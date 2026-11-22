export const SUSPECTS_SCHEMA = [
  { name: 'id', type: 'CHAR(2)', nullable: false, key: 'PRI' },
  { name: 'code', type: 'VARCHAR(16)', nullable: false, key: '' },
  { name: 'name', type: 'VARCHAR(80)', nullable: false, key: '' },
  { name: 'role', type: 'VARCHAR(120)', nullable: false, key: '' },
  { name: 'type', type: 'VARCHAR(12)', nullable: false, key: '' },
  { name: 'status', type: 'VARCHAR(24)', nullable: false, key: '' },
  { name: 'last_seen', type: 'TEXT', nullable: false, key: '' },
  { name: 'alibi', type: 'TEXT', nullable: false, key: '' },
  { name: 'motive', type: 'TEXT', nullable: false, key: '' },
  { name: 'notes', type: 'TEXT', nullable: true, key: '' }
];

const TABLE_NAME = 'suspects';
const DATABASE_NAME = 'epochcorp';
const CREATE_TABLE_SQL = `CREATE TABLE suspects (\n${SUSPECTS_SCHEMA.map(column =>
  `  ${column.name} ${column.type}${column.nullable ? ' NULL' : ' NOT NULL'}${column.key === 'PRI' ? ' PRIMARY KEY' : ''}`
).join(',\n')}\n);`;

function invalid(message) {
  throw new Error(message);
}

function cleanIdentifier(identifier) {
  return identifier.replace(/`/g, '').toLowerCase();
}

function validateDatabase(name, currentDatabase) {
  const database = cleanIdentifier(name);
  if (database !== DATABASE_NAME) invalid(`Unknown database '${name}'.`);
  if (currentDatabase !== DATABASE_NAME) invalid('Select the epochcorp database with USE epochcorp first.');
  return database;
}

function validateTable(name, currentDatabase) {
  const parts = name.split('.');
  if (parts.length === 2) validateDatabase(parts[0], currentDatabase);
  else if (currentDatabase !== DATABASE_NAME) invalid('Select the epochcorp database with USE epochcorp first.');

  const table = cleanIdentifier(parts[parts.length - 1]);
  if (table !== TABLE_NAME) invalid(`Unknown table '${parts[parts.length - 1]}'.`);
  return table;
}

function asRow(suspect) {
  return {
    id: suspect.id,
    code: suspect.code,
    name: suspect.name,
    role: suspect.role,
    type: suspect.type,
    status: suspect.stamp,
    last_seen: suspect.lastSeen,
    alibi: suspect.alibi,
    motive: suspect.motive,
    notes: suspect.notes || null
  };
}

function parseLiteral(value) {
  if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.startsWith('"')) return value.slice(1, -1).replace(/""/g, '"');
  return value;
}

function matchesCondition(row, expression) {
  const match = expression.match(/^(`?\w+`?)\s*(=|!=|<>|>=|<=|>|<|LIKE)\s*('(?:''|[^'])*'|"(?:\"\"|[^"])*"|-?\d+(?:\.\d+)?|[\w.-]+)$/i);
  if (!match) invalid(`Invalid WHERE condition '${expression}'.`);

  const columnName = cleanIdentifier(match[1]);
  if (!SUSPECTS_SCHEMA.some(column => column.name === columnName)) invalid(`Unknown column '${columnName}'.`);
  const actual = row[columnName];
  const expected = parseLiteral(match[3]);
  if (actual === null || actual === undefined) return false;
  const actualText = String(actual);

  if (match[2].toUpperCase() === 'LIKE') {
    const pattern = [...expected].map(character => {
      if (character === '%') return '.*';
      if (character === '_') return '.';
      return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return new RegExp(`^${pattern}$`, 'i').test(actualText);
  }

  const leftNumber = Number(actualText);
  const rightNumber = Number(expected);
  const bothNumeric = actualText.trim() !== '' && String(rightNumber) === expected && Number.isFinite(leftNumber);
  const left = bothNumeric ? leftNumber : actualText.toLowerCase();
  const right = bothNumeric ? rightNumber : expected.toLowerCase();
  switch (match[2]) {
    case '=': return left === right;
    case '!=':
    case '<>': return left !== right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default: return false;
  }
}

function parseWhere(where) {
  if (!where) return () => true;
  const conditions = where.split(/\s+AND\s+/i);
  return row => conditions.every(condition => matchesCondition(row, condition.trim()));
}

function result(columns, rows, message, database, selectable = false) {
  return { columns, rows, message, database, selectable };
}

function describeRows() {
  return SUSPECTS_SCHEMA.map(column => ({
    values: {
      Field: column.name,
      Type: column.type,
      Null: column.nullable ? 'YES' : 'NO',
      Key: column.key,
      Default: column.nullable ? 'NULL' : '—',
      Extra: ''
    }
  }));
}

export function executeSuspectsSql(command, suspects, currentDatabase = DATABASE_NAME) {
  let query = command.trim().replace(/;\s*$/, '');
  if (!query || query.includes(';')) invalid('Enter one SQL command at a time.');

  if (/^HELP$/i.test(query)) {
    return result([], [], [
      'SHOW DATABASES;  USE epochcorp;  SELECT DATABASE();',
      'SHOW TABLES;  DESCRIBE suspects;  SHOW COLUMNS FROM suspects;  SHOW CREATE TABLE suspects;',
      'SELECT * FROM suspects;',
      "SELECT id, name, type FROM suspects WHERE type = 'MAIN';",
      "SELECT name, role FROM suspects WHERE name LIKE '%Ram%' ORDER BY name ASC LIMIT 5;",
      'SELECT supports column lists, WHERE comparisons (=, !=, <>, >, <, >=, <=, LIKE) joined with AND, ORDER BY, and LIMIT.'
    ].join('\n'), currentDatabase);
  }
  if (/^SHOW\s+DATABASES$/i.test(query)) {
    return result(['Database'], [{ values: { Database: DATABASE_NAME } }], '1 row in set', currentDatabase);
  }
  const useMatch = query.match(/^USE\s+(`?\w+`?)$/i);
  if (useMatch) {
    const database = cleanIdentifier(useMatch[1]);
    if (database !== DATABASE_NAME) invalid(`Unknown database '${database}'.`);
    return result([], [], `Database changed to ${DATABASE_NAME}.`, database);
  }
  if (/^SELECT\s+DATABASE\s*\(\s*\)$/i.test(query)) {
    return result(['DATABASE()'], [{ values: { 'DATABASE()': currentDatabase } }], '1 row in set', currentDatabase);
  }
  const showTablesMatch = query.match(/^SHOW\s+TABLES(?:\s+FROM\s+(`?\w+`?))?$/i);
  if (showTablesMatch) {
    const database = showTablesMatch[1]
      ? validateDatabase(showTablesMatch[1], currentDatabase)
      : validateDatabase(currentDatabase, currentDatabase);
    return result([`Tables_in_${database}`], [{ values: { [`Tables_in_${database}`]: TABLE_NAME } }], '1 row in set', currentDatabase);
  }

  const describeMatch = query.match(/^(?:DESCRIBE|DESC)\s+((?:`?\w+`?\.)?`?\w+`?)$/i)
    || query.match(/^SHOW\s+COLUMNS\s+FROM\s+((?:`?\w+`?\.)?`?\w+`?)$/i);
  if (describeMatch) {
    validateTable(describeMatch[1], currentDatabase);
    return result(['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], describeRows(), `${SUSPECTS_SCHEMA.length} rows in set`, currentDatabase);
  }

  const createMatch = query.match(/^SHOW\s+CREATE\s+TABLE\s+((?:`?\w+`?\.)?`?\w+`?)$/i);
  if (createMatch) {
    validateTable(createMatch[1], currentDatabase);
    return result(['Table', 'Create Table'], [{
      values: { Table: TABLE_NAME, 'Create Table': CREATE_TABLE_SQL }
    }], '1 row in set', currentDatabase);
  }

  const selectMatch = query.match(/^SELECT\s+(.+?)\s+FROM\s+((?:`?\w+`?\.)?`?\w+`?)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+`?(\w+)`?(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!selectMatch) invalid('Unsupported SQL syntax. Use a listed read-only command.');
  validateTable(selectMatch[2], currentDatabase);

  const columnsText = selectMatch[1].trim();
  const selectedColumns = columnsText === '*'
    ? SUSPECTS_SCHEMA.map(column => column.name)
    : columnsText.split(',').map(column => cleanIdentifier(column.trim()));
  if (!selectedColumns.length || selectedColumns.some(column => !SUSPECTS_SCHEMA.some(item => item.name === column))) {
    invalid('SELECT contains an unknown column.');
  }
  if (columnsText !== '*' && !/^(?:`?\w+`?\s*,\s*)*`?\w+`?$/.test(columnsText)) {
    invalid('Use * or a comma-separated list of column names after SELECT.');
  }

  const predicate = parseWhere(selectMatch[3]);
  let rows = suspects.map(asRow).filter(predicate);
  const orderColumn = selectMatch[4] ? cleanIdentifier(selectMatch[4]) : null;
  if (orderColumn && !SUSPECTS_SCHEMA.some(column => column.name === orderColumn)) {
    invalid(`Unknown column '${orderColumn}'.`);
  }
  if (orderColumn) {
    const direction = selectMatch[5] && selectMatch[5].toUpperCase() === 'DESC' ? -1 : 1;
    rows = rows.slice().sort((left, right) =>
      String(left[orderColumn] ?? '').localeCompare(String(right[orderColumn] ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * direction
    );
  }
  if (selectMatch[6] !== undefined) rows = rows.slice(0, Number(selectMatch[6]));

  return result(
    selectedColumns,
    rows.map(row => ({
      suspectId: row.id,
      values: Object.fromEntries(selectedColumns.map(column => [column, row[column]]))
    })),
    `${rows.length} row${rows.length === 1 ? '' : 's'} in set`,
    currentDatabase,
    true
  );
}
