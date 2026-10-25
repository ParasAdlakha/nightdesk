import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { planWithRules } from '../core/rules.mjs';
import { loadKb, searchKb, runTool } from '../core/tools.mjs';
import { handleMessage } from '../core/agent.mjs';
import { buildBrief } from '../core/brief.mjs';
import { createStore } from '../core/store.mjs';
import { isLocalUrl } from '../core/config.mjs';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const customers = JSON.parse(readFileSync(join(DATA, 'customers.json'), 'utf8'));
const seed = JSON.parse(readFileSync(join(DATA, 'inbox-seed.json'), 'utf8'));
const kb = loadKb(DATA);
const bySubject = (s) => seed.find((m) => m.subject.includes(s));

function ctx() {
  const store = createStore(mkdtempSync(join(tmpdir(), 'nightdesk-')));
  const sent = [];
  const channels = { send: async (text) => { sent.push(text); store.feed({ kind: 'alert', text, via: ['test'] }); return ['test']; } };
  return { store, channels, customers, kb, sent, useModel: false };
}

test('only local model endpoints are allowed', () => {
  assert.equal(isLocalUrl('http://localhost:11434/v1'), true);
  assert.equal(isLocalUrl('http://127.0.0.1:8000/v1'), true);
  assert.equal(isLocalUrl('https://api.openai.com/v1'), false);
  assert.equal(isLocalUrl('not a url'), false);
});

test('knowledge base search finds the right policy', () => {
  assert.equal(searchKb(kb, 'charged twice refund')[0].id, 'billing');
  assert.equal(searchKb(kb, 'locked password')[0].id, 'password-reset');
  assert.equal(searchKb(kb, 'production down 503')[0].id, 'outages');
});

test('rules classify the sample inbox', () => {
  const cat = (s) => planWithRules(bySubject(s)).find(([n]) => n === 'classify')[1];
  assert.deepEqual([cat('scanners').category, cat('scanners').urgency], ['outage', 'p1']);
  assert.equal(cat('Charged twice').category, 'billing');
  assert.equal(cat('cancel').category, 'churn_risk');
  assert.equal(cat('locked out').category, 'account_access');
  assert.equal(cat('SSO').category, 'sales');
  assert.equal(cat('10 tricks').category, 'spam');
});

test('outage on enterprise account is escalated with a draft', async () => {
  const c = ctx();
  const out = await handleMessage({ id: 'a1', ...bySubject('scanners') }, c);
  assert.equal(out.triage.urgency, 'p1');
  assert.equal(out.customer.plan, 'Enterprise');
  assert.ok(out.escalated);
  assert.equal(out.status, 'needs_approval');
  assert.equal(c.sent.length, 1);
});

test('spam is archived with no draft and no alert', async () => {
  const c = ctx();
  const out = await handleMessage({ id: 'a2', ...bySubject('10 tricks') }, c);
  assert.equal(out.status, 'archived');
  assert.equal(out.draft, undefined);
  assert.equal(c.sent.length, 0);
});

test('escalation is refused for a normal ticket', async () => {
  const c = ctx();
  const msg = { id: 'a3', from: 'x@y.z', subject: 'hi', body: '', triage: { category: 'how_to', urgency: 'normal', summary: '' } };
  const r = await runTool('escalate', { reason: 'just because' }, { ...c, msg });
  assert.match(r.error, /only for p1/);
  assert.equal(c.sent.length, 0);
});

test('drafts are never sent, only saved for approval', async () => {
  const c = ctx();
  const msg = { id: 'a4', triage: { category: 'billing', urgency: 'normal', summary: '' } };
  const r = await runTool('draft_reply', { body: 'Hello' }, { ...c, msg });
  assert.equal(msg.draft.status, 'awaiting_approval');
  assert.match(r.status, /approves/);
});

test('invalid classification is rejected', async () => {
  const c = ctx();
  const msg = { id: 'a5' };
  const r = await runTool('classify', { category: 'made_up', urgency: 'p1', summary: '' }, { ...c, msg });
  assert.ok(r.error);
  assert.equal(msg.triage, undefined);
});

test('a broken model falls back to the rule engine', async () => {
  const c = ctx();
  const out = await handleMessage({ id: 'a6', ...bySubject('Charged twice') }, { ...c, useModel: true });
  // No model server in tests: the call fails, the rules finish the job.
  assert.equal(out.triage.category, 'billing');
  assert.match(out.engine, /rules/);
});

test('morning brief summarises the night', async () => {
  const c = ctx();
  const handled = [];
  for (const [i, m] of seed.entries()) handled.push(await handleMessage({ id: `b${i}`, ...m }, c));
  const text = buildBrief(handled, c.store.state.tasks);
  assert.match(text, /6 emails handled/);
  assert.match(text, /Harbor Logistics/);
  assert.match(text, /At risk: Corvid Health/);
});
