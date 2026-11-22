// Progress between visits: jobs finished, cash, packages found, best score.
// Storage can be off (private windows): then progress lasts this visit only.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      jobsDone: Math.max(0, Math.min(5, data.jobsDone | 0)),
      cash: Math.max(0, data.cash | 0),
      packages: Array.isArray(data.packages) ? data.packages.filter((n) => typeof n === 'number') : [],
      best: Math.max(0, data.best | 0),
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      jobsDone: data.jobsDone | 0,
      cash: data.cash | 0,
      packages: data.packages,
      best: data.best | 0,
    }));
  } catch {
    // Storage off: nothing to do.
  }
}
