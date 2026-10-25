// The morning brief: what happened overnight, in one message a manager can read on a phone.
export function buildBrief(messages, tasks, since) {
  const recent = messages.filter((m) => m.handled_at && (!since || m.handled_at >= since));
  const by = (k) => recent.filter((m) => m.triage?.category === k).length;
  const escalated = recent.filter((m) => m.escalated);
  const drafts = recent.filter((m) => m.status === 'needs_approval');
  const atRisk = recent.filter((m) => m.triage?.category === 'churn_risk');
  const lines = [
    `☀️ Nightdesk morning brief: ${recent.length} emails handled overnight`,
    `• ${escalated.length} escalated · ${drafts.length} replies drafted, waiting for approval · ${by('spam')} spam archived`,
  ];
  for (const m of escalated) lines.push(`• 🚨 ${m.customer?.company || m.from}: ${m.triage.summary}`);
  for (const m of atRisk) if (m.customer) lines.push(`• 💸 At risk: ${m.customer.company}, $${m.customer.mrr_usd}/mo, renews ${m.customer.renewal}`);
  const open = tasks.filter((t) => !t.done);
  if (open.length) lines.push(`• ${open.length} follow-up tasks: ${open.slice(0, 4).map((t) => `${t.owner}: ${t.title}`).join('; ')}`);
  return lines.join('\n');
}
