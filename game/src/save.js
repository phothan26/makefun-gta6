// Progress between visits: unlocked jobs, cash, collected packages, best style.
// Stored in localStorage; a private window simply keeps nothing.
import { BEST_KEY, SAVE_KEY } from './config.js';

function blank() {
  return { unlockedJob: 0, cash: 0, packages: [], bestStyle: 0, muted: false, radio: 0 };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    return { ...blank(), ...parsed, packages: Array.isArray(parsed.packages) ? parsed.packages : [] };
  } catch {
    return blank();
  }
}

export function createSave() {
  const data = loadSave();
  return {
    ...data,
    write() {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify({
          unlockedJob: data.unlockedJob,
          cash: data.cash,
          packages: data.packages,
          bestStyle: data.bestStyle,
          muted: data.muted,
          radio: data.radio,
        }));
      } catch { /* storage can be off: progress lasts this visit only */ }
    },
    clear() {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      Object.assign(data, blank());
    },
  };
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch { /* ignore */ }
}
