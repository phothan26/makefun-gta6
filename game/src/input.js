// Input: keyboard state for the browser, and a programmatic input the
// bot drives. Both produce the same shape:
// { up, down, left, right, enter, ghost, action } where action is a
// one-frame edge trigger consumed by the simulation.
export function makeInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    enter: false, // edge: pressed this frame (enter / exit a vehicle)
    enterKind: null, // 'car' | 'boat' | null: when set, E boards only this kind
    ghost: false, // edge: pressed this frame (toggle Ghost Mode)
    radio: -1, // edge: 0/1/2 to switch station, -1 = none
    mute: false, // edge: mute toggle
  };
}

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function attachKeyboard(input, target) {
  if (typeof window === 'undefined' || !target) return () => {};
  const down = (e) => {
    if (KEYMAP[e.code]) {
      input[KEYMAP[e.code]] = true;
      e.preventDefault();
    } else if (e.code === 'KeyE' || e.code === 'Enter') {
      input.enter = true;
    } else if (e.code === 'KeyG') {
      input.ghost = true;
    } else if (e.code === 'Digit1') {
      input.radio = 0;
    } else if (e.code === 'Digit2') {
      input.radio = 1;
    } else if (e.code === 'Digit3') {
      input.radio = 2;
    } else if (e.code === 'KeyM') {
      input.mute = true;
    }
  };
  const up = (e) => {
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
  };
}

// Clear the one-frame edge triggers after the simulation consumed them.
export function clearEdges(input) {
  input.enter = false;
  input.enterKind = null;
  input.ghost = false;
  input.radio = -1;
  input.mute = false;
}
