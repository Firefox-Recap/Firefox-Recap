import initSqlJs from 'sql.js';

let db;

/**
 * Initializes the SQLite database persistently using IndexedDB.
 */
const initDB = async () => {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`,
  });

  const storedDb = await browser.storage.local.get('sqliteDB');

  if (storedDb.sqliteDB) {
    db = new SQL.Database(new Uint8Array(storedDb.sqliteDB));
    console.log('Loaded database from storage.');
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS categorizedHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        title TEXT,
        visitTime INTEGER,
        category TEXT  
      );
    `);
    console.log('SQLite DB Initialized.');
  }
};

/**
 * Saves a categorized history item to the database and persists it.
 */
export const saveHistory = async (historyItem) => {
  if (!db) {
    console.error('DB not initialized.');
    return;
  }

  const categoryValue = Array.isArray(historyItem.category)
    ? JSON.stringify(historyItem.category)
    : historyItem.category;

  const stmt = db.prepare(`
    INSERT INTO categorizedHistory (url, title, visitTime, category) 
    VALUES (?, ?, ?, ?);
  `);
  stmt.run([
    historyItem.url,
    historyItem.title,
    historyItem.visitTime,
    categoryValue,
  ]);
  stmt.free();

  const data = db.export();
  await browser.storage.local.set({sqliteDB: data});
  console.log('History item saved:', historyItem);
};

/**
 * Retrieves the latest categorized history from the database.
 */
export const getHistory = () => {
  if (!db) {
    console.error('DB not initialized.');
    return [];
  }
  const stmt = db.prepare(
    'SELECT * FROM categorizedHistory ORDER BY visitTime DESC LIMIT 100;',
  );
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();

    if (
      row.category &&
      typeof row.category === 'string' &&
      row.category.startsWith('[')
    ) {
      try {
        row.category = JSON.parse(row.category);
      } catch (e) {
        console.error('Error parsing category JSON:', e);
      }
    }

    rows.push(row);
  }
  stmt.free();
  return rows;
};

export default initDB;
