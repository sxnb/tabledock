import { describe, it, expect } from 'vitest'
import { readOnlyViolation } from '../../src/main/db/drivers/sqlserver'

describe('readOnlyViolation', () => {
  it('allows plain reads', () => {
    expect(readOnlyViolation('SELECT * FROM users WHERE id = 1')).toBeNull()
    expect(readOnlyViolation('SELECT created_at FROM updates_log')).toBeNull()
    expect(readOnlyViolation('EXEC sp_help')).toBeNull()
  })

  it('finds write and transaction-control keywords in any case', () => {
    expect(readOnlyViolation('delete from users')).toBe('DELETE')
    expect(readOnlyViolation('SELECT 1;\nUPDATE users SET name = 1')).toBe('UPDATE')
    expect(readOnlyViolation('DROP TABLE users')).toBe('DROP')
    expect(readOnlyViolation('SELECT 1; COMMIT')).toBe('COMMIT')
    expect(readOnlyViolation('BEGIN TRY SELECT 1 END TRY BEGIN CATCH ROLLBACK END CATCH')).toBe(
      'ROLLBACK'
    )
  })

  it('ignores keywords inside comments, strings, and quoted identifiers', () => {
    expect(readOnlyViolation('-- DELETE this later\nSELECT 1')).toBeNull()
    expect(readOnlyViolation('/* DROP */ SELECT 1')).toBeNull()
    expect(readOnlyViolation("SELECT * FROM t WHERE note = 'please delete me'")).toBeNull()
    expect(readOnlyViolation("SELECT N'it''s an update'")).toBeNull()
    expect(readOnlyViolation('SELECT [update], "delete" FROM t')).toBeNull()
  })

  it('does not mistake a comment marker inside a string for a comment', () => {
    expect(readOnlyViolation("SELECT '--'; DELETE FROM users")).toBe('DELETE')
    expect(readOnlyViolation("SELECT '/*'; DELETE FROM users -- */")).toBe('DELETE')
  })

  it('errs towards refusing where T-SQL would see less code', () => {
    // An unterminated string, and a nested block comment T-SQL would treat as one.
    expect(readOnlyViolation("SELECT 'oops; DELETE FROM users")).toBe('DELETE')
    expect(readOnlyViolation('/* outer /* inner */ DROP */ SELECT 1')).toBe('DROP')
  })
})
