'use strict';

async function addItem(db, msg, sender, params) {
  const item = params.item;
  if (!item) return msg.reply('לא הבנתי מה להוסיף לרשימה.');

  const existing = db.prepare(
    'SELECT id FROM shopping_list WHERE item = ? AND removed = 0'
  ).get(item);

  if (existing) {
    return msg.reply(`*${item}* כבר נמצא ברשימת הקניות.`);
  }

  db.prepare(
    'INSERT INTO shopping_list (item, added_by, added_at, removed) VALUES (?, ?, ?, 0)'
  ).run(item, sender || '', Date.now());

  await msg.reply(`הוספתי *${item}* לרשימת הקניות ✓`);
}

async function removeItem(db, msg, params) {
  const item = params.item;
  if (!item) return msg.reply('לא הבנתי מה להסיר מהרשימה.');

  const result = db.prepare(
    'UPDATE shopping_list SET removed = 1, removed_at = ? WHERE item LIKE ? AND removed = 0'
  ).run(Date.now(), `%${item}%`);

  if (result.changes === 0) {
    return msg.reply(`לא מצאתי *${item}* ברשימת הקניות.`);
  }

  await msg.reply(`הסרתי *${item}* מרשימת הקניות ✓`);
}

async function listItems(db, msg) {
  const items = db.prepare(
    'SELECT item FROM shopping_list WHERE removed = 0 ORDER BY added_at ASC'
  ).all();

  if (items.length === 0) {
    return msg.reply('רשימת הקניות ריקה.');
  }

  const list = items.map((r, i) => `${i + 1}. ${r.item}`).join('\n');
  await msg.reply(`🛒 *רשימת קניות:*\n${list}`);
}

module.exports = { addItem, removeItem, listItems };
