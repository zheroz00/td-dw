import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHybridMessages } from '../background/providers/prompts.js';
import { pickProvider } from '../background/providers/index.js';

const partial = {
  service: 'Netflix',
  title: 'Some Show',
  episodeInfo: 'S2:E4 The One',
  currentTimeSeconds: 1500,
  durationSeconds: 2700,
  transcript: { text: '[12:30] hello\n[24:59] there', partial: true, coverageStartSeconds: 750, truncated: false }
};

test('buildHybridMessages states the covered window and puts the subtitles in the user turn', () => {
  const [system, user] = buildHybridMessages(partial, { summaryLength: 'medium' });
  assert.match(system.content, /covering ONLY 12:30 to 25:00/);
  assert.match(system.content, /before 12:30 from your own knowledge/);
  assert.match(system.content, /NO_KNOWLEDGE/);
  assert.doesNotMatch(system.content, /evenly sampled/);
  assert.match(user.content, /12:30 to 25:00/);
  assert.ok(user.content.includes('[24:59] there'));
});

test('buildHybridMessages mentions sampling only when truncated', () => {
  const state = { ...partial, transcript: { ...partial.transcript, truncated: true } };
  const [system] = buildHybridMessages(state, {});
  assert.match(system.content, /evenly sampled/);
});

test('pickProvider routes partial transcripts to hybrid, full ones to transcript, none to knowledge', () => {
  const auto = { recapProvider: 'auto' };
  assert.equal(pickProvider(partial, auto).name, 'hybrid');
  const full = { ...partial, transcript: { text: 'x', partial: false } };
  assert.equal(pickProvider(full, auto).name, 'transcript');
  assert.equal(pickProvider({ ...partial, transcript: null }, auto).name, 'knowledge');
});

test('pickProvider honours forced sources, except a partial transcript can only be hybrid', () => {
  assert.equal(pickProvider(partial, { recapProvider: 'knowledge' }).name, 'knowledge');
  assert.equal(pickProvider(partial, { recapProvider: 'transcript' }).name, 'hybrid');
  const full = { ...partial, transcript: { text: 'x' } };
  assert.equal(pickProvider(full, { recapProvider: 'transcript' }).name, 'transcript');
  assert.equal(pickProvider({ ...partial, transcript: null }, { recapProvider: 'transcript' }).name, 'transcript');
});

test('buildTranscriptMessages describes a partial transcript as a window, not the start', async () => {
  const { buildTranscriptMessages } = await import('../background/providers/prompts.js');
  const [system, user] = buildTranscriptMessages(partial, { summaryLength: 'medium' });
  assert.match(system.content, /shown on screen from 12:30 to 25:00; nothing before 12:30 was captured/);
  assert.match(system.content, /guess at what happened before 12:30/);
  assert.doesNotMatch(system.content, /from the start up to/);
  assert.match(user.content, /from 12:30 to 25:00/);

  const full = { ...partial, transcript: { text: 'x', partial: false } };
  const [fullSystem] = buildTranscriptMessages(full, {});
  assert.match(fullSystem.content, /from the start up to 25:00/);
});

// --- hybrid fallback (fetch stubbed: one canned reply per LLM call) ----------

const config = { baseUrl: 'http://localhost:11434/v1', model: 'test', summaryLength: 'medium' };

function stubReplies(...replies) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const content = replies.shift();
    if (content instanceof Error) throw content;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  return calls;
}

test('hybrid returns a memory recap when the model knows the title', async () => {
  const { hybridProvider } = await import('../background/providers/hybrid-provider.js');
  const calls = stubReplies('- Something happened');
  const result = await hybridProvider.getRecap(partial, config);
  assert.deepEqual(result, { ok: true, known: true, recapText: '- Something happened', source: 'hybrid' });
  assert.equal(calls.length, 1);
});

test('hybrid falls back to a captions-only recap when the model does not know the title', async () => {
  const { hybridProvider } = await import('../background/providers/hybrid-provider.js');
  const calls = stubReplies('NO_KNOWLEDGE\nI do not know this show.', '- [12:30] Someone says hello');
  const result = await hybridProvider.getRecap(partial, config);
  assert.deepEqual(result, { ok: true, known: true, recapText: '- [12:30] Someone says hello', source: 'captions' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[0].content, /nothing before 12:30 was captured/);
});

test('a failed fallback call surfaces its error', async () => {
  const { hybridProvider } = await import('../background/providers/hybrid-provider.js');
  stubReplies('NO_KNOWLEDGE', new Error('offline'));
  const result = await hybridProvider.getRecap(partial, config);
  assert.equal(result.ok, false);
  assert.match(result.error, /Could not reach/);
});
