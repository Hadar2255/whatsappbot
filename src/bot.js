'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const db = require('./database');
const gemini = require('./gemini');
const { transcribeAudio, analyzeImage, chat } = gemini;
const shopping = require('./features/shopping');
const tasks = require('./features/tasks');
const shifts = require('./features/shifts');
const attendance = require('./features/attendance');
const medical = require('./features/medical');
const absences = require('./features/absences');
const lists = require('./features/lists');
const expenses = require('./features/expenses');

// Conversation context: senderId → { messages, lastActivity }
const conversations = new Map();
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function isConversationActive(senderId) {
  const ctx = conversations.get(senderId);
  return ctx && (Date.now() - ctx.lastActivity < CONVERSATION_TIMEOUT);
}

function updateConversation(senderId, userMsg, botMsg) {
  const ctx = conversations.get(senderId) || { messages: [] };
  ctx.messages.push({ role: 'user', content: userMsg });
  if (botMsg) ctx.messages.push({ role: 'assistant', content: botMsg });
  if (ctx.messages.length > 12) ctx.messages = ctx.messages.slice(-12);
  ctx.lastActivity = Date.now();
  conversations.set(senderId, ctx);
}

function getHistory(senderId) {
  return conversations.get(senderId)?.messages || [];
}

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

async function routeIntentWithResult(msg, groupId, sender, intentResult) {
  let captured = null;
  const capturingMsg = msg === SILENT ? SILENT : {
    ...msg,
    reply: async (text) => { captured = text; return msg.reply(text); }
  };
  await routeIntent(capturingMsg, groupId, sender, intentResult);
  return captured;
}

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

    case 'list_add':
      return lists.addItem(groupDb, msg, sender, params);
    case 'list_remove':
      return lists.removeItem(groupDb, msg, params);
    case 'list_view':
      return lists.viewList(groupDb, msg, params);

    case 'expense_add':
      return expenses.addExpense(groupDb, msg, sender, params);
    case 'expense_view':
      return expenses.viewExpenses(groupDb, msg, params);

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
  'absence_add',
  'list_add', 'list_remove',
  'expense_add'
]);

const READ_INTENTS = new Set([
  'shopping_list', 'task_list', 'shift_view', 'attendance_view', 'medical_list', 'absence_view', 'list_view', 'expense_view'
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

function buildDbContext(groupDb) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleString('he-IL');
    let ctx = `תאריך ושעה: ${now}\n`;

    const tasks = groupDb.prepare('SELECT title, assigned_to FROM tasks WHERE completed = 0').all();
    if (tasks.length > 0) {
      ctx += `\nמשימות פתוחות (${tasks.length}):\n`;
      ctx += tasks.map(t => `- ${t.title}${t.assigned_to ? ` [${t.assigned_to}]` : ''}`).join('\n');
    }

    const shopping = groupDb.prepare('SELECT item FROM shopping_list WHERE removed = 0').all();
    if (shopping.length > 0) {
      ctx += `\n\nרשימת קניות: ${shopping.map(s => s.item).join(', ')}`;
    }

    const absences = groupDb.prepare(
      'SELECT employee_name, reason, return_date FROM absences ORDER BY reported_at DESC LIMIT 10'
    ).all();
    if (absences.length > 0) {
      ctx += `\n\nהיעדרויות:\n`;
      ctx += absences.map(a => `- ${a.employee_name}: ${a.reason}${a.return_date ? ` (חוזר ${a.return_date})` : ''}`).join('\n');
    }

    const shifts = groupDb.prepare(
      'SELECT employee_name, start_time, end_time FROM shifts WHERE shift_date = ?'
    ).all(today);
    if (shifts.length > 0) {
      ctx += `\n\nמשמרות היום:\n`;
      ctx += shifts.map(s => `- ${s.employee_name}${s.start_time ? ` ${s.start_time}–${s.end_time}` : ''}`).join('\n');
    }

    const attendance = groupDb.prepare(
      'SELECT employee_name, clock_in, clock_out FROM attendance WHERE date = ? ORDER BY clock_in'
    ).all(today);
    if (attendance.length > 0) {
      ctx += `\n\nנוכחות היום:\n`;
      ctx += attendance.map(a => {
        const inT = a.clock_in ? new Date(a.clock_in).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '?';
        const outT = a.clock_out ? new Date(a.clock_out).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : 'עדיין בעבודה';
        return `- ${a.employee_name}: ${inT} → ${outT}`;
      }).join('\n');
    }

    const expenses = groupDb.prepare(
      'SELECT SUM(amount) as total, COUNT(*) as cnt FROM expenses WHERE created_at >= ?'
    ).get(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime());
    if (expenses && expenses.total) {
      ctx += `\n\nהוצאות החודש: ₪${Number(expenses.total).toFixed(2)} (${expenses.cnt} פעולות)`;
    }

    return ctx;
  } catch (e) {
    return '';
  }
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
    console.log(`[הודעה] from=${msg.from} type=${msg.type} body=${(msg.body||'').slice(0,50)}`);
    if (!msg.from.endsWith('@g.us')) {
      console.log('[מדלג] לא הודעת קבוצה');
      return;
    }

    const groupId = msg.from;
    const sender = msg.author || msg.from;
    const content = msg.body || '';
    const timestamp = msg.timestamp || Math.floor(Date.now() / 1000);

    db.saveMessage(groupId, sender, content, timestamp);

    // Process voice / image messages
    if (msg.hasMedia && ['ptt', 'audio', 'image'].includes(msg.type)) {
      try {
        const media = await msg.downloadMedia();
        if (msg.type === 'ptt' || msg.type === 'audio') {
          const transcribed = await transcribeAudio(media);
          if (transcribed) {
            console.log(`[קול] ${sender}: ${transcribed}`);
            content = transcribed;
          }
        } else if (msg.type === 'image') {
          const description = await analyzeImage(media);
          if (description) {
            console.log(`[תמונה] ${sender}: ${description}`);
            content = description;
          }
        }
      } catch (err) {
        console.error('שגיאה בעיבוד מדיה:', err.message);
        return;
      }
    }

    if (!content || content.trim().length < 2) return;

    const botName = process.env.BOT_NAME || 'שולי';
    const isMentioned = content.includes(botName);
    const conversationActive = isConversationActive(sender);
    const shouldRespond = isMentioned || conversationActive;

    // Detect intent for all messages (write ops run silently)
    let intentResult;
    try {
      intentResult = await gemini.detectIntent(content);
    } catch (err) {
      console.error('שגיאה בזיהוי כוונה:', err.message);
      if (shouldRespond) await msg.reply('מצטערת, אני לא מצליחה להבין כרגע. נסה שוב.');
      return;
    }

    const { intent } = intentResult;

    try {
      if (WRITE_INTENTS.has(intent)) {
        // Write ops: always execute; reply only if שולי mentioned or conversation active
        const replyMsg = shouldRespond ? msg : SILENT;
        const botReply = await routeIntentWithResult(replyMsg, groupId, sender, intentResult);
        if (shouldRespond) updateConversation(sender, content, botReply);

      } else if (READ_INTENTS.has(intent) && shouldRespond) {
        const botReply = await routeIntentWithResult(msg, groupId, sender, intentResult);
        updateConversation(sender, content, botReply);

      } else if (shouldRespond) {
        // Conversational response with live DB context
        const history = getHistory(sender);
        const dbContext = buildDbContext(db.getDb(groupId));
        const reply = await chat(content, history, dbContext);
        await msg.reply(reply);
        updateConversation(sender, content, reply);
      }
    } catch (err) {
      console.error('שגיאה בטיפול בבקשה:', err.message);
      if (shouldRespond) await msg.reply('אירעה שגיאה. נסה שוב.');
    }
  });

  client.initialize();
}

module.exports = { startBot };
