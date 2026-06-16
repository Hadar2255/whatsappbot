'use strict';

const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });

const connections = new Map();

function sanitizeGroupId(groupId) {
  return groupId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      added_by TEXT,
      added_at INTEGER NOT NULL,
      removed INTEGER DEFAULT 0,
      removed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assigned_to TEXT,
      created_at INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      clock_in INTEGER,
      clock_out INTEGER,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medical_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'pending'
    );
  `);
}

function getDb(groupId) {
  if (connections.has(groupId)) {
    return connections.get(groupId);
  }

  const filename = sanitizeGroupId(groupId) + '.db';
  const dbPath = path.join(dataDir, filename);
  const db = new Database(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);

  connections.set(groupId, db);
  return db;
}

function saveMessage(groupId, sender, content, timestamp) {
  const db = getDb(groupId);
  db.prepare(
    'INSERT INTO messages (sender, content, timestamp) VALUES (?, ?, ?)'
  ).run(sender || '', content || '', timestamp || Date.now());
}

module.exports = { getDb, saveMessage };
