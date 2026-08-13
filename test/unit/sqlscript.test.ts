import { describe, it, expect } from 'vitest'
import { splitSqlScript, hasDelimiterDirective } from '../../src/main/db/sqlscript'

describe('hasDelimiterDirective', () => {
  it('detects a DELIMITER line in any casing or position', () => {
    expect(hasDelimiterDirective('DELIMITER ;;')).toBe(true)
    expect(hasDelimiterDirective('SELECT 1;\ndelimiter $$\n')).toBe(true)
    expect(hasDelimiterDirective('  DELIMITER //')).toBe(true)
  })

  it('does not fire on the word appearing inside a statement', () => {
    expect(hasDelimiterDirective("SELECT 'DELIMITER ;;' AS x;")).toBe(false)
    expect(hasDelimiterDirective('SELECT 1;')).toBe(false)
  })
})

describe('splitSqlScript', () => {
  it('splits plain statements on semicolons', () => {
    expect(splitSqlScript('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('ignores a trailing separator and blank statements', () => {
    expect(splitSqlScript('SELECT 1;;;\n\n')).toEqual(['SELECT 1'])
    expect(splitSqlScript('   ')).toEqual([])
  })

  it('keeps semicolons that live inside string literals', () => {
    expect(splitSqlScript("INSERT INTO t VALUES ('a;b'); SELECT 1;")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      'SELECT 1'
    ])
  })

  it('handles doubled and backslash-escaped quotes', () => {
    expect(splitSqlScript("SELECT 'it''s; fine'; SELECT 2;")).toEqual([
      "SELECT 'it''s; fine'",
      'SELECT 2'
    ])
    expect(splitSqlScript("SELECT 'a\\'; b'; SELECT 2;")).toEqual(["SELECT 'a\\'; b'", 'SELECT 2'])
  })

  it('keeps semicolons inside quoted identifiers', () => {
    expect(splitSqlScript('SELECT `we;ird`, "al;so" FROM t; SELECT 2;')).toEqual([
      'SELECT `we;ird`, "al;so" FROM t',
      'SELECT 2'
    ])
  })

  it('keeps semicolons inside comments', () => {
    expect(splitSqlScript('-- a; comment\nSELECT 1;')).toEqual(['-- a; comment\nSELECT 1'])
    expect(splitSqlScript('/* a; b */ SELECT 1;')).toEqual(['/* a; b */ SELECT 1'])
    expect(splitSqlScript('# hash; comment\nSELECT 1;')).toEqual(['# hash; comment\nSELECT 1'])
  })

  it('honours DELIMITER so a compound body stays in one statement', () => {
    const script = [
      'CREATE TABLE t (id INT);',
      'DELIMITER ;;',
      'CREATE TRIGGER bump BEFORE UPDATE ON t FOR EACH ROW BEGIN SET NEW.id = 1; END;;',
      'DELIMITER ;',
      'SELECT 1;'
    ].join('\n')

    expect(splitSqlScript(script)).toEqual([
      'CREATE TABLE t (id INT)',
      'CREATE TRIGGER bump BEFORE UPDATE ON t FOR EACH ROW BEGIN SET NEW.id = 1; END',
      'SELECT 1'
    ])
  })

  it('supports several delimiter switches in one script', () => {
    const script = 'DELIMITER $$\nSELECT 1; SELECT 2$$\nDELIMITER ;\nSELECT 3;'
    expect(splitSqlScript(script)).toEqual(['SELECT 1; SELECT 2', 'SELECT 3'])
  })

  it('never emits a DELIMITER directive as a statement', () => {
    const statements = splitSqlScript('DELIMITER ;;\nSELECT 1;;\nDELIMITER ;\n')
    expect(statements).toEqual(['SELECT 1'])
    expect(statements.some((s) => /DELIMITER/i.test(s))).toBe(false)
  })
})
