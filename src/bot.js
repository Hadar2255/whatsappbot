'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const db = require('./database');
const gemini = require('./gemini');
const shopping = require('./features/shopping');
const tasks = require('./features/tasks');
const shifts = require('./features/shifts');
const attendance = require('./features/attendance');
const medical = require('./features/medical');
const absences = require('./features/absences');

const CHROME_PATHS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.platform === 'win32') {
    const fs = require('fs');
    for (const p of CHROME_PATHS_WINDOWS) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (_) {}
    }
  }
  return undefined;
}

const executablePath = findChrome();
if (executablePath) {
  console.log('משתמש בדפדפן:', executablePath);
}

const puppeteerConfig = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  ...(executablePath && { executablePath })
};

async function routeIntent(msg, groupId, sender, { intent, params }) {
  const groupDb = db.getDb(groupId);

  switch (intent) {
    case 'shopping_add':
      return shopping.addItem(groupDb, msg, sender, params);
    case 'shopping_remove':
      return shopping.removeItem(groupDb, msg, params);
    case 'shopping_list':
      return shopping.listItems(groupDb, msg);

    case 'task_add':
      return tasks.addTask(groupDb, msg, sender, params);
    case 'task_complete':
      return tasks.completeTask(groupDb, msg, params);
    case 'task_list':
      return tasks.listTasks(groupDb, msg);

    case 'shift_assign':
      return shifts.assignShift(groupDb, msg, params);
    case 'shift_view':
      return shifts.viewShifts(groupDb, msg, params);

    case 'attendance_in':
      return attendance.clockIn(groupDb, msg, sender, params);
    case 'attendance_out':
      return attendance.clockOut(groupDb, msg, sender, params);
    case 'attendance_view':
      return attendance.viewAttendance(groupDb, msg, params);

    case 'medical_add':
      return medical.addRequest(groupDb, msg, sender, params);
    case 'medical_list':
      return medical.listRequests(groupDb, msg, params);

    case 'absence_add':
      return absences.addAbsence(groupDb, msg, sender, params);
    case 'absence_view':
      return absences.viewAbsences(groupDb, msg, params);

    default:
      await msg.reply('שולי לא הבינה את הבקשה. אפשר לנסות שוב בצורה אחרת?');
  }
}

const WRITE_INTENTS = new Set([
  'shopping_add', 'shopping_remove',
  'task_add', 'task_complete',
  'shift_assign',
  'attendance_in', 'attendance_out',
  'medical_add',
  'absence_add'
]);

const READ_INTENTS = new Set([
  'shopping_list', 'task_list', 'shift_view', 'attendance_view', 'medical_list', 'absence_view'
]);

const SILENT = { reply: async () => {} };

async function showSummary(msg, groupId) {
  const groupDb = db.getDb(groupId);

  const shoppingItems = groupDb.prepare(
    'SELECT item FROM shopping_list WHERE removed = 0 ORDER BY added_at ASC'
  ).all();
  const openTasks = groupDb.prepare(
    'SELECT title, assigned_to FROM tasks WHERE completed = 0 ORDER BY created_at ASC'
  ).all();

  let parts = [];

  if (shoppingItems.length > 0) {
    const list = shoppingItems.map((r, i) => `${i + 1}. ${r.item}`).join('\n');
    parts.push(`🛒 *רשימת קניות (${shoppingItems.length}):*\n${list}`);
  }

  if (openTasks.length > 0) {
    const list = openTasks.map((t, i) => {
      const a = t.assigned_to ? ` ← ${t.assigned_to}` : '';
      return `${i + 1}. ${t.title}${a}`;
    }).join('\n');
    parts.push(`📋 *משימות פתוחות (${openTasks.length}):*\n${list}`);
  }

  if (parts.length === 0) {
    return msg.reply('אין פריטים פתוחים ברשימות כרגע.');
  }

  await msg.reply(parts.join('\n\n'));
}

function startBot() {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
  });

  client.on('qr', (qr) => {
    console.log('\nסרוק את קוד ה-QR עם WhatsApp שלך:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✓ שולי מוכנה! הבוט מחובר ל-WhatsApp');
  });

  client.on('auth_failure', (msg) => {
    console.error('שגיאת אימות:', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('הבוט התנתק:', reason);
  });

  client.on('message', async (msg) => {
    if (!msg.from.endsWith('@g.us')) return;

    const groupId = msg.from;
    const sender = msg.author || msg.from;
    const content = msg.body || '';
    const timestamp = msg.timestamp || Math.floor(Date.now() / 1000);

    db.saveMessage(groupId, sender, content, timestamp);

    const botName = process.env.BOT_NAME || 'שולי';
    const isMentioned = content.includes(botName);

    // Skip if not mentioned and content is too short to contain intent
    if (!isMentioned && content.trim().length < 3) return;

    let intentResult;
    try {
      intentResult = await gemini.detectIntent(content);
    } catch (err) {
      console.error('שגיאה בזיהוי כוונה:', err.message);
      if (isMentioned) await msg.reply('מצטערת, אני לא מצליחה להבין כרגע. נסה שוב.');
      return;
    }

    const { intent } = intentResult;

    try {
      if (WRITE_INTENTS.has(intent)) {
        // Write ops run silently always; reply only when שולי mentioned
        await routeIntent(isMentioned ? msg : SILENT, groupId, sender, intentResult);
      } else if (READ_INTENTS.has(intent) && isMentioned) {
        await routeIntent(msg, groupId, sender, intentResult);
      } else if (isMentioned) {
        // שולי mentioned but no specific intent → show summary
        await showSummary(msg, groupId);
      }
    } catch (err) {
      console.error('שגיאה בטיפול בבקשה:', err.message);
      await msg.reply('אירעה שגיאה. נסה שוב.');
    }
  });

  client.initialize();
}

module.exports = { startBot };
