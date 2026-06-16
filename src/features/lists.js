'use strict';

async function addItem(db, msg, sender, params) {
  const { list_name, item } = params;
  if (!list_name || !item) return msg.reply('לא הבנתי לאיזו רשימה להוסיף.');

  const existing = db.prepare(
    'SELECT id FROM general_lists WHERE list_name = ? AND item = ? AND removed = 0'
  ).get(list_name, item);

  if (existing) return msg.reply(`*${item}* כבר נמצא ברשימת ${list_name}.`);

  db.prepare(
    'INSERT INTO general_lists (list_name, item, added_by, added_at, removed) VALUES (?, ?, ?, ?, 0)'
  ).run(list_name, item, sender || '', Date.now());

  await msg.reply(`הוספתי *${item}* לרשימת *${list_name}* ✓`);
}

async function removeItem(db, msg, params) {
  const { list_name, item } = params;
  if (!list_name || !item) return msg.reply('לא הבנתי מה להסיר.');

  const result = db.prepare(
    'UPDATE general_lists SET removed = 1, removed_at = ? WHERE list_name = ? AND item LIKE ? AND removed = 0'
  ).run(Date.now(), list_name, `%${item}%`);

  if (result.changes === 0) return msg.reply(`לא מצאתי *${item}* ברשימת *${list_name}*.`);
  await msg.reply(`הסרתי *${item}* מרשימת *${list_name}* ✓`);
}

async function viewList(db, msg, params) {
  const { list_name } = params;

  if (list_name) {
    const items = db.prepare(
      'SELECT item FROM general_lists WHERE list_name = ? AND removed = 0 ORDER BY added_at ASC'
    ).all(list_name);

    if (items.length === 0) return msg.reply(`רשימת *${list_name}* ריקה.`);

    const list = items.map((r, i) => `${i + 1}. ${r.item}`).join('\n');
    return msg.reply(`📝 *${list_name}:*\n${list}`);
  }

  // Show all lists
  const rows = db.prepare(
    'SELECT DISTINCT list_name FROM general_lists WHERE removed = 0 ORDER BY list_name'
  ).all();

  if (rows.length === 0) return msg.reply('אין רשימות כלליות כרגע.');

  let reply = '📝 *רשימות כלליות:*\n';
  for (const { list_name: name } of rows) {
    const items = db.prepare(
      'SELECT item FROM general_lists WHERE list_name = ? AND removed = 0'
    ).all(name);
    reply += `\n*${name}* (${items.length}):\n`;
    reply += items.map((r, i) => `  ${i + 1}. ${r.item}`).join('\n');
  }

  await msg.reply(reply);
}

module.exports = { addItem, removeItem, viewList };
