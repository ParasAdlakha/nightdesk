// The agent's tools. The model chooses which to call and with what; this file decides
// what each call is allowed to do. Nothing here can send an email to a customer:
// replies are saved as drafts for a person to approve.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CATEGORIES = ['outage', 'billing', 'account_access', 'sales', 'churn_risk', 'how_to', 'spam'];
export const URGENCY = ['p1', 'high', 'normal', 'low'];

export const TOOL_SCHEMAS = [
  fn('lookup_customer', 'Look up the sender in the local CRM: plan, revenue, renewal date, notes.', { email: str('Sender email address') }, ['email']),
  fn('search_kb', 'Search the local knowledge base for the policy that applies. Returns the best matching articles.', { query: str('A few keywords') }, ['query']),
  fn('classify', 'Record the triage decision for this message. Call exactly once.', {
    category: { type: 'string', enum: CATEGORIES },
    urgency: { type: 'string', enum: URGENCY },
    summary: str('One sentence a manager could read in the morning'),
  }, ['category', 'urgency', 'summary']),
  fn('draft_reply', 'Save a reply draft for a human to approve. Never promise refunds, credits or root causes the knowledge base does not support.', { body: str('Plain-text reply, signed "The Support Team"') }, ['body']),
  fn('escalate', 'Page the on-call channel now (Slack or Telegram). Only for p1 or churn risk on a paying account.', { reason: str('Why a human must look now') }, ['reason']),
  fn('create_task', 'Create a follow-up task for the team.', { title: str('Task title'), owner: { type: 'string', enum: ['support', 'billing', 'sales', 'account_manager', 'on_call'] } }, ['title', 'owner']),
  fn('finish', 'Call when this message is fully handled.', { note: str('What you did, in one line') }, ['note']),
];

function fn(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
}
function str(description) { return { type: 'string', description }; }

export function loadKb(dataDir) {
  const dir = join(dataDir, 'kb');
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    const title = text.split('\n')[0].replace(/^#\s*/, '');
    const keywords = (text.match(/Keywords:(.*)/)?.[1] || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    return { id: f.replace('.md', ''), title, keywords, text };
  });
}

export function searchKb(kb, query) {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = kb.map((a) => {
    const hay = a.text.toLowerCase();
    let score = 0;
    for (const w of words) { if (a.keywords.some((k) => k.includes(w))) score += 3; else if (hay.includes(w)) score += 1; }
    return { ...a, score };
  }).filter((a) => a.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map(({ id, title, text, score }) => ({ id, title, score, text }));
}

// Executes one tool call against the message's working record. Returns what the model sees.
export async function runTool(name, args, ctx) {
  const { msg, customers, kb, channels, store } = ctx;
  switch (name) {
    case 'lookup_customer': {
      const c = customers.find((x) => x.email.toLowerCase() === String(args.email || '').toLowerCase());
      msg.customer = c || null;
      return c || { found: false, note: 'Not a known customer' };
    }
    case 'search_kb': {
      const hits = searchKb(kb, args.query);
      msg.kb = [...new Set([...(msg.kb || []), ...hits.map((h) => h.id)])];
      return hits.length ? hits : { found: false };
    }
    case 'classify': {
      if (!CATEGORIES.includes(args.category) || !URGENCY.includes(args.urgency)) return { error: 'invalid category or urgency' };
      msg.triage = { category: args.category, urgency: args.urgency, summary: String(args.summary || '').slice(0, 300) };
      return { ok: true };
    }
    case 'draft_reply': {
      if (msg.triage?.category === 'spam') return { error: 'no replies to spam' };
      msg.draft = { body: String(args.body || '').slice(0, 4000), status: 'awaiting_approval' };
      return { ok: true, status: 'saved as draft; a person approves before anything is sent' };
    }
    case 'escalate': {
      const allowed = msg.triage && (msg.triage.urgency === 'p1' || msg.triage.category === 'churn_risk');
      if (!allowed) return { error: 'escalation is only for p1 or churn_risk; classify first' };
      const text = `🚨 ${msg.triage.urgency.toUpperCase()} · ${msg.customer?.company || msg.from}\n${msg.subject}\n${args.reason}`;
      const sent = await channels.send(text);
      msg.escalated = { reason: String(args.reason).slice(0, 500), via: sent };
      return { ok: true, via: sent };
    }
    case 'create_task': {
      const t = store.task({ title: String(args.title).slice(0, 200), owner: args.owner, message_id: msg.id });
      msg.tasks = [...(msg.tasks || []), t.id];
      return { ok: true, task_id: t.id };
    }
    case 'finish':
      msg.note = String(args.note || '').slice(0, 300);
      return { ok: true };
    default:
      return { error: `unknown tool ${name}` };
  }
}
