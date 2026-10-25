// Every setting in one place. Anything missing switches that part to a local stand-in,
// so the agent always runs; the dashboard shows which parts are live.
import { fileURLToPath } from 'node:url';
const env = process.env;

export const config = {
  port: Number(env.PORT || 8791),
  aiBaseUrl: (env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, ''),
  model: env.AI_MODEL || 'qwen2.5:3b',
  aiEnabled: env.AI_ENABLED !== '0',
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS || 180000),
  maxSteps: Number(env.AI_MAX_STEPS || 8),

  telegramToken: env.TELEGRAM_BOT_TOKEN || '',
  telegramChat: env.TELEGRAM_CHAT_ID || '',
  slackWebhook: env.SLACK_WEBHOOK_URL || '',

  pollSeconds: Number(env.POLL_SECONDS || 10),
  briefAt: env.BRIEF_AT || '08:00',
  dataDir: env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url)),
  varDir: env.VAR_DIR || fileURLToPath(new URL('../var/', import.meta.url)),
};

// The only hosts the agent may reach. Inference is localhost-only by construction.
export function isLocalUrl(url) {
  try {
    const { hostname } = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');
  } catch { return false; }
}

export const live = {
  get ai() { return config.aiEnabled && isLocalUrl(config.aiBaseUrl); },
  telegram: Boolean(config.telegramToken && config.telegramChat),
  slack: Boolean(config.slackWebhook),
};
