// Built-in guesses for common Israeli merchants. The last resort of the classifier in learn.ts:
// used only for a merchant the user's own history says nothing about, and always shown as a guess.
// Each rule points at one of the ready-made categories in presets.ts.
import type { PresetId } from './presets';

const RULES: [RegExp, PresetId | 'ignore'][] = [
  // needs
  // The pharmacy rule comes first: "סופר פארם" is a pharmacy, not a supermarket.
  [/פארם|בית מרקחת|מרקחת|דראגסטור|כללית|מכבי|מאוחדת|לאומית|רופא|מרפא|אופטיק/, 'health'],
  [/שופרסל|רמי לוי|ויקטורי|יוחננוף|אושר עד|טיב טעם|מגה|חצי חינם|יינות ביתן|קרפור|סופר|מרקט|מכולת|מינימרקט|ירקות|ירקונית|פירות|קצב|מאפיי/, 'groceries'],
  [/דלק|פז |פז$|סונול|דור אלון|אלונית|ten |טן |yellow|מנהרות|כביש 6|חניון|חניה|פנגו|רכבת|רב.?קו|אגד|מוסך|טסט|רישוי/i, 'transport'],
  [/עירי[יה]ת|ארנונה|חברת החשמל|חשמל|מקורות|תאגיד|גז |אמישראגז|פזגז|סופרגז|ועד בית|ביטוח|הראל|מגדל|כלל |הפניקס|מנורה|איילון/, 'home'],
  [/hot|הוט|yes|סלקום|פרטנר|פלאפון|בזק|cello|גולן|019|012|רמי לוי תקשורת|we4g/i, 'home'],
  [/גן |מעון|צהרון|מתנ"ס|בית ספר|אוניברסיט|מכללה|שכר לימוד/, 'kids'],
  // wants
  [/מסעד|קפה|cafe|coffee|בר |פאב|פיצה|בורגר|סושי|שווארמה|פלאפל|חומוס|מקדונלד|ארומה|רולדין|גלידה|קונדיטור|wolt|וולט|תן ביס|10bis|משלוח/i, 'eating'],
  [/netflix|spotify|disney|apple\.com|google|youtube|prime|hbo|playstation|xbox|steam|duolingo|chatgpt|openai/i, 'subscriptions'],
  [/מלון|hotel|booking|airbnb|אל על|טיסות/i, 'travel'],
  [/zara|h&m|מנגו|קסטרו|fox|פוקס|גולף|רנואר|terminal|טרמינל|נעלי|אופנה|shein|aliexpress|asos|next|amazon|איקאה|ikea|הום סנטר|קרביץ|צעצוע|מתנ/i, 'shopping'],
  [/סינמה|קולנוע|yes planet|תיאטר|הופעה|חוף|פארק|רשות הטבע|ספא|כושר|חדר כושר|holmes|space/i, 'leisure'],
  // deposits into savings are money kept, not spending
  [/פסגות|מיטב|אלטשולר|ילין|אקסלנס|ibi|אינטראקטיב|interactive brokers|בית השקעות|קרן השתלמות|קופת גמל|חיסכון|פקדון/i, 'ignore'],
];

export function guessPreset(merchant: string): PresetId | 'ignore' | null {
  for (const [re, preset] of RULES) if (re.test(merchant)) return preset;
  return null;
}
