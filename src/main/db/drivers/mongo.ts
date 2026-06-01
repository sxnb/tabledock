import { MongoClient, type MongoClientOptions } from 'mongodb'
import { EJSON } from 'bson'
import type { ConnectionConfig, MongoDriverApi, MongoFindOptions, MongoFindResult } from '../types'

const SYSTEM_DATABASES = new Set(['admin', 'local', 'config'])
const AGGREGATE_LIMIT = 500

/** MongoDB driver. Documents cross the IPC boundary as Extended JSON strings. */
export class MongoDriver implements MongoDriverApi {
  readonly kind = 'mongodb' as const
  private client: MongoClient | null = null

  constructor(private readonly config: ConnectionConfig) {}

  private buildUri(): string {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || 27017
    const auth = this.config.user
      ? `${encodeURIComponent(this.config.user)}:${encodeURIComponent(this.config.password || '')}@`
      : ''
    const authSource = this.config.user ? `?authSource=${this.config.database || 'admin'}` : ''
    return `mongodb://${auth}${host}:${port}/${authSource}`
  }

  async connect(): Promise<void> {
    const ssl = this.config.ssl
    const options: MongoClientOptions = { serverSelectionTimeoutMS: 8000 }
    if (ssl?.enabled) {
      options.tls = true
      if (ssl.ca) options.tlsCAFile = ssl.ca
      if (ssl.cert || ssl.key) options.tlsCertificateKeyFile = ssl.cert || ssl.key
      if (!ssl.ca) options.tlsAllowInvalidCertificates = true
    }
    this.client = new MongoClient(this.buildUri(), options)
    await this.client.connect()
    // Validate the connection.
    await this.client.db('admin').command({ ping: 1 })
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
  }

  private get handle(): MongoClient {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }

  async listDatabases(): Promise<string[]> {
    const result = await this.handle.db('admin').admin().listDatabases()
    return result.databases.map((d) => d.name).filter((n) => !SYSTEM_DATABASES.has(n))
  }

  async listCollections(database: string): Promise<string[]> {
    const cols = await this.handle.db(database).listCollections().toArray()
    return cols.map((c) => c.name).sort()
  }

  async find(
    database: string,
    collection: string,
    opts: MongoFindOptions
  ): Promise<MongoFindResult> {
    const { filter, sort, projection, page, pageSize } = opts
    const query = filter.trim() ? (EJSON.parse(filter) as Record<string, unknown>) : {}
    const hasQuery = Object.keys(query).length > 0
    const coll = this.handle.db(database).collection(collection)
    // estimatedDocumentCount is instant; use it when browsing the whole collection.
    const total = hasQuery ? await coll.countDocuments(query) : await coll.estimatedDocumentCount()
    let cursor = coll.find(query)
    if (sort && sort.trim()) cursor = cursor.sort(EJSON.parse(sort) as Record<string, never>)
    if (projection && projection.trim())
      cursor = cursor.project(EJSON.parse(projection) as Record<string, never>)
    const docs = await cursor
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray()
    return {
      documents: docs.map((doc) => ({
        // _id may be absent when a projection excludes it (edit/delete then disabled).
        id: doc._id === undefined ? '' : EJSON.stringify(doc._id),
        json: EJSON.stringify(doc, undefined, 2)
      })),
      total,
      page,
      pageSize
    }
  }

  async aggregate(
    database: string,
    collection: string,
    pipeline: string
  ): Promise<MongoFindResult> {
    const stages = pipeline.trim() ? EJSON.parse(pipeline) : []
    if (!Array.isArray(stages)) throw new Error('Pipeline must be a JSON array of stages')
    // Cap results so a broad pipeline can't pull an unbounded amount into memory.
    const limited = [...stages, { $limit: AGGREGATE_LIMIT }]
    const docs = await this.handle.db(database).collection(collection).aggregate(limited).toArray()
    return {
      documents: docs.map((doc) => ({
        id: doc._id === undefined ? '' : EJSON.stringify(doc._id),
        json: EJSON.stringify(doc, undefined, 2)
      })),
      total: docs.length,
      page: 1,
      pageSize: docs.length
    }
  }

  async insertDocument(database: string, collection: string, json: string): Promise<void> {
    const doc = EJSON.parse(json) as Record<string, unknown>
    await this.handle.db(database).collection(collection).insertOne(doc)
  }

  async updateDocument(
    database: string,
    collection: string,
    id: string,
    json: string
  ): Promise<void> {
    const _id = EJSON.parse(id)
    const doc = EJSON.parse(json) as Record<string, unknown>
    delete doc._id
    await this.handle
      .db(database)
      .collection(collection)
      .replaceOne({ _id: _id as never }, doc)
  }

  async deleteDocument(database: string, collection: string, id: string): Promise<void> {
    const _id = EJSON.parse(id)
    await this.handle
      .db(database)
      .collection(collection)
      .deleteOne({ _id: _id as never })
  }

  async dumpJson(database: string): Promise<string> {
    const db = this.handle.db(database)
    const collections = await this.listCollections(database)
    const parts: string[] = [`// DataDock dump of ${database} — ${new Date().toISOString()}\n`]
    for (const name of collections) {
      const docs = await db.collection(name).find({}).toArray()
      parts.push(`// collection: ${name}`)
      parts.push(EJSON.stringify(docs, undefined, 2))
      parts.push('')
    }
    return parts.join('\n')
  }
}
