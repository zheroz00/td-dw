import { providerFromUrl } from './config.js';

// One client for every backend: OpenRouter and any OpenAI-compatible
// endpoint (Ollama, llama.cpp, LM Studio, ...) all speak POST {baseUrl}/chat/completions.

// Verified against the provider docs on 2026-09-05: Gemini's OpenAI-compatible
// endpoint takes a top-level `reasoning_effort` (minimal/low/medium/high; thinking
// cannot be turned off on 3.x Flash, only lowered). OpenRouter needs the nested
// `reasoning: { effort }` object and ignores a top-level `reasoning_effort`.
// Custom/local OpenAI-compatible servers may reject unknown fields entirely, so
// by default they get nothing. Only when the user explicitly configured an effort
// (`explicit`) do they get the OpenAI-standard top-level field, which Ollama, vLLM,
// LM Studio and OpenAI itself read.
export function reasoningFields(baseUrl, effort, { explicit = false } = {}) {
  if (!effort) return {};
  const provider = providerFromUrl(baseUrl);
  if (provider === 'openrouter') return { reasoning: { effort } };
  if (provider === 'gemini') return { reasoning_effort: effort };
  return explicit ? { reasoning_effort: effort } : {};
}

// A slow thinking model can run for minutes. Without our own limit Node's fetch
// gives up after its 300 s header timeout with a misleading "fetch failed".
export const LLM_TIMEOUT_MS = 120000;

function timeoutError(timeoutMs) {
  return new Error(`The model took longer than ${Math.round(timeoutMs / 1000)} seconds to answer, so TD;DW gave up. Thinking models can run long: try a faster model, or turn its reasoning effort down.`);
}

// maxTokens must leave room for hidden reasoning: thinking models (Gemini 3.x,
// DeepSeek, Claude w/ extended thinking) bill chain-of-thought against
// max_tokens BEFORE any visible output. Too small = truncated or empty replies.
//
// `config.reasoningEffort` (the TV service sets it; the extension never does) wins
// over the caller's `effort` and is sent to any endpoint, custom ones included.
export async function chatCompletion(config, messages, options) {
  return (await chatCompletionDetailed(config, messages, options)).text;
}

// Same call, plus the model that actually answered: OpenAI-compatible replies
// name it in `model`, which differs from the requested one when a router
// (openrouter/free, openrouter/auto) picked it. Falls back to the requested
// model for servers that leave the field out.
export async function chatCompletionDetailed(config, messages, { maxTokens = 8192, temperature = 0.3, effort, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('No API base URL configured. Open the extension options.');
  }
  if (!config.model) {
    throw new Error('No model configured. Open the extension options.');
  }

  // Warn (don't block — local endpoints are legitimately http://) if a key would
  // travel to a non-local host in cleartext.
  if (config.apiKey && /^http:\/\//i.test(baseUrl)) {
    try {
      const host = new URL(baseUrl).hostname;
      const isLocal =
        host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
      if (!isLocal) {
        console.warn(
          `[TD;DW] Sending your API key to a non-local http:// endpoint (${host}) in cleartext — use https:// for remote endpoints.`
        );
      }
    } catch { /* malformed URL — the fetch below will surface it */ }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  if (baseUrl.includes('openrouter.ai')) {
    // OpenRouter uses these for app attribution/rankings.
    headers['HTTP-Referer'] = 'https://github.com/zheroz00/td-dw';
    headers['X-Title'] = 'TD;DW';
  }

  const extraFields = config.reasoningEffort
    ? reasoningFields(baseUrl, config.reasoningEffort, { explicit: true })
    : reasoningFields(baseUrl, effort);

  async function post(fields) {
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...fields
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      if (err.name === 'TimeoutError') throw timeoutError(timeoutMs);
      throw new Error(`Could not reach ${baseUrl} — check the URL and that the endpoint is running. (${err.message})`);
    }
  }

  let res = await post(extraFields);

  // Some OpenRouter models reject the reasoning field outright with a 400.
  // Retry once without it rather than failing the whole request.
  if (!res.ok && res.status === 400 && Object.keys(extraFields).length) {
    console.warn('[TD;DW] endpoint rejected reasoning settings, retrying without');
    res = await post({});
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`);
  }

  // The same signal also covers reading the body, so a timeout can land here too.
  let data;
  try {
    data = await res.json();
  } catch (err) {
    if (err.name === 'TimeoutError') throw timeoutError(timeoutMs);
    throw err;
  }
  const message = data?.choices?.[0]?.message;
  let text = message?.content;
  if (typeof text !== 'string') {
    text = '';
  }
  // Local reasoning models (Qwen, DeepSeek, ...) may emit their chain of
  // thought as a <think> block before the answer — strip it.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) {
    // Reasoning models put chain-of-thought in a separate field; if that's all
    // we got, the model ran out of token budget before answering.
    if (message?.reasoning || message?.reasoning_content) {
      throw new Error('The model spent its whole token budget on hidden reasoning and never answered — try a non-reasoning model, or report this so the budget can be raised.');
    }
    throw new Error('LLM response contained no message content.');
  }
  return { text, model: typeof data?.model === 'string' && data.model ? data.model : config.model };
}
