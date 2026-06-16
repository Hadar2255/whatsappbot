'use strict';

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function addAbsence(db, msg, sender, params) {
  const name = params.employee_name;
  if (!name) return msg.reply('לא הבנתי של מי ההיעדרות.');

  const reason = params.reason || 'היעדרות';
  const startDate = params.start_date || todayDate();
  const returnDate = params.return_date || null;
  const notes = params.notes || null;

  db.prepare(
    'INSERT INTO absences (employee_name, reason, start_date, return_date, notes, reported_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, reason, startDate, returnDate, notes, Date.now());

  let reply = `נרשמה היעדרות: *${name}* - ${reason}`;
  if (returnDate) reply += `\nצפוי/ה לחזור: ${returnDate}`;
  if (notes) reply += `\nהערה: ${notes}`;
  reply += ' ✓';

  await msg.reply(reply);
}

async function viewAbsences(db, msg, params) {
  const records = db.prepare(
    'SELECT employee_name, reason, start_date, return_date, notes FROM absences ORDER BY reported_at DESC LIMIT 20'
  ).all();

  if (records.length === 0) {
    return msg.reply('אין היעדרויות רשומות.');
  }

  const lines = records.map((r, i) => {
    let line = `${i + 1}. *${r.employee_name}* - ${r.reason} (מ-${r.start_date})`;
    if (r.return_date) line += ` | חזרה: ${r.return_date}`;
    if (r.notes) line += ` | ${r.notes}`;
    return line;
  });

  await msg.reply(`🤒 *היעדרויות:*\n${lines.join('\n')}`);
}

module.exports = { addAbsence, viewAbsences };
