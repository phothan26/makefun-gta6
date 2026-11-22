// NEON RAIN — Midnight Courier: seeded randomness.
// Every random choice in the game comes from here, so the same seed always
// builds the same city and plays the same night. No Math.random, no clock.
export function makeRng(seed) {
  const rng = {
    s: seed >>> 0,
    next() {
      let a = this.s | 0;
      a = (a + 0x6d2b79f5) | 0;
      this.s = a;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(a, b) {
      return a + Math.floor(this.next() * (b - a + 1));
    },
    range(a, b) {
      return a + this.next() * (b - a);
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    chance(p) {
      return this.next() < p;
    },
  };
  return rng;
}

// Deterministic pseudo-random value in [0,1) from two integers. Used for
// per-tick effects (rain streaks, flicker) that must not consume RNG state,
// so a saved game resumes exactly where it left off.
export function hash01(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
