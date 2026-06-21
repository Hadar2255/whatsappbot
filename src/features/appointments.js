'use strict';

const { hebrewWeekday } = require('../utils');

async function addAppointment(db, msg, sender, params) {
  const { title, date, start_time, end_time, notes } = params;
  if (!title || !date) return msg.reply('לא הבנתי מתי ומה התור/הפגישה.');

  db.prepare(
    'INSERT INTO appointments (title, event_date, start_time, end_time, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(title, date, start_time || null, end_time || null, notes || null, sender || '', Date.now());

  const day = hebrewWeekday(date);
  const timeStr = start_time ? ` בשעה ${start_time}${end_time ? `–${end_time}` : ''}` : '';
  await msg.reply(`רשמתי: *${title}* ב-${date}${day ? ` (יום ${day})` : ''}${timeStr} ✓`);
}

function rangeToDates(range, explicitDate) {
  if (explicitDate) return [explicitDate];

  const toStr = d => d.toISOString().split('T')[0];
  const today = new Date();

  if (range === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return [toStr(d)];
  }
  if (range === 'week') {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(toStr(d));
    }
    return dates;
  }
  if (range === 'all') return null;
  return [toStr(today)];
}

async function viewAppointments(db, msg, params) {
  const { date, range } = params || {};
  const dates = rangeToDates(range, date);

  const rows = dates
    ? db.prepare(
        `SELECT title, event_date, start_time, end_time, notes FROM appointments
         WHERE event_date IN (${dates.map(() => '?').join(',')})
         ORDER BY event_date ASC, start_time ASC`
      ).all(...dates)
    : db.prepare(
        'SELECT title, event_date, start_time, end_time, notes FROM appointments ORDER BY event_date ASC, start_time ASC'
      ).all();

  if (rows.length === 0) return msg.reply('אין תוכניות רשומות לטווח הזה.');

  const list = rows.map(r => {
    const day = hebrewWeekday(r.event_date);
    const timeStr = r.start_time ? ` ${r.start_time}${r.end_time ? `–${r.end_time}` : ''}` : '';
    return `- ${r.event_date}${day ? ` (יום ${day})` : ''}${timeStr}: ${r.title}`;
  }).join('\n');

  await msg.reply(`📅 *תוכניות:*\n${list}`);
}

module.exports = { addAppointment, viewAppointments };
