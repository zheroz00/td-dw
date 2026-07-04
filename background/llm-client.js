// One client for every backend: OpenRouter and any OpenAI-compatible
// endpoint (Ollama, llama.cpp, LM Studio, ...) all speak POST {baseUrl}/chat/completions.

// maxTokens must leave room for hidden reasoning: thinking models (Gemini 3.x,
// DeepSeek, Claude w/ extended thinking) bill chain-of-thought against
// max_tokens BEFORE any visible output. Too small = truncated or empty replies.
export async function chatCompletion(config, messages, { maxTokens = 8192, temperature = 0.3 } = {}) {
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

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });
  } catch (err) {
    throw new Error(`Could not reach ${baseUrl} — check the URL and that the endpoint is running. (${err.message})`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
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
  return text;
}
