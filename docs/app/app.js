// Dashboard: polls the agent's state every 2 seconds and renders it.
// The selected email's tool calls are drawn as connected nodes, in the order the agent made them.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const words = (s) => String(s || '').replace(/_/g, ' ');
let selected = new URLSearchParams(location.search).get('m');
let picked = Boolean(selected);
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
  const m = state.messages;
  const s = status.stats || {};
  const engine = status.model_live ? `<b>${esc(status.model)}</b> on localhost` : status.browser_demo ? '<span class="warn">browser demo · rule engine</span>' : '<span class="warn">model offline · rule engine</span>';
  const channel = status.channels?.telegram ? 'Telegram' : status.channels?.slack ? 'Slack' : 'console';
  $('announce').innerHTML = `<span>INFERENCE ${engine}</span><span>CLOUD LLM CALLS <b>${status.cloud_llm_calls ?? 0}</b></span><span>COST PER CALL <b>$0.00</b></span><span>CHANNEL <b>${channel}</b></span>`;
  $('live').textContent = status.busy ? 'Agent working…' : `Always on · checks every ${status.poll_seconds}s`;
  $('live').className = `live${status.busy ? ' busy' : ''}`;

  const count = (f) => m.filter(f).length;
  $('stats').innerHTML = [
    [count((x) => x.handled_at), 'handled'],
    [count((x) => x.escalated), 'escalated', count((x) => x.escalated) > 0],
    [count((x) => x.status === 'needs_approval'), 'to approve'],
    [s.model_calls || 0, 'local model calls'],
    [count((x) => x.status === 'new' || x.status === 'working'), 'in queue'],
  ].map(([v, l, hot]) => `<div class="stat${hot ? ' hot' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');

  // Until someone picks an email, follow the most urgent one the agent has handled.
  if (!picked || !m.some((x) => x.id === selected)) {
    const rank = (x) => (x.triage?.urgency === 'p1' ? 0 : x.escalated ? 1 : x.draft ? 2 : 3);
    selected = m.filter((x) => x.handled_at).sort((a, b) => rank(a) - rank(b))[0]?.id || m.find((x) => x.status === 'working')?.id || null;
  }

  $('inbox-label').innerHTML = `<span>Inbox</span><span>${m.length}</span>`;
  $('messages').innerHTML = m.map((x) => `
    <li data-id="${x.id}" class="${x.id === selected ? 'sel' : ''}">
      <div class="who"><span>${esc(x.customer?.company || x.from.split('@')[1] || x.from)}</span><span>${time(x.received_at)}</span></div>
      <div class="subj">${esc(x.subject)}</div>
      <div class="tags">${tags(x)}</div>
    </li>`).join('') || '<p class="muted">Empty. Load the overnight inbox to watch the agent work.</p>';
  for (const li of document.querySelectorAll('#messages li')) li.onclick = () => { selected = li.dataset.id; picked = true; history.replaceState(null, '', `?m=${selected}`); render(); };

  renderDetail(m.find((x) => x.id === selected));

  $('channel-label').innerHTML = `<span>Channel</span><span>${channel}</span>`;
  $('feed').innerHTML = (state.feed || []).map((f) => {
    const brief = f.text.startsWith('☀️');
    return `<li class="${brief ? 'brief' : 'alert'}"><div class="when">${brief ? 'Morning brief' : 'Escalation'} · ${time(f.at)} · ${esc(f.via.join(', '))}</div>${esc(f.text)}</li>`;
  }).join('') || '<p class="muted">Escalations and the morning brief land here, and in Telegram or Slack when connected.</p>';
  $('tasks').innerHTML = (state.tasks || []).map((t) => `<li><span class="owner">${esc(words(t.owner))}</span><span>${t.done ? '<s>' : ''}${esc(t.title)}${t.done ? '</s>' : ''}</span></li>`).join('') || '<p class="muted">None yet.</p>';
}

function tags(x) {
  const out = [];
  if (x.triage) out.push(`<span class="tag ${x.triage.urgency}">${esc(x.triage.urgency)}</span><span class="tag">${esc(words(x.triage.category))}</span>`);
  if (x.escalated) out.push('<span class="tag esc">paged</span>');
  if (x.status === 'working' || x.status === 'new') out.push(`<span class="tag work">${x.status === 'new' ? 'queued' : 'working'}</span>`);
  else if (x.status === 'approved') out.push('<span class="tag ok">approved</span>');
  else out.push(`<span class="tag">${esc(words(x.status))}</span>`);
  return out.join('');
}

// One node per tool call: what the agent asked for and what it got back, in plain words.
function nodeFor(t, x) {
  const a = t.args || {}, r = t.result || {};
  switch (t.name) {
    case 'lookup_customer': return { kind: 'Tool', name: 'lookup_customer', val: x.customer ? `<div class="big">${esc(x.customer.company)}</div>${esc(x.customer.plan)} · $${x.customer.mrr_usd}/mo · renews ${esc(x.customer.renewal)}${x.customer.notes ? `<br><span class="muted" style="padding:0">${esc(x.customer.notes)}</span>` : ''}` : 'Not in the CRM' };
    case 'classify': return { kind: 'Decision', name: 'classify', val: `<div class="tags" style="margin-bottom:6px"><span class="tag ${esc(a.urgency)}">${esc(a.urgency)}</span><span class="tag">${esc(words(a.category))}</span></div>${esc(a.summary)}` };
    case 'search_kb': return { kind: 'Tool', name: 'search_kb', val: `“${esc(a.query)}”<br>${(x.kb || []).map((k) => `<span class="tag" style="margin-top:6px;display:inline-block">${esc(k)}.md</span>`).join(' ') || 'No match'}` };
    case 'draft_reply': return { kind: 'Output', name: 'draft_reply', val: r.error ? esc(r.error) : 'Reply saved as a draft.<br>Waiting for a person to approve.', cls: r.error ? 'denied' : '' };
    case 'escalate': return { kind: 'Action', name: 'escalate', val: r.error ? `Refused: ${esc(r.error)}` : `<div class="big">Paged ${esc((r.via || x.escalated?.via || ['console']).join(', '))}</div>${esc(a.reason)}`, cls: r.error ? 'denied' : 'alert' };
    case 'create_task': return { kind: 'Action', name: 'create_task', val: `<span class="tag" style="margin-bottom:6px;display:inline-block">${esc(words(a.owner))}</span><br>${esc(a.title)}` };
    case 'finish': return { kind: 'Done', name: 'finish', val: esc(a.note) };
    case 'fallback': return { kind: 'Fallback', name: 'rule engine', val: `Model unavailable, rules took over.<br><span class="muted" style="padding:0">${esc(a.reason)}</span>`, cls: 'fallback' };
    default: return { kind: 'Tool', name: t.name, val: esc(JSON.stringify(a)) };
  }
}

function renderDetail(x) {
  const d = $('detail');
  if (!x) {
    d.dataset.id = '';
    d.innerHTML = `<div class="empty-hero">
      <div class="label" style="margin:0">Always-on support agent · local inference</div>
      <h2>Your support inbox, triaged overnight.<br>On your own hardware.</h2>
      <p>Load six emails from a typical night and watch the agent look up each customer, classify, search your policies, draft replies for approval, and page a human only when it must.</p>
      <button class="lime" onclick="document.getElementById('seed').click()">Load overnight inbox</button>
      <div class="steps"><div><span>01 · READ</span>Every email, as it lands</div><div><span>02 · DECIDE</span>Local model picks the tools</div><div><span>03 · ACT</span>Draft, page, or create a task</div><div><span>04 · BRIEF</span>Summary at 08:00</div></div>
    </div>`;
    return;
  }
  const key = `${x.id}:${x.status}:${x.tool_calls?.length || 0}`;
  if (d.dataset.key === key) return;
  if (d.dataset.id === x.id && document.activeElement?.tagName === 'TEXTAREA') return;
  d.dataset.id = x.id; d.dataset.key = key;

  const engineName = x.engine?.startsWith('rules') ? 'rule engine' : x.engine ? `${x.engine} · local` : '';
  const nodes = [{ kind: 'Input', name: 'email', val: `<div class="big">${esc(x.from)}</div>${time(x.received_at)} · ${esc(x.subject)}`, cls: 'input' }]
    .concat((x.tool_calls || []).map((t) => nodeFor(t, x)));
  const working = x.status === 'working' || x.status === 'new';

  d.innerHTML = `
    <div class="canvas-head">
      <div><div class="meta">${esc(x.customer?.company || x.from)} · received ${time(x.received_at)}${x.handled_at ? ` · handled ${time(x.handled_at)}` : ''}</div>
      <h2>${esc(x.triage?.summary || x.subject)}</h2></div>
      <div class="tags">${tags(x)}${engineName ? `<span class="tag">${esc(engineName)}</span>` : ''}</div>
    </div>
    <div class="graph" id="graph">
      <svg class="wires" id="wires"></svg>
      ${nodes.map((n, i) => `<div class="node ${n.cls || ''}" style="animation-delay:${i * 60}ms"><div class="kind"><span>${String(i).padStart(2, '0')} · ${esc(n.kind)}</span><b>${esc(n.name)}</b></div><div class="val">${n.val}</div></div>`).join('')}
      ${working ? '<div class="node"><div class="kind"><span>·· · Agent</span><b>thinking</b></div><div class="val">Choosing the next tool…</div></div>' : ''}
    </div>
    ${x.draft ? `<div class="output"><div class="kind"><span>Output · reply draft</span><span>${x.draft.status === 'approved' ? 'Approved by a person' : 'Waiting for your approval'}</span></div>
      <textarea id="draft" ${x.draft.status === 'approved' ? 'disabled' : ''}>${esc(x.draft.body)}</textarea>
      <div class="row">${x.draft.status === 'approved' ? '<span class="tag ok">approved</span><span class="note">Logged to the audit trail.</span>' : '<button class="dark" id="approve">Approve reply</button><span class="note">The agent can’t send email. You decide.</span>'}</div></div>` : ''}
    <div class="mail"><div class="kind">Original email</div><p>${esc(x.body)}</p></div>`;

  const btn = $('approve');
  if (btn) btn.onclick = async () => { btn.disabled = true; await api(`/api/messages/${x.id}/approve`, { body: $('draft').value }); d.dataset.key = ''; refresh(); };
  requestAnimationFrame(drawWires);
}

// Curved wires from each node to the next, like a node editor.
function drawWires() {
  const g = $('graph'), svg = $('wires');
  if (!g || !svg) return;
  const box = g.getBoundingClientRect();
  const nodes = [...g.querySelectorAll('.node')].map((n) => n.getBoundingClientRect());
  let paths = '';
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const sameRow = Math.abs(a.top - b.top) < 10;
    const x1 = (sameRow ? a.right : a.left + a.width / 2) - box.left, y1 = (sameRow ? a.top + 26 : a.bottom) - box.top;
    const x2 = (sameRow ? b.left : b.left + b.width / 2) - box.left, y2 = (sameRow ? b.top + 26 : b.top) - box.top;
    const d = sameRow
      ? `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`
      : `M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 40} ${x2},${y2}`;
    paths += `<path d="${d}"/><circle cx="${x1}" cy="${y1}" r="3.5"/><circle cx="${x2}" cy="${y2}" r="3.5"/>`;
  }
  svg.innerHTML = paths;
}
window.addEventListener('resize', drawWires);

$('seed').onclick = async () => { await api('/api/seed', {}); refresh(); };
$('reset').onclick = async () => { if (confirm('Clear all messages?')) { await api('/api/reset', {}); selected = null; picked = false; refresh(); } };
$('brief').onclick = async () => { await api('/api/brief', {}); refresh(); };
refresh();
setInterval(refresh, 2000);
