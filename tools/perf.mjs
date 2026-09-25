// Draw-call / triangle breakdown by object category for a few viewpoints.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const q = process.argv[2] || '';
await page.goto('file://' + new URL('../index.html', import.meta.url).pathname + '?shot&frames=1&' + q);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 240000 });
const views = { champ: [0, 1.7, 262, 0, 0.22], base: [22, 0, 27, -2.3, 0.3], top: [0, 279.7, 7.3, Math.PI, -0.2], l2: [3, 115.73, 17.4, Math.PI, -0.1] };
for (const [name, c] of Object.entries(views)) {
  const r = await page.evaluate(([c]) => {
    const g = window.__game, THREE = null;
    g.player.teleport(c[0], c[1], c[2], c[3], c[4]);
    g.frame();
    const info = g.renderer.info.render;
    const total = { calls: info.calls, tris: info.triangles };
    // shadow-less main pass
    const sun = g.atmo.sun; sun.castShadow = false;
    g.frame();
    const main = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    sun.castShadow = true;
    // categories: count visible meshes in frustum
    const cam = g.camera;
    cam.updateMatrixWorld();
    const fr = new cam.projectionMatrix.constructor();
    const cats = {};
    const frustum = new (Object.getPrototypeOf(g.player.pos).constructor === undefined ? Object : Object)();
    g.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const key = (m && m.name) || ((o.isInstancedMesh ? 'I:' : '') + (o.geometry && o.geometry.type) + ':' + (m && m.type) + (m && m.userData && m.userData.uniforms ? '*' : ''));
      cats[key] = (cats[key] || 0) + 1;
    });
    return { total, main, cats };
  }, [c]);
  console.log(name.padEnd(6), 'with shadows', JSON.stringify(r.total), ' main only', JSON.stringify(r.main));
  console.log('       visible objects by material:', JSON.stringify(Object.entries(r.cats).sort((a, b) => b[1] - a[1]).slice(0, 12)));
}
await browser.close();
