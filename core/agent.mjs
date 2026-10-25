// The agent loop for one message: the local model reads it, calls tools, and stops with finish().
// Every tool call is checked by tools.mjs and written to the audit log.
import { config, live } from './config.mjs';
import { chat } from './llm.mjs';
import { TOOL_SCHEMAS, runTool } from './tools.mjs';
import { planWithRules } from './rules.mjs';

const SYSTEM = `You are Nightdesk, the overnight support agent for a B2B software company.
Handle one inbound email at a time using tools. Work in this order:
1. lookup_customer with the sender's email.
2. classify the message (category, urgency, one-sentence summary). Use p1 only for production outages.
3. If not spam: search_kb, then draft_reply grounded ONLY in what the knowledge base says. Never promise refunds, credits, dates or root causes it does not support.
4. escalate only for p1, or churn_risk on a paying customer.
5. create_task when a human must follow up (billing confirmation, sales lead, account manager call).
6. finish.
You cannot send email. Drafts wait for human approval. Be brief and warm.`;

export async function handleMessage(msg, ctx) {
  const work = { ...msg, tool_calls: [] };
  ctx = { ...ctx, msg: work };
  const useModel = ctx.useModel ?? live.ai;
  let engine = useModel ? config.model : 'rules';
  try {
    if (useModel) await modelLoop(work, ctx);
    else await rulesLoop(work, ctx);
  } catch (err) {
    ctx.store.audit({ message_id: msg.id, event: 'model_failed', error: String(err.message || err) });
    work.tool_calls.push({ name: 'fallback', args: { reason: String(err.message || err).slice(0, 200) } });
    engine = 'rules (fallback)';
    await rulesLoop(work, ctx);
  }
  work.engine = engine;
  work.status = work.triage?.category === 'spam' ? 'archived' : work.draft ? 'needs_approval' : 'handled';
  work.handled_at = new Date().toISOString();
  return work;
}

async function exec(name, args, ctx) {
  const result = await ctx.runTool(name, args, ctx);
  ctx.msg.tool_calls.push({ name, args, result: summarize(result) });
  ctx.store.audit({ message_id: ctx.msg.id, tool: name, args, result: summarize(result) });
  return result;
}

async function rulesLoop(msg, ctx) {
  for (const [name, args] of planWithRules(msg)) await exec(name, args, { runTool, ...ctx });
}

async function modelLoop(msg, ctx) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `From: ${msg.from}\nSubject: ${msg.subject}\nReceived: ${msg.received_at}\n\n${msg.body}` },
  ];
  for (let step = 0; step < config.maxSteps; step++) {
    const { message, usage } = await chat(messages, TOOL_SCHEMAS);
    ctx.store.usage(usage);
    messages.push(message);
    const calls = message.tool_calls || [];
    if (!calls.length) break;
    for (const call of calls) {
      let args = {};
      try { args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : call.function.arguments || {}; } catch { args = {}; }
      const result = await exec(call.function.name, args, { runTool, ...ctx });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 4000) });
      if (call.function.name === 'finish') return;
    }
  }
  if (!msg.triage) throw new Error('model stopped without classifying');
}

function summarize(result) {
  const s = JSON.stringify(result);
  return s.length > 400 ? s.slice(0, 400) + '…' : result;
}
