'use strict';

const express = require('express');
const path = require('path');
const { DatabaseSync: Database } = require('node:sqlite');
const fs = require('fs');
const { detectIntent } = require('./gemini');

const dataDir = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'personal_expenses.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT DEFAULT 'כללי',
    merchant TEXT,
    description TEXT,
    raw_text TEXT,
    created_at INTEGER NOT NULL
  );
`);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple HTML dashboard
app.get('/', (req, res) => {
  const period = req.query.period || 'month';
  const since = periodToMs(period);

  const rows = db.prepare(
    'SELECT id, amount, category, merchant, description, created_at FROM expenses WHERE created_at >= ? ORDER BY created_at DESC'
  ).all(since);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const byCategory = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
  }

  const catRows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, sum]) => `<tr><td>${cat}</td><td>₪${sum.toFixed(2)}</td></tr>`)
    .join('');

  const expenseRows = rows.map(r => {
    const d = new Date(r.created_at).toLocaleString('he-IL');
    return `<tr>
      <td>${d}</td>
      <td>${r.merchant || '—'}</td>
      <td>${r.category}</td>
      <td>₪${r.amount.toFixed(2)}</td>
      <td>${r.description || ''}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>מעקב הוצאות - שולי</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
  h1 { color: #333; }
  .total { font-size: 2em; color: #2e7d32; font-weight: bold; margin: 16px 0; }
  .filters { margin: 12px 0; }
  .filters a { margin-left: 12px; padding: 6px 14px; background: #1976d2; color: white;
               text-decoration: none; border-radius: 4px; }
  .filters a.active { background: #0d47a1; }
  table { border-collapse: collapse; width: 100%; background: white; border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1); margin-top: 16px; }
  th, td { padding: 10px 14px; border-bottom: 1px solid #eee; text-align: right; }
  th { background: #f0f0f0; font-weight: bold; }
  h2 { margin-top: 28px; }
  form { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
  form input, form select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  form button { padding: 8px 18px; background: #2e7d32; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
</style>
</head>
<body>
<h1>💰 מעקב הוצאות — שולי</h1>
<div class="filters">
  תצוגה:
  <a href="?period=today" ${period==='today'?'class="active"':''}>היום</a>
  <a href="?period=week" ${period==='week'?'class="active"':''}>השבוע</a>
  <a href="?period=month" ${period==='month'?'class="active"':''}>החודש</a>
  <a href="?period=all" ${period==='all'?'class="active"':''}>הכל</a>
</div>
<div class="total">סה"כ: ₪${total.toFixed(2)}</div>

<h2>הוספה ידנית</h2>
<form method="POST" action="/add">
  <div><label>סכום (₪)<br><input name="amount" type="number" step="0.01" required placeholder="0.00"></label></div>
  <div><label>קטגוריה<br><input name="category" placeholder="אוכל, דלק, ציוד..."></label></div>
  <div><label>תיאור<br><input name="description" placeholder="תיאור אופציונלי"></label></div>
  <div><button type="submit">הוסף</button></div>
</form>

<h2>לפי קטגוריה</h2>
<table><tr><th>קטגוריה</th><th>סכום</th></tr>${catRows}</table>

<h2>כל ההוצאות</h2>
<table>
  <tr><th>תאריך</th><th>בית עסק</th><th>קטגוריה</th><th>סכום</th><th>תיאור</th></tr>
  ${expenseRows || '<tr><td colspan="5">אין הוצאות</td></tr>'}
</table>
</body></html>`);
});

// Manual add from web form
app.post('/add', (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (!amount || isNaN(amount)) return res.redirect('/');

  db.prepare(
    'INSERT INTO expenses (amount, category, merchant, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(amount, req.body.category || 'כללי', null, req.body.description || null, null, Date.now());

  res.redirect('/');
});

// Endpoint for phone automation (Tasker / iOS Shortcuts)
app.post('/expense', async (req, res) => {
  const text = req.body.text || req.body.notification || '';
  if (!text) return res.status(400).json({ error: 'missing text' });

  try {
    const result = await detectIntent(`רשום הוצאה מתוך ההודעה הזו: ${text}`);

    if (result.intent === 'expense_add' && result.params.amount) {
      const { amount, category, description } = result.params;
      const merchant = extractMerchant(text);

      db.prepare(
        'INSERT INTO expenses (amount, category, merchant, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(Number(amount), category || 'כללי', merchant, description || null, text, Date.now());

      console.log(`הוצאה נרשמה: ${amount} ₪ | ${category} | ${merchant || ''}`);
      return res.json({ ok: true, amount, category, merchant });
    }

    res.json({ ok: false, message: 'לא זוהה סכום כסף' });
  } catch (err) {
    console.error('שגיאה בניתוח הוצאה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function extractMerchant(text) {
  const patterns = [
    /ב[-–]([^\d,\n]+)/,
    /at\s+([^\d,\n]+)/i,
    /\*([^*]+)\*/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 40);
  }
  return null;
}

function periodToMs(period) {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === 'week') {
    const d = now.getDay();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (d === 0 ? 6 : d - 1)).getTime();
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return 0;
}

function startServer() {
  const port = process.env.EXPENSE_PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`💰 דשבורד הוצאות: http://localhost:${port}`);
  });
}

module.exports = { startServer };
