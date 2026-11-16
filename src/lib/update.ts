// In-app updates for the Android app.
//
// Every build published by the GitHub action carries a version (see deploy/scripts/version.mjs)
// and writes it into the notes of the "Latest APK" release. The repository is public, so the app
// reads those notes without signing in, and when
// the published build is newer than its own it offers an update:
//   - normally it downloads bundle.zip (the web content) and restarts into it;
//   - when the Android wrapper itself changed, it downloads the APK and opens the installer.
// The native half is deploy/android/.../AppUpdaterPlugin.java.
import { useSyncExternalStore } from 'react';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from './platform';

export interface AppVersion {
  version: string; build: number; native: number; commit: string; date: string;
  /** What changed in this version; present on a published version read from GitHub. */
  notes?: { he: string[]; en: string[] } | null;
}
declare const __APP_VERSION__: AppVersion;
/** The version of the code that is running right now. */
export const CURRENT: AppVersion = __APP_VERSION__;

const REPO = 'Aviozkfir/FinanceFamily';
const RELEASE_TAG = 'latest-apk';
const RECHECK_MS = 10 * 60 * 1000;

interface Updater {
  getInfo(): Promise<{ native: number; apkVersion?: string; apkBuild?: number; rolledBackBuild: number }>;
  confirm(): Promise<void>;
  applyBundle(o: { url: string; build: number }): Promise<void>;
  installApk(o: { url: string }): Promise<void>;
  addListener(event: 'progress', cb: (p: { percent: number }) => void): Promise<PluginListenerHandle>;
}
const Updater = registerPlugin<Updater>('AppUpdater');

/** 'not-public': GitHub hides the release, so the repository is still private. 'busy': GitHub's hourly limit for anonymous requests. */
export type UpdateError = 'not-public' | 'busy' | 'offline' | 'failed';
export interface UpdateState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'restarting';
  latest?: AppVersion;
  /** 'bundle' swaps the web content in place; 'apk' goes through the Android installer. */
  kind?: 'bundle' | 'apk';
  percent?: number;
  error?: UpdateError;
  detail?: string;
  /** A build that was installed, failed to start and was undone. It is not offered again by itself. */
  rolledBackBuild?: number;
  checkedAt?: number;
}

let state: UpdateState = { phase: 'idle' };
let assets: { bundle?: string; apk?: string } = {};
const subscribers = new Set<() => void>();
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn());
}
export const useUpdate = () => useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn); }, () => state);

/** The version block the GitHub action writes into the release notes. */
export function readManifest(notes: string): AppVersion | null {
  const m = notes.match(/<!--\s*update-manifest\s*(\{.*?\})\s*-->/s);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]) as AppVersion;
    return typeof v.build === 'number' && typeof v.native === 'number' && typeof v.version === 'string' ? v : null;
  } catch { return null; }
}

/** Asks GitHub for the published version. `manual` also re-offers a build that was rolled back. */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!isNative() || state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'installing' || state.phase === 'restarting') return;
  if (!manual && state.checkedAt && Date.now() - state.checkedAt < RECHECK_MS) return;
  set({ phase: 'checking', error: undefined, detail: undefined });
  try {
    const [info, res] = await Promise.all([
      Updater.getInfo(),
      fetch(`https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      }),
    ]);
    if (res.status === 404) { set({ phase: 'idle', error: 'not-public', checkedAt: Date.now() }); return; }
    if (res.status === 403 || res.status === 429) { set({ phase: 'idle', error: 'busy', checkedAt: Date.now() }); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = (await res.json()) as { body?: string; assets?: { name: string; url: string }[] };
    const latest = readManifest(release.body ?? '');
    const find = (name: string) => release.assets?.find((a) => a.name === name)?.url;
    assets = { bundle: find('bundle.zip'), apk: find('FinanceFamily.apk') };
    const rolledBackBuild = info.rolledBackBuild || undefined;
    const kind = latest && latest.native > info.native ? 'apk' : 'bundle';
    const offer = latest != null && latest.build > CURRENT.build && Boolean(kind === 'apk' ? assets.apk : assets.bundle)
      && (manual || latest.build !== rolledBackBuild);
    set({ phase: offer ? 'available' : 'idle', latest: latest ?? undefined, kind: offer ? kind : undefined, rolledBackBuild, checkedAt: Date.now() });
  } catch (e) {
    set({ phase: 'idle', error: navigator.onLine === false ? 'offline' : 'failed', detail: e instanceof Error ? e.message : String(e) });
  }
}

/** Downloads and applies the offered update. A content update ends with the app reloading itself. */
export async function installUpdate(): Promise<void> {
  if (state.phase !== 'available' || !state.latest) return;
  const { latest, kind } = state;
  set({ phase: 'downloading', percent: 0, error: undefined, detail: undefined });
  const listener = await Updater.addListener('progress', (p) => set({ percent: p.percent }));
  try {
    if (kind === 'apk') {
      await Updater.installApk({ url: assets.apk! });
      // The system installer is on screen now; this copy of the app is replaced when it finishes.
      set({ phase: 'installing' });
    } else {
      await Updater.applyBundle({ url: assets.bundle!, build: latest.build });
      set({ phase: 'restarting' });
    }
  } catch (e) {
    set({ phase: 'available', error: 'failed', detail: e instanceof Error ? e.message : String(e) });
  } finally {
    void listener.remove();
  }
}

/** Call once the app is on screen: tells the native side this content works, then looks for updates. */
let started = false;
export function startUpdates() {
  if (!isNative() || started) return;
  started = true;
  Updater.confirm().catch(() => {});
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Back from the system installer without installing: offer the update again.
    if (state.phase === 'installing') set({ phase: 'available' });
    void checkForUpdate();
  });
}
