// The latest recap and its follow-up thread, held in memory. One slot: this
// serves one TV, and a restart clearing it is fine. A recap asked for while
// another is running joins it instead of paying for a second LLM call (the TV
// and the phone can both ask at once).

export const MAX_HISTORY = 50; // the prompt only sends the last 10 anyway

export function createStore(runRecap) {
  let latest = null;
  let inFlight = null;

  return {
    recap() {
      if (!inFlight) {
        inFlight = (async () => {
          try {
            latest = await runRecap();
            return latest;
          } finally {
            inFlight = null;
          }
        })();
      }
      return inFlight;
    },

    async latest() {
      if (inFlight) {
        try {
          return await inFlight;
        } catch {
          // The caller that started it gets the error; readers get the previous recap.
        }
      }
      return latest;
    },

    isRunning: () => inFlight !== null,

    addTurn(id, question, answer) {
      if (!latest || latest.id !== id) return false;
      latest.history.push({ question, answer });
      if (latest.history.length > MAX_HISTORY) {
        latest.history.splice(0, latest.history.length - MAX_HISTORY);
      }
      return true;
    }
  };
}
