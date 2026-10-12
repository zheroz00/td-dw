import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../../tv/lib/config.js';

const VALID = {
  JELLYFIN_URL: 'http://jellyfin.local:8096/',
  JELLYFIN_API_KEY: 'jf-key',
  TDDW_TV_KEY: 'abcdef0123456789abcdef',
  LLM_BASE_URL: 'http://llm.local:4000/v1',
  LLM_MODEL: 'gemma'
};

test('loadConfig: valid env gets defaults and a trimmed URL', () => {
  const c = loadConfig(VALID);
  assert.equal(c.port, 8795);
  assert.equal(c.pauseOnRecap, true);
  assert.equal(c.tvKey, 'abcdef0123456789abcdef');
  assert.deepEqual(c.jellyfin, { url: 'http://jellyfin.local:8096', apiKey: 'jf-key', device: null, subtitleLang: 'en' });
  assert.deepEqual(c.llm, {
    baseUrl: 'http://llm.local:4000/v1',
    apiKey: '',
    model: 'gemma',
    summaryLength: 'medium',
    recapProvider: 'auto',
    spoilerFreeAnswers: true,
    transcriptBudget: 'standard'
  });
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.llm) && Object.isFrozen(c.jellyfin));
});

test('loadConfig: optional values are honoured', () => {
  const c = loadConfig({
    ...VALID,
    PORT: '9001',
    PAUSE_ON_RECAP: 'false',
    JELLYFIN_DEVICE: 'SHIELD',
    SUBTITLE_LANG: 'fr',
    SUMMARY_LENGTH: 'short',
    TRANSCRIPT_BUDGET: 'local',
    SPOILER_FREE_ANSWERS: 'no',
    LLM_API_KEY: 'sk-test'
  });
  assert.equal(c.port, 9001);
  assert.equal(c.pauseOnRecap, false);
  assert.equal(c.jellyfin.device, 'SHIELD');
  assert.equal(c.jellyfin.subtitleLang, 'fr');
  assert.equal(c.llm.summaryLength, 'short');
  assert.equal(c.llm.transcriptBudget, 'local');
  assert.equal(c.llm.spoilerFreeAnswers, false);
  assert.equal(c.llm.apiKey, 'sk-test');
});

test('loadConfig: a Jellyfin URL with a sub-path keeps the path', () => {
  assert.equal(loadConfig({ ...VALID, JELLYFIN_URL: 'https://example.com/jellyfin/' }).jellyfin.url, 'https://example.com/jellyfin');
});

test('loadConfig: every missing required var is reported at once', () => {
  assert.throws(() => loadConfig({}), (err) => {
    assert.ok(err instanceof ConfigError);
    for (const name of ['JELLYFIN_URL', 'JELLYFIN_API_KEY', 'TDDW_TV_KEY', 'LLM_BASE_URL', 'LLM_MODEL']) {
      assert.ok(err.problems.some((p) => p.startsWith(name)), `expected a problem for ${name}`);
    }
    return true;
  });
});

test('loadConfig: rejects a short or URL-unsafe TV key without echoing it', () => {
  for (const bad of ['short', 'has spaces in it 1234', 'plus+and&hash#chars1234']) {
    assert.throws(() => loadConfig({ ...VALID, TDDW_TV_KEY: bad }), (err) => {
      assert.ok(err.problems.some((p) => p.startsWith('TDDW_TV_KEY')));
      assert.ok(!err.message.includes(bad), 'the key must not appear in the error');
      return true;
    });
  }
});

test('loadConfig: rejects bad URLs, flags, choices and ports', () => {
  assert.throws(() => loadConfig({ ...VALID, JELLYFIN_URL: 'jellyfin.local' }), /JELLYFIN_URL must be an http/);
  assert.throws(() => loadConfig({ ...VALID, LLM_BASE_URL: 'ftp://llm.local' }), /LLM_BASE_URL must be an http/);
  assert.throws(() => loadConfig({ ...VALID, PAUSE_ON_RECAP: 'maybe' }), /PAUSE_ON_RECAP must be true or false/);
  assert.throws(() => loadConfig({ ...VALID, SUMMARY_LENGTH: 'huge' }), /SUMMARY_LENGTH must be one of/);
  assert.throws(() => loadConfig({ ...VALID, PORT: '99999' }), /PORT must be a whole number/);
});
