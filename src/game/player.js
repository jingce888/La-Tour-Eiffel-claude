// First-person walker: capsule vs. the collision world, gravity, stepping,
// riding moving platforms (lift cabins) and subtle camera motion.
import * as THREE from 'three';

const EYE = 1.64;
const RADIUS = 0.3;
const STEP = 0.52;
const GRAVITY = 21;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.groundTag = null;
    this.eyeSmooth = EYE;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.lift = null;            // lift object the player stands in
    this.liftOffset = 0;          // camera inertia while riding
    this.liftOffsetV = 0;
    this.shake = 0;
    this.fovBase = 70;
    this.fov = 70;
    this.stepDist = 0;
    this.onStep = null;           // footstep callback(surface)
    this.speedFactor = 1;
  }

  teleport(x, y, z, yaw = this.yaw, pitch = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch;
    this.eyeSmooth = EYE;
  }

  look(dx, dy, sens = 1, zoomK = 1) {
    const k = 0.0021 * sens * zoomK;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.5, 1.5);
  }

  update(dt, input, platforms) {
    // ride moving platforms: apply the cabin's own displacement first
    let plat = null;
    if (this.groundTag && this.groundTag.delta && this.onGround) plat = this.groundTag;
    if (this.groundTag && this.groundTag.cabins && this.onGround) {
      const c = this.groundTag.riding(this.pos, this.pos.y + 0.1);
      if (c) { this.pos.add(c.delta); plat = this.groundTag; }
    } else if (plat) {
      this.pos.add(plat.delta);
    }
    this.lift = plat;

    const ax = input.axes();
    const run = input.running();
    const speed = (run ? 6.4 : 3.1) * this.speedFactor;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = fwd.multiplyScalar(ax.y * speed).addScaledVector(right, ax.x * speed);
    const accel = this.onGround ? 12 : 2.5;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.onGround && input.hit('Space')) { this.vel.y = 4.6; this.onGround = false; }
    this.vel.y -= GRAVITY * dt;

    // horizontal move with sub-steps (fast runs through thin fences)
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.2));
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      this.world.resolve(this.pos, RADIUS, this.pos.y + STEP * 0.9, this.pos.y + 1.78);
    }

    // vertical: ground snapping / falling
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const g = this.world.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y) + STEP);
    if (g.y > -Infinity && this.pos.y <= g.y + 0.001) {
      const stepUp = g.y - prevY;
      this.pos.y = g.y;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      this.groundTag = g.tag;
      if (stepUp > 0.05 && stepUp < STEP) this.eyeSmooth -= stepUp; // smooth stairs
    } else if (g.y > -Infinity && this.onGround && prevY - g.y < STEP && this.vel.y <= 0) {
      // walking down a step: stick to the floor
      this.pos.y = g.y;
      this.vel.y = 0;
      this.groundTag = g.tag;
    } else {
      this.onGround = false;
    }
    if (this.pos.y < -30) this.pos.y = 0;   // safety net

    // footsteps & head bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && hs > 0.4;
    this.bobAmp += ((moving ? Math.min(1, hs / 5) : 0) - this.bobAmp) * Math.min(1, dt * 6);
    if (moving) {
      this.bobPhase += hs * dt * 1.9;
      this.stepDist += hs * dt;
      const stride = run ? 1.7 : 1.35;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.onStep && this.onStep(this.groundTag, hs);
      }
    }
    this.eyeSmooth += (EYE - this.eyeSmooth) * Math.min(1, dt * 9);
  }

  /** Lift inertia: the camera dips when the cabin accelerates upwards. */
  liftFeel(dt, accelY, speed) {
    const k = 30, c = 7.5;
    const f = -k * this.liftOffset - c * this.liftOffsetV - accelY * 0.35;
    this.liftOffsetV += f * dt;
    this.liftOffset += this.liftOffsetV * dt;
    this.shake = speed;
  }

  applyCamera(t, zoom) {
    const cam = this.camera;
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;
    let jitter = 0, roll = Math.cos(this.bobPhase) * 0.004 * this.bobAmp;
    if (this.shake > 0.05) {
      jitter = (Math.sin(t * 57.1) * 0.6 + Math.sin(t * 91.7) * 0.4) * 0.0022 * Math.min(1, this.shake / 3);
      roll += Math.sin(t * 1.3) * 0.0025 * Math.min(1, this.shake / 3);
    }
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + this.eyeSmooth + bobY + this.liftOffset + jitter,
      this.pos.z - Math.sin(this.yaw) * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, roll);
    const target = zoom ? 18 : this.fovBase;
    this.fov += (target - this.fov) * 0.18;
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}

export { EYE };
