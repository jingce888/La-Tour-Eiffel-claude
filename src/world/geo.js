// Geography helpers in the tower frame (metres; +z → bearing 134.2°, the
// Champ de Mars; −z → the Trocadéro; y up, 0 = Champ de Mars ground level).
export const LAT0 = 48.8582607, LON0 = 2.2944985;
const MLAT = 111132.0;
const MLON = 111320.0 * Math.cos(LAT0 * Math.PI / 180);
const PHI = -45.8 * Math.PI / 180;
const CP = Math.cos(PHI), SP = Math.sin(PHI);

export function proj(lat, lon) {
  const x = (lon - LON0) * MLON, z = (LAT0 - lat) * MLAT;
  return [x * CP + z * SP, -x * SP + z * CP];
}

export const RIVER_Y = -5.8;   // Seine water level relative to the Champ de Mars (≈ 27.7 m vs 33.5 m ASL)
export const R_DETAIL = 2600;  // real OSM footprints inside, procedural city outside

// Broad hills visible on the horizon (all outside the detailed zone)
export const HILLS = [
  { x: 4747, z: 348, h: 96, r: 520 },      // Montmartre (Sacré-Cœur ≈ 130 m ASL)
  { x: 6100, z: 3400, h: 70, r: 1300 },    // Belleville / Ménilmontant
  { x: -3202, z: -5212, h: 110, r: 1100 }, // Mont Valérien
  { x: -5800, z: -1500, h: 90, r: 2300 },  // Saint-Cloud heights
  { x: -6500, z: 1800, h: 110, r: 2600 },  // Meudon
];

/** Terrain height at (x,z); flat inside the detailed zone. */
export function terrainHeight(x, z) {
  let h = 0;
  for (const k of HILLS) {
    const dx = x - k.x, dz = z - k.z;
    h += k.h * Math.exp(-(dx * dx + dz * dz) / (2 * k.r * k.r));
  }
  // fade to flat near the tower so the detailed city stays on the level ground
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - 2300) / 1400));
  return h * t * t * (3 - 2 * t);
}

export const LANDMARKS = [
  { id: 'chaillot', cn: '夏乐宫 · 特罗卡德罗', fr: 'Palais de Chaillot', pos: [8, 34, -640], short: '夏乐宫', big: true },
  { id: 'etoile', cn: '凯旋门', fr: 'Arc de Triomphe', pos: [1261, 52, -1172], short: '凯旋门', big: true },
  { id: 'invalides', cn: '荣军院金顶', fr: 'Dôme des Invalides', pos: [704, 108, 1163], short: '荣军院', big: true },
  { id: 'ecole', cn: '军事学校', fr: 'École Militaire', pos: [0, 28, 1030], short: '军事学校' },
  { id: 'montparnasse', cn: '蒙帕纳斯大楼', fr: 'Tour Montparnasse', pos: [112, 212, 2693], short: '蒙帕纳斯', big: true },
  { id: 'unesco', cn: '联合国教科文组织总部', fr: 'UNESCO', pos: [-429, 26, 1658], short: 'UNESCO' },
  { id: 'grandpalais', cn: '大皇宫', fr: 'Grand Palais', pos: [1558, 48, 338], short: '大皇宫' },
  { id: 'concorde', cn: '协和广场', fr: 'Place de la Concorde', pos: [1953, 24, 833], short: '协和广场' },
  { id: 'orsay', cn: '奥赛博物馆', fr: 'Musée d’Orsay', pos: [1778, 30, 1551], short: '奥赛' },
  { id: 'louvre', cn: '卢浮宫', fr: 'Musée du Louvre', pos: [2312, 30, 1912], short: '卢浮宫', big: true },
  { id: 'opera', cn: '巴黎歌剧院', fr: 'Opéra Garnier', pos: [2987, 72, 909], short: '歌剧院' },
  { id: 'sacrecoeur', cn: '圣心大教堂 · 蒙马特', fr: 'Sacré-Cœur', pos: [4748, 182, 348], short: '圣心堂', big: true },
  { id: 'notredame', cn: '巴黎圣母院', fr: 'Notre-Dame de Paris', pos: [2407, 72, 3319], short: '圣母院', big: true },
  { id: 'pantheon', cn: '先贤祠', fr: 'Panthéon', pos: [1692, 84, 3659], short: '先贤祠' },
  { id: 'defense', cn: '拉德芳斯 · 新凯旋门', fr: 'La Défense · Grande Arche', pos: [-278, 112, -5737], short: '拉德芳斯', big: true },
  { id: 'radio', cn: '法国广播之家', fr: 'Maison de la Radio', pos: [-1285, 70, -400], short: '广播之家' },
  { id: 'boulogne', cn: '布洛涅森林', fr: 'Bois de Boulogne', pos: [-2025, 20, -2679], short: '布洛涅森林' },
  { id: 'iena', cn: '耶拿桥 · 塞纳河', fr: 'Pont d’Iéna · la Seine', pos: [42, 4, -234], short: '塞纳河' },
  { id: 'birhakeim', cn: '比尔-哈凯姆桥', fr: 'Pont de Bir-Hakeim', pos: [-582, 10, -159], short: '比尔哈凯姆桥' },
  { id: 'liberte', cn: '自由女神像（天鹅岛）', fr: 'Statue de la Liberté', pos: [-1414, 12, -137], short: '自由女神' },
  { id: 'champ', cn: '战神广场', fr: 'Champ de Mars', pos: [0, 4, 520], short: '战神广场' },
  { id: 'alex3', cn: '亚历山大三世桥', fr: 'Pont Alexandre III', pos: [1425, 8, 566], short: '亚历山大三世桥' },
];
