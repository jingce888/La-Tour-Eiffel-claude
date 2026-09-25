// Decoder for data/paris.bin (see tools/osm_build.py for the format).
// Map data © OpenStreetMap contributors (ODbL 1.0).
import DATA from '../../data/paris.bin';

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unsupported');
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

class Reader {
  constructor(b) { this.b = b; this.p = 0; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  var() {
    let v = 0, s = 0, c;
    do { c = this.b[this.p++]; v += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80);
    return v;
  }
  svar() { const v = this.var(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  ring(st, q) {
    const n = this.var();
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      st[0] += this.svar(); st[1] += this.svar();
      pts[i * 2] = st[0] * q; pts[i * 2 + 1] = st[1] * q;
    }
    return pts;
  }
}

const Q = 0.5;

function readBuildings(r) {
  const n = r.u32(), st = [0, 0], out = new Array(n);
  for (let i = 0; i < n; i++) {
    const h = r.u16() / 4;
    const minh = r.u8() / 2;
    const sr = r.u8();
    const seed = r.u8();
    const nh = r.var();
    const outer = r.ring(st, Q);
    const holes = [];
    for (let k = 0; k < nh; k++) holes.push(r.ring(st, Q));
    out[i] = { h, minh, style: sr & 15, roof: sr >> 4, seed, outer, holes };
  }
  return out;
}
function readAreas(r) {
  const n = r.u32(), st = [0, 0], out = new Array(n);
  for (let i = 0; i < n; i++) {
    const cls = r.u8();
    const nh = r.var();
    const outer = r.ring(st, Q);
    const holes = [];
    for (let k = 0; k < nh; k++) holes.push(r.ring(st, Q));
    out[i] = { cls, outer, holes };
  }
  return out;
}
function readLines(r) {
  const n = r.u32(), st = [0, 0], out = new Array(n);
  for (let i = 0; i < n; i++) {
    const cls = r.u8(), width = r.u8() / 4, flags = r.u8();
    out[i] = { cls, width, flags, pts: r.ring(st, Q) };
  }
  return out;
}
function readPoints(r) {
  const n = r.u32(), pts = new Float32Array(n * 2);
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) { x += r.svar(); z += r.svar(); pts[i * 2] = x; pts[i * 2 + 1] = z; }
  return pts;
}

export async function loadParis() {
  const bytes = await inflate(b64ToBytes(DATA));
  const r = new Reader(bytes);
  const magic = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (magic !== 'EIF2') throw new Error('bad map data');
  const count = r.u32();
  const sec = {};
  for (let i = 0; i < count; i++) {
    const id = r.u32(), len = r.u32();
    sec[id] = new Reader(bytes.subarray(r.p, r.p + len));
    r.p += len;
  }
  return {
    buildings: readBuildings(sec[1]),
    tall: readBuildings(sec[2]),
    water: readAreas(sec[3]),
    green: readAreas(sec[4]),
    roads: readLines(sec[5]),
    roadsFar: readLines(sec[6]),
    rail: readLines(sec[7]),
    trees: readPoints(sec[8]),
    bridges: readAreas(sec[9]),
  };
}
