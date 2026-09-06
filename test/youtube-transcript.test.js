import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.js';

const TDDW = await loadContentScript('content/adapters/youtube-transcript.js');

test('parses srv3 <p><s> format and joins segments', () => {
  const xml = '<p t="1000" d="2000"><s>Hello </s><s>world</s></p>';
  const lines = TDDW.parseCaptionXml(xml, 60000);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[0:01] Hello world');
});

test('parses classic <text start=.. dur=..> format', () => {
  const xml = '<text start="1.5" dur="2">Hello there</text>';
  const lines = TDDW.parseCaptionXml(xml, 60000);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[0:01] Hello there');
});

test('entity decoding order: &amp;lt; stays &lt; (not decoded all the way to <)', () => {
  const xml = '<p t="0"><s>&amp;lt;tag&amp;gt;</s></p>';
  const lines = TDDW.parseCaptionXml(xml, 60000);
  assert.equal(lines[0], '[0:00] &lt;tag&gt;');
});

test('entity decoding also applies on the classic format', () => {
  const xml = '<text start="0" dur="1">&amp;lt;there&amp;gt;</text>';
  const lines = TDDW.parseCaptionXml(xml, 60000);
  assert.equal(lines[0], '[0:00] &lt;there&gt;');
});

test('cutoff filtering: srv3 cues after the cutoff are dropped', () => {
  const xml = '<p t="1000"><s>Kept</s></p><p t="5000"><s>Dropped</s></p>';
  const lines = TDDW.parseCaptionXml(xml, 3000);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[0:01] Kept');
});

test('cutoff filtering: classic cues after the cutoff are dropped', () => {
  const xml = '<text start="1.5" dur="2">Kept</text><text start="10" dur="2">Dropped</text>';
  const lines = TDDW.parseCaptionXml(xml, 5000);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[0:01] Kept');
});

test('pickCaptionTrack prefers a human track over asr in the same language', () => {
  globalThis.navigator.language = 'en-US';
  const human = { languageCode: 'en', kind: '', baseUrl: 'human' };
  const asr = { languageCode: 'en', kind: 'asr', baseUrl: 'asr' };
  const picked = TDDW.pickCaptionTrack([asr, human]);
  assert.equal(picked.baseUrl, 'human');
});

test('pickCaptionTrack prefers the UI language over English', () => {
  globalThis.navigator.language = 'es-ES';
  const en = { languageCode: 'en', kind: 'asr', baseUrl: 'en' };
  const es = { languageCode: 'es', kind: 'asr', baseUrl: 'es' };
  const picked = TDDW.pickCaptionTrack([en, es]);
  assert.equal(picked.baseUrl, 'es');
  globalThis.navigator.language = 'en-US'; // reset for any later tests
});
