// In-browser stand-in for server/server.mjs: answers the dashboard's /api/* calls and runs
// the always-on loop with the same rule engine, tool guardrails and morning brief.
// No model runs here; the engine tag on each email says "rules (browser demo)".
import DATA from './data.js';
import { planWithRules } from './rules.mjs';
import { buildBrief } from './brief.mjs';

const KEY = 'nightdesk-demo-v1';
const fresh = () => ({ messages: [], feed: [], tasks: [], briefs: [], stats: { model_calls: 0, tokens_in: 0, tokens_out: 0, model_ms: 0 } });
let state = load();
let busy = false;
const id = () => Math.random().toString(16).slice(2, 10);

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { return fresh(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } }

const kb = DATA.kb.map((a) => ({ ...a, keywords: (a.text.match(/Keywords:(.*)/)?.[1] || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean) }));
function searchKb(query) {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return kb.map((a) => {
    let score = 0;
    for (const w of words) { if (a.keywords.some((k) => k.includes(w))) score += 3; else if (a.text.toLowerCase().includes(w)) score += 1; }
    return { id: a.id, score };
  }).filter((a) => a.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

function feed(text) { state.feed.unshift({ at: new Date().toISOString(), kind: 'alert', text, via: ['console'] }); }

// Same guardrails as core/tools.mjs runTool.
function runTool(name, args, msg) {
  switch (name) {
    case 'lookup_customer': msg.customer = DATA.customers.find((c) => c.email === args.email) || null; return msg.customer || { found: false };
    case 'search_kb': { const hits = searchKb(args.query); msg.kb = hits.map((h) => h.id); return hits; }
    case 'classify': msg.triage = { category: args.category, urgency: args.urgency, summary: args.summary }; return { ok: true };
    case 'draft_reply':
      if (msg.triage?.category === 'spam') return { error: 'no replies to spam' };
      msg.draft = { body: args.body, status: 'awaiting_approval' }; return { ok: true };
    case 'escalate': {
      if (!(msg.triage && (msg.triage.urgency === 'p1' || msg.triage.category === 'churn_risk'))) return { error: 'escalation is only for p1 or churn_risk' };
      feed(`🚨 ${msg.triage.urgency.toUpperCase()} · ${msg.customer?.company || msg.from}\n${msg.subject}\n${args.reason}`);
      msg.escalated = { reason: args.reason, via: ['console'] }; return { ok: true };
    }
    case 'create_task': { const t = { id: id(), created_at: new Date().toISOString(), done: false, title: args.title, owner: args.owner, message_id: msg.id }; state.tasks.unshift(t); return { ok: true, task_id: t.id }; }
    case 'finish': msg.note = args.note; return { ok: true };
    default: return { error: 'unknown tool' };
  }
}

function tick() {
  if (busy) return;
  const msg = state.messages.filter((m) => m.status === 'new').at(-1);
  if (!msg) return;
  busy = true;
  msg.status = 'working'; save();
  // A short pause so you can watch it work, one email at a time.
  setTimeout(() => {
    msg.tool_calls = [];
    for (const [name, args] of planWithRules(msg)) msg.tool_calls.push({ name, args, result: runTool(name, args, msg) });
    msg.engine = 'rules (browser demo)';
    msg.status = msg.triage?.category === 'spam' ? 'archived' : msg.draft ? 'needs_approval' : 'handled';
    msg.handled_at = new Date().toISOString();
    save(); busy = false;
  }, 1200);
}
setInterval(tick, 400);

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const routes = {
  'GET /api/state': () => state,
  'GET /api/status': () => ({ model: 'rule engine', model_live: false, browser_demo: true, ai_enabled: false, channels: { telegram: false, slack: false, console: true }, poll_seconds: 0.4, busy, stats: state.stats, cloud_llm_calls: 0 }),
  'POST /api/seed': () => { for (const m of [...DATA.inbox].reverse()) state.messages.unshift({ id: id(), status: 'new', ...m }); save(); return { added: DATA.inbox.length }; },
  'POST /api/reset': () => { state = fresh(); save(); return { ok: true }; },
  'POST /api/brief': () => { const text = buildBrief(state.messages, state.tasks); state.feed.unshift({ at: new Date().toISOString(), kind: 'brief', text, via: ['console'] }); save(); return { text }; },
};

const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const path = typeof url === 'string' ? url : url.url;
  if (!path.startsWith('/api/')) return realFetch(url, opts);
  const method = opts.method || 'GET';
  const approve = path.match(/^\/api\/messages\/([\w-]+)\/approve$/);
  if (approve && method === 'POST') {
    const m = state.messages.find((x) => x.id === approve[1]);
    if (!m?.draft) return json({ error: 'no draft' }, 404);
    const body = JSON.parse(opts.body || '{}');
    m.draft = { ...m.draft, body: body.body || m.draft.body, status: 'approved', approved_at: new Date().toISOString() };
    m.status = 'approved'; save();
    return json(m);
  }
  const handler = routes[`${method} ${path}`];
  return handler ? json(handler()) : json({ error: 'not found' }, 404);
};
