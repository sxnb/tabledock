/**
 * Split a SQL script into individual statements, honouring `DELIMITER`.
 *
 * `DELIMITER` is a client-side directive, not SQL — the server rejects it. Dumps
 * that contain triggers or stored routines use it so the semicolons inside a
 * BEGIN…END body are not mistaken for statement ends, which means anything
 * importing such a script has to interpret it here instead.
 *
 * The scanner skips over quoted strings, backtick-quoted identifiers, and both
 * comment styles so a delimiter appearing inside them is not treated as one.
 */
export function splitSqlScript(sql: string): string[] {
  const statements: string[] = []
  let delimiter = ';'
  let buffer = ''
  let i = 0

  const push = (): void => {
    const trimmed = buffer.trim()
    if (trimmed) statements.push(trimmed)
    buffer = ''
  }

  while (i < sql.length) {
    // A DELIMITER directive is only valid at the start of a line.
    if (buffer.trim() === '' || buffer.endsWith('\n')) {
      const directive = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(?:\r?\n|$)/i.exec(sql.slice(i))
      if (directive) {
        push()
        delimiter = directive[1]
        i += directive[0].length
        continue
      }
    }

    const char = sql[i]
    const rest = sql.slice(i)

    // Comments: copied through so statements keep their annotations.
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2)
      const stop = end === -1 ? sql.length : end + 2
      buffer += sql.slice(i, stop)
      i = stop
      continue
    }
    if (rest.startsWith('-- ') || rest.startsWith('--\n') || rest === '--' || char === '#') {
      const end = sql.indexOf('\n', i)
      const stop = end === -1 ? sql.length : end + 1
      buffer += sql.slice(i, stop)
      i = stop
      continue
    }

    // Quoted regions are consumed whole.
    if (char === "'" || char === '"' || char === '`') {
      const end = scanQuoted(sql, i)
      buffer += sql.slice(i, end)
      i = end
      continue
    }

    if (sql.startsWith(delimiter, i)) {
      push()
      i += delimiter.length
      continue
    }

    buffer += char
    i++
  }

  push()
  return statements
}

/** Return the index just past the quoted region starting at `start`. */
function scanQuoted(sql: string, start: number): number {
  const quote = sql[start]
  let i = start + 1
  while (i < sql.length) {
    const char = sql[i]
    // Backslash escapes apply to strings but not to backtick identifiers.
    if (char === '\\' && quote !== '`') {
      i += 2
      continue
    }
    if (char === quote) {
      // A doubled quote is an escaped quote, not the end.
      if (sql[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  return sql.length
}

/** Whether a script uses `DELIMITER`, and so has to be split before running. */
export function hasDelimiterDirective(sql: string): boolean {
  return /^[ \t]*DELIMITER[ \t]+\S+/im.test(sql)
}
