import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'trading_bot.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL'); // Better performance and concurrency

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS Orders (
    id TEXT PRIMARY KEY,
    pairId TEXT,
    market TEXT,
    type TEXT,
    localPrice INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Items (
    hash_name TEXT PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS Basis (
    market_name TEXT PRIMARY KEY,
    basis_prices TEXT
  );

  CREATE TABLE IF NOT EXISTS IdMap (
    market_name TEXT PRIMARY KEY,
    asset_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS AuditLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS ItemStreaks (
    market_name TEXT PRIMARY KEY,
    streak INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS Profits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market TEXT,
    sellPrice REAL,
    basis REAL,
    profit REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS CancelledOrders (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS ProcessedEvents (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS BuyLocks (
    market_name TEXT PRIMARY KEY,
    locked_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS LiquidateItems (
    market_name TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for existing databases
try {
  const tableInfo = db.prepare('PRAGMA table_info(Orders)').all() as any[];
  const hasCreatedAt = tableInfo.some(c => c.name === 'created_at');
  if (!hasCreatedAt) {
    console.log("[DB] Adding created_at column to Orders table...");
    try {
      db.exec('ALTER TABLE Orders ADD COLUMN created_at TEXT');
      db.exec("UPDATE Orders SET created_at = datetime('now') WHERE created_at IS NULL");
    } catch {
      db.exec(`
        CREATE TABLE Orders_new (
          id TEXT PRIMARY KEY,
          pairId TEXT,
          market TEXT,
          type TEXT,
          localPrice INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO Orders_new (id, pairId, market, type, localPrice)
          SELECT id, pairId, market, type, localPrice FROM Orders;
        DROP TABLE Orders;
        ALTER TABLE Orders_new RENAME TO Orders;
      `);
    }
    console.log("[DB] Orders table migration successful.");
  }
} catch (e) {
  console.error("[DB] Migration error on Orders table:", e);
}

try {
  const tableInfo = db.prepare('PRAGMA table_info(CancelledOrders)').all() as any[];
  const idCol = tableInfo.find(c => c.name === 'id');
  if (idCol && idCol.type === 'INTEGER') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS CancelledOrders_new (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO CancelledOrders_new SELECT CAST(id AS TEXT), timestamp FROM CancelledOrders;
      DROP TABLE CancelledOrders;
      ALTER TABLE CancelledOrders_new RENAME TO CancelledOrders;
    `);
  }
} catch (e) {
  console.error("Migration error CancelledOrders:", e);
}

export default db;
