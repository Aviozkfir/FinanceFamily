// The terms of use shown on first launch. Raising VERSION asks every user to accept again.
import type { Lang } from './types';

export const EULA_VERSION = 1;
const KEY = 'finance-eula';

export function eulaAccepted(): boolean {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as { version?: number } | null)?.version === EULA_VERSION; } catch { return false; }
}
export function acceptEula() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: EULA_VERSION, at: new Date().toISOString() })); } catch { /* storage unavailable: asked again next launch */ }
}

const TEXT: Record<Lang, { title: string; intro: string; sections: [string, string][] }> = {
  he: {
    title: 'תנאי שימוש',
    intro: 'לפני שמתחילים, כמה דברים שחשוב לדעת. השימוש באפליקציה מותנה בהסכמה לתנאים האלה.',
    sections: [
      ['מה האפליקציה עושה', 'האפליקציה היא כלי אישי למעקב אחרי הכנסות והוצאות. היא אינה ייעוץ פיננסי, ייעוץ השקעות או ייעוץ מס, ואינה תחליף לאיש מקצוע.'],
      ['הנתונים שלך', 'כל הנתונים שאתה מזין או מעלה נשמרים במכשיר הזה בלבד ואינם נשלחים לשום שרת. האחריות לגיבוי היא שלך: מחיקת האפליקציה או הנתונים שלה מוחקת אותם לצמיתות.'],
      ['דיוק', 'החישובים מבוססים על הקבצים שהעלית ועל הסיווג של העסקאות, שחלקו נעשה בניחוש אוטומטי. ייתכנו טעויות. בדוק את המספרים מול דפי החיוב לפני שאתה מסתמך עליהם.'],
      ['מה כן יוצא מהמכשיר', 'האפליקציה בודקת מול GitHub אם יש גרסה חדשה. אם תבחר לשלוח משוב, הטקסט שכתבת ופרטי הגרסה והמכשיר יועברו למפתח דרך שירות טפסים חיצוני. שום נתון פיננסי אינו נשלח.'],
      ['ללא אחריות', 'האפליקציה ניתנת חינם וכמות שהיא (AS IS), ללא אחריות מכל סוג. המפתח אינו אחראי לכל נזק, הפסד או החלטה שהתקבלה על סמך השימוש בה, ככל שהדין מתיר.'],
      ['שינויים', 'התנאים עשויים להתעדכן. במקרה כזה תתבקש לאשר אותם מחדש.'],
    ],
  },
  en: {
    title: 'Terms of use',
    intro: 'Before you start, a few things worth knowing. Using the app requires agreeing to these terms.',
    sections: [
      ['What the app does', 'The app is a personal tool for tracking income and spending. It is not financial, investment or tax advice, and it does not replace a professional.'],
      ['Your data', 'Everything you enter or upload is stored on this device only and is not sent to any server. Backing it up is your responsibility: deleting the app or its data deletes it for good.'],
      ['Accuracy', 'The calculations rely on the files you upload and on how transactions are classified, some of which is automatic guessing. Mistakes are possible. Check the numbers against your statements before relying on them.'],
      ['What does leave the device', 'The app checks GitHub for a new version. If you choose to send feedback, the text you wrote and the version and device details are passed to the developer through an outside form service. No financial data is sent.'],
      ['No warranty', 'The app is provided free and as is, with no warranty of any kind. To the extent the law allows, the developer is not liable for any damage, loss or decision made on the basis of using it.'],
      ['Changes', 'These terms may be updated. If they are, you will be asked to accept them again.'],
    ],
  },
};
export const eulaText = (lang: Lang) => TEXT[lang];
