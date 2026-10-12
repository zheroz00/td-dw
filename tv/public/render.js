// Recap text from the model, turned into plain data the page renders as text
// nodes. Mirrors the extension overlay (content/ui/overlay.js: showRecap,
// renderItem, appendRich): strip list markers, lift a leading [m:ss] into a
// chip, honour **bold** and nothing else. It never builds HTML, so model
// output can't inject markup. Shared by the page and the Node tests.

// `*` is only a bullet when it's a lone asterisk, so a line that opens with
// **bold** keeps both of its markers.
const LIST_MARKER = /^\s*(?:[-•]|\*(?!\*)|\d+[.)])\s*/;
const TIME_CHIP = /^\[(\d{1,2}(?::\d{2}){1,2})\]\s*/;

// "a **b** c" -> [{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]
export function splitBold(text) {
  return String(text ?? '')
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((run) => run.text);
}

// One entry per non-empty line: { time: '12:34' | null, runs }.
export function parseRecap(recapText) {
  return String(recapText ?? '')
    .split('\n')
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter(Boolean)
    .map((line) => {
      const chip = line.match(TIME_CHIP);
      return {
        time: chip ? chip[1] : null,
        runs: splitBold(chip ? line.slice(chip[0].length) : line)
      };
    });
}

// Seconds to "m:ss" or "h:mm:ss", the same format the prompts use.
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '?';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
