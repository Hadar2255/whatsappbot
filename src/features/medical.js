'use strict';

const STATUS_LABELS = {
  pending: 'ממתין',
  completed: 'טופל'
};

async function addRequest(db, msg, sender, params) {
  const { description, date } = params;
  if (!description) return msg.reply('לא הבנתי את הבקשה הרפואית. אפשר לפרט?');

  const requestDate = date || new Date().toLocaleDateString('he-IL');

  db.prepare(
    'INSERT INTO medical_requests (requester, description, date, status) VALUES (?, ?, ?, ?)'
  ).run(sender || 'לא ידוע', description, requestDate, 'pending');

  await msg.reply(`נרשמה בקשה רפואית:\n📋 *${description}*\n📅 תאריך: ${requestDate} ✓`);
}

async function listRequests(db, msg, params) {
  const status = params.status || null;

  let query = 'SELECT requester, description, date, status FROM medical_requests WHERE 1=1';
  const queryParams = [];

  if (status) {
    query += ' AND status = ?';
    queryParams.push(status);
  }
  query += ' ORDER BY date DESC, rowid DESC';

  const requests = db.prepare(query).all(...queryParams);

  if (requests.length === 0) {
    const filter = status ? ` בסטטוס "${STATUS_LABELS[status] || status}"` : '';
    return msg.reply(`אין בקשות רפואיות${filter}.`);
  }

  const lines = requests.map((r, i) => {
    const statusLabel = STATUS_LABELS[r.status] || r.status;
    return `${i + 1}. *${r.description}* (${r.date}) - ${statusLabel}`;
  });

  const title = status ? `בקשות רפואיות - ${STATUS_LABELS[status] || status}` : 'בקשות רפואיות';
  await msg.reply(`🏥 *${title}:*\n${lines.join('\n')}`);
}

module.exports = { addRequest, listRequests };
