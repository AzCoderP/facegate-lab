import {test} from "node:test";
import assert from "node:assert/strict";
import {TelePhysics} from "../web/telekinesis-core.mjs";
test("nearby grab, bounded scale, release and real physics wall collision",()=>{const s=new TelePhysics();assert.equal(s.hold(3,2,0),false);assert.equal(s.hold(0,0,100),true);s.hold(.1,.1,200,"demo",5,1.2);assert.equal(s.radius,1.3);assert.equal(s.angle,1.2);s.release();assert.equal(s.state,"flying");for(let i=0;i<100;i++)s.step(1/60);assert.equal(s.state,"burst");assert.ok(s.impact);s.reset();assert.equal(s.state,"idle");assert.equal(s.impact,null);});
test("tracking loss pauses a held object instead of throwing",()=>{const s=new TelePhysics();s.hold(0,0,0);s.lost();assert.equal(s.state,"idle");assert.equal(s.ball.velocity.z,0);s.release();assert.equal(s.state,"idle");});
