-- Seed data for the PostgreSQL test container (database: datadock_test).
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(120),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users (id),
  title     VARCHAR(200) NOT NULL,
  body      TEXT
);

CREATE INDEX posts_user_id_idx ON posts (user_id);

INSERT INTO users (email, name, active) VALUES
  ('alice@example.com', 'Alice', TRUE),
  ('bob@example.com',   'Bob',   TRUE),
  ('carol@example.com', 'Carol', FALSE);

INSERT INTO posts (user_id, title, body) VALUES
  (1, 'Hello world', 'first post'),
  (1, 'Second post', 'more text'),
  (2, 'Bob writes',  'bob body');
