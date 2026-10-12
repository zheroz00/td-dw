// Settings for the TV recap service, read once from environment variables at
// startup. Every problem is collected and reported together, so a bad .env
// fails loudly before the first button press instead of halfway through one.

const SUMMARY_LENGTHS = ['short', 'medium', 'detailed'];
const TRANSCRIPT_BUDGETS = ['standard', 'local'];
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];
const DEFAULT_PORT = 8795;
// The key travels in a URL (the TV button and the phone bookmark), so it has
// to survive a query string untouched: letters, digits, '-' and '_' only.
const URL_SAFE_KEY = /^[A-Za-z0-9_-]{16,}$/;

export class ConfigError extends Error {
  constructor(problems) {
    super(`TD;DW TV can't start. Fix these settings:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export function loadConfig(env = process.env) {
  const problems = [];
  const read = (name) => (env[name] ?? '').trim();

  const required = (name) => {
    const value = read(name);
    if (!value) problems.push(`${name} is required`);
    return value;
  };

  const httpUrl = (name) => {
    const value = required(name);
    if (!value) return '';
    let ok = false;
    try {
      const { protocol } = new URL(value);
      ok = protocol === 'http:' || protocol === 'https:';
    } catch { /* reported below */ }
    if (!ok) problems.push(`${name} must be an http:// or https:// URL (got "${value}")`);
    return value.replace(/\/+$/, '');
  };

  const flag = (name, fallback) => {
    const value = read(name).toLowerCase();
    if (!value) return fallback;
    if (['true', '1', 'yes', 'on'].includes(value)) return true;
    if (['false', '0', 'no', 'off'].includes(value)) return false;
    problems.push(`${name} must be true or false (got "${env[name]}")`);
    return fallback;
  };

  const oneOf = (name, allowed, fallback) => {
    const value = read(name).toLowerCase();
    if (!value) return fallback;
    if (allowed.includes(value)) return value;
    problems.push(`${name} must be one of ${allowed.join(', ')} (got "${env[name]}")`);
    return fallback;
  };

  const portNumber = () => {
    const value = read('PORT');
    if (!value) return DEFAULT_PORT;
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
    problems.push(`PORT must be a whole number from 1 to 65535 (got "${env.PORT}")`);
    return DEFAULT_PORT;
  };

  const jellyfinUrl = httpUrl('JELLYFIN_URL');
  const jellyfinApiKey = required('JELLYFIN_API_KEY');
  const tvKey = required('TDDW_TV_KEY');
  if (tvKey && !URL_SAFE_KEY.test(tvKey)) {
    problems.push('TDDW_TV_KEY must be at least 16 letters, digits, - or _ (generate one with: openssl rand -hex 24)');
  }
  const llmBaseUrl = httpUrl('LLM_BASE_URL');
  const llmModel = required('LLM_MODEL');
  const summaryLength = oneOf('SUMMARY_LENGTH', SUMMARY_LENGTHS, 'medium');
  const transcriptBudget = oneOf('TRANSCRIPT_BUDGET', TRANSCRIPT_BUDGETS, 'standard');
  const reasoningEffort = oneOf('LLM_REASONING_EFFORT', REASONING_EFFORTS, null);
  const spoilerFreeAnswers = flag('SPOILER_FREE_ANSWERS', true);
  const pauseOnRecap = flag('PAUSE_ON_RECAP', true);
  const port = portNumber();

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    port,
    tvKey,
    pauseOnRecap,
    jellyfin: Object.freeze({
      url: jellyfinUrl,
      apiKey: jellyfinApiKey,
      device: read('JELLYFIN_DEVICE') || null,
      subtitleLang: read('SUBTITLE_LANG') || 'en'
    }),
    // Same shape as the extension's stored config (background/config.js), so
    // the extension's providers and prompts take it unchanged.
    llm: Object.freeze({
      baseUrl: llmBaseUrl,
      apiKey: read('LLM_API_KEY'),
      model: llmModel,
      summaryLength,
      recapProvider: 'auto',
      spoilerFreeAnswers,
      transcriptBudget,
      reasoningEffort
    })
  });
}
