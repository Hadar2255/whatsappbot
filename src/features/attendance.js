'use strict';

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')} שעות`;
}

async function clockIn(db, msg, sender, params) {
  const name = params.employee_name;
  if (!name) return msg.reply('לא הבנתי של מי הכניסה. אפשר לציין שם?');

  const today = todayDate();
  const open = db.prepare(
    'SELECT id FROM attendance WHERE employee_name LIKE ? AND date = ? AND clock_out IS NULL'
  ).get(`%${name}%`, today);

  if (open) {
    return msg.reply(`*${name}* כבר רשום/ה כנכנס/ת היום.`);
  }

  const now = Date.now();
  db.prepare(
    'INSERT INTO attendance (employee_name, clock_in, date) VALUES (?, ?, ?)'
  ).run(name, now, today);

  await msg.reply(`✅ *${name}* נכנס/ה לעבודה בשעה ${formatTime(now)}`);
}

async function clockOut(db, msg, sender, params) {
  const name = params.employee_name;
  if (!name) return msg.reply('לא הבנתי של מי היציאה. אפשר לציין שם?');

  const today = todayDate();
  const open = db.prepare(
    'SELECT id, clock_in FROM attendance WHERE employee_name LIKE ? AND date = ? AND clock_out IS NULL'
  ).get(`%${name}%`, today);

  if (!open) {
    return msg.reply(`לא נמצאה כניסה פתוחה עבור *${name}* היום.`);
  }

  const now = Date.now();
  db.prepare(
    'UPDATE attendance SET clock_out = ? WHERE id = ?'
  ).run(now, open.id);

  const duration = formatDuration(now - open.clock_in);
  await msg.reply(`✅ *${name}* יצא/ה מעבודה בשעה ${formatTime(now)}\nסה"כ: ${duration}`);
}

async function viewAttendance(db, msg, params) {
  const date = params.date || todayDate();
  const name = params.employee_name;

  let query = 'SELECT employee_name, clock_in, clock_out FROM attendance WHERE date = ?';
  const queryParams = [date];

  if (name) {
    query += ' AND employee_name LIKE ?';
    queryParams.push(`%${name}%`);
  }
  query += ' ORDER BY clock_in';

  const records = db.prepare(query).all(...queryParams);

  if (records.length === 0) {
    return msg.reply(`לא נמצאו רשומות נוכחות לתאריך ${date}.`);
  }

  const lines = records.map((r, i) => {
    const inTime = r.clock_in ? formatTime(r.clock_in) : '—';
    const outTime = r.clock_out ? formatTime(r.clock_out) : 'פתוח';
    let line = `${i + 1}. *${r.employee_name}* | כניסה: ${inTime} | יציאה: ${outTime}`;
    if (r.clock_in && r.clock_out) {
      line += ` | ${formatDuration(r.clock_out - r.clock_in)}`;
    }
    return line;
  });

  await msg.reply(`🕐 *נוכחות - ${date}:*\n${lines.join('\n')}`);
}

module.exports = { clockIn, clockOut, viewAttendance };
