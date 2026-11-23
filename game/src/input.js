// Keyboard input for MARSHLIGHT. Keys are tracked as held/released so
// the simulation gets one clean input object per tick, and "pressed"
// edges (Enter, E, M, digits) fire exactly once per key press.
export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const input = {
    up: false, down: false, left: false, right: false,
    enter: false, brake: false,
  };
  const codeToKey = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyE: 'enter',
  };
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  return {
    input,
    poll() {
      input.up = held.has('KeyW') || held.has('ArrowUp');
      input.down = held.has('KeyS') || held.has('ArrowDown');
      input.left = held.has('KeyA') || held.has('ArrowLeft');
      input.right = held.has('KeyD') || held.has('ArrowRight');
      input.enter = pressed.has('KeyE');
      input.brake = false;
      const edges = new Set(pressed);
      pressed.clear();
      return edges;
    },
  };
}
