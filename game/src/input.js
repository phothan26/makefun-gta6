// Keyboard and mouse, read once a frame. Keys are held in a set; actions are
// edge-triggered (pressed this frame) and cleared after the game reads them.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PUNCH = 4;
export const ACTION_ENTER = 8;
export const ACTION_RADIO = 16;
export const ACTION_MUTE = 32;
export const ACTION_JOB = 64;

const KEYMAP = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  f: ACTION_PUNCH,
  F: ACTION_PUNCH,
  e: ACTION_ENTER,
  E: ACTION_ENTER,
  r: ACTION_RADIO,
  R: ACTION_RADIO,
  m: ACTION_MUTE,
  M: ACTION_MUTE,
  j: ACTION_JOB,
  J: ACTION_JOB,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = { x: 0, y: 0, clicked: false };

  function keyDown(event) {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    keys.add(event.key);
    const action = KEYMAP[event.key];
    if (action) actions |= action;
  }

  function keyUp(event) {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    keys.delete(event.key);
  }

  function click(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top, clicked: true };
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousedown', click);

  function held(...names) {
    return names.some((n) => keys.has(n));
  }

  return {
    /** Movement for this frame, in screen-relative directions. */
    direction() {
      return {
        up: held('w', 'W', 'ArrowUp'),
        down: held('s', 'S', 'ArrowDown'),
        left: held('a', 'A', 'ArrowLeft'),
        right: held('d', 'D', 'ArrowRight'),
        handbrake: held(' '),
        run: held('Shift'),
      };
    },
    /** Edge-triggered actions since the last read; reading clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Mouse clicks since the last read; reading clears them. */
    takeClick() {
      const taken = mouse;
      mouse = { x: 0, y: 0, clicked: false };
      return taken;
    },
    /** True while the named key is held (for menu navigation). */
    isDown(name) {
      return keys.has(name);
    },
  };
}
