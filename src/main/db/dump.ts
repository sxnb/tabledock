import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

/**
 * Characters to accumulate before handing a chunk to the dump writer.
 *
 * Dumps are streamed rather than concatenated: a whole-database string overruns
 * V8's ~512 MB string limit and fails with "Invalid string length". Emitting
 * every row on its own would be safe but needlessly slow, so drivers regroup
 * their output into chunks of roughly this size.
 */
export const DUMP_CHUNK_CHARS = 1 << 20

/** Rows to fetch per round-trip when a driver pages a table for a dump. */
export const DUMP_BATCH_ROWS = 1000

/** Regroup a stream of small strings into ~`DUMP_CHUNK_CHARS` chunks. */
export async function* chunked(
  pieces: AsyncIterable<string> | Iterable<string>
): AsyncGenerator<string> {
  let buf = ''
  for await (const piece of pieces) {
    buf += piece
    if (buf.length >= DUMP_CHUNK_CHARS) {
      yield buf
      buf = ''
    }
  }
  if (buf) yield buf
}

/**
 * Write a dump's chunks to `filePath`, honouring backpressure so the file can be
 * far larger than memory. A failed dump leaves no half-written file behind.
 */
export async function writeDump(filePath: string, chunks: AsyncIterable<string>): Promise<void> {
  try {
    await pipeline(Readable.from(chunks), createWriteStream(filePath, 'utf-8'))
  } catch (err) {
    await unlink(filePath).catch(() => {})
    throw err
  }
}
