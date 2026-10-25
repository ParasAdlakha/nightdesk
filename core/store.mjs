// Local state: a JSON file for messages and an append-only JSONL audit log.
// Everything the agent reads or decides stays on this machine.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'state.json');
  const auditFile = join(dir, 'audit.jsonl');
  let state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { messages: [], feed: [], tasks: [], briefs: [], stats: { model_calls: 0, tokens_in: 0, tokens_out: 0, model_ms: 0 } };
  const save = () => writeFileSync(file, JSON.stringify(state, null, 2));

  return {
    get state() { return state; },
    reset() { state = { messages: [], feed: [], tasks: [], briefs: [], stats: { model_calls: 0, tokens_in: 0, tokens_out: 0, model_ms: 0 } }; save(); },
    addMessage(msg) {
      const m = { id: randomUUID().slice(0, 8), status: 'new', received_at: new Date().toISOString(), ...msg };
      state.messages.unshift(m); save(); return m;
    },
    nextNew() { return state.messages.filter((m) => m.status === 'new').at(-1); },
    update(id, patch) {
      const m = state.messages.find((x) => x.id === id);
      if (m) { Object.assign(m, patch); save(); }
      return m;
    },
    get(id) { return state.messages.find((x) => x.id === id); },
    feed(entry) { state.feed.unshift({ at: new Date().toISOString(), ...entry }); state.feed = state.feed.slice(0, 200); save(); },
    task(t) { const task = { id: randomUUID().slice(0, 8), created_at: new Date().toISOString(), done: false, ...t }; state.tasks.unshift(task); save(); return task; },
    brief(b) { state.briefs.unshift({ at: new Date().toISOString(), ...b }); save(); },
    usage(u) { const s = state.stats; s.model_calls++; s.tokens_in += u.input || 0; s.tokens_out += u.output || 0; s.model_ms += u.ms || 0; save(); },
    audit(event) { appendFileSync(auditFile, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n'); },
  };
}
