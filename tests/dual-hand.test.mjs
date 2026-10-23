import {test} from "node:test";
import assert from "node:assert/strict";
import {GestureLatch,DualHands} from "../web/dual-hand-core.mjs";
import {paintEffects} from "../web/hand-effects.mjs";
const hand=(side,x)=>({side,points:Array.from({length:21},()=>({x,y:.5}))});
test("gesture debounce and cooldown reject rapid flicker",()=>{const l=new GestureLatch();assert.equal(l.update("fist",0),"none");assert.equal(l.update("palm",80),"none");assert.equal(l.update("fist",160),"none");assert.equal(l.update("fist",350),"fist");l.update("palm",360);assert.equal(l.update("palm",550),"fist");assert.equal(l.update("palm",710),"palm");});
test("left/right kept independently; input order does not replace hands",()=>{const d=new DualHands();let r=d.update([hand("Left",.2),hand("Right",.8)],0);assert.equal(r.hands.length,2);r=d.update([hand("Right",.75),hand("Left",.25)],210);assert.equal(r.hands.find(h=>h.side==="Left").points[0].x<.3,true);assert.equal(d.update([],300).hands.length,0);d.update([],700);assert.equal(d.slots.size,0);});
test("two close hands need stable combination; no ghost portal with one hand",()=>{const d=new DualHands();d.update([hand("Left",.4),hand("Right",.5)],0);assert.equal(d.update([hand("Left",.4),hand("Right",.5)],200).combo,"close");assert.equal(d.update([hand("Left",.4)],220).hands.length,1);});
test("stale inference draws no effects",()=>{let cleared=0;paintEffects({canvas:{width:960,height:720},clearRect(){cleared++;}},{at:0,hands:[]},500);assert.equal(cleared,1);});
