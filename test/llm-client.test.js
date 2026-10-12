import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasoningFields } from '../background/llm-client.js';
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
