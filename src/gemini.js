'use strict';

const Groq = require('groq-sdk');
const { toFile } = require('groq-sdk');

const SYSTEM_PROMPT = `אתה עוזר של בוט ווטסאפ בשם שולי. תפקידך לזהות את כוונת המשתמש מתוך הודעה בעברית ולהחזיר JSON בלבד.

הפורמט שחייב להחזיר (JSON בלבד):
{"intent": "...", "params": {...}}

הכוונות האפשריות:

רשימת קניות:
- shopping_add: הוספת פריט ("תוסיפי חלב", "קני ביצים", "הוסף לחם")
  params: {"item": "שם הפריט"}
- shopping_remove: הסרת פריט ("תמחקי חלב", "הוציאי ביצים מהרשימה", "מחק לחם")
  params: {"item": "שם הפריט"}
- shopping_list: הצגת הרשימה ("מה יש ברשימה", "תראי לי את הקניות", "מה צריך לקנות")
  params: {}

משימות:
- task_add: הוספת משימה ("תוסיפי משימה לתקן את הברז", "תוסיפי: לקנות מתנה לאמא", "תזכירי לי להתקשר")
  params: {"title": "כותרת המשימה", "assigned_to": "שם אם צוין או null"}
- task_complete: סיום משימה ("סמני כבוצע", "סגרי את המשימה על הברז", "בוצע - לתקן ברז")
  params: {"title": "חלק מכותרת המשימה"}
- task_list: הצגת משימות ("מה המשימות", "תראי לי מה יש לעשות", "מה פתוח")
  params: {}

משמרות עובדים:
- shift_assign: הקצאת משמרת ("שימי את דוד ביום ראשון בבוקר", "הוסיפי משמרת לשרה ב-15/6 מ-8 עד 16")
  params: {"employee_name": "שם העובד", "shift_date": "תאריך כ-YYYY-MM-DD אם אפשר", "start_time": "שעת התחלה או null", "end_time": "שעת סיום או null", "notes": "הערה או null"}
- shift_view: הצגת משמרות ("מה המשמרות השבוע", "מתי עובד דוד", "מי עובד מחר")
  params: {"employee_name": "שם או null", "shift_date": "תאריך או null"}

נוכחות עובדים:
- attendance_in: כניסה לעבודה ("דוד נכנס", "אני מתחיל", "כניסה - יוסי", "פתיחת משמרת")
  params: {"employee_name": "שם העובד"}
- attendance_out: יציאה מעבודה ("דוד יוצא", "אני מסיים", "יציאה - יוסי", "סגירת משמרת")
  params: {"employee_name": "שם העובד"}
- attendance_view: צפייה בנוכחות ("מה שעות הנוכחות", "מתי נכנס דוד היום", "דוח נוכחות")
  params: {"employee_name": "שם או null", "date": "תאריך כ-YYYY-MM-DD או null"}

בקשות רפואיות:
- medical_add: הוספת בקשה רפואית ("צריך להגיש טופס רפואי", "יש לי תור לרופא ב-20/6", "בקשה רפואית - מחלה")
  params: {"description": "תיאור הבקשה", "date": "תאריך רלוונטי כמחרוזת"}
- medical_list: הצגת בקשות רפואיות ("מה הבקשות הרפואיות", "תראי לי את הטפסים הרפואיים", "בקשות פתוחות")
  params: {"status": "pending או completed או null לכולן"}

מעקב הוצאות (זהה באופן פסיבי כל הודעה שמזכירה סכום כסף):
- expense_add: רישום הוצאה ("שילמנו 450 שקל על דלק", "קנינו ציוד ב-800", "חשבונית 1200 ש"ח", "העברתי 500 לספק")
  params: {"amount": מספר_בלבד, "category": "קטגוריה מתאימה בעברית (דלק/ציוד/אוכל/שכר/ספקים/שיווק/תחזוקה/כללי/וכו')", "description": "תיאור קצר או null"}
- expense_view: הצגת דוח הוצאות ("כמה הוצאנו השבוע", "מה ההוצאות החודש", "סיכום הוצאות", "דוח כספי")
  params: {"period": "today או week או month או all"}

רשימות כלליות (השתמש בזה כאשר התוכן לא מתאים לשום קטגוריה אחרת אך ברור שמדובר בפריט שצריך לזכור/לעקוב אחריו):
- list_add: הוספה לרשימה כללית ("הוסיפי לרשימת ציוד: כיסאות", "פרויקטים: שיפוץ מחסן", "תזכורת חשובה: לשלם ארנונה")
  params: {"list_name": "שם הרשימה בעברית — בחר שם מתאים לתוכן (למשל: ציוד, פרויקטים, תזכורות, הזמנות, רכישות, וכו')", "item": "הפריט או הפעולה"}
- list_remove: הסרה מרשימה ("מחקי מרשימת ציוד כיסאות")
  params: {"list_name": "שם הרשימה", "item": "הפריט"}
- list_view: הצגת רשימה ("מה יש ברשימת ציוד", "תראי לי פרויקטים", "כל הרשימות")
  params: {"list_name": "שם הרשימה או null לכל הרשימות"}

היעדרויות עובדים:
- absence_add: רישום היעדרות / מחלה / חופש ("אפריים חולה", "שרה לא מגיעה היום", "יוסי חופש השבוע", "דוד חולה והוא חוזר בראשון")
  params: {"employee_name": "שם העובד", "reason": "סיבה (מחלה/חופש/אחר)", "start_date": "תאריך התחלה כ-YYYY-MM-DD", "return_date": "תאריך חזרה צפוי כמחרוזת או null", "notes": "הערה נוספת או null"}
- absence_view: הצגת היעדרויות ("מי חולה", "מי נעדר", "מה ההיעדרויות", "מי לא מגיע")
  params: {}

אם ההודעה אינה מתאימה לאף כוונה:
{"intent": "unknown", "params": {}}`;

// Support multiple keys comma-separated: GROQ_API_KEY=key1,key2,key3
const API_KEYS = (process.env.GROQ_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
if (API_KEYS.length === 0) throw new Error('חסר GROQ_API_KEY ב-.env');

const clients = API_KEYS.map(key => new Groq({ apiKey: key }));
let keyIndex = 0;

function nextClient() {
  const client = clients[keyIndex];
  keyIndex = (keyIndex + 1) % clients.length;
  return client;
}

async function callWithRotation(fn) {
  let lastErr;
  for (let attempt = 0; attempt < clients.length; attempt++) {
    const client = nextClient();
    try {
      return await fn(client);
    } catch (err) {
      lastErr = err;
      const is429 = err.status === 429 || String(err.message).includes('429');
      if (is429 && clients.length > 1) {
        console.log(`[key rotation] מפתח עמוס, עובר לבא (${attempt + 1}/${clients.length})...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function detectIntent(message) {
  try {
    const completion = await callWithRotation(client => client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    }));
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('Groq error:', err.message);
    return { intent: 'unknown', params: {} };
  }
}

async function transcribeAudio(media) {
  const mimeType = media.mimetype.split(';')[0].trim();
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'ogg';
  const audioBuffer = Buffer.from(media.data, 'base64');
  const file = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

  return callWithRotation(client => client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'he',
    response_format: 'text'
  })).then(t => typeof t === 'string' ? t : t.text || '');
}

async function analyzeImage(media) {
  const mimeType = media.mimetype.split(';')[0].trim();
  const dataUrl = `data:${mimeType};base64,${media.data}`;

  const completion = await callWithRotation(client => client.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: 'תאר בעברית מה בתמונה. אם יש חשבונית/קבלה — ציין את הסכום הכולל ושם העסק. אם יש רשימה — ציין את הפריטים. אם יש טקסט — תמלל אותו.' }
      ]
    }],
    temperature: 0
  }));
  return completion.choices[0].message.content || '';
}

const CHAT_PROMPT = `אתה שולי, עוזרת חכמה וחברותית בקבוצת ווטסאפ. ענה בעברית בצורה טבעית וידידותית.
אתה יכול לנהל רשימות קניות, משימות, משמרות, נוכחות, היעדרויות, הוצאות ועוד.
כשיש לך נתוני מערכת — השתמש בהם כדי לתת המלצות חכמות ומותאמות אישית.
אם שואלים שאלה כללית — ענה עליה כמו ChatGPT. אם מבקשים לבצע פעולה — בצע ואשר.
אל תחזור על שאלת המשתמש. תהיה קצר וענייני אלא אם ביקשו הסבר ארוך.`;

async function chat(message, history = [], dbContext = '') {
  try {
    const systemContent = dbContext
      ? `${CHAT_PROMPT}\n\n--- נתוני מערכת עדכניים ---\n${dbContext}\n--- סוף נתוני מערכת ---`
      : CHAT_PROMPT;

    const completion = await callWithRotation(client => client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemContent },
        ...history.slice(-10),
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 800
    }));
    return completion.choices[0].message.content || '';
  } catch (err) {
    console.error('Groq chat error:', err.message);
    return 'מצטערת, אין לי תשובה כרגע.';
  }
}

module.exports = { detectIntent, transcribeAudio, analyzeImage, chat };
