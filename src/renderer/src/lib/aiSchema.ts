import type { SchemaGraph } from '@shared/types'

const MAX_TABLES = 40
const MAX_COLS = 60

/** Compact, token-bounded textual schema for the AI prompt (names/types/keys only). */
export function buildSchemaContext(graph: SchemaGraph): string {
  const lines: string[] = []
  for (const table of graph.tables.slice(0, MAX_TABLES)) {
    lines.push(`${table.name}(`)
    lines.push(
      table.columns
        .slice(0, MAX_COLS)
        .map((c) => {
          const flags = [c.isPrimaryKey ? 'PK' : '', c.isForeignKey ? 'FK' : '']
            .filter(Boolean)
            .join(',')
          return `  ${c.name} ${c.dataType}${flags ? ` [${flags}]` : ''}`
        })
        .join('\n')
    )
    lines.push(')')
  }
  if (graph.relations.length > 0) {
    lines.push('', 'Foreign keys:')
    for (const r of graph.relations) {
      lines.push(`  ${r.sourceTable}.${r.sourceColumn} -> ${r.targetTable}.${r.targetColumn}`)
    }
  }
  if (graph.tables.length > MAX_TABLES) {
    lines.push('', `… and ${graph.tables.length - MAX_TABLES} more tables (truncated)`)
  }
  return lines.join('\n')
}
