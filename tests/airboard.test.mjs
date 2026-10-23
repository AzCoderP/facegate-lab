import {test} from "node:test";
import assert from "node:assert/strict";
import {StrokeStore,paintPath} from "../web/airboard-core.mjs";
import {PointerFilter} from "../web/drawing-core.mjs";
test("vector undo redo and confirmed clear are reversible",()=>{
 const s=new StrokeStore(), path={points:[{x:1,y:2},{x:40,y:50}],color:"blue",width:5};
 s.add(path);path.points[0].x=999;assert.equal(s.paths[0].points[0].x,1);
 s.add({...path,erase:true});s.undo();assert.equal(s.paths.length,1);s.redo();assert.equal(s.paths.length,2);
 s.clear();assert.equal(s.paths.length,0);s.undo();assert.equal(s.paths.length,2);
 s.undo();s.add(path);assert.equal(s.future.length,0);
});
test("smoothed path includes the released endpoint",()=>{
 const lines=[];const ctx={save(){},restore(){},beginPath(){},moveTo(){},quadraticCurveTo(){},lineTo(x,y){lines.push([x,y]);},stroke(){}};
 paintPath(ctx,{points:[{x:0,y:0},{x:10,y:10},{x:20,y:20}],smooth:true,color:"blue",width:5});
 assert.deepEqual(lines.at(-1),[20,20]);
});
test("long tracking gap breaks the stroke and raw mode has no filter lag",()=>{
 const f=new PointerFilter();f.update({x:0,y:0},0);
 assert.equal(f.update({x:25,y:30},400).breakStroke,true);
 assert.equal(f.update({x:50,y:60},420,0).x,50);
});

test("path limit never removes existing drawing; clear starts fresh and undo restores it",()=>{const s=new StrokeStore(2);s.add({points:[{x:1,y:1}]});s.add({points:[{x:2,y:2}]});assert.equal(s.add({points:[]}),false);assert.equal(s.paths[0].points[0].x,1);s.clear();s.add({points:[{x:3,y:3}]});s.undo();s.undo();assert.equal(s.paths.length,2);});
