'use strict';

const { hebrewWeekday } = require('../utils');

async function addReminder(db, msg, sender, params) {
  const { reminder_text, date, time } = params;
  if (!reminder_text || !date || !time) return msg.reply('לא הבנתי על מה ומתי להזכיר. אפשר לנסח מחדש?');

  const remind_at = new Date(`${date}T${time}:00`).getTime();
  if (isNaN(remind_at)) return msg.reply('לא הצלחתי להבין את השעה/תאריך.');

  if (remind_at <= Date.now()) return msg.reply('הזמן שציינת כבר עבר 😅');

  db.prepare(
    'INSERT INTO reminders (sender_id, reminder_text, remind_at, sent, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(sender, reminder_text, remind_at, Date.now());

  const day = hebrewWeekday(date);
  await msg.reply(`🔔 אזכיר לך *${reminder_text}* ב-${date}${day ? ` (יום ${day})` : ''} בשעה ${time} ✓`);
}

async function listReminders(db, msg, sender) {
  const rows = db.prepare(
    'SELECT reminder_text, remind_at FROM reminders WHERE sender_id = ? AND sent = 0 AND remind_at > ? ORDER BY remind_at ASC'
  ).all(sender, Date.now());

  if (rows.length === 0) return msg.reply('אין לך תזכורות ממתינות.');

  const list = rows.map(r => {
    const d = new Date(r.remind_at);
    const date = d.toISOString().split('T')[0];
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const day = hebrewWeekday(date);
    return `- ${date} (יום ${day}) ${time}: ${r.reminder_text}`;
  }).join('\n');

  await msg.reply(`🔔 *תזכורות ממתינות:*\n${list}`);
}

module.exports = { addReminder, listReminders };
