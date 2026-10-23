import * as THREE from "./vendor/three.module.mjs";
import { TelePhysics } from "./telekinesis-core.mjs";
export class Telekinesis {
  constructor(container, report) {
    this.report = report;
    this.sim = new TelePhysics();
    this.state = null;
    this.dead = false;
    this.last = performance.now();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0, 0);
    this.renderer.setSize(960, 720, false);
    this.canvas = this.renderer.domElement;
    this.canvas.id = "tele-canvas";
    container.append(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
    this.camera.position.z = 10;
    this.geometry = new THREE.IcosahedronGeometry(1, 3);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x52cfff,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    this.orb = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.orb);
    this.ringGeo = new THREE.TorusGeometry(1.15, 0.025, 6, 60);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe7a1ff });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.orb.add(this.ring);
    this.wallGeo = new THREE.PlaneGeometry(8, 6, 12, 9);
    this.wallMat = new THREE.MeshBasicMaterial({
      color: 0x22aaff,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    this.wallMesh = new THREE.Mesh(this.wallGeo, this.wallMat);
    this.wallMesh.position.z = -5;
    this.scene.add(this.wallMesh);
    this.coords = new Float32Array(96 * 3);
    this.velocities = new Float32Array(96 * 3);
    this.colors = new Float32Array(96 * 3);
    for (let i = 0; i < 96; i++) {
      const c = new THREE.Color().setHSL(i / 96, 1, 0.65);
      c.toArray(this.colors, i * 3);
    }
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.coords, 3),
    );
    this.particleGeo.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3),
    );
    this.particleMat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(this.particleGeo, this.particleMat);
    this.particles.visible = false;
    this.scene.add(this.particles);
    this.burstTime = null;
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.dispose();
      this.report("WebGL bağlantısı itdi. Rejimi yenidən seç.");
    });
    this.down = (e) => {
      if (e.button !== 0) return;
      const p = this.point(e);
      this.pointer = this.sim.hold(p.x, p.y, performance.now());
      if (this.pointer) this.canvas.setPointerCapture(e.pointerId);
    };
    this.move = (e) => {
      if (this.pointer) {
        const p = this.point(e);
        this.sim.hold(p.x, p.y, performance.now());
      }
    };
    this.up = () => {
      if (this.pointer) this.sim.release();
      this.pointer = false;
    };
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", () => {
      this.pointer = false;
      this.sim.lost();
    });
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width - 0.5) * 8,
      y: (0.5 - (e.clientY - r.top) / r.height) * 6,
    };
  }
  input(state) {
    this.state = state;
    const now = performance.now();
    const hands = state.hands;
    const pinches = hands
      .filter((h) => h.gesture === "pinch")
      .sort((a, b) => a.side.localeCompare(b.side));
    const pos = (h) => ({
      x: (0.5 - (h.points[4].x + h.points[8].x) / 2) * 8,
      y: (0.5 - (h.points[4].y + h.points[8].y) / 2) * 6,
    });
    if (pinches.length) {
      const a = pos(pinches[0]);
      let x = a.x,
        y = a.y,
        r = this.sim.radius,
        angle = this.sim.angle;
      if (pinches.length === 2) {
        const b = pos(pinches[1]);
        x = (a.x + b.x) / 2;
        y = (a.y + b.y) / 2;
        r = Math.hypot(a.x - b.x, a.y - b.y) * 0.45;
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      }
      this.sim.hold(
        x,
        y,
        now,
        pinches
          .map((h) => h.side)
          .sort()
          .join("+"),
        r,
        angle,
      );
    } else if (
      hands.length &&
      hands.some(
        (h) =>
          h.gesture === "palm" || h.gesture === "index" || h.gesture === "two",
      )
    ) {
      this.sim.release();
    } else if (!hands.length) this.sim.lost();
  }
  burst(now) {
    this.burstTime = now;
    const p = this.sim.impact;
    for (let i = 0; i < 96; i++) {
      const a = i * 2.39996,
        s = 1 + (i % 7) * 0.4;
      this.coords.set([p.x, p.y, p.z], i * 3);
      this.velocities.set(
        [Math.cos(a) * s, Math.sin(a) * s, 0.5 + (i % 5) * 0.2],
        i * 3,
      );
    }
    this.particles.visible = true;
  }
  reset() {
    this.sim.reset();
    this.particles.visible = false;
    this.burstTime = null;
  }
  animate(now) {
    if (this.dead) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.pointer && this.state && now - this.state.at > 350)
      this.sim.lost();
    this.sim.step(dt);
    this.orb.visible = this.sim.state !== "burst";
    this.orb.position.copy(this.sim.ball.position);
    this.orb.quaternion.copy(this.sim.ball.quaternion);
    this.orb.scale.setScalar(this.sim.radius);
    this.ring.rotation.y = now * 0.001;
    if (this.sim.state === "burst" && this.burstTime === null) this.burst(now);
    if (this.particles.visible) {
      const age = (now - this.burstTime) / 1000;
      for (let i = 0; i < this.coords.length; i++)
        this.coords[i] += this.velocities[i] * dt;
      this.particleGeo.attributes.position.needsUpdate = true;
      this.particleMat.opacity = Math.max(0, 1 - age / 1.8);
      if (age > 1.8) this.particles.visible = false;
    }
    const text = {
      idle: "Topa yaxın pinch et və tut",
      held: "Tutuldu — iki pinch ilə ölçü və bucağı dəyiş; əli açıb at",
      flying: "Top virtual divara atıldı",
      burst: "Zərbə! Rəngli hissəciklər — Yenidən yarat düyməsini seç",
    }[this.sim.state];
    if (text !== this.lastText) {
      this.report(text);
      this.lastText = text;
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.frame);
    for (const r of [
      this.geometry,
      this.material,
      this.ringGeo,
      this.ringMat,
      this.wallGeo,
      this.wallMat,
      this.particleGeo,
      this.particleMat,
    ])
      r.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
