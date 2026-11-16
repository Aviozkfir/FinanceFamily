// Built-in guesses for common Israeli merchants. The last resort of the classifier in learn.ts:
// used only for a merchant the user's own history says nothing about, and always shown as a guess.
type Guess = 'needs' | 'wants' | 'ignore';

const RULES: [RegExp, Guess][] = [
  // needs
  [/שופרסל|רמי לוי|ויקטורי|יוחננוף|אושר עד|טיב טעם|מגה|חצי חינם|יינות ביתן|קרפור|סופר|מרקט|מכולת|מינימרקט|ירקות|ירקונית|פירות|קצב|מאפיי/, 'needs'],
  [/פארם|בית מרקחת|מרקחת|דראגסטור|כללית|מכבי|מאוחדת|לאומית|רופא|מרפא|אופטיק/, 'needs'],
  [/דלק|פז |פז$|סונול|דור אלון|אלונית|ten |טן |yellow|מנהרות|כביש 6|חניון|חניה|פנגו|רכבת|רב.?קו|אגד|מוסך|טסט|רישוי/i, 'needs'],
  [/עירי[יה]ת|ארנונה|חברת החשמל|חשמל|מקורות|תאגיד|גז |אמישראגז|פזגז|סופרגז|ועד בית|ביטוח|הראל|מגדל|כלל |הפניקס|מנורה|איילון/, 'needs'],
  [/hot|הוט|yes|סלקום|פרטנר|פלאפון|בזק|cello|גולן|019|012|רמי לוי תקשורת|we4g/i, 'needs'],
  [/גן |מעון|צהרון|מתנ"ס|בית ספר|אוניברסיט|מכללה|שכר לימוד/, 'needs'],
  // wants
  [/מסעד|קפה|cafe|coffee|בר |פאב|פיצה|בורגר|סושי|שווארמה|פלאפל|חומוס|מקדונלד|ארומה|רולדין|גלידה|קונדיטור|wolt|וולט|תן ביס|10bis|משלוח/i, 'wants'],
  [/netflix|spotify|disney|apple\.com|google|youtube|amazon|prime|hbo|playstation|xbox|steam|duolingo|chatgpt|openai/i, 'wants'],
  [/zara|h&m|מנגו|קסטרו|fox|פוקס|גולף|רנואר|terminal|טרמינל|נעלי|אופנה|shein|aliexpress|asos|next|איקאה|ikea|הום סנטר|קרביץ|צעצוע|מתנ/i, 'wants'],
  [/סינמה|קולנוע|yes planet|תיאטר|הופעה|מלון|hotel|booking|airbnb|אל על|טיסות|חוף|פארק|רשות הטבע|ספא|כושר|חדר כושר|holmes|space/i, 'wants'],
  // deposits into savings are money kept, not spending
  [/פסגות|מיטב|אלטשולר|ילין|אקסלנס|ibi|אינטראקטיב|interactive brokers|בית השקעות|קרן השתלמות|קופת גמל|חיסכון|פקדון/i, 'ignore'],
];

export function guessBucket(merchant: string): Guess | null {
  for (const [re, bucket] of RULES) if (re.test(merchant)) return bucket;
  return null;
}
