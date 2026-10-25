export default {
 "customers": [
  {
   "email": "maya@brightlane.io",
   "name": "Maya Okafor",
   "company": "Brightlane",
   "plan": "Business",
   "mrr_usd": 1200,
   "renewal": "2026-11-30",
   "open_tickets": 1,
   "notes": "Champion. Asked about SSO in Q3."
  },
  {
   "email": "ops@harborfreight-logistics.com",
   "name": "Daniel Reyes",
   "company": "Harbor Logistics",
   "plan": "Enterprise",
   "mrr_usd": 6400,
   "renewal": "2027-02-01",
   "open_tickets": 0,
   "notes": "24/7 warehouse ops. SLA: 1 hour response on P1."
  },
  {
   "email": "lena@studiofinch.de",
   "name": "Lena Brandt",
   "company": "Studio Finch",
   "plan": "Starter",
   "mrr_usd": 49,
   "renewal": "2026-12-12",
   "open_tickets": 0,
   "notes": ""
  },
  {
   "email": "sam.k@corvidhealth.com",
   "name": "Sam Kowalski",
   "company": "Corvid Health",
   "plan": "Business",
   "mrr_usd": 2100,
   "renewal": "2026-11-05",
   "open_tickets": 2,
   "notes": "Renewal at risk: two late invoices disputed."
  },
  {
   "email": "priya@tandemcafe.com",
   "name": "Priya Nair",
   "company": "Tandem Cafe",
   "plan": "Starter",
   "mrr_usd": 49,
   "renewal": "2027-03-20",
   "open_tickets": 0,
   "notes": ""
  }
 ],
 "inbox": [
  {
   "from": "ops@harborfreight-logistics.com",
   "subject": "URGENT: scanners can't sync, warehouse stopped",
   "body": "Since about 2am none of our handheld scanners can sync. The dashboard shows error 503. Our night shift is loading trucks by hand. Please call me, this is production down.",
   "received_at": "2026-10-25T02:14:00-07:00"
  },
  {
   "from": "maya@brightlane.io",
   "subject": "Adding SSO for our team?",
   "body": "Hi! We're growing and our IT team wants to put everyone on Okta. Is SAML SSO something we can turn on with our current plan? Also how do we add 12 more seats?",
   "received_at": "2026-10-25T00:41:00-07:00"
  },
  {
   "from": "lena@studiofinch.de",
   "subject": "Charged twice this month",
   "body": "Hello, I see two charges of $49 on my card for October. Can you refund one? Thanks, Lena",
   "received_at": "2026-10-24T23:58:00-07:00"
  },
  {
   "from": "sam.k@corvidhealth.com",
   "subject": "We want to cancel",
   "body": "Honestly we're done. Third invoice problem this quarter and nobody answers. Please cancel our account at the end of the month.",
   "received_at": "2026-10-25T03:30:00-07:00"
  },
  {
   "from": "priya@tandemcafe.com",
   "subject": "locked out",
   "body": "I typed my password wrong a few times and now it says my account is locked?? I need to print today's rota.",
   "received_at": "2026-10-25T05:02:00-07:00"
  },
  {
   "from": "newsletter@growthhacks.example",
   "subject": "10 tricks to 10x your MRR",
   "body": "Unlock the secrets top founders use. Click here to claim your free ebook!",
   "received_at": "2026-10-25T04:00:00-07:00"
  }
 ],
 "kb": [
  {
   "id": "billing",
   "text": "# Billing, invoices and refunds\n\nKeywords: invoice, billing, charge, charged twice, refund, payment, card, receipt, VAT\n\n- Invoices are issued on the 1st of each month and are available under Settings > Billing.\n- Duplicate charges are refunded in full within 5 to 10 business days once confirmed. Support must confirm both charge IDs before promising a refund.\n- Refunds for unused months are pro-rated on annual plans only.\n- VAT IDs can be added to future invoices; past invoices cannot be reissued.\n"
  },
  {
   "id": "outages",
   "text": "# Outages and degraded service\n\nKeywords: down, outage, not loading, error 500, 502, 503, timeout, sync stopped, cannot access, production\n\n- Check the status page first. If an incident is open, link it and give the next update time.\n- If no incident is open and the customer reports a full outage, treat it as P1: escalate to on-call immediately.\n- Enterprise customers have a 1-hour response SLA on P1 issues.\n- Never guess at root cause in a reply. Say what we know, what we are doing, and when the next update will come.\n"
  },
  {
   "id": "password-reset",
   "text": "# Resetting a password or unlocking an account\n\nKeywords: password, reset, locked, login, sign in, 2FA, two-factor\n\n1. Go to the sign-in page and choose \"Forgot password\". A reset link is emailed and is valid for 30 minutes.\n2. After 5 failed attempts an account locks for 15 minutes. It unlocks automatically.\n3. If two-factor codes are not arriving, check the device clock is set automatically; codes are time-based.\n4. Support can force a reset for the account owner only, after verifying the owner's email.\n"
  },
  {
   "id": "sso-and-plans",
   "text": "# SSO, plans and upgrades\n\nKeywords: SSO, SAML, Okta, Azure AD, upgrade, plan, seats, pricing, enterprise, cancel, cancellation\n\n- SAML SSO (Okta, Azure AD, Google) is included on Business and Enterprise plans.\n- Seats can be added at any time from Settings > Team; billing is pro-rated.\n- Cancellation requests are handled by the account manager, never by an automated reply. Flag the account and draft a holding reply.\n- Upgrade questions from Business customers go to sales as a lead.\n"
  }
 ]
};
