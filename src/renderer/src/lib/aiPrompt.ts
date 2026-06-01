import type { DriverKind } from '@shared/types'

const DIALECT: Partial<Record<DriverKind, string>> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgres: 'PostgreSQL',
  mssql: 'Microsoft SQL Server (T-SQL)',
  sqlite: 'SQLite'
}

export function dialectName(kind: DriverKind): string {
  return DIALECT[kind] ?? 'SQL'
}

/** System prompt: a dialect-aware SQL assistant grounded in the live schema. */
export function systemPrompt(kind: DriverKind, schemaText: string): string {
  const dialect = dialectName(kind)
  return `You are DataDock's SQL assistant for a ${dialect} database. Translate the user's request into one correct ${dialect} query.

Database schema:
${schemaText}

Rules:
- Use only the tables and columns shown above; quote identifiers as ${dialect} requires.
- Reply with the query inside a single \`\`\`sql fenced code block, then a one-sentence explanation.
- Prefer read-only SELECTs unless the user clearly asks to modify data.
- Never claim you executed the query — the user reviews and runs it in DataDock.`
}
