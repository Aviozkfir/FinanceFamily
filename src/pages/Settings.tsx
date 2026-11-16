import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { BucketId, DB, Split } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, useL, useLang, useStore } from '../lib/store';
import { isNative } from '../lib/platform';
import { buildModel } from '../lib/learn';
import { CURRENT, checkForUpdate, installUpdate, useUpdate } from '../lib/update';
import { BUCKET_COLOR, Button, Card, CardTitle, Dot, IconButton, PageHeader, Pill, Segmented, TextInput, cx } from '../components/ui';

export default function SettingsPage() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setSettings, updateCategory, removeCategory, replaceDb } = useStore();
  const s = db.settings;
  const [split, setSplit] = useState<Split>(s.split);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const update = useUpdate();

  const splitSum = split.needs + split.wants + split.invest;
  useEffect(() => { if (splitSum === 100) setSettings({ split }); }, [split]); // eslint-disable-line react-hooks/exhaustive-deps

  const native = isNative();
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
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
  const learned = useMemo(() => buildModel(db).known.size, [db]);

  return (
    <div className="rise max-w-3xl space-y-4">
      <PageHeader title={L('הגדרות', 'Settings')} />

      <Card>
        <CardTitle>{L('תצוגה', 'Display')}</CardTitle>
        <div className="flex flex-wrap gap-6">
          <div><p className="mb-1.5 text-sm text-ink2">{L('שפה', 'Language')}</p>
            <Segmented value={s.lang} onChange={(v) => setSettings({ lang: v })} options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]} /></div>
          <div><p className="mb-1.5 text-sm text-ink2">{L('ערכת צבעים', 'Theme')}</p>
            <Segmented value={s.theme} onChange={(v) => setSettings({ theme: v })} options={[{ value: 'dark', label: L('כהה', 'Dark') }, { value: 'light', label: L('בהירה', 'Light') }]} /></div>
        </div>
      </Card>

      <Card>
        <CardTitle hint={L('משמשת כשלא הוגדר יעד לחודש, וכברירת מחדל ליעדים חדשים', 'Used when a month has no goal, and as the default for new goals')}>{L('חלוקת ברירת מחדל', 'Default split')}</CardTitle>
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
      </Card>

      <Card>
        <CardTitle hint={L('קטגוריות חדשות מוסיפים מלוח הסיווג', 'New categories are added from the classification board')}>{L('הקטגוריות שלי', 'My categories')}</CardTitle>
        {custom.length ? (
          <ul className="space-y-2">
            {custom.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Dot color={BUCKET_COLOR[c.bucket]} />
                <TextInput value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} className="min-w-32 flex-1" aria-label={L('שם הקטגוריה', 'Category name')} />
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
      </Card>

      <Card>
        <CardTitle hint={native ? L('כשמתפרסמת גרסה חדשה מופיע כפתור עדכון בראש המסך', 'When a new version is published, an Update button appears at the top of the screen') : undefined}>{L('גרסה ועדכונים', 'Version and updates')}</CardTitle>
        <p className="text-sm">
          <span className="font-semibold">{L('גרסה', 'Version')} <bdi dir="ltr">{CURRENT.version}</bdi></span>
          {CURRENT.build > 0 && <span className="text-muted"> · <bdi dir="ltr">{L('בנייה', 'build')} {CURRENT.build} · {CURRENT.commit} · {CURRENT.date.slice(0, 10)}</bdi></span>}
        </p>
        {native && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" icon={<RefreshCw size={15} className={update.phase === 'checking' ? 'animate-spin' : ''} />} disabled={update.phase !== 'idle' && update.phase !== 'available'} onClick={() => void checkForUpdate(true)}>{L('בדוק עדכונים', 'Check for updates')}</Button>
              {update.phase === 'available' && update.latest && <Button size="sm" variant="primary" icon={<Download size={15} />} onClick={() => void installUpdate()}>{L(`עדכן ל-${update.latest.version}`, `Update to ${update.latest.version}`)}</Button>}
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
          </>
        )}
      </Card>

      <Card>
        <CardTitle hint={native ? L('הנתונים נשמרים במכשיר הזה בלבד. אפשר לטעון לכאן גיבוי שהורד מהמחשב.', 'Data is stored on this device only. You can load a backup downloaded on the computer.') : L('הנתונים נשמרים בקובץ data/db.json בתיקיית האפליקציה, עם גיבוי יומי אוטומטי', 'Data lives in data/db.json inside the app folder, with an automatic daily backup')}>{L('הנתונים שלי', 'My data')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {!native && <Button icon={<Download size={16} />} onClick={exportData}>{L('הורד גיבוי', 'Download backup')}</Button>}
          <Button icon={<Upload size={16} />} onClick={() => importRef.current?.click()}>{L('שחזר מגיבוי', 'Restore from backup')}</Button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
          {importMsg && <span role="status" className="text-sm text-ink2">{importMsg}</span>}
        </div>
      </Card>
    </div>
  );
}
