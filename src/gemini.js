'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `אתה עוזר של בוט ווטסאפ בשם שולי. תפקידך לזהות את כוונת המשתמש מתוך הודעה בעברית ולהחזיר JSON בלבד.

הפורמט שחייב להחזיר (JSON בלבד, ללא markdown, ללא הסברים):
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

אם ההודעה אינה מתאימה לאף כוונה:
{"intent": "unknown", "params": {}}`;

async function detectIntent(message) {
  try {
    const prompt = `${SYSTEM_PROMPT}\n\nהודעה: ${message}`;
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    return JSON.parse(text);
  } catch (err) {
    console.error('Gemini error:', err.message);
    return { intent: 'unknown', params: {} };
  }
}

module.exports = { detectIntent };
