// Local-only server: stores the data file on disk.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const dbFile = path.join(dataDir, 'db.json');
const backupDir = path.join(dataDir, 'backups');
const isProd = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 5174;
const HOST = '127.0.0.1'; // never exposed to the network

fs.mkdirSync(backupDir, { recursive: true });

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJsonAtomic = (file, value) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
};

// One backup per day, keep the latest 30.
function dailyBackup() {
  if (!fs.existsSync(dbFile)) return;
  const name = `db-${new Date().toISOString().slice(0, 10)}.json`;
  const target = path.join(backupDir, name);
  if (fs.existsSync(target)) return;
  fs.copyFileSync(dbFile, target);
  const all = fs.readdirSync(backupDir).filter((f) => f.startsWith('db-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 30))) fs.rmSync(path.join(backupDir, old));
}

const app = express();
app.use(express.json({ limit: '25mb' }));

// Only the local browser may talk to this server.
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return res.status(403).json({ error: 'forbidden' });
  next();
});

app.get('/api/db', (_req, res) => res.json(readJson(dbFile, null)));

app.put('/api/db', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !req.body.months) return res.status(400).json({ error: 'invalid' });
  dailyBackup();
  writeJsonAtomic(dbFile, req.body);
  res.json({ ok: true });
});

if (isProd) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(isProd ? `\n  Finance app:  http://localhost:${PORT}\n` : `[api] listening on http://${HOST}:${PORT}`);
});
