// The only place a model is called. It must be a local, OpenAI-compatible server
// (Ollama, vLLM, NIM). A non-local URL is refused before any request is made.
import { config, isLocalUrl } from './config.mjs';

export async function chat(messages, tools) {
  if (!isLocalUrl(config.aiBaseUrl)) throw new Error(`Refusing non-local model endpoint: ${config.aiBaseUrl}`);
  const t0 = Date.now();
  const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(config.aiTimeoutMs),
    body: JSON.stringify({ model: config.model, messages, tools, tool_choice: 'auto', temperature: 0.1 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Model error ${res.status}: ${body.error?.message || 'unknown'}`);
  return {
    message: body.choices[0].message,
    usage: { input: body.usage?.prompt_tokens || 0, output: body.usage?.completion_tokens || 0, ms: Date.now() - t0 },
  };
}

export async function modelReachable() {
  try {
    const res = await fetch(`${config.aiBaseUrl}/models`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}
