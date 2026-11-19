// The method families Gili works with (Tzofim, "המסע בצופים"); see agents/method-families.md.
// Every method in an activity belongs to one family. Names are used as-is in feeds and saved activities,
// so never rename one: add new families instead.
export const METHOD_FAMILIES = [
  { name: 'משחק תחרות', examples: ['מירוץ שליחים', 'חידון', 'הדגל', 'משימה בקבוצות'] },
  { name: 'עשייה', examples: ['יצירת מפה של השכונה', 'מפגש עם קבוצה שונה', 'בניית תקנון', 'פרמידה אנושית'] },
  { name: 'ייצוג', examples: ['בחירת ציטוט / תמונה / טקסט', 'סולם מסכים – לא מסכים'] },
  { name: 'הבעה יצירתית', examples: ['כתיבת שיר', 'יצירת קולאז׳', 'הצגה', 'תרגיל התרחשות'] },
  { name: 'השראה', examples: ['עבודה עם טקסט', 'מפגש עם אדם מעורר השראה', 'צפייה בסרט / הרצאה', 'סיור במקום או בפרויקט'] },
  { name: 'דיון בשאלה', examples: ['החלפת דעות', 'משפט מבוים', 'יצירת פרובוקציה'] },
  { name: 'חשיבה משותפת', examples: ['סיעור מוחות', 'כתיבת סיפור בהמשכים ביחד', 'פיתוח רעיונות לפרויקט'] },
  { name: 'שיתוף', examples: ['מעגל הקשבה', 'סיפור אישי', 'פינת החניך'] },
  { name: 'משחק הדמייה', examples: ['משחק תפקידים', 'תרגילי תיאטרון', 'בית משפט'] },
  { name: 'התבוננות', examples: ['צפייה מהצד על פעילות', 'סיור בחינת השכונה', 'הסתכלות על עצמי'] },
  { name: 'הסבר', examples: ['מילולי', 'בציור', 'על ידי חפצים', 'דוגמאות מהשטח'] },
  { name: 'פירוק', examples: ['מחקר בסוגיה', 'ממה מורכב המצב בארץ?', 'יצירת תרשים'] },
] as const

export type MethodFamily = (typeof METHOD_FAMILIES)[number]['name']
