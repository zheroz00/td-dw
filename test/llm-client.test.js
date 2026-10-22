import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasoningFields, chatCompletion, chatCompletionDetailed } from '../background/llm-client.js';
import { providerFromUrl, endpointLabel } from '../background/config.js';

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

// --- endpointLabel -----------------------------------------------------------

test('endpointLabel: presets by name, custom endpoints by host', () => {
  assert.equal(endpointLabel('https://openrouter.ai/api/v1'), 'OpenRouter');
  assert.equal(endpointLabel('https://generativelanguage.googleapis.com/v1beta/openai'), 'Gemini');
  assert.equal(endpointLabel('https://api.mistral.ai/v1'), 'api.mistral.ai');
  assert.equal(endpointLabel('http://localhost:11434/v1'), 'localhost:11434');
  assert.equal(endpointLabel('not a url'), 'Custom endpoint');
});

// --- chatCompletionDetailed --------------------------------------------------

function replyWith(body) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
}
const routerConfig = { baseUrl: 'http://localhost:11434/v1', model: 'openrouter/free' };

test('chatCompletionDetailed reports the model that actually answered', async () => {
  replyWith({ model: 'poolside/laguna-s-2.1:free', choices: [{ message: { content: 'hi' } }] });
  assert.deepEqual(await chatCompletionDetailed(routerConfig, []), { text: 'hi', model: 'poolside/laguna-s-2.1:free' });
});

test('chatCompletionDetailed falls back to the requested model when the reply omits it', async () => {
  replyWith({ choices: [{ message: { content: 'hi' } }] });
  assert.deepEqual(await chatCompletionDetailed(routerConfig, []), { text: 'hi', model: 'openrouter/free' });
});

test('chatCompletion still returns just the text', async () => {
  replyWith({ model: 'x', choices: [{ message: { content: 'hi' } }] });
  assert.equal(await chatCompletion(routerConfig, []), 'hi');
});
