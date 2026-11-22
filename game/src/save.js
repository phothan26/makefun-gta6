// Save / load through localStorage. Guarded everywhere: in Node, in a
// fresh profile, or with storage disabled, every call is a safe no-op.
const KEY = 'vice-harbor-save-v1';

export function loadSave() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function writeSave(game) {
  try {
    if (typeof localStorage === 'undefined') return;
    const data = {
      money: game.money,
      jobsDone: game.jobsDone,
      jobIndex: game.jobIndex,
      cratesGot: game.cratesGot,
      dayT: game.dayT,
      time: game.time,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // Storage full or blocked: the game keeps running without a save.
  }
}

export function clearSave() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(KEY);
  } catch (e) {
    // ignore
  }
}
