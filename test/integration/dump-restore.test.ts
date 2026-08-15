import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgresDriver } from '../../src/main/db/drivers/postgres'
import { MySqlDriver } from '../../src/main/db/drivers/mysql'
import type { RelationalDriver } from '../../src/main/db/types'
import { testConfig, RELATIONAL_KINDS, type TestKind } from '../support/dbconfig'

/**
 * The dump's real contract: a dump of a populated database, replayed against an
 * empty one on another server, reproduces it. Each kind builds a schema using
 * the features that used to be silently dropped — enums, arrays, constraints,
 * indexes, views, routines, triggers, sequences — then restores and inspects it.
 */

const SRC = 'tabledock_rt_src'
const DST = 'tabledock_rt_dst'

const PG_SCHEMA = `
CREATE TYPE order_status AS ENUM ('pending','paid','refunded');
CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);
CREATE SEQUENCE ticket_seq START WITH 500;
CREATE FUNCTION bump() RETURNS trigger AS $$
BEGIN NEW.touched := NEW.touched + 1; RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TABLE customers (
  id serial PRIMARY KEY,
  email varchar(120) NOT NULL UNIQUE,
  tags text[],
  payload bytea,
  meta jsonb,
  -- A jsonb holding an array parses into the same JS array a text[] does, and a
  -- jsonb scalar into a bare string/number/boolean. All of them need JSON syntax.
  meta_list jsonb,
  meta_objs jsonb,
  meta_str jsonb,
  meta_num jsonb,
  meta_bool jsonb,
  meta_plain json,
  touched integer NOT NULL DEFAULT 0
);
CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'pending',
  qty positive_int,
  ticket integer NOT NULL DEFAULT nextval('ticket_seq'),
  total numeric(10,2),
  CONSTRAINT orders_total_ck CHECK (total >= 0)
);
CREATE INDEX orders_status_idx ON orders (status);
CREATE VIEW paid_orders AS SELECT * FROM orders WHERE status = 'paid';
CREATE VIEW paid_totals AS SELECT customer_id, sum(total) AS total FROM paid_orders GROUP BY customer_id;
CREATE TRIGGER customers_bump BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION bump();
INSERT INTO customers (email, tags, payload, meta, meta_list, meta_objs, meta_str, meta_num, meta_bool, meta_plain) VALUES
  ('a@x.com', ARRAY['vip','beta'], '\\xdeadbeef'::bytea, '{"k":"v"}',
   '["qwen3.5:9b","b"]',
   '[{"url":"https://x.example/a","reason":"4 of 9 roles are remote"},{"url":null,"n":2}]',
   '"hello"', '42', 'true', '[1,2]'),
  ('b@x.com', ARRAY['has,comma','quo"te', NULL], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO orders (customer_id, status, qty, total) VALUES (1,'paid',3,10.50),(2,'pending',1,0);
`

const MYSQL_SCHEMA = `
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  payload VARBINARY(32),
  meta JSON,
  touched INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  total DECIMAL(10,2),
  CONSTRAINT orders_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX orders_status_idx ON orders (status);
CREATE VIEW paid_orders AS SELECT * FROM orders WHERE status = 'paid';
CREATE VIEW paid_totals AS SELECT customer_id, SUM(total) AS total FROM paid_orders GROUP BY customer_id;
CREATE TRIGGER customers_bump BEFORE UPDATE ON customers FOR EACH ROW BEGIN SET NEW.touched = NEW.touched + 1; END;
CREATE FUNCTION add_two(a INT) RETURNS INT DETERMINISTIC BEGIN RETURN a + 2; END;
INSERT INTO customers (email, payload, meta) VALUES
  ('a@x.com', UNHEX('deadbeef'), '{"k":"v"}'), ('b@x.com', NULL, NULL);
INSERT INTO orders (customer_id, status, total) VALUES (1,'paid',10.50),(2,'pending',0);
`

function driverFor(kind: TestKind, database: string): RelationalDriver {
  const config = { ...testConfig(kind), database }
  return kind === 'postgres' ? new PostgresDriver(config) : new MySqlDriver(config)
}

for (const kind of RELATIONAL_KINDS) {
  describe(`dump → restore into an empty database: ${kind}`, () => {
    let restored: RelationalDriver
    let dump = ''

    beforeAll(async () => {
      // Postgres cannot drop the database it is connected to, so administer from another.
      const admin = driverFor(kind, kind === 'postgres' ? 'postgres' : 'mysql')
      await admin.connect()
      for (const db of [SRC, DST]) {
        await admin.runQuery(`DROP DATABASE IF EXISTS ${db}`)
        await admin.runQuery(`CREATE DATABASE ${db}`)
      }
      await admin.disconnect()

      const source = driverFor(kind, SRC)
      await source.connect()
      await source.runScript(kind === 'postgres' ? PG_SCHEMA : MYSQL_SCHEMA, SRC)
      const chunks: string[] = []
      for await (const chunk of source.dumpDatabase(SRC)) chunks.push(chunk)
      dump = chunks.join('')
      await source.disconnect()

      restored = driverFor(kind, DST)
      await restored.connect()
      await restored.runScript(dump, DST)
    }, 60000)

    afterAll(async () => {
      await restored?.disconnect()
      const admin = driverFor(kind, kind === 'postgres' ? 'postgres' : 'mysql')
      await admin.connect()
      for (const db of [SRC, DST])
        await admin.runQuery(`DROP DATABASE IF EXISTS ${db}`).catch(() => {})
      await admin.disconnect()
    })

    const scalar = async (sql: string): Promise<unknown> =>
      (await restored.runQuery(sql, DST)).rows[0]?.[0]

    it('restores every row', async () => {
      expect(Number(await scalar('SELECT COUNT(*) FROM customers'))).toBe(2)
      expect(Number(await scalar('SELECT COUNT(*) FROM orders'))).toBe(2)
    })

    it('restores enum-typed columns', async () => {
      expect(String(await scalar('SELECT status FROM orders WHERE id = 1'))).toBe('paid')
    })

    it('restores binary columns', async () => {
      const hex =
        kind === 'postgres'
          ? await scalar("SELECT encode(payload, 'hex') FROM customers WHERE email = 'a@x.com'")
          : await scalar("SELECT LOWER(HEX(payload)) FROM customers WHERE email = 'a@x.com'")
      expect(String(hex)).toBe('deadbeef')
    })

    it('restores views, including one built on another view', async () => {
      expect(Number(await scalar('SELECT COUNT(*) FROM paid_orders'))).toBe(1)
      expect(Number(await scalar('SELECT COUNT(*) FROM paid_totals'))).toBe(1)
    })

    it('restores indexes and foreign keys', async () => {
      const indexes = Number(
        await scalar(
          kind === 'postgres'
            ? `SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_status_idx'`
            : `SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = '${DST}' AND index_name = 'orders_status_idx'`
        )
      )
      expect(indexes).toBe(1)

      const fks = Number(
        await scalar(
          kind === 'postgres'
            ? `SELECT COUNT(*) FROM pg_constraint con
               JOIN pg_class c ON c.oid = con.conrelid
               WHERE con.contype = 'f' AND c.relname = 'orders'`
            : `SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE constraint_schema = '${DST}' AND constraint_type = 'FOREIGN KEY'`
        )
      )
      expect(fks).toBe(1)
    })

    it('restores the trigger, and it still fires', async () => {
      await restored.runQuery("UPDATE customers SET email = 'a2@x.com' WHERE id = 1", DST)
      expect(Number(await scalar('SELECT touched FROM customers WHERE id = 1'))).toBe(1)
    })

    it('leaves auto-generated keys continuing past the restored rows', async () => {
      await restored.insertRow('customers', { database: DST, values: { email: 'c@x.com' } })
      const id = Number(await scalar("SELECT id FROM customers WHERE email = 'c@x.com'"))
      expect(id).toBe(3)
    })

    if (kind === 'postgres') {
      it('restores array values, including quoting-sensitive elements', async () => {
        expect(
          String(await scalar("SELECT tags::text FROM customers WHERE email = 'b@x.com'"))
        ).toBe('{"has,comma","quo\\"te",NULL}')
        // Keyed by id: an earlier test renames this row's email.
        expect(String(await scalar('SELECT tags[1] FROM customers WHERE id = 1'))).toBe('vip')
      })

      it('restores json columns as JSON, not as Postgres arrays', async () => {
        // A jsonb array written with array syntax is what produced
        // "invalid input syntax for type json" on restore.
        expect(String(await scalar('SELECT meta_list::text FROM customers WHERE id = 1'))).toBe(
          '["qwen3.5:9b", "b"]'
        )
        expect(String(await scalar('SELECT meta_list->>0 FROM customers WHERE id = 1'))).toBe(
          'qwen3.5:9b'
        )
      })

      it('restores a json array of objects', async () => {
        // Nested objects inside a json array are the shape that broke most
        // widely: each object was quoted as a Postgres array element.
        expect(
          Number(await scalar('SELECT jsonb_array_length(meta_objs) FROM customers WHERE id = 1'))
        ).toBe(2)
        expect(
          String(await scalar("SELECT meta_objs->0->>'url' FROM customers WHERE id = 1"))
        ).toBe('https://x.example/a')
        expect(
          String(await scalar("SELECT meta_objs->0->>'reason' FROM customers WHERE id = 1"))
        ).toBe('4 of 9 roles are remote')
        expect(await scalar("SELECT meta_objs->1->>'url' FROM customers WHERE id = 1")).toBeNull()
      })

      it('restores json scalars, which are not valid JSON unquoted', async () => {
        expect(String(await scalar('SELECT meta_str::text FROM customers WHERE id = 1'))).toBe(
          '"hello"'
        )
        expect(String(await scalar('SELECT meta_num::text FROM customers WHERE id = 1'))).toBe('42')
        expect(String(await scalar('SELECT meta_bool::text FROM customers WHERE id = 1'))).toBe(
          'true'
        )
        expect(String(await scalar('SELECT meta_plain::text FROM customers WHERE id = 1'))).toBe(
          '[1,2]'
        )
      })

      it('keeps json objects queryable through json operators', async () => {
        expect(String(await scalar("SELECT meta->>'k' FROM customers WHERE id = 1"))).toBe('v')
      })

      it('restores the domain and its constraint', async () => {
        await expect(
          restored.runQuery('INSERT INTO orders (customer_id, qty, total) VALUES (1, -5, 1)', DST)
        ).rejects.toThrow()
      })

      it('restores a standalone sequence at its current value', async () => {
        expect(Number(await scalar("SELECT nextval('ticket_seq')"))).toBe(502)
      })

      it('restores check constraints', async () => {
        await expect(
          restored.runQuery('INSERT INTO orders (customer_id, total) VALUES (1, -1)', DST)
        ).rejects.toThrow()
      })
    } else {
      it('restores stored routines', async () => {
        expect(Number(await scalar('SELECT add_two(40)'))).toBe(42)
      })

      it('turns foreign-key checks off for the restore and back on after', async () => {
        expect(dump).toMatch(/SET FOREIGN_KEY_CHECKS = 0;/)
        expect(dump.trimEnd().endsWith('SET FOREIGN_KEY_CHECKS = 1;')).toBe(true)
      })

      it('strips DEFINER so the script does not depend on a user existing', () => {
        expect(dump).not.toMatch(/DEFINER\s*=/i)
      })
    }
  })
}
