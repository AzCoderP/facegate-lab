import test from "node:test";
import assert from "node:assert/strict";
import { calculate, classifyHand, geometry } from "../web/gesture-core.mjs";

test("finger patterns classify consistently after rotation and mirroring", () => {
  for (const [raised, name] of [[[true,false,false,false],"index"],[[true,true,false,false],"two"],[[true,true,true,true],"palm"],[[false,false,false,false],"fist"]]) {
    const points = Array.from({length:21},()=>({x:0.2,y:0.4}));
    points[0]={x:0,y:0}; points[9]={x:0,y:0.5}; points[4]={x:-1,y:0};
    [8,12,16,20].forEach((tip,n)=>{ points[tip-2]={x:0.1*n,y:0.5}; points[tip]={x:0.1*n,y:raised[n]?0.9:0.4}; });
    assert.equal(classifyHand(points).name,name);
    assert.equal(classifyHand(points.map(p=>({x:-p.y,y:p.x}))).name,name);
  }
});

test("math precedence, unary signs, powers and roots", () => {
  for (const [input, expected] of [["(12+8)*3/2",30],["2+3*4",14],["2^3^2",512],["-2^2",-4],["2^-2",0.25],["sqrt(81)+.5",9.5],["3×4−2",10],["0",0]]) assert.equal(calculate(input),expected);
});
test("unsafe, malformed and nonfinite expressions are rejected", () => {
  for (const input of ["", "1/0", "sqrt(-1)", "2**3", "alert(1)", "globalThis", "1;2", "(2", "2)", "2(3)", "9^999", "1".repeat(161)]) assert.throws(()=>calculate(input),input);
});
test("pinch hysteresis and missing landmarks", () => {
  assert.equal(classifyHand(null).name,"none");
  const p = Array.from({length:21},()=>({x:0.5,y:0.5}));
  p[0]={x:0.5,y:1}; p[9]={x:0.5,y:0.5};
  p[4]={x:0.5,y:0}; p[8]={x:0.7,y:0};
  assert.equal(classifyHand(p,false).pinch,false);
  assert.equal(classifyHand(p,true).pinch,true);
  p[8].x=NaN; assert.equal(classifyHand(p).name,"none");
});
test("all 3D edges reference finite vertices",()=>{
  for(const kind of ["cube","pyramid","sphere"]){
    const {vertices,edges}=geometry(kind);
    assert.ok(vertices.length>=5);
    for(const [a,b] of edges){ assert.ok(vertices[a]?.every(Number.isFinite)); assert.ok(vertices[b]?.every(Number.isFinite)); }
  }
});
