import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { chunked, writeDump, DUMP_CHUNK_CHARS } from '../../src/main/db/dump'
import { insertChunks, sqlLiteral } from '../../src/main/db/sqlformat'

const quoteIdent = (name: string): string => '"' + name.replace(/"/g, '""') + '"'

async function collect(chunks: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const chunk of chunks) out.push(chunk)
  return out
}

describe('chunked', () => {
  it('yields nothing for an empty stream', async () => {
    expect(await collect(chunked([]))).toEqual([])
  })

  it('coalesces small pieces into a single chunk', async () => {
    expect(await collect(chunked(['a', 'b', 'c']))).toEqual(['abc'])
  })

  it('flushes once a chunk reaches the size limit, and keeps every chunk bounded', async () => {
    const piece = 'x'.repeat(1000)
    const pieces = Array.from({ length: 4000 }, () => piece) // ~4 MB total
    const chunks = await collect(chunked(pieces))

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DUMP_CHUNK_CHARS + piece.length)
    }
    expect(chunks.join('')).toBe(pieces.join(''))
  })

  it('accepts an async source', async () => {
    async function* source(): AsyncGenerator<string> {
      yield 'one '
      yield 'two'
    }
    expect(await collect(chunked(source()))).toEqual(['one two'])
  })
})

describe('sqlLiteral', () => {
  it('escapes the values a dump has to survive', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(undefined)).toBe('NULL')
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(10n)).toBe('10')
    expect(sqlLiteral(true)).toBe('TRUE')
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
    expect(sqlLiteral(new Date('2024-03-01T10:20:30.000Z'))).toBe("'2024-03-01T10:20:30.000Z'")
    expect(sqlLiteral(Buffer.from([0xde, 0xad]))).toBe("X'dead'")
    expect(sqlLiteral({ a: "it's" })).toBe('\'{"a":"it\'\'s"}\'')
  })
})

describe('insertChunks', () => {
  it('emits one statement per row', async () => {
    const chunks = await collect(
      insertChunks(
        '"t"',
        ['id', 'name'],
        [
          [1, 'a'],
          [2, null]
        ],
        quoteIdent
      )
    )
    expect(chunks.join('')).toBe(
      'INSERT INTO "t" ("id", "name") VALUES (1, \'a\');\n' +
        'INSERT INTO "t" ("id", "name") VALUES (2, NULL);\n'
    )
  })

  it('emits nothing for a table with no rows', async () => {
    expect(await collect(insertChunks('"t"', ['id'], [], quoteIdent))).toEqual([])
  })

  it('never builds one string for the whole table', async () => {
    const wide = 'y'.repeat(5000)
    function* rows(): Generator<unknown[]> {
      for (let i = 0; i < 2000; i++) yield [i, wide] // ~10 MB of SQL
    }
    const chunks = await collect(insertChunks('"t"', ['id', 'body'], rows(), quoteIdent))

    expect(chunks.length).toBeGreaterThan(5)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DUMP_CHUNK_CHARS * 2)
    }
    expect(chunks.join('').match(/^INSERT INTO/gm)).toHaveLength(2000)
  })

  it('consumes rows lazily rather than draining the source first', async () => {
    const wide = 'y'.repeat(5000)
    let produced = 0
    function* rows(): Generator<unknown[]> {
      for (let i = 0; i < 2000; i++) {
        produced++
        yield [i, wide]
      }
    }
    const iterator = insertChunks('"t"', ['id', 'body'], rows(), quoteIdent)[Symbol.asyncIterator]()

    const first = await iterator.next()
    expect(first.done).toBe(false)
    // Enough rows to fill one chunk, and no more — a driver streaming a table
    // must not be drained ahead of the writer.
    expect(produced).toBeLessThan(500)
    expect(produced).toBeGreaterThan(0)
  })
})

describe('writeDump', () => {
  it('streams chunks to disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tabledock-dump-'))
    const file = join(dir, 'out.sql')
    try {
      await writeDump(file, chunked(['-- header\n', 'INSERT INTO t VALUES (1);\n']))
      expect(readFileSync(file, 'utf-8')).toBe('-- header\nINSERT INTO t VALUES (1);\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes a file larger than V8 can hold in one string', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tabledock-dump-'))
    const file = join(dir, 'big.sql')
    const megabyte = 'z'.repeat(1024 * 1024)
    async function* pieces(): AsyncGenerator<string> {
      // 600 MB — past the ~512 MB limit that made the old whole-string dump
      // fail with "Invalid string length".
      for (let i = 0; i < 600; i++) yield megabyte
    }
    try {
      await writeDump(file, chunked(pieces()))
      expect(statSync(file).size).toBe(600 * 1024 * 1024)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120000)

  it('removes the partial file when the source fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tabledock-dump-'))
    const file = join(dir, 'broken.sql')
    async function* failing(): AsyncGenerator<string> {
      yield 'INSERT INTO t VALUES (1);\n'
      throw new Error('connection lost')
    }
    try {
      await expect(writeDump(file, failing())).rejects.toThrow('connection lost')
      expect(existsSync(file)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
