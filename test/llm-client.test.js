import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasoningFields, chatCompletion } from '../background/llm-client.js';
import { providerFromUrl } from '../background/config.js';

// --- reasoningFields ---------------------------------------------------------

test('reasoningFields: openrouter gets the nested reasoning.effort object', () => {
  assert.deepEqual(
    reasoningFields('https://openrouter.ai/api/v1', 'medium'),
    { reasoning: { effort: 'medium' } }
  );
});

test('reasoningFields: gemini gets a top-level reasoning_effort', () => {
  assert.deepEqual(
    reasoningFields('https://generativelanguage.googleapis.com/v1beta/openai', 'low'),
    { reasoning_effort: 'low' }
  );
});

test('reasoningFields: custom/local endpoints get nothing', () => {
  assert.deepEqual(reasoningFields('http://localhost:11434/v1', 'medium'), {});
});

test('reasoningFields: a falsy effort gets nothing, regardless of provider', () => {
  assert.deepEqual(reasoningFields('https://openrouter.ai/api/v1', undefined), {});
  assert.deepEqual(reasoningFields('https://openrouter.ai/api/v1', ''), {});
  assert.deepEqual(reasoningFields('https://generativelanguage.googleapis.com/v1beta/openai', null), {});
});

// --- providerFromUrl ---------------------------------------------------------

test('providerFromUrl: recognizes openrouter', () => {
  assert.equal(providerFromUrl('https://openrouter.ai/api/v1'), 'openrouter');
});

test('providerFromUrl: recognizes gemini', () => {
  assert.equal(providerFromUrl('https://generativelanguage.googleapis.com/v1beta/openai'), 'gemini');
});

test('providerFromUrl: falls back to custom for anything else', () => {
  assert.equal(providerFromUrl('http://localhost:11434/v1'), 'custom');
  assert.equal(providerFromUrl(''), 'custom');
});

// --- reasoningFields: explicit opt-in -----------------------------------------

test('reasoningFields: explicit sends the OpenAI-standard field to custom endpoints', () => {
  assert.deepEqual(
    reasoningFields('http://localhost:11434/v1', 'none', { explicit: true }),
    { reasoning_effort: 'none' }
  );
});

test('reasoningFields: explicit leaves openrouter and gemini on their own shapes', () => {
  assert.deepEqual(
    reasoningFields('https://openrouter.ai/api/v1', 'none', { explicit: true }),
    { reasoning: { effort: 'none' } }
  );
  assert.deepEqual(
    reasoningFields('https://generativelanguage.googleapis.com/v1beta/openai', 'low', { explicit: true }),
    { reasoning_effort: 'low' }
  );
});

test('reasoningFields: explicit with a falsy effort still gives nothing', () => {
  assert.deepEqual(reasoningFields('http://localhost:11434/v1', '', { explicit: true }), {});
  assert.deepEqual(reasoningFields('http://localhost:11434/v1', null, { explicit: true }), {});
  assert.deepEqual(reasoningFields('http://localhost:11434/v1', undefined, { explicit: true }), {});
});

// --- chatCompletion: reasoning config and timeout -----------------------------

const MESSAGES = [{ role: 'user', content: 'hi' }];
const COMPLETION = { choices: [{ message: { content: '- hi' } }] };

// Runs `fn` with globalThis.fetch replaced by `stub`, restoring it afterwards.
async function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function okFetch(seen) {
  return async (url, init) => {
    seen.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(COMPLETION), { status: 200 });
  };
}

test('chatCompletion: config.reasoningEffort overrides the caller and reaches a custom endpoint', async () => {
  const seen = [];
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma', reasoningEffort: 'none' };
  const text = await withFetch(okFetch(seen), () => chatCompletion(config, MESSAGES, { effort: 'low' }));
  assert.equal(text, '- hi');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].body.reasoning_effort, 'none');
});

test('chatCompletion: without config.reasoningEffort a custom endpoint gets no reasoning field', async () => {
  const seen = [];
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma' };
  await withFetch(okFetch(seen), () => chatCompletion(config, MESSAGES, { effort: 'low' }));
  assert.equal(seen.length, 1);
  assert.deepEqual(
    Object.keys(seen[0].body).sort(),
    ['max_tokens', 'messages', 'model', 'temperature']
  );
});

test('chatCompletion: a slow model gets an honest timeout message, not "could not reach"', async () => {
  // Never answers; rejects with the signal's reason once the timeout fires,
  // which is what real fetch does.
  const hangs = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma' };
  await withFetch(hangs, async () => {
    await assert.rejects(
      chatCompletion(config, MESSAGES, { timeoutMs: 50 }),
      (err) => {
        assert.match(err.message, /took longer than 0 seconds/);
        assert.doesNotMatch(err.message, /Could not reach/);
        return true;
      }
    );
  });
});

test('chatCompletion: other fetch failures still say the endpoint could not be reached', async () => {
  const refuses = async () => { throw new TypeError('fetch failed'); };
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma' };
  await withFetch(refuses, async () => {
    await assert.rejects(chatCompletion(config, MESSAGES), /Could not reach http:\/\/llm\.local\/v1/);
  });
});

test('chatCompletion: a timeout while reading the response body is reported the same way', async () => {
  const slowBody = async (url, init) => {
    const res = new Response(JSON.stringify(COMPLETION), { status: 200 });
    res.json = () => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    return res;
  };
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma' };
  await withFetch(slowBody, async () => {
    await assert.rejects(chatCompletion(config, MESSAGES, { timeoutMs: 50 }), /took longer than 0 seconds/);
  });
});

test('chatCompletion: the success path works with the timeout signal attached', async () => {
  const seen = [];
  const config = { baseUrl: 'http://llm.local/v1', model: 'gemma' };
  const text = await withFetch(okFetch(seen), () => chatCompletion(config, MESSAGES));
  assert.equal(text, '- hi');
  assert.ok(seen[0].init.signal instanceof AbortSignal);
});
