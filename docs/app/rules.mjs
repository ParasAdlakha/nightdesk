// Deterministic stand-in for the model. It plans the same tool calls the model would,
// so the agent keeps working when no model server is running, and tests need no GPU.
const has = (text, words) => words.some((w) => text.includes(w));

export function planWithRules(msg) {
  const text = `${msg.subject} ${msg.body}`.toLowerCase();
  let category = 'how_to', urgency = 'normal', kbQuery = msg.subject;

  if (has(text, ['unsubscribe', 'click here', 'free ebook', '10x'])) { category = 'spam'; urgency = 'low'; }
  else if (has(text, ['cancel', "we're done", 'switching to', 'terminate'])) { category = 'churn_risk'; urgency = 'high'; kbQuery = 'cancel cancellation'; }
  else if (has(text, ['down', 'outage', '503', '502', '500', "can't sync", 'cannot access', 'production'])) { category = 'outage'; urgency = has(text, ['urgent', 'production', 'stopped', 'down']) ? 'p1' : 'high'; kbQuery = 'outage down production'; }
  else if (has(text, ['charged', 'invoice', 'refund', 'billing', 'charge'])) { category = 'billing'; kbQuery = 'charged twice refund invoice'; }
  else if (has(text, ['locked', 'password', 'log in', 'login', 'sign in', '2fa'])) { category = 'account_access'; urgency = has(text, ['today', 'urgent', 'asap']) ? 'high' : 'normal'; kbQuery = 'locked password reset'; }
  else if (has(text, ['sso', 'upgrade', 'seats', 'pricing', 'plan'])) { category = 'sales'; kbQuery = 'SSO upgrade seats plan'; }

  const summary = `${category.replace('_', ' ')}: ${msg.subject}`.slice(0, 200);
  const calls = [
    ['lookup_customer', { email: msg.from }],
    ['classify', { category, urgency, summary }],
  ];
  if (category === 'spam') return [...calls, ['finish', { note: 'Spam, archived.' }]];

  calls.push(['search_kb', { query: kbQuery }]);
  const first = (msg.from.split('@')[0].split(/[._]/)[0] || 'there').replace(/^\w/, (c) => c.toUpperCase());
  const replies = {
    outage: `Hi ${first},\n\nThank you for flagging this. We've treated it as a P1 and paged our on-call engineer, who is looking at it now. We'll update you within the hour with what we know and what we're doing.\n\nThe Support Team`,
    billing: `Hi ${first},\n\nSorry about the double charge. We're confirming both charges now; once confirmed, the duplicate is refunded in full and usually reaches your card within 5 to 10 business days.\n\nThe Support Team`,
    account_access: `Hi ${first},\n\nAfter 5 failed attempts an account locks for 15 minutes and then unlocks on its own. If you need in sooner, use "Forgot password" on the sign-in page; the link is valid for 30 minutes.\n\nThe Support Team`,
    sales: `Hi ${first},\n\nGood news: SAML SSO with Okta is included on your Business plan. You can add seats any time under Settings > Team, billed pro-rata. I've asked our team to reach out to help with the Okta setup.\n\nThe Support Team`,
    churn_risk: `Hi ${first},\n\nThank you for telling us, and I'm sorry the invoice problems have put you here. Your account manager will contact you today personally to sort out the invoices and talk through your options.\n\nThe Support Team`,
    how_to: `Hi ${first},\n\nThanks for getting in touch. We're looking into this and will reply properly within one business day.\n\nThe Support Team`,
  };
  calls.push(['draft_reply', { body: replies[category] }]);
  if (urgency === 'p1') calls.push(['escalate', { reason: 'Customer reports a production outage; enterprise 1-hour P1 SLA applies.' }]);
  if (category === 'churn_risk') calls.push(['escalate', { reason: 'Paying customer asked to cancel; account manager must call today.' }], ['create_task', { title: `Call ${msg.from} about cancellation and invoices`, owner: 'account_manager' }]);
  if (category === 'billing') calls.push(['create_task', { title: `Confirm duplicate charge for ${msg.from}`, owner: 'billing' }]);
  if (category === 'sales') calls.push(['create_task', { title: `SSO + seats lead: ${msg.from}`, owner: 'sales' }]);
  calls.push(['finish', { note: `Triaged as ${category}/${urgency}.` }]);
  return calls;
}
