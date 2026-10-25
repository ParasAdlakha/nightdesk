// Where the agent talks to people: Telegram, Slack, or the dashboard's console feed.
// These are the only outbound network calls besides the local model.
import { config, live } from './config.mjs';

export function createChannels(store) {
  async function send(text) {
    const via = [];
    if (live.telegram) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: config.telegramChat, text }),
        });
        if (r.ok) via.push('telegram');
      } catch { /* fall through to console */ }
    }
    if (live.slack) {
      try {
        const r = await fetch(config.slackWebhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
        if (r.ok) via.push('slack');
      } catch { /* fall through to console */ }
    }
    if (!via.length) via.push('console');
    store.feed({ kind: 'alert', text, via });
    return via;
  }
  return { send };
}
