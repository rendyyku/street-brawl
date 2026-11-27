import { createEmptyInput } from './engine.js';

const P1_KEYMAP = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyJ: 'lp',
  KeyU: 'hp',
  KeyK: 'lk',
  KeyI: 'hk',
  KeyL: 'sp',
  KeyO: 'sup',
  KeyP: 'ex',
  // Alternate desktop bindings (arrows + ZXC when in 1P/online mode)
};

const P1_SINGLE_ALT = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyZ: 'lp',
  KeyX: 'hp',
  KeyC: 'lk',
  KeyV: 'hk',
  Space: 'sp',
  KeyB: 'sup',
  KeyN: 'ex',
};

const P2_KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Numpad1: 'lp',
  Numpad4: 'hp',
  Numpad2: 'lk',
  Numpad5: 'hk',
  Numpad3: 'sp',
  Numpad6: 'sup',
  Numpad9: 'ex',
};

export class InputManager {
  constructor() {
    this.p1Keys = createEmptyInput();
    this.p2Keys = createEmptyInput();
    this.touch = createEmptyInput();
    this.singlePlayerMode = true;
    this.dpadPointerId = null;
    this.dpadCenter = { x: 0, y: 0 };
    this.bindKeyboard();
  }

  setSinglePlayerMode(isSingle) {
    this.singlePlayerMode = isSingle;
  }

  bindKeyboard() {
    const update = (e, pressed) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const code = e.code;
      let handled = false;

      if (P1_KEYMAP[code]) {
        this.p1Keys[P1_KEYMAP[code]] = pressed;
        handled = true;
      }
      if (this.singlePlayerMode && P1_SINGLE_ALT[code]) {
        this.p1Keys[P1_SINGLE_ALT[code]] = pressed;
        handled = true;
      }
      if (!this.singlePlayerMode && P2_KEYMAP[code]) {
        this.p2Keys[P2_KEYMAP[code]] = pressed;
        handled = true;
      }
      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', (e) => update(e, true));
    window.addEventListener('keyup', (e) => update(e, false));
    window.addEventListener('blur', () => this.clearAll());
  }

  clearAll() {
    this.p1Keys = createEmptyInput();
    this.p2Keys = createEmptyInput();
    this.touch = createEmptyInput();
  }

  bindMobileControls(dpadEl, knobEl, buttonsContainer) {
    if (dpadEl && knobEl) {
      const maxR = 42;
      const setDirsFromDelta = (dx, dy) => {
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, maxR);
        const ang = Math.atan2(dy, dx);
        const kx = dist > 2 ? Math.cos(ang) * clamped : 0;
        const ky = dist > 2 ? Math.sin(ang) * clamped : 0;
        knobEl.style.transform = `translate(${kx}px, ${ky}px)`;

        this.touch.left = dx < -16;
        this.touch.right = dx > 16;
        this.touch.up = dy < -20;
        this.touch.down = dy > 20;
      };

      const resetDpad = () => {
        this.dpadPointerId = null;
        knobEl.style.transform = 'translate(0px, 0px)';
        this.touch.left = false;
        this.touch.right = false;
        this.touch.up = false;
        this.touch.down = false;
      };

      dpadEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dpadEl.setPointerCapture(e.pointerId);
        this.dpadPointerId = e.pointerId;
        const rect = dpadEl.getBoundingClientRect();
        this.dpadCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        setDirsFromDelta(e.clientX - this.dpadCenter.x, e.clientY - this.dpadCenter.y);
      });

      dpadEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.dpadPointerId) return;
        e.preventDefault();
        setDirsFromDelta(e.clientX - this.dpadCenter.x, e.clientY - this.dpadCenter.y);
      });

      dpadEl.addEventListener('pointerup', (e) => {
        if (e.pointerId === this.dpadPointerId) resetDpad();
      });
      dpadEl.addEventListener('pointercancel', (e) => {
        if (e.pointerId === this.dpadPointerId) resetDpad();
      });
    }

    if (buttonsContainer) {
      const btns = buttonsContainer.querySelectorAll('[data-action]');
      btns.forEach((btn) => {
        const action = btn.dataset.action;
        const press = (e) => {
          e.preventDefault();
          btn.setPointerCapture?.(e.pointerId);
          this.touch[action] = true;
          btn.classList.add('active');
          if (navigator.vibrate) navigator.vibrate(12);
        };
        const release = (e) => {
          e.preventDefault();
          this.touch[action] = false;
          btn.classList.remove('active');
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
      });
    }
  }

  getP1Input() {
    const out = createEmptyInput();
    for (const k of Object.keys(out)) {
      out[k] = Boolean(this.p1Keys[k] || this.touch[k]);
    }
    return out;
  }

  getP2Input() {
    return { ...this.p2Keys };
  }
}

export function packInput(inp) {
  let bits = 0;
  if (inp.left) bits |= 1;
  if (inp.right) bits |= 2;
  if (inp.up) bits |= 4;
  if (inp.down) bits |= 8;
  if (inp.lp) bits |= 16;
  if (inp.hp) bits |= 32;
  if (inp.lk) bits |= 64;
  if (inp.hk) bits |= 128;
  if (inp.sp) bits |= 256;
  if (inp.sup) bits |= 512;
  if (inp.ex) bits |= 1024;
  return bits;
}

export function unpackInput(bits) {
  return {
    left: Boolean(bits & 1),
    right: Boolean(bits & 2),
    up: Boolean(bits & 4),
    down: Boolean(bits & 8),
    lp: Boolean(bits & 16),
    hp: Boolean(bits & 32),
    lk: Boolean(bits & 64),
    hk: Boolean(bits & 128),
    sp: Boolean(bits & 256),
    sup: Boolean(bits & 512),
    ex: Boolean(bits & 1024),
  };
}
