import { useEffect, useRef, useState } from 'react';
import { Check, Download, KeyRound, RefreshCw, Terminal, Trash2, Upload } from 'lucide-react';
import type { BucketId, DB, Split } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, useL, useLang, useStore } from '../lib/store';
import { fetchAiStatus, type AiStatus } from '../lib/ai';
import { API_KEY_STORAGE, isNative } from '../lib/platform';
import { CURRENT, checkForUpdate, installUpdate, useUpdate } from '../lib/update';
import { BUCKET_COLOR, Button, Card, CardTitle, Dot, IconButton, PageHeader, Pill, Segmented, TextInput, cx } from '../components/ui';

export default function SettingsPage() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setSettings, updateCategory, removeCategory, replaceDb } = useStore();
  const s = db.settings;
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [split, setSplit] = useState<Split>(s.split);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const update = useUpdate();

  useEffect(() => { fetchAiStatus().then(setStatus); }, []);
  const splitSum = split.needs + split.wants + split.invest;
  useEffect(() => { if (splitSum === 100) setSettings({ split }); }, [split]); // eslint-disable-line react-hooks/exhaustive-deps

  const native = isNative();
  async function saveKey(value: string) {
    if (native) {
      if (value) localStorage.setItem(API_KEY_STORAGE, value); else localStorage.removeItem(API_KEY_STORAGE);
      setApiKey(''); setKeySaved(true); setStatus(await fetchAiStatus()); setTimeout(() => setKeySaved(false), 2500);
      return;
    }
    const res = await fetch('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: value }) }).catch(() => null);
    if (res?.ok) { setApiKey(''); setKeySaved(true); setStatus(await fetchAiStatus()); setTimeout(() => setKeySaved(false), 2500); }
  }

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
  const providers = [
    { value: 'auto' as const, title: L('אוטומטי', 'Automatic'), desc: L('Claude Code אם הוא מותקן ומחובר, אחרת מפתח API', 'Claude Code when installed and signed in, otherwise the API key') },
    { value: 'claude-code' as const, title: L('החשבון שלי ב-Claude', 'My Claude account'), desc: L('דרך ההתחברות של Claude Code במחשב הזה — בלי מפתח, על חשבון המנוי', 'Through the Claude Code sign-in on this computer — no key, uses your subscription') },
    { value: 'api' as const, title: L('מפתח API', 'API key'), desc: L('חיוב לפי שימוש דרך Anthropic Console', 'Pay-as-you-go through the Anthropic Console') },
  ];

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
        <CardTitle hint={L('העוזר שמסכם, מנתח ועונה על שאלות', 'The assistant that summarizes, analyzes and answers questions')}>{L('חיבור ל-Claude', 'Claude connection')}</CardTitle>
        {native && <p className="mb-3 text-sm text-ink2">{L('בטלפון העוזר עובד עם מפתח API של Anthropic. המפתח נשמר במכשיר הזה בלבד.', 'On the phone the assistant uses an Anthropic API key. The key is stored on this device only.')}</p>}
        <div className={cx('space-y-2', native && 'hidden')}>
          {providers.map((p) => (
            <button key={p.value} onClick={() => setSettings({ aiProvider: p.value })} aria-pressed={s.aiProvider === p.value}
              className={cx('flex w-full items-start gap-3 rounded-2xl border p-4 text-start transition-colors', s.aiProvider === p.value ? 'border-accent bg-accent-soft' : 'border-line bg-surface2 hover:border-line-strong')}>
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', s.aiProvider === p.value ? 'border-accent bg-accent text-page' : 'border-line-strong')}>
                {s.aiProvider === p.value && <Check size={12} strokeWidth={3.5} />}</span>
              <span><span className="block font-semibold">{p.title}</span><span className="block text-[13px] text-muted">{p.desc}</span></span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={cx('rounded-2xl bg-surface2 p-4', native && 'hidden')}>
            <p className="flex items-center gap-2 text-sm font-semibold"><Terminal size={15} />Claude Code</p>
            <div className="mt-2">{status == null ? <Pill>…</Pill> : status.cli ? <Pill tone="good">● {L('מותקן', 'Installed')} · {status.cliVersion}</Pill> : <Pill tone="warn">{L('לא נמצא במחשב', 'Not found on this computer')}</Pill>}</div>
            <p className="mt-2 text-xs text-muted">{L('אם העוזר מדווח שאינך מחובר: פתח טרמינל, הרץ claude והתחבר עם חשבון Claude שלך.', 'If the assistant says you are not signed in: open a terminal, run claude and sign in with your Claude account.')}</p>
          </div>
          <div className="rounded-2xl bg-surface2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} />{L('מפתח API', 'API key')}</p>
            <div className="mt-2">{status?.hasApiKey ? <Pill tone="good">● {L('מפתח שמור', 'Key saved')}</Pill> : <Pill>{L('לא הוגדר', 'Not set')}</Pill>}</div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (apiKey.trim()) saveKey(apiKey.trim()); }}>
              <TextInput type="password" dir="ltr" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" className="!h-9" />
              <Button size="sm" type="submit" disabled={!apiKey.trim()}>{keySaved ? <Check size={15} /> : L('שמור', 'Save')}</Button>
              {status?.hasApiKey && <IconButton type="button" label={L('מחק מפתח', 'Remove key')} onClick={() => saveKey('')}><Trash2 size={15} /></IconButton>}
            </form>
            <p className="mt-2 text-xs text-muted">{native ? L('המפתח נשמר במכשיר הזה בלבד.', 'The key is stored on this device only.') : L('המפתח נשמר בקובץ מקומי במחשב שלך בלבד.', 'The key is stored in a local file on your computer only.')}</p>
          </div>
        </div>
        <label className="mt-4 block max-w-sm"><span className="mb-1.5 block text-sm text-ink2">{L('מודל (לא חובה)', 'Model (optional)')}</span>
          <TextInput dir="ltr" value={s.aiModel} onChange={(e) => setSettings({ aiModel: e.target.value.trim() })} placeholder={status?.defaultModel ?? 'claude-opus-5-5'} />
          <span className="mt-1 block text-xs text-muted">{L('השאר ריק לברירת המחדל.', 'Leave empty for the default.')}</span></label>
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
                  {(['needs', 'wants', 'invest', 'ignore'] as BucketId[]).map((b) => <option key={b} value={b}>{bucketName(b, lang)}</option>)}
                </select>
                <IconButton label={L('מחק קטגוריה', 'Delete category')} onClick={() => removeCategory(c.id)}><Trash2 size={16} /></IconButton>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{L('עדיין לא יצרת קטגוריות משלך.', 'You have not created any categories yet.')}</p>}
        <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
          {L(`האפליקציה זוכרת ${Object.keys(db.merchantRules).length} בתי עסק שכבר סיווגת, ומסווגת אותם לבד בקובץ הבא.`, `The app remembers ${Object.keys(db.merchantRules).length} merchants you already classified and sorts them automatically next time.`)}
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
