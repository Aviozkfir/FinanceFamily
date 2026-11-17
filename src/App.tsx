import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarRange, CloudOff, Home as HomeIcon, Menu, Settings as SettingsIcon, TrendingUp, X } from 'lucide-react';
import { useL, useStore } from './lib/store';
import { previousMonth } from './lib/format';
import { cx } from './components/ui';
import UpdateBanner from './components/UpdateBanner';
import WhatsNew from './components/WhatsNew';
import EulaGate from './components/Eula';
import { acceptEula, eulaAccepted } from './lib/eula';
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
  // The month whose statement is the latest one out: where the Month tab goes.
  const month = previousMonth();
  const monthFilled = useStore((st) => { const m = st.db.months[month]; return !!m && (m.txs.length > 0 || m.manual.length > 0); });
  const L = useL();
  const { pathname } = useLocation();
  const [agreed, setAgreed] = useState(eulaAccepted);
  const [menu, setMenu] = useState(false);

  useEffect(() => { load(); }, [load]);
  // The app is on screen with its data: confirm this version works and look for a newer one.
  useEffect(() => { if (ready) startUpdates(); }, [ready]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang; el.dir = lang === 'he' ? 'rtl' : 'ltr'; el.dataset.theme = theme;
    document.title = lang === 'he' ? 'הכסף שלי' : 'My Money';
  }, [lang, theme]);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [pathname]);

  if (!ready) return <div className="flex h-full items-center justify-center text-muted">…</div>;
  if (!agreed) return <EulaGate onAccept={() => { acceptEula(); setAgreed(true); }} />;

  const nav = [
    { to: '/', icon: HomeIcon, label: L('בית', 'Home'), end: true },
    // Straight to the picture when the month is filled in, otherwise to filling it in.
    { to: monthFilled ? `/month/${month}/analysis` : `/month/${month}`, match: ['/month', '/goal'], icon: CalendarRange, label: L('חודש', 'Month') },
    { to: '/history', match: ['/history', '/trends'], icon: TrendingUp, label: L('לאורך זמן', 'Over time') },
    { to: '/settings', match: ['/settings'], icon: SettingsIcon, label: L('הגדרות', 'Settings') },
  ];
  const fullscreen = pathname.endsWith('/classify');
  const active = (n: (typeof nav)[number]) => (n.match ? n.match.some((p) => pathname.startsWith(p)) : pathname === '/');
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
        </aside>
      )}

      <div className={cx(!fullscreen && 'lg:ps-60')}>
        {/* Phone: one bar on top. Everything you can go to, Settings included, is in its menu. */}
        {!fullscreen && (
          <div className="sticky top-0 z-40 lg:hidden">
            <div className="flex items-center justify-between bg-page/90 px-4 py-2.5 backdrop-blur-xl">
              <NavLink to="/" className="flex items-center gap-2 font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-page"><TrendingUp size={16} strokeWidth={2.6} /></span>{L('הכסף שלי', 'My Money')}</NavLink>
              <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={L('תפריט', 'Menu')}
                className="press flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-surface2">{menu ? <X size={22} /> : <Menu size={22} />}</button>
            </div>
            {menu && (
              <>
                <button type="button" aria-label={L('סגור תפריט', 'Close menu')} onClick={() => setMenu(false)} className="fixed inset-0 top-[52px] bg-black/40" />
                <nav className="rise absolute inset-x-3 top-full z-10 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
                  {nav.map((n) => (
                    <NavLink key={n.to} to={n.to} onClick={() => setMenu(false)} className={cx('press flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium',
                      active(n) ? 'bg-surface2 text-ink' : 'text-ink2')}>
                      <n.icon size={20} className={active(n) ? 'text-accent' : ''} />{n.label}
                    </NavLink>
                  ))}
                </nav>
              </>
            )}
          </div>
        )}
        {!fullscreen && <UpdateBanner />}
        {!fullscreen && <WhatsNew />}
        {offline && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-warn lg:mx-8">
            <CloudOff size={16} />{L('השרת המקומי לא זמין — השינויים נשמרים בדפדפן בלבד. הפעל את האפליקציה דרך start.bat.', 'The local server is unreachable — changes are saved in this browser only. Start the app with start.bat.')}
          </div>
        )}
        <main className={cx(fullscreen ? '' : 'glow mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:px-8 lg:pt-10')}>
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

    </div>
  );
}
