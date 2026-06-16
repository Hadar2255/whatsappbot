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

const puppeteerConfig = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
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

    default:
      await msg.reply('שולי לא הבינה את הבקשה. אפשר לנסות שוב בצורה אחרת?');
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
    if (!msg.from.endsWith('@g.us')) return;

    const groupId = msg.from;
    const sender = msg.author || msg.from;
    const content = msg.body || '';
    const timestamp = msg.timestamp || Math.floor(Date.now() / 1000);

    db.saveMessage(groupId, sender, content, timestamp);

    const botName = process.env.BOT_NAME || 'שולי';
    if (!content.includes(botName)) return;

    let intentResult;
    try {
      intentResult = await gemini.detectIntent(content);
    } catch (err) {
      console.error('שגיאה בזיהוי כוונה:', err.message);
      await msg.reply('מצטערת, אני לא מצליחה להבין כרגע. נסה שוב.');
      return;
    }

    try {
      await routeIntent(msg, groupId, sender, intentResult);
    } catch (err) {
      console.error('שגיאה בטיפול בבקשה:', err.message);
      await msg.reply('אירעה שגיאה. נסה שוב.');
    }
  });

  client.initialize();
}

module.exports = { startBot };
