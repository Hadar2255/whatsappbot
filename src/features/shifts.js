'use strict';

async function assignShift(db, msg, params) {
  const { employee_name, shift_date, start_time, end_time, notes } = params;

  if (!employee_name || !shift_date) {
    return msg.reply('חסר שם עובד או תאריך משמרת. אפשר לנסח שוב?');
  }

  db.prepare(
    'INSERT INTO shifts (employee_name, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(employee_name, shift_date, start_time || null, end_time || null, notes || null);

  let reply = `נוספה משמרת ל*${employee_name}* בתאריך ${shift_date}`;
  if (start_time || end_time) {
    reply += ` (${start_time || '?'} - ${end_time || '?'})`;
  }
  if (notes) reply += `\nהערה: ${notes}`;
  reply += ' ✓';

  await msg.reply(reply);
}

async function viewShifts(db, msg, params) {
  const { employee_name, shift_date } = params;

  let query = 'SELECT employee_name, shift_date, start_time, end_time, notes FROM shifts WHERE 1=1';
  const queryParams = [];

  if (employee_name) {
    query += ' AND employee_name LIKE ?';
    queryParams.push(`%${employee_name}%`);
  }
  if (shift_date) {
    query += ' AND shift_date = ?';
    queryParams.push(shift_date);
  }
  query += ' ORDER BY shift_date, start_time';

  const shifts = db.prepare(query).all(...queryParams);

  if (shifts.length === 0) {
    return msg.reply('לא נמצאו משמרות.');
  }

  const lines = shifts.map((s, i) => {
    let line = `${i + 1}. *${s.employee_name}* - ${s.shift_date}`;
    if (s.start_time || s.end_time) {
      line += ` (${s.start_time || '?'} - ${s.end_time || '?'})`;
    }
    if (s.notes) line += ` | ${s.notes}`;
    return line;
  });

  await msg.reply(`📅 *משמרות:*\n${lines.join('\n')}`);
}

module.exports = { assignShift, viewShifts };
