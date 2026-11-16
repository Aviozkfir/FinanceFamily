import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarRange, CloudOff, Home as HomeIcon, Languages, Moon, Settings as SettingsIcon, Sun, TrendingUp } from 'lucide-react';
import { useL, useStore } from './lib/store';
import { currentMonth, shiftMonth } from './lib/format';
import { cx } from './components/ui';
import UpdateBanner from './components/UpdateBanner';
import WhatsNew from './components/WhatsNew';
import { startUpdates } from './lib/update';
import Home from './pages/Home';
import GoalPage from './pages/Goal';
import MonthPage from './pages/Month';
import ClassifyPage from './pages/Classify';
import AnalysisPage from './pages/Analysis';
import HistoryPage from './pages/History';
import TrendsPage from './pages/Trends';
import SettingsPage from './pages/Settings';

export default function App() {
  const { ready, load, offline } = useStore();
  const { lang, theme } = useStore((s) => s.db.settings);
  const setSettings = useStore((s) => s.setSettings);
  const lastMonthFilled = useStore((st) => { const m = st.db.months[shiftMonth(currentMonth(), -1)]; return !!m && (m.txs.length > 0 || m.manual.length > 0); });
  const L = useL();
  const { pathname } = useLocation();

  useEffect(() => { load(); }, [load]);
  // The app is on screen with its data: confirm this version works and look for a newer one.
  useEffect(() => { if (ready) startUpdates(); }, [ready]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang; el.dir = lang === 'he' ? 'rtl' : 'ltr'; el.dataset.theme = theme;
    document.title = lang === 'he' ? 'הכסף שלי' : 'My Money';
  }, [lang, theme]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  if (!ready) return <div className="flex h-full items-center justify-center text-muted">…</div>;

  const now = currentMonth();
  const nav = [
    { to: '/', icon: HomeIcon, label: L('בית', 'Home'), end: true },
    // Straight to the picture when last month is filled in, otherwise to filling it in.
    { to: lastMonthFilled ? `/month/${shiftMonth(now, -1)}/analysis` : `/month/${shiftMonth(now, -1)}`, match: ['/month', '/goal'], icon: CalendarRange, label: L('חודש', 'Month') },
    { to: '/history', match: ['/history', '/trends'], icon: TrendingUp, label: L('לאורך זמן', 'Over time') },
  ];
  const fullscreen = pathname.endsWith('/classify');
  const active = (n: (typeof nav)[number]) => (n.match ? n.match.some((p) => pathname.startsWith(p)) : pathname === '/');
  const settingsLink = (
    <NavLink to="/settings" aria-label={L('הגדרות', 'Settings')} title={L('הגדרות', 'Settings')}
      className={({ isActive }) => cx('flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface2 hover:text-ink', isActive ? 'bg-surface2 text-accent' : 'text-ink2')}>
      <SettingsIcon size={17} />
    </NavLink>
  );

  const toggles = (
    <>
      <button onClick={() => setSettings({ lang: lang === 'he' ? 'en' : 'he' })} title={L('Switch to English', 'עבור לעברית')}
        className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-ink2 hover:bg-surface2 hover:text-ink">
        <Languages size={16} />{lang === 'he' ? 'EN' : 'עב'}
      </button>
      <button onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-label={L('החלף ערכת צבעים', 'Toggle theme')}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-ink2 hover:bg-surface2 hover:text-ink">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </>
  );

  return (
    <div className="min-h-full">
      {!fullscreen && (
        <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-line bg-surface/70 p-4 backdrop-blur-xl lg:flex">
          <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-page"><TrendingUp size={18} strokeWidth={2.6} /></span>
            <span className="text-lg font-bold tracking-tight">{L('הכסף שלי', 'My Money')}</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active(n) ? 'bg-surface2 text-ink' : 'text-ink2 hover:bg-surface2/60 hover:text-ink')}>
                <n.icon size={18} className={active(n) ? 'text-accent' : ''} />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-between border-t border-line pt-3">{toggles}{settingsLink}</div>
        </aside>
      )}

      <div className={cx(!fullscreen && 'lg:ps-60')}>
        {!fullscreen && (
          <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
            <span className="flex items-center gap-2 font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-page"><TrendingUp size={16} strokeWidth={2.6} /></span>{L('הכסף שלי', 'My Money')}</span>
            <div className="flex items-center">{toggles}{settingsLink}</div>
          </div>
        )}
        {!fullscreen && <UpdateBanner />}
        {!fullscreen && <WhatsNew />}
        {offline && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-warn lg:mx-8">
            <CloudOff size={16} />{L('השרת המקומי לא זמין — השינויים נשמרים בדפדפן בלבד. הפעל את האפליקציה דרך start.bat.', 'The local server is unreachable — changes are saved in this browser only. Start the app with start.bat.')}
          </div>
        )}
        <main className={cx(fullscreen ? '' : 'glow mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10')}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/goal/:month" element={<GoalPage />} />
            <Route path="/month/:month" element={<MonthPage />} />
            <Route path="/month/:month/classify" element={<ClassifyPage />} />
            <Route path="/month/:month/analysis" element={<AnalysisPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {!fullscreen && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={cx('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium', active(n) ? 'text-ink' : 'text-muted')}>
              <n.icon size={21} className={active(n) ? 'text-accent' : ''} /><span className="max-w-full truncate px-0.5">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
