// DOM heads-up display.
const $ = (id) => document.getElementById(id);

const CARDINALS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
const CARD_CN = { N: '北', NE: '东北', E: '东', SE: '东南', S: '南', SW: '西南', W: '西', NW: '西北' };

export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      locFr: $('loc-fr'), locCn: $('loc-cn'), locAlt: $('loc-alt'), marker: $('loc-marker'),
      prompt: $('prompt'), caption: $('caption'), capFr: $('cap-fr'), capCn: $('cap-cn'), capInfo: $('cap-info'),
      toast: $('toast'), fps: $('fps'), scope: $('scope'), cross: $('crosshair'),
      lift: $('lift'), liftName: $('lift-name'), liftAlt: $('lift-alt'), liftSpd: $('lift-spd'), liftAng: $('lift-ang'),
      liftDot: $('lift-dot'), liftStops: $('lift-stops'), liftBtns: $('lift-btns'), liftState: $('lift-state'),
      track: $('cp-track'), deg: $('cp-deg'), labels: $('labels'),
    };
    this.last = {};
    this.capTimer = null;
    this.toastTimer = null;
    this.hidden = false;
    this.liftKey = null;
    this.landmarks = [];
    this.buildCompass();
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  toggleHidden() { this.hidden = !this.hidden; this.root.classList.toggle('fade', this.hidden); }

  set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  location(fr, cn, alt) {
    this.set('fr', this.el.locFr, fr);
    this.set('cn', this.el.locCn, cn);
    this.set('alt', this.el.locAlt, alt.toFixed(1));
    const pct = Math.max(0, Math.min(1, alt / 330));
    this.set('mk', this.el.marker.style, `${(pct * 100).toFixed(1)}%`, 'bottom');
  }

  prompt(html) {
    if (this.last.prompt === html) return;
    this.last.prompt = html;
    if (!html) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }

  caption(fr, cn, info = '', ms = 5200) {
    this.el.capFr.textContent = fr;
    this.el.capCn.textContent = cn;
    this.el.capInfo.textContent = info;
    this.el.caption.classList.add('on');
    clearTimeout(this.capTimer);
    this.capTimer = setTimeout(() => this.el.caption.classList.remove('on'), ms);
  }

  toast(msg, ms = 2400) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('on'), ms);
  }

  scope(on) { this.el.scope.classList.toggle('on', on); }
  fps(text) { this.set('fps', this.el.fps, text); }

  // ------------------------------------------------------------ lift panel
  liftPanel(info) {
    if (!info) {
      if (this.liftKey !== null) { this.el.lift.classList.add('hidden'); this.liftKey = null; }
      return;
    }
    if (this.liftKey !== info.key) {
      this.liftKey = info.key;
      this.el.lift.classList.remove('hidden');
      this.el.liftName.textContent = info.name;
      this.el.liftStops.innerHTML = '';
      this.el.liftBtns.innerHTML = '';
      info.stops.forEach((s, i) => {
        const t = info.stops.length > 1 ? i / (info.stops.length - 1) : 0;
        const tick = document.createElement('i'); tick.style.left = `${t * 100}%`;
        const lab = document.createElement('span'); lab.style.left = `${t * 100}%`; lab.textContent = s.tick;
        this.el.liftStops.append(tick, lab);
        const b = document.createElement('button');
        b.innerHTML = `${s.short}<small>${s.btn}</small>`;
        b.dataset.i = i;
        b.addEventListener('click', () => info.onSelect(i));
        this.el.liftBtns.append(b);
      });
      this.last.liftCur = this.last.liftDest = null;
    }
    this.set('lalt', this.el.liftAlt, info.alt.toFixed(1));
    this.set('lspd', this.el.liftSpd, info.speed.toFixed(1));
    this.set('lang', this.el.liftAng, info.angle === null ? '—' : info.angle.toFixed(0));
    this.set('ldot', this.el.liftDot.style, `${(info.progress * 100).toFixed(2)}%`, 'left');
    this.set('lstate', this.el.liftState, info.state);
    const key = `${info.current}|${info.dest}`;
    if (this.last.liftBtnKey !== key) {
      this.last.liftBtnKey = key;
      [...this.el.liftBtns.children].forEach((b, i) => {
        b.classList.toggle('cur', i === info.current && info.dest === null);
        b.classList.toggle('dest', i === info.dest);
      });
    }
  }

  // ------------------------------------------------------------ compass
  buildCompass() {
    this.ticks = [];
    const track = this.el.track;
    for (let d = 0; d < 360; d += 15) {
      const t = document.createElement('i');
      t.className = 't' + (d % 45 === 0 ? ' maj' : '');
      track.append(t);
      this.ticks.push({ el: t, deg: d });
    }
    for (const [c, d] of CARDINALS) {
      const e = document.createElement('span');
      e.className = 'c' + (c === 'N' ? ' n' : '');
      e.textContent = CARD_CN[c];
      track.append(e);
      this.ticks.push({ el: e, deg: d });
    }
  }
  setCompassLandmarks(list) {
    for (const l of this.landmarks) l.el.remove();
    this.landmarks = list.map((l) => {
      const e = document.createElement('span');
      e.className = 'lm';
      e.textContent = l.short;
      this.el.track.append(e);
      return { el: e, lm: l };
    });
  }
  compass(heading, bearingTo) {
    const w = this.el.track.clientWidth || 560;
    const span = 150; // degrees visible
    const place = (el, deg) => {
      let d = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(d) > span / 2 + 5) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.left = `${(0.5 + d / span) * w}px`;
    };
    for (const t of this.ticks) place(t.el, t.deg);
    // landmark labels: most important first, dropping to a second row (or
    // hiding) when they would overlap a label already placed
    const rows = [[], []];
    for (const l of this.landmarks) {
      const d = ((bearingTo(l.lm) - heading + 540) % 360) - 180;
      let row = -1;
      if (Math.abs(d) <= span / 2 + 5) {
        const x = (0.5 + d / span) * w, half = l.lm.short.length * 5.2 + 4;
        row = rows.findIndex((r) => r.every(([x0, h0]) => Math.abs(x - x0) > half + h0));
        if (row >= 0) {
          rows[row].push([x, half]);
          l.el.style.left = `${x}px`;
        }
      }
      l.el.style.display = row < 0 ? 'none' : '';
      l.el.classList.toggle('r2', row === 1);
    }
    this.set('deg', this.el.deg, `${Math.round((heading + 360) % 360)}°`);
  }
}
