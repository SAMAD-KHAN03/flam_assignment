const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

// 1. Establish connection to the persistent SQLite file
// Force the database to be created in the parent (root) folder:
const dbPath = path.join(__dirname, "../queue.db");
const db = new DatabaseSync(dbPath, { timeout: 5000 });

// 2. Enable Write-Ahead Logging (WAL) mode for great cross-process concurrency
// CRITICAL FIX: Explicitly turn on WAL (Write-Ahead Logging) mode
// This allows multiple processes to read and write concurrently without hard-locking the file
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
// 3. Create the table to track active worker process IDs
db.exec(`
  CREATE TABLE IF NOT EXISTS active_workers (
    pid INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL
  );
`);

// 4. Create the core jobs management table
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    run_at TEXT NOT NULL,
    locked_until TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

console.log("[Database] Native SQLite storage layers fully initialized.");

// Export the open connection so our handler files can use it
module.exports = db;
