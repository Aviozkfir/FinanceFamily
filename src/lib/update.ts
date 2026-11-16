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

export type Channel = 'stable' | 'dev';
export interface AppVersion {
  version: string; build: number; native: number; commit: string; date: string;
  /** 'stable' = built from main; 'dev' = a developer build of another branch. Absent on old builds = stable. */
  channel?: Channel;
  /** What changed in this version; present on a published version read from GitHub. */
  notes?: { he: string[]; en: string[] } | null;
}
declare const __APP_VERSION__: AppVersion;
/** The version of the code that is running right now. */
export const CURRENT: AppVersion = __APP_VERSION__;

const REPO = 'Aviozkfir/FinanceFamily';
const RELEASE_TAGS: Record<Channel, string> = { stable: 'latest-apk', dev: 'dev-apk' };
const CHANNEL_STORAGE = 'finance-update-channel';
/** Copy of the data taken right before an update, so a bad version cannot cost the user their months. */
const SNAPSHOT_STORAGE = 'finance-db-before-update';
const DB_STORAGE = 'finance-db';

export const currentChannel = (): Channel => CURRENT.channel ?? 'stable';
/** The channel this phone follows: what the user chose, or else the channel of the build it is running. */
export function getChannel(): Channel {
  try {
    const chosen = localStorage.getItem(CHANNEL_STORAGE);
    return chosen === 'dev' || chosen === 'stable' ? chosen : currentChannel();
  } catch { return currentChannel(); }
}
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
  /** The channel this phone follows (stable unless developer versions are on). */
  channel: Channel;
  /** True when the offered version is older than the running one: leaving a developer build for stable. */
  goingBack?: boolean;
}

let state: UpdateState = { phase: 'idle', channel: getChannel() };
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

type Published = { version: AppVersion; bundle?: string; apk?: string };
/** Reads one channel's release. Returns null when that release does not exist (yet). */
async function readRelease(channel: Channel): Promise<Published | null | 'not-public' | 'busy'> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAGS[channel]}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return channel === 'stable' ? 'not-public' : null;
  if (res.status === 403 || res.status === 429) return 'busy';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const release = (await res.json()) as { body?: string; assets?: { name: string; url: string }[] };
  const version = readManifest(release.body ?? '');
  if (!version) return null;
  const find = (name: string) => release.assets?.find((a) => a.name === name)?.url;
  return { version: { ...version, channel }, bundle: find('bundle.zip'), apk: find('FinanceFamily.apk') };
}

/** Switches between stable and developer versions, then looks for what that means right now. */
export function setChannel(channel: Channel) {
  try { localStorage.setItem(CHANNEL_STORAGE, channel); } catch { /* storage unavailable */ }
  set({ channel, phase: 'idle', latest: undefined, kind: undefined, goingBack: undefined, error: undefined, detail: undefined, checkedAt: undefined });
  void checkForUpdate(true);
}

/**
 * Asks GitHub for the published version. `manual` also re-offers a build that was rolled back.
 *
 * On the stable channel the app follows the Latest APK release. If it is still running a
 * developer build (the user just switched developer versions off), stable is offered even though
 * it is older. On the developer channel the app takes whichever of the two releases is newer, so
 * it also receives a stable release that overtakes the last developer build.
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!isNative() || state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'installing' || state.phase === 'restarting') return;
  if (!manual && state.checkedAt && Date.now() - state.checkedAt < RECHECK_MS) return;
  const channel = getChannel();
  set({ phase: 'checking', channel, error: undefined, detail: undefined });
  try {
    const [info, stable, dev] = await Promise.all([Updater.getInfo(), readRelease('stable'), channel === 'dev' ? readRelease('dev') : null]);
    const problem = [stable, dev].find((r): r is 'not-public' | 'busy' => typeof r === 'string');
    if (problem) { set({ phase: 'idle', error: problem, checkedAt: Date.now() }); return; }
    const found = [stable, dev].filter((r): r is Published => !!r && typeof r !== 'string').sort((x, y) => y.version.build - x.version.build)[0];
    const rolledBackBuild = info.rolledBackBuild || undefined;
    if (!found) { set({ phase: 'idle', latest: undefined, kind: undefined, rolledBackBuild, checkedAt: Date.now() }); return; }
    const latest = found.version;
    const goingBack = channel === 'stable' && currentChannel() === 'dev' && latest.build < CURRENT.build;
    const kind = latest.native > info.native ? 'apk' : 'bundle';
    const offer = (latest.build > CURRENT.build || goingBack) && Boolean(kind === 'apk' ? found.apk : found.bundle)
      && (manual || latest.build !== rolledBackBuild);
    assets = { bundle: found.bundle, apk: found.apk };
    set({ phase: offer ? 'available' : 'idle', latest, kind: offer ? kind : undefined, goingBack: offer ? goingBack : undefined, rolledBackBuild, checkedAt: Date.now() });
  } catch (e) {
    set({ phase: 'idle', error: navigator.onLine === false ? 'offline' : 'failed', detail: e instanceof Error ? e.message : String(e) });
  }
}

/** When the data was last copied aside before an update, or null. */
export function snapshotDate(): string | null {
  try { return (JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE) ?? 'null') as { at?: string } | null)?.at ?? null; } catch { return null; }
}
/** The data as it was before the last update, for the store to load back. */
export function readSnapshot(): unknown {
  try { return (JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE) ?? 'null') as { db?: unknown } | null)?.db ?? null; } catch { return null; }
}
function takeSnapshot() {
  try {
    const db = localStorage.getItem(DB_STORAGE);
    if (db) localStorage.setItem(SNAPSHOT_STORAGE, `{"at":${JSON.stringify(new Date().toISOString())},"from":${JSON.stringify(CURRENT.version)},"db":${db}}`);
  } catch { /* out of space: the update still goes ahead */ }
}

/** Downloads and applies the offered update. A content update ends with the app reloading itself. */
export async function installUpdate(): Promise<void> {
  if (state.phase !== 'available' || !state.latest) return;
  const { latest, kind } = state;
  // Keep the data as it was on the last stable version: that is the state worth going back to.
  if (currentChannel() === 'stable') takeSnapshot();
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
