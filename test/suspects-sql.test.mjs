import assert from 'node:assert/strict';
import test from 'node:test';
import { SUSPECTS } from '../js/data/dossiers.js';
import { executeSuspectsSql } from '../js/components/suspectsSql.mjs';

test('exposes schema discovery commands without revealing suspect rows', () => {
  const tables = executeSuspectsSql('SHOW TABLES;', SUSPECTS);
  assert.deepEqual(tables.columns, ['Tables_in_epochcorp']);
  assert.equal(tables.rows[0].values.Tables_in_epochcorp, 'suspects');

  const description = executeSuspectsSql('DESC suspects', SUSPECTS);
  assert.equal(description.rows.length, 10);
  assert.equal(description.rows[0].values.Field, 'id');
});

test('returns only selected records and columns for a filtered SELECT', () => {
  const result = executeSuspectsSql(
    "SELECT id, name, type FROM suspects WHERE type = 'MAIN' ORDER BY name ASC LIMIT 2;",
    SUSPECTS
  );
  assert.deepEqual(result.columns, ['id', 'name', 'type']);
  assert.deepEqual(result.rows.map(row => row.values.name), ['Divya Mehta', 'K. Verma']);
  assert.equal(result.rows.length, 2);
  assert.equal(result.selectable, true);
});

test('SELECT * returns every column and preserves record ids for selection', () => {
  const result = executeSuspectsSql('SELECT * FROM epochcorp.suspects;', SUSPECTS);
  assert.equal(result.rows.length, SUSPECTS.length);
  assert.deepEqual(result.columns, ['id', 'code', 'name', 'role', 'type', 'status', 'last_seen', 'alibi', 'motive', 'notes']);
  assert.equal(result.rows[0].suspectId, '01');
  assert.equal(result.rows[0].values.name, 'Ram Sharma');

  const partialResult = executeSuspectsSql("SELECT name FROM suspects WHERE id = '01';", SUSPECTS);
  assert.equal(partialResult.rows[0].suspectId, '01');
  assert.deepEqual(partialResult.rows[0].values, { name: 'Ram Sharma' });
});

test('supports LIKE filters and rejects invalid commands and columns', () => {
  const result = executeSuspectsSql("SELECT name FROM suspects WHERE name LIKE '%Ram%'", SUSPECTS);
  assert.deepEqual(result.rows.map(row => row.values.name), ['Ram Sharma']);
  assert.throws(() => executeSuspectsSql('DELETE FROM suspects', SUSPECTS), /Unsupported SQL syntax/);
  assert.throws(() => executeSuspectsSql('SELECT password FROM suspects', SUSPECTS), /unknown column/i);
});
