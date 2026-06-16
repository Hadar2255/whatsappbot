'use strict';

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function startOfPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff).getTime();
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  return 0;
}

async function addExpense(db, msg, sender, params) {
  const { amount, category, description } = params;
  if (!amount || isNaN(amount)) return msg.reply('לא הבנתי את הסכום.');

  db.prepare(
    'INSERT INTO expenses (amount, category, description, reported_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(Number(amount), category || 'כללי', description || null, sender || '', Date.now());

  await msg.reply(`נרשמה הוצאה: *${Number(amount).toLocaleString('he-IL')} ₪* | ${category || 'כללי'}${description ? ` — ${description}` : ''} ✓`);
}

async function viewExpenses(db, msg, params) {
  const period = params.period || 'month';
  const since = startOfPeriod(period);

  const rows = db.prepare(
    'SELECT amount, category, description, created_at FROM expenses WHERE created_at >= ? ORDER BY created_at DESC'
  ).all(since);

  if (rows.length === 0) {
    const labels = { today: 'היום', week: 'השבוע', month: 'החודש', all: '' };
    return msg.reply(`אין הוצאות רשומות ${labels[period] || ''}.`);
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  // Group by category
  const byCategory = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
  }

  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, sum]) => `  • ${cat}: ${sum.toLocaleString('he-IL')} ₪`)
    .join('\n');

  const periodLabel = { today: 'היום', week: 'השבוע', month: 'החודש', all: 'סה"כ' };
  const recentLines = rows.slice(0, 5).map(r => {
    const date = new Date(r.created_at).toLocaleDateString('he-IL');
    return `  ${date} | ${r.category} | ${r.amount.toLocaleString('he-IL')} ₪${r.description ? ` — ${r.description}` : ''}`;
  }).join('\n');

  await msg.reply(
    `💰 *הוצאות ${periodLabel[period] || ''}:*\n` +
    `סה"כ: *${total.toLocaleString('he-IL')} ₪*\n\n` +
    `*לפי קטגוריה:*\n${catLines}\n\n` +
    `*5 אחרונות:*\n${recentLines}`
  );
}

module.exports = { addExpense, viewExpenses };
