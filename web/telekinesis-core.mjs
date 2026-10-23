import { World, Body, Sphere, Plane, Vec3 } from "./vendor/cannon-es.mjs";
export class TelePhysics {
  constructor() {
    this.world = new World({ gravity: new Vec3(0, 0, 0) });
    this.wall = new Body({ mass: 0, shape: new Plane() });
    this.wall.position.z = -5;
    this.world.addBody(this.wall);
    this.ball = new Body({
      mass: 1,
      shape: new Sphere(0.45),
      linearDamping: 0.02,
    });
    this.world.addBody(this.ball);
    this.ball.addEventListener("collide", (e) => {
      if (e.body === this.wall && this.state === "flying") {
        this.state = "burst";
        this.impact = {
          x: this.ball.position.x,
          y: this.ball.position.y,
          z: -4.9,
        };
      }
    });
    this.reset();
  }
  reset() {
    this.state = "idle";
    this.radius = 0.45;
    this.angle = 0;
    this.impact = null;
    this.owner = null;
    this.lastTime = null;
    this.motion = { x: 0, y: 0 };
    this.ball.type = Body.KINEMATIC;
    this.ball.position.set(0, 0, 0);
    this.ball.velocity.set(0, 0, 0);
    this.ball.angularVelocity.set(0, 0, 0);
    this.ball.quaternion.set(0, 0, 0, 1);
    this.setSize(0.45);
  }
  setSize(radius) {
    this.radius = Math.max(0.2, Math.min(1.3, radius));
    this.ball.shapes[0].radius = this.radius;
    this.ball.shapes[0].updateBoundingSphereRadius();
    this.ball.updateBoundingRadius();
    this.ball.updateMassProperties();
  }
  hold(x, y, now, owner = "demo", radius = this.radius, angle = this.angle) {
    if (this.state === "flying" || this.state === "burst") return false;
    if (
      this.state !== "held" &&
      Math.hypot(x - this.ball.position.x, y - this.ball.position.y) >
        this.radius + 0.7
    )
      return false;
    const dt =
      this.lastTime === null
        ? 0.016
        : Math.max(0.008, Math.min(0.15, (now - this.lastTime) / 1000));
    if (this.owner !== owner) this.motion = { x: 0, y: 0 };
    else
      this.motion = {
        x: this.motion.x * 0.5 + ((x - this.ball.position.x) / dt) * 0.5,
        y: this.motion.y * 0.5 + ((y - this.ball.position.y) / dt) * 0.5,
      };
    this.state = "held";
    this.owner = owner;
    this.lastTime = now;
    this.ball.type = Body.KINEMATIC;
    this.ball.position.set(x, y, 0);
    this.ball.velocity.set(0, 0, 0);
    this.setSize(radius);
    this.angle = angle;
    this.ball.quaternion.setFromEuler(0, 0, angle);
    return true;
  }
  release() {
    if (this.state !== "held") return;
    this.state = "flying";
    this.ball.type = Body.DYNAMIC;
    this.ball.wakeUp();
    this.ball.velocity.set(
      Math.max(-4, Math.min(4, this.motion.x)),
      Math.max(-4, Math.min(4, this.motion.y)),
      -8,
    );
    this.ball.angularVelocity.set(1, 2, 2);
    this.lastTime = null;
  }
  lost() {
    if (this.state === "held") {
      this.state = "idle";
      this.owner = null;
      this.lastTime = null;
      this.motion = { x: 0, y: 0 };
    }
  }
  step(dt) {
    this.world.step(1 / 60, Math.min(0.05, Math.max(0, dt)), 4);
  }
}
