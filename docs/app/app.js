// Dashboard: polls the agent's state every 2 seconds and renders it.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
let selected = new URLSearchParams(location.search).get('m');
let state = { messages: [], feed: [], tasks: [] }, status = {};

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

async function refresh() {
  [state, status] = await Promise.all([api('/api/state'), api('/api/status')]);
  render();
}

function render() {
  const s = status.stats || {};
  const chips = [
    [status.model_live ? 'on' : 'off', status.model_live ? `Model: ${status.model} · local` : status.browser_demo ? 'Browser demo · rule engine' : 'Model offline · rule engine'],
    ['on', `Cloud LLM calls: ${status.cloud_llm_calls ?? 0}`],
    ['on', `Inference cost: $0.00`],
    [status.channels?.telegram || status.channels?.slack ? 'on' : 'off', `Channel: ${status.channels?.telegram ? 'Telegram' : status.channels?.slack ? 'Slack' : 'console'}`],
    [status.busy ? 'on pulse' : 'on', status.busy ? 'Agent working…' : `Always on · every ${status.poll_seconds}s`],
  ];
  $('chips').innerHTML = chips.map(([c, t]) => `<span class="chip ${c}"><span class="dot"></span>${esc(t)}</span>`).join('');

  const m = state.messages;
  const count = (f) => m.filter(f).length;
  $('stats').innerHTML = [
    [count((x) => x.handled_at), 'handled'],
    [count((x) => x.escalated), 'escalated'],
    [count((x) => x.status === 'needs_approval'), 'drafts to approve'],
    [s.model_calls || 0, 'local model calls'],
    [((s.tokens_in || 0) + (s.tokens_out || 0)).toLocaleString(), 'tokens, on device'],
    [count((x) => x.status === 'new' || x.status === 'working'), 'in queue'],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

  $('messages').innerHTML = m.map((x) => `
    <li data-id="${x.id}" class="${x.id === selected ? 'sel' : ''}">
      <div class="from"><span>${esc(x.customer?.company || x.from)}</span><span>${time(x.received_at)}</span></div>
      <div class="subj">${esc(x.subject)}</div>
      <div class="tags">${x.triage ? `<span class="tag ${x.triage.urgency}">${x.triage.urgency.toUpperCase()}</span><span class="tag ${x.triage.category}">${x.triage.category.replace('_', ' ')}</span>` : ''}
      <span class="tag status-${x.status}">${x.status.replace('_', ' ')}</span>${x.escalated ? '<span class="tag p1">escalated</span>' : ''}</div>
    </li>`).join('') || '<p class="empty">Inbox empty. Load the overnight inbox to watch the agent work.</p>';
  for (const li of document.querySelectorAll('#messages li')) li.onclick = () => { selected = li.dataset.id; history.replaceState(null, '', `?m=${selected}`); render(); };

  renderDetail(m.find((x) => x.id === selected));

  $('feed').innerHTML = (state.feed || []).map((f) => `<li class="${f.text.startsWith('☀️') ? 'brief' : ''}"><div class="when">${time(f.at)} · via ${esc(f.via.join(', '))}</div>${esc(f.text)}</li>`).join('') || '<p class="empty">Escalations and the morning brief appear here, and in Telegram or Slack when connected.</p>';
  $('tasks').innerHTML = (state.tasks || []).map((t) => `<li><span class="owner">${esc(t.owner)}</span><span>${t.done ? '<s>' : ''}${esc(t.title)}${t.done ? '</s>' : ''}</span></li>`).join('') || '<p class="empty">None yet.</p>';
}

function renderDetail(x) {
  const d = $('detail');
  if (!x) { d.innerHTML = '<p class="empty">Pick an email to see what the agent did.</p>'; return; }
  if (d.dataset.id === x.id && d.dataset.status === x.status && document.activeElement?.tagName === 'TEXTAREA') return;
  d.dataset.id = x.id; d.dataset.status = x.status;
  const c = x.customer;
  d.innerHTML = `
    <div class="tags">${x.triage ? `<span class="tag ${x.triage.urgency}">${x.triage.urgency.toUpperCase()}</span><span class="tag">${x.triage.category.replace('_', ' ')}</span>` : ''}<span class="tag status-${x.status}">${x.status.replace('_', ' ')}</span>${x.engine ? `<span class="tag">engine: ${esc(x.engine)}</span>` : ''}</div>
    <h1>${esc(x.subject)}</h1>
    <div class="meta">${esc(x.from)} · received ${time(x.received_at)}${x.handled_at ? ` · handled ${time(x.handled_at)}` : ''}</div>
    ${x.triage ? `<div class="card"><h3>Agent summary</h3><div>${esc(x.triage.summary)}</div>${x.escalated ? `<div class="row"><span class="tag p1">Escalated via ${esc(x.escalated.via.join(', '))}</span><span class="muted">${esc(x.escalated.reason)}</span></div>` : ''}</div>` : ''}
    <div class="card"><h3>Email</h3><div class="body">${esc(x.body)}</div></div>
    ${c ? `<div class="card"><h3>Customer (local CRM)</h3><div class="kv"><span>Company</span><span>${esc(c.company)}</span><span>Plan</span><span>${esc(c.plan)} · $${c.mrr_usd}/mo</span><span>Renewal</span><span>${esc(c.renewal)}</span><span>Notes</span><span>${esc(c.notes || '–')}</span></div></div>` : ''}
    ${x.draft ? `<div class="card"><h3>Reply draft · ${x.draft.status === 'approved' ? 'approved by a person' : 'waiting for your approval'}</h3><textarea id="draft" ${x.draft.status === 'approved' ? 'disabled' : ''}>${esc(x.draft.body)}</textarea>
      <div class="row">${x.draft.status === 'approved' ? '<span class="tag status-approved">approved</span>' : '<button id="approve">Approve reply</button><span class="muted">The agent can’t send email. You decide.</span>'}</div></div>` : ''}
    ${x.tool_calls?.length ? `<div class="card"><h3>Agent trace · tool calls chosen by ${x.engine?.startsWith('rules') ? 'the rule engine' : 'the local model'}</h3><ul class="trace">${x.tool_calls.map((t, i) => `<li><span class="n">${i + 1}</span><span class="name">${esc(t.name)}</span><span class="args">${esc(JSON.stringify(t.args)).slice(0, 260)}</span></li>`).join('')}</ul></div>` : x.status === 'working' ? '<div class="card"><h3>Agent trace</h3><p class="muted">The local model is working on this email…</p></div>' : ''}`;
  const btn = $('approve');
  if (btn) btn.onclick = async () => { btn.disabled = true; await api(`/api/messages/${x.id}/approve`, { body: $('draft').value }); refresh(); };
}

$('seed').onclick = async () => { await api('/api/seed', {}); refresh(); };
$('reset').onclick = async () => { if (confirm('Clear all messages?')) { await api('/api/reset', {}); selected = null; refresh(); } };
$('brief').onclick = async () => { await api('/api/brief', {}); refresh(); };
refresh();
setInterval(refresh, 2000);
