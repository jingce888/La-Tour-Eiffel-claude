// Paris around the tower: real geography (OpenStreetMap) + procedural detail.
import { loadParis } from './parisData.js';
import { buildGround } from './ground.js';
import { buildWater } from './water.js';
import { buildNearBuildings, buildFarCity } from './buildings.js';
import { buildTrees } from './trees.js';
import { buildLandmarkModels, LandmarkGuide } from './landmarks.js';
import { terrainHeight } from './geo.js';

export async function buildWorld({ scene, collision, progress, nextFrame, groundHoles = [] }) {
  progress(0.02, '解压巴黎地图数据…');
  await nextFrame();
  const data = await loadParis();
  collision.terrain = (x, z) => (Math.hypot(x, z) < 2400 ? 0 : terrainHeight(x, z));

  progress(0.12, `绘制地表：塞纳河、公园与 ${data.roads.length.toLocaleString()} 条街道`);
  await nextFrame();
  const ground = buildGround({ scene, data, holes: groundHoles });
  const water = buildWater({ scene, data, riverRings: ground.riverRings, collision });

  progress(0.35, `建造街区：${(data.buildings.length + data.tall.length).toLocaleString()} 栋真实建筑`);
  await nextFrame();
  const near = buildNearBuildings({ scene, data, collision });

  progress(0.6, '铺展远景城市…');
  await nextFrame();
  const far = buildFarCity({ scene, data });

  progress(0.72, `种植行道树：${(data.trees.length / 2).toLocaleString()} 棵`);
  await nextFrame();
  const trees = buildTrees({ scene, data, collision });

  progress(0.9, '荣军院金顶、凯旋门、圣心堂…');
  await nextFrame();
  buildLandmarkModels(scene);
  const landmarks = new LandmarkGuide(document.getElementById('labels'));

  const buildingMats = [near.mat, far.mat];
  return {
    landmarks,
    stats: `建筑 ${near.count.toLocaleString()} + ${far.count.toLocaleString()} 栋 · 树木 ${trees.count.toLocaleString()} 棵`,
    info: { buildings: near.count, far: far.count, trees: trees.count, bldTris: near.tris },
    update(dt, camera) {
      water.update(dt);
      trees.update(camera);
      near.update(camera);
    },
    setTime(name) {
      const n = name === 'night' ? 1 : 0;
      for (const m of buildingMats) m.userData.uniforms.uNight.value = n;
      ground.mat.userData.uniforms.uNight.value = n;
    },
  };
}
