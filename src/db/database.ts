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
    localPrice INTEGER
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
    id INTEGER PRIMARY KEY,
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
`);

export default db;
