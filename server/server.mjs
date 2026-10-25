// Nightdesk server: the always-on loop plus a small JSON API and the dashboard. No framework.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, live } from '../core/config.mjs';
import { createStore } from '../core/store.mjs';
import { createChannels } from '../core/channels.mjs';
import { loadKb } from '../core/tools.mjs';
import { handleMessage } from '../core/agent.mjs';
import { buildBrief } from '../core/brief.mjs';
import { modelReachable } from '../core/llm.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const store = createStore(config.varDir);
const channels = createChannels(store);
const customers = JSON.parse(readFileSync(join(config.dataDir, 'customers.json'), 'utf8'));
const kb = loadKb(config.dataDir);
const dropDir = join(config.varDir, 'inbox');
mkdirSync(dropDir, { recursive: true });

let busy = false, modelUp = false, lastBriefDay = null, current = null;

// ---------- the always-on loop ----------
async function tick() {
  if (busy) return;
  busy = true;
  try {
    pickUpDropFolder();
    modelUp = live.ai && await modelReachable();
    const msg = store.nextNew();
    if (msg) {
      current = msg.id;
      store.update(msg.id, { status: 'working' });
      const done = await handleMessage(msg, { store, channels, customers, kb, useModel: modelUp });
      store.update(msg.id, done);
      current = null;
    }
    maybeBrief();
  } catch (err) {
    console.error('tick failed:', err);
  } finally { busy = false; }
}

// Any .json file dropped in var/inbox becomes a message: the hook for a real mail fetcher (IMAP, Gmail API).
function pickUpDropFolder() {
  for (const f of readdirSync(dropDir).filter((x) => x.endsWith('.json'))) {
    try {
      const m = JSON.parse(readFileSync(join(dropDir, f), 'utf8'));
      store.addMessage(clean(m));
      mkdirSync(join(dropDir, 'done'), { recursive: true });
      renameSync(join(dropDir, f), join(dropDir, 'done', f));
    } catch (err) { console.error('bad drop file', f, err.message); }
  }
}

function maybeBrief() {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const day = now.toDateString();
  if (hhmm >= config.briefAt && lastBriefDay !== day) { lastBriefDay = day; sendBrief(); }
}

async function sendBrief() {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const text = buildBrief(store.state.messages, store.state.tasks, since);
  const via = await channels.send(text);
  store.brief({ text, via });
  return { text, via };
}

function clean(m) {
  return {
    from: String(m.from || 'unknown@unknown').slice(0, 200),
    subject: String(m.subject || '(no subject)').slice(0, 300),
    body: String(m.body || '').slice(0, 8000),
    received_at: m.received_at || new Date().toISOString(),
  };
}

function seed() {
  const items = JSON.parse(readFileSync(join(config.dataDir, 'inbox-seed.json'), 'utf8'));
  for (const m of items.reverse()) store.addMessage(clean(m));
  return items.length;
}

// ---------- API ----------
const routes = [
  ['GET', /^\/api\/status$/, async () => ({
    model: config.model, endpoint: config.aiBaseUrl, model_live: modelUp, ai_enabled: live.ai,
    channels: { telegram: live.telegram, slack: live.slack, console: true },
    poll_seconds: config.pollSeconds, brief_at: config.briefAt, busy, current, stats: store.state.stats,
    cloud_llm_calls: 0,
  })],
  ['GET', /^\/api\/state$/, async () => store.state],
  ['POST', /^\/api\/inbox$/, async (body) => store.addMessage(clean(body))],
  ['POST', /^\/api\/seed$/, async () => ({ added: seed() })],
  ['POST', /^\/api\/reset$/, async () => { store.reset(); return { ok: true }; }],
  ['POST', /^\/api\/brief$/, async () => sendBrief()],
  ['POST', /^\/api\/messages\/([\w-]+)\/approve$/, async (body, [, id]) => {
    const m = store.get(id);
    if (!m?.draft) throw httpError(404, 'no draft');
    const draft = { ...m.draft, body: body.body ? String(body.body).slice(0, 4000) : m.draft.body, status: 'approved', approved_at: new Date().toISOString() };
    store.audit({ message_id: id, event: 'draft_approved_by_human' });
    return store.update(id, { draft, status: 'approved' });
  }],
  ['POST', /^\/api\/tasks\/([\w-]+)\/done$/, async (_b, [, id]) => {
    const t = store.state.tasks.find((x) => x.id === id);
    if (t) t.done = true;
    store.update('__none__', {});
    return t || {};
  }],
];

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  for (const [method, re, handler] of routes) {
    const match = url.pathname.match(re);
    if (match && req.method === method) {
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const out = await handler(raw ? JSON.parse(raw) : {}, match);
        if (method === 'POST') setImmediate(tick);
        return send(res, 200, JSON.stringify(out), 'application/json');
      } catch (err) {
        return send(res, err.status || 500, JSON.stringify({ error: err.message }), 'application/json');
      }
    }
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1).replace(/\.\./g, '');
  const path = join(PUBLIC, file);
  if (existsSync(path)) return send(res, 200, readFileSync(path), TYPES[extname(path)] || 'application/octet-stream');
  send(res, 404, 'not found', 'text/plain');
}).listen(config.port, async () => {
  modelUp = live.ai && await modelReachable();
  console.log(`Nightdesk on http://localhost:${config.port}`);
  console.log(`  model: ${modelUp ? `${config.model} @ ${config.aiBaseUrl} (local)` : 'rule engine (no local model reachable)'} · channels: ${[live.telegram && 'telegram', live.slack && 'slack', 'console'].filter(Boolean).join(', ')}`);
  setInterval(tick, config.pollSeconds * 1000);
  tick();
});

function send(res, status, body, type) { res.writeHead(status, { 'content-type': type }); res.end(body); }
