// Procedural sound (WebAudio): no audio files.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lift = { speed: 0, dist: 0 };
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // shared noise buffers
    const len = ctx.sampleRate * 3;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    }
    this.white = white; this.pink = pink;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // city murmur
    this.city = ctx.createGain(); this.city.gain.value = 0;
    const cityLP = ctx.createBiquadFilter(); cityLP.type = 'lowpass'; cityLP.frequency.value = 520;
    loop(pink).connect(cityLP).connect(this.city).connect(this.master);

    // wind (band-passed noise with slow gusts)
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 520; this.windBP.Q.value = 0.6;
    loop(white).connect(this.windBP).connect(this.wind).connect(this.master);

    // lift motor: two detuned oscillators + rumble
    this.motor = ctx.createGain(); this.motor.gain.value = 0;
    this.motorLP = ctx.createBiquadFilter(); this.motorLP.type = 'lowpass'; this.motorLP.frequency.value = 260;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 52;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'triangle'; this.osc2.frequency.value = 104;
    const o2g = ctx.createGain(); o2g.gain.value = 0.5;
    this.osc1.connect(this.motorLP); this.osc2.connect(o2g).connect(this.motorLP);
    const rumbleBP = ctx.createBiquadFilter(); rumbleBP.type = 'bandpass'; rumbleBP.frequency.value = 140; rumbleBP.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 1.4;
    loop(pink).connect(rumbleBP).connect(rg).connect(this.motorLP);
    this.motorLP.connect(this.motor).connect(this.master);
    this.osc1.start(); this.osc2.start();
    this.t = 0;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  env(node, t0, a, peak, d) {
    node.gain.cancelScheduledValues(t0);
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  burst({ freq = 1500, q = 1, dur = 0.05, gain = 0.2, type = 'bandpass', buf = 'white', delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf === 'pink' ? this.pink : this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(this.master);
    this.env(g, t, 0.004, gain, dur);
    s.start(t, Math.random() * 2, dur + 0.1);
  }

  tone(freq, dur, gain = 0.12, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this.env(g, t, 0.01, gain, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  chime() {
    // two-tone arrival chime with soft harmonics
    this.tone(784, 1.6, 0.09); this.tone(1568, 1.0, 0.025);
    this.tone(659, 2.0, 0.09, 'sine', 0.42); this.tone(1318, 1.2, 0.022, 'sine', 0.42);
  }
  doors() {
    this.burst({ freq: 900, q: 0.5, dur: 1.2, gain: 0.05, buf: 'pink' });
    this.burst({ freq: 180, q: 1.5, dur: 0.18, gain: 0.25, delay: 1.35 });
  }
  click() {
    this.burst({ freq: 2400, q: 3, dur: 0.035, gain: 0.08 });
    this.burst({ freq: 300, q: 2, dur: 0.06, gain: 0.12, delay: 0.012 });
  }
  step(surface, speed) {
    const g = 0.05 + Math.min(0.05, speed * 0.008);
    if (surface === 'deck' || surface === 'lift') {
      this.burst({ freq: 420, q: 1.2, dur: 0.07, gain: g * 1.4 });
      this.burst({ freq: 1600, q: 2, dur: 0.03, gain: g * 0.5 });
    } else if (surface === 'metal') {
      this.burst({ freq: 2200, q: 6, dur: 0.09, gain: g });
    } else {
      this.burst({ freq: 2600, q: 0.8, dur: 0.06, gain: g * 0.9 });
      this.burst({ freq: 700, q: 1, dur: 0.05, gain: g * 0.6 });
    }
  }

  /** Per-frame ambience: altitude, lift motion. */
  update(dt, { altitude, liftSpeed, liftActive, night, underTower }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.t += dt;
    const a = Math.max(0, Math.min(1, altitude / 280));
    const cityG = (0.16 * (1 - a) + 0.035) * (night ? 0.6 : 1) * (underTower ? 0.9 : 1);
    this.city.gain.setTargetAtTime(cityG, t, 0.5);
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.11 + 1.3);
    const windG = (0.012 + 0.16 * a * a) * gust * (liftActive ? 0.55 : 1);
    this.wind.gain.setTargetAtTime(windG, t, 0.4);
    this.windBP.frequency.setTargetAtTime(380 + 420 * a + 160 * gust, t, 0.6);
    // motor
    const s = Math.min(1, liftSpeed / 5);
    this.motor.gain.setTargetAtTime(liftActive ? 0.05 + 0.2 * s : 0, t, 0.25);
    this.osc1.frequency.setTargetAtTime(44 + 30 * s, t, 0.3);
    this.osc2.frequency.setTargetAtTime(88 + 60 * s, t, 0.3);
    this.motorLP.frequency.setTargetAtTime(180 + 420 * s, t, 0.3);
    // rail joints every 3 m of travel
    if (liftActive && liftSpeed > 0.2) {
      this.lift.dist += liftSpeed * dt;
      if (this.lift.dist > 3.2) { this.lift.dist = 0; this.click(); }
    }
  }
}
