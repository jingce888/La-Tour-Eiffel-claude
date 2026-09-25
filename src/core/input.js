// Keyboard / mouse (pointer lock) / touch input.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered this frame
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 }; // touch joystick
    this.touchRun = false;
    this.locked = false;
    this.zoomHeld = false;
    this.sensitivity = 1;
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && this.enabled) e.preventDefault();
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.zoomHeld = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange && this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 2 && this.locked) this.zoomHeld = true;
      if (e.button === 0 && this.locked) this.pressed.add('Click');
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.zoomHeld = false; });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.dom.addEventListener('wheel', (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const r = this.dom.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { this.dom.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { this.dom.requestPointerLock(); } catch (e2) { /* ignore */ }
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return l;
  }
  endFrame() { this.pressed.clear(); this.wheel = 0; }

  /** Movement axes in [-1,1] from keyboard or joystick. */
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    x += this.move.x; y += this.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  running() { return this.down('ShiftLeft') || this.down('ShiftRight') || this.touchRun; }

  /** Touch controls: virtual stick (left), drag-look (right), buttons via data-act. */
  attachTouch(root) {
    if (!this.isTouch) return;
    root.classList.add('touch');
    const stick = root.querySelector('#stick'), knob = root.querySelector('#stick .knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 56;
    root.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) { this.pressed.add(btn.dataset.act); if (btn.dataset.act === 'Zoom') this.zoomHeld = true; if (btn.dataset.act === 'Run') this.touchRun = !this.touchRun; continue; }
        if (t.clientX < innerWidth * 0.42 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = sx - 70 + 'px'; stick.style.top = sy - 70 + 'px'; stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / R; this.move.y = -dy / R;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lx) * 2.2; this.look.y += (t.clientY - ly) * 2.2;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
        if (t.identifier === lookId) lookId = null;
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn && btn.dataset.act === 'Zoom') this.zoomHeld = false;
      }
    };
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', end, { passive: true });
  }
}
