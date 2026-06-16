'use strict';

async function addTask(db, msg, sender, params) {
  const title = params.title;
  if (!title) return msg.reply('לא הבנתי מה המשימה. אפשר לנסח שוב?');

  db.prepare(
    'INSERT INTO tasks (title, assigned_to, created_at, completed) VALUES (?, ?, ?, 0)'
  ).run(title, params.assigned_to || null, Date.now());

  const assignee = params.assigned_to ? ` (שויך ל${params.assigned_to})` : '';
  await msg.reply(`הוספתי משימה: *${title}*${assignee} ✓`);
}

async function completeTask(db, msg, params) {
  const title = params.title;
  if (!title) return msg.reply('לא הבנתי איזו משימה לסמן כבוצעת.');

  const result = db.prepare(
    'UPDATE tasks SET completed = 1, completed_at = ? WHERE title LIKE ? AND completed = 0'
  ).run(Date.now(), `%${title}%`);

  if (result.changes === 0) {
    return msg.reply(`לא מצאתי משימה פתוחה בשם *${title}*.`);
  }

  await msg.reply(`סימנתי *${title}* כבוצע ✓`);
}

async function listTasks(db, msg) {
  const tasks = db.prepare(
    'SELECT title, assigned_to FROM tasks WHERE completed = 0 ORDER BY created_at ASC'
  ).all();

  if (tasks.length === 0) {
    return msg.reply('אין משימות פתוחות. הכל בוצע!');
  }

  const list = tasks.map((t, i) => {
    const assignee = t.assigned_to ? ` ← ${t.assigned_to}` : '';
    return `${i + 1}. ${t.title}${assignee}`;
  }).join('\n');

  await msg.reply(`📋 *משימות פתוחות:*\n${list}`);
}

module.exports = { addTask, completeTask, listTasks };
