import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import type { BucketId, DB, Split } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, categoryName, useCardLabel, useL, useLang, useStore } from '../lib/store';
import { isNative } from '../lib/platform';
import { buildModel } from '../lib/learn';
import { CURRENT, checkForUpdate, currentChannel, installUpdate, readSnapshot, setChannel, snapshotDate, useUpdate } from '../lib/update';
import { CHANGELOG, linesOf } from '../lib/changelog';
import { exportBackup, exportTransactions } from '../lib/files';
import { feedbackEnabled, sendFeedback, type FeedbackKind } from '../lib/feedback';
import { EulaBody } from '../components/Eula';
import { BUCKET_COLOR, Button, Dot, IconButton, PageHeader, Pill, Segmented, TextInput, cx } from '../components/ui';

/**
 * One settings section. Closed, it shows its name and the current value, so the page reads as a
 * short list and nothing is hidden behind a tap just to learn what it is set to.
 */
function Section({ title, summary, children }: { title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {summary != null && <span className="block truncate text-[13px] text-muted group-open:hidden">{summary}</span>}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

export default function SettingsPage() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setSettings, setCardName, updateCategory, removeCategory, replaceDb } = useStore();
  const cardLabel = useCardLabel();
  const s = db.settings;
  const [split, setSplit] = useState<Split>(s.split);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const native = isNative();
  const update = useUpdate();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const snapshot = native ? snapshotDate() : null;
  function restoreSnapshot() {
    const data = readSnapshot() as DB | null;
    if (data && typeof data.months === 'object') { replaceDb(data); setImportMsg(L('הנתונים שוחזרו.', 'Data restored.')); }
    setConfirmRestore(false);
  }

  const splitSum = split.needs + split.wants + split.invest;
  useEffect(() => { if (splitSum === 100) setSettings({ split }); }, [split]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runExport(fn: () => Promise<void>) {
    try { await fn(); setImportMsg(''); } catch { setImportMsg(L('הייצוא נכשל.', 'The export failed.')); }
  }
  const [fbKind, setFbKind] = useState<FeedbackKind>('bug');
  const [fbText, setFbText] = useState('');
  const [fbContact, setFbContact] = useState('');
  const [fbState, setFbState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  async function submitFeedback() {
    setFbState('sending');
    try { await sendFeedback({ kind: fbKind, message: fbText.trim(), contact: fbContact.trim(), lang }); setFbText(''); setFbState('sent'); }
    catch { setFbState('failed'); }
  }
  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text()) as DB;
      if (!data || typeof data.months !== 'object' || !Array.isArray(data.categories)) throw new Error();
      replaceDb(data);
      setImportMsg(L('הגיבוי שוחזר.', 'Backup restored.'));
    } catch { setImportMsg(L('הקובץ אינו גיבוי תקין של האפליקציה.', 'That file is not a valid backup of this app.')); }
  }

  const custom = db.categories.filter((c) => !c.builtin);
  // Every card that ever appeared in a statement, by its last four digits.
  const cards = useMemo(() => [...new Set(Object.values(db.months).flatMap((m) => m.files.map((f) => f.card)))].filter((c) => c && c !== '????').sort(), [db.months]);
  const learned = useMemo(() => buildModel(db).known.size, [db]);

  return (
    <div className="rise max-w-3xl space-y-3">
      <PageHeader title={L('הגדרות', 'Settings')} />

      <Section title={L('תצוגה', 'Display')} summary={`${s.lang === 'he' ? 'עברית' : 'English'} · ${s.theme === 'dark' ? L('כהה', 'Dark') : L('בהירה', 'Light')}`}>
        <div className="flex flex-wrap gap-6">
          <div><p className="mb-1.5 text-sm text-ink2">{L('שפה', 'Language')}</p>
            <Segmented value={s.lang} onChange={(v) => setSettings({ lang: v })} options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]} /></div>
          <div><p className="mb-1.5 text-sm text-ink2">{L('ערכת צבעים', 'Theme')}</p>
            <Segmented value={s.theme} onChange={(v) => setSettings({ theme: v })} options={[{ value: 'dark', label: L('כהה', 'Dark') }, { value: 'light', label: L('בהירה', 'Light') }]} /></div>
        </div>
      </Section>

      <Section title={L('תקציב', 'Budget')} summary={<bdi>{L(`חלוקה ${s.split.needs}/${s.split.wants}/${s.split.invest}`, `Split ${s.split.needs}/${s.split.wants}/${s.split.invest}`)}</bdi>}>
        <p className="mb-3 text-[13px] text-muted">{L('החלוקה משמשת כשלא הוגדר יעד לחודש, וכברירת מחדל ליעדים חדשים.', 'The split is used when a month has no goal, and as the default for new goals.')}</p>
        <div className="grid max-w-md grid-cols-3 gap-3">
          {SPEND_BUCKETS.map((b) => (
            <label key={b}><span className="mb-1.5 flex items-center gap-1.5 text-[13px] text-ink2"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}</span>
              <div className="relative" dir="ltr"><input type="number" min={0} max={100} dir="ltr" value={split[b]}
                onChange={(e) => setSplit({ ...split, [b]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                className="num h-10 w-full rounded-xl border border-line bg-surface2 pl-3 pr-8 text-sm font-semibold focus:border-accent focus:outline-none" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">%</span></div></label>
          ))}
        </div>
        {splitSum !== 100 && <p role="alert" className="mt-3 text-sm text-bad">{L(`החלוקה מסתכמת ב-${splitSum}% — היא תישמר כשתגיע ל-100%.`, `The split adds up to ${splitSum}% — it is saved once it totals 100%.`)}</p>}
      </Section>

      <Section title={L('סיווג', 'Classification')} summary={`${s.smartClassify ? L('סיווג חכם', 'Smart') : L('החלקה', 'Swipe')} · ${s.subcategories ? L('עם תת-קטגוריות', 'with sub-categories') : L('צרכים ורצונות בלבד', 'needs and wants only')}`}>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface2 p-4">
            <input type="checkbox" checked={s.subcategories} onChange={(e) => setSettings({ subcategories: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-semibold">{L('תת-קטגוריות', 'Sub-categories')}</span>
              <span className="block text-[13px] text-muted">{L('סופר, רכב, אוכל בחוץ ועוד, בתוך צרכים ורצונות. כשכבוי, יש רק צרכים, רצונות ו"לא לספור", בסיווג ובניתוח. שום דבר לא נמחק: הדלקה מחזירה את הפירוט.', 'Groceries, car, eating out and more, inside needs and wants. Off: only needs, wants and "don\'t count", in classification and in the analysis. Nothing is deleted: switching back on brings the detail back.')}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface2 p-4">
            <input type="checkbox" checked={s.smartClassify} onChange={(e) => setSettings({ smartClassify: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-semibold">{L('סיווג חכם', 'Smart classification')}</span>
              <span className="block text-[13px] text-muted">{L('האפליקציה לומדת מהבחירות שלך, מסווגת לבד בתי עסק שהיא מכירה ומנחשת חדשים, ואתה עובר רק על מה שהיא לא בטוחה לגביו. כשכבוי, כל עסקה מוצגת לך בכרטיס: גוררים שמאלה לצרכים וימינה לרצונות.', 'The app learns from your choices, places merchants it knows by itself and guesses new ones, and you go over only what it is unsure about. Off: each transaction is shown on a card — drag left for needs and right for wants.')}</span>
            </span>
          </label>
        </div>
      </Section>

      <Section title={L('כרטיסים', 'Cards')} summary={cards.length ? cards.map((c) => cardLabel(c)).join(' · ') : L('עוד לא הועלה דף חיוב', 'No statement uploaded yet')}>
        {cards.length ? (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-sm text-muted" dir="ltr">•••• {c}</span>
                <TextInput value={db.cardNames[c] ?? ''} placeholder={L('שם לכרטיס', 'A name for the card')} onChange={(e) => setCardName(c, e.target.value)} className="flex-1" aria-label={L(`שם לכרטיס ${c}`, `Name for card ${c}`)} />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{L('הכרטיסים יופיעו כאן אחרי העלאת דף חיוב ראשון.', 'Cards appear here after the first statement is uploaded.')}</p>}
        <p className="mt-3 text-[13px] text-muted">{L('השם מוצג ליד כל עסקה במקום ארבע הספרות.', 'The name is shown next to every transaction instead of the four digits.')}</p>
      </Section>

      {s.subcategories && (
      <Section title={L('קטגוריות', 'Categories')} summary={L(`${custom.length} קטגוריות · ${learned} בתי עסק נלמדו`, `${custom.length} categories · ${learned} merchants learned`)}>
        <p className="mb-3 text-[13px] text-muted">{L('אפשר לשנות שם, להעביר בין צרכים לרצונות או למחוק. קטגוריות חדשות מוסיפים מלוח הסיווג.', 'Rename, move between needs and wants, or delete. New categories are added from the classification board.')}</p>
        {custom.length ? (
          <ul className="space-y-2">
            {custom.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Dot color={BUCKET_COLOR[c.bucket]} />
                <TextInput value={c.name} placeholder={categoryName({ ...c, name: '' }, lang)} onChange={(e) => updateCategory(c.id, { name: e.target.value })} className="min-w-32 flex-1" aria-label={L('שם הקטגוריה', 'Category name')} />
                <select value={c.bucket} onChange={(e) => updateCategory(c.id, { bucket: e.target.value as BucketId })} aria-label={L('נספר תחת', 'Counts as')}
                  className="h-10 rounded-xl border border-line bg-surface2 px-2 text-sm focus:border-accent focus:outline-none">
                  {(['needs', 'wants', ...(c.bucket === 'invest' ? ['invest'] : []), 'ignore'] as BucketId[]).map((b) => <option key={b} value={b}>{bucketName(b, lang)}</option>)}
                </select>
                <IconButton label={L('מחק קטגוריה', 'Delete category')} onClick={() => removeCategory(c.id)}><Trash2 size={16} /></IconButton>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{L('עדיין לא יצרת קטגוריות משלך.', 'You have not created any categories yet.')}</p>}
        <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
          {L(`האפליקציה למדה ממך ${learned} בתי עסק, ומסווגת אותם ודומים להם לבד בקובץ הבא. היא לומדת רק מבחירות שעשית או אישרת, במכשיר הזה בלבד.`, `The app has learned ${learned} merchants from you, and classifies them and similar ones automatically next time. It learns only from choices you made or confirmed, on this device only.`)}
        </p>
      </Section>
      )}

      <Section title={L('גרסה ועדכונים', 'Version and updates')} summary={<><bdi dir="ltr">{CURRENT.version}</bdi>{native && currentChannel() === 'dev' ? ` · ${L('גרסת פיתוח', 'developer build')}` : ''}{update.phase === 'available' && update.latest ? ` · ${L('יש עדכון', 'update available')}` : ''}</>}>
        <p className="text-sm">
          <span className="font-semibold">{L('גרסה', 'Version')} <bdi dir="ltr">{CURRENT.version}</bdi>{native && currentChannel() === 'dev' && <> · {L('גרסת פיתוח', 'developer build')}</>}</span>
          {CURRENT.build > 0 && <span className="text-muted"> · <bdi dir="ltr">{L('בנייה', 'build')} {CURRENT.build} · {CURRENT.commit} · {CURRENT.date.slice(0, 10)}</bdi></span>}
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-accent">{L('מה חדש בכל גרסה', 'What changed in each version')}</summary>
          <div className="mt-2 space-y-3">
            {CHANGELOG.map((e) => (
              <div key={e.version}>
                <p className="font-semibold"><bdi dir="ltr">{e.version}</bdi> <span className="font-normal text-muted">· <bdi dir="ltr">{e.date}</bdi></span></p>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-ink2">{linesOf(e, lang).map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            ))}
          </div>
        </details>
        {native && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" icon={<RefreshCw size={15} className={update.phase === 'checking' ? 'animate-spin' : ''} />} disabled={update.phase !== 'idle' && update.phase !== 'available'} onClick={() => void checkForUpdate(true)}>{L('בדוק עדכונים', 'Check for updates')}</Button>
              {update.phase === 'available' && update.latest && <Button size="sm" variant="primary" icon={<Download size={15} />} onClick={() => void installUpdate()}>{update.goingBack ? L(`חזור ל-${update.latest.version}`, `Go back to ${update.latest.version}`) : L(`עדכן ל-${update.latest.version}`, `Update to ${update.latest.version}`)}</Button>}
              {update.phase === 'downloading' && <Pill tone="accent">{L('מוריד…', 'Downloading…')} {update.percent ?? 0}%</Pill>}
              {update.phase === 'idle' && !update.error && update.checkedAt && <Pill tone="good">● {L('האפליקציה מעודכנת', 'The app is up to date')}</Pill>}
            </div>
            {update.error && (
              <p role="alert" className="mt-2 text-sm text-bad">
                {update.error === 'not-public' && L('לא נמצאה גרסה שפורסמה. ייתכן שהמאגר ב-GitHub עדיין פרטי.', 'No published version was found. The GitHub repository may still be private.')}
                {update.error === 'busy' && L('GitHub מגביל כרגע בדיקות מהרשת הזו. נסה שוב בעוד שעה.', 'GitHub is limiting checks from this network right now. Try again in an hour.')}
                {update.error === 'offline' && L('אין חיבור לאינטרנט.', 'No internet connection.')}
                {update.error === 'failed' && <>{L('הבדיקה או העדכון נכשלו.', 'The check or the update failed.')}{update.detail ? <bdi dir="ltr"> ({update.detail})</bdi> : null}</>}
              </p>
            )}
            {update.rolledBackBuild != null && update.rolledBackBuild > CURRENT.build && (
              <p className="mt-2 text-sm text-warn">{L(`בנייה ${update.rolledBackBuild} הותקנה אך לא עלתה, והאפליקציה חזרה לגרסה הקודמת. היא לא תוצע שוב אוטומטית.`, `Build ${update.rolledBackBuild} was installed but did not start, so the app went back to the previous version. It will not be offered again automatically.`)}</p>
            )}
            <div className="mt-4 rounded-2xl bg-surface2 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={update.channel === 'dev'} onChange={(e) => setChannel(e.target.checked ? 'dev' : 'stable')} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <span>
                  <span className="block text-sm font-semibold">{L('קבל גרסאות פיתוח', 'Receive developer versions')}</span>
                  <span className="block text-[13px] text-muted">{L('גרסאות שעדיין בבדיקה, לפני שהן מגיעות לכולם. הן עובדות על הנתונים האמיתיים שלך. כיבוי מחזיר לגרסה היציבה.', 'Versions still being tested, before they reach everyone. They run on your real data. Switching this off takes you back to the stable version.')}</span>
                </span>
              </label>
            </div>
            {snapshot && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span>{L(`נשמר עותק של הנתונים מלפני העדכון האחרון מגרסה יציבה (${snapshot.slice(0, 10)}).`, `A copy of your data was kept from before the last update off a stable version (${snapshot.slice(0, 10)}).`)}</span>
                {confirmRestore
                  ? <><Button size="sm" variant="danger" onClick={restoreSnapshot}>{L('כן, החזר את הנתונים למצב הזה', 'Yes, put my data back to that')}</Button><Button size="sm" variant="ghost" onClick={() => setConfirmRestore(false)}>{L('ביטול', 'Cancel')}</Button></>
                  : <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(true)}>{L('שחזר את העותק', 'Restore that copy')}</Button>}
              </div>
            )}
          </>
        )}
      </Section>

      <Section title={L('הנתונים שלי', 'My data')} summary={native ? L('נשמרים במכשיר הזה בלבד · גיבוי וייצוא', 'Stored on this device only · backup and export') : L('נשמרים במחשב הזה · גיבוי וייצוא', 'Stored on this computer · backup and export')}>
        <p className="mb-3 text-[13px] text-muted">
          {L('גיבוי הוא קובץ אחד שמכיל את כל מה שיש באפליקציה: החודשים, העסקאות, הקטגוריות, מה שהאפליקציה למדה ממך וההגדרות. שמור אותו במקום בטוח; "שחזר מגיבוי" מחזיר הכול ממנו, גם במכשיר אחר.',
            'A backup is one file holding everything in the app: the months, the transactions, the categories, what the app learned from you and the settings. Keep it somewhere safe; "Restore from backup" brings it all back, on another device too.')}
          {native ? L(' הנתונים נשמרים במכשיר הזה בלבד, ולכן כדאי לגבות מדי פעם.', ' The data lives on this device only, so back it up now and then.') : L(' במחשב הנתונים נשמרים ב-data/db.json, עם גיבוי יומי אוטומטי.', ' On the computer the data lives in data/db.json, with an automatic daily backup.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Download size={16} />} onClick={() => void runExport(() => exportBackup(db))}>{native ? L('שמור גיבוי', 'Save a backup') : L('הורד גיבוי', 'Download backup')}</Button>
          <Button icon={<Upload size={16} />} onClick={() => importRef.current?.click()}>{L('שחזר מגיבוי', 'Restore from backup')}</Button>
          <Button icon={<FileSpreadsheet size={16} />} onClick={() => void runExport(() => exportTransactions(db, lang))}>{L('ייצא עסקאות לאקסל', 'Export transactions to Excel')}</Button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
        </div>
        {importMsg && <p role="status" className="mt-2 text-sm text-ink2">{importMsg}</p>}
      </Section>

      {feedbackEnabled() && (
        <Section title={L('משוב ודיווח על תקלה', 'Feedback and bug reports')} summary={L('נשלח ישירות למפתח', 'Goes straight to the developer')}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (fbText.trim()) void submitFeedback(); }}>
            <Segmented size="sm" value={fbKind} onChange={setFbKind} options={[{ value: 'bug', label: L('תקלה', 'Bug') }, { value: 'idea', label: L('רעיון', 'Idea') }, { value: 'other', label: L('אחר', 'Other') }]} />
            <textarea value={fbText} onChange={(e) => { setFbText(e.target.value); if (fbState !== 'sending') setFbState('idle'); }} rows={4} maxLength={4000}
              placeholder={fbKind === 'bug' ? L('מה עשית, מה קרה, ומה ציפית שיקרה?', 'What did you do, what happened, and what did you expect?') : L('מה היית רוצה לראות באפליקציה?', 'What would you like to see in the app?')}
              className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
            <TextInput value={fbContact} onChange={(e) => setFbContact(e.target.value)} placeholder={L('איך לחזור אליך (לא חובה)', 'How to reach you (optional)')} />
            <p className="text-xs text-muted">{L('נשלחים הטקסט שכתבת, מספר הגרסה וסוג המכשיר. שום נתון פיננסי לא נשלח.', 'Your text, the version number and the device type are sent. No financial data is sent.')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={!fbText.trim() || fbState === 'sending'}>{fbState === 'sending' ? L('שולח…', 'Sending…') : L('שלח', 'Send')}</Button>
              {fbState === 'sent' && <span role="status" className="text-sm text-good">{L('נשלח. תודה!', 'Sent. Thank you!')}</span>}
              {fbState === 'failed' && <span role="alert" className="text-sm text-bad">{L('השליחה נכשלה. בדוק את החיבור ונסה שוב.', 'Sending failed. Check your connection and try again.')}</span>}
            </div>
          </form>
        </Section>
      )}

      <Section title={L('תנאי שימוש', 'Terms of use')}>
        <EulaBody />
      </Section>
    </div>
  );
}
