import test from "node:test";
import assert from "node:assert/strict";
import {fitStroke,PointerFilter} from "../web/drawing-core.mjs";
import {silhouette} from "../web/object-core.mjs";

test("noisy oblique line becomes a fitted line, not a circle",()=>{
 const points=Array.from({length:100},(_,i)=>({x:50+i*4,y:60+i*2+Math.sin(i)*3}));
 assert.equal(fitStroke(points).type,"line");
 assert.equal(fitStroke(points,"circle").type,"free");
});
test("closed circles fit, partial arcs and scribbles do not",()=>{
 const circle=Array.from({length:121},(_,i)=>{const a=i*Math.PI*2/120,r=100+Math.sin(i*2)*2;return {x:300+Math.cos(a)*r,y:250+Math.sin(a)*r};});
 assert.equal(fitStroke(circle).type,"circle");
 assert.equal(fitStroke(circle.slice(0,60),"circle").type,"free");
 assert.equal(fitStroke(Array.from({length:70},(_,i)=>({x:i*3,y:i%2?400:20}))).type,"free");
});
test("rotated rectangle fits and tiny strokes remain free",()=>{
 const corners=[[0,0],[220,0],[220,120],[0,120],[0,0]],points=[];
 for(let j=0;j<4;j++) for(let i=0;i<30;i++){const x=corners[j][0]+(corners[j+1][0]-corners[j][0])*i/29,y=corners[j][1]+(corners[j+1][1]-corners[j][1])*i/29;points.push({x:350+x*Math.cos(.4)-y*Math.sin(.4),y:200+x*Math.sin(.4)+y*Math.cos(.4)});}
 assert.equal(fitStroke(points).type,"rectangle");
 assert.equal(fitStroke([{x:0,y:0},{x:1,y:1}]).type,"free");
});
test("adaptive filter reduces stationary jitter and breaks large jumps",()=>{
 const f=new PointerFilter();const values=[];
 for(let i=0;i<60;i++) values.push(f.update({x:100+Math.sin(i)*2,y:100},i*33).x);
 assert.ok(Math.max(...values)-Math.min(...values)<3.5);
 assert.equal(f.update({x:800,y:500},2100).x,values.at(-1));
 f.update({x:800,y:500},2133);
 assert.equal(f.update({x:800,y:500},2166).breakStroke,true);
});
test("background geometry reports shape without pretending to identify a pen",()=>{
 const width=120,height=100,bg=new Uint8ClampedArray(width*height*4),frame=new Uint8ClampedArray(bg);
 for(let y=20;y<80;y++)for(let x=30;x<38;x++){const p=(y*width+x)*4;frame[p]=255;frame[p+1]=255;frame[p+2]=255;}
 assert.equal(silhouette(bg,bg,width,height).length,0);
 const found=silhouette(frame,bg,width,height);
 assert.equal(found.length,1);assert.match(found[0].label,/Uzunsov/);assert.ok(!found[0].label.includes("qələm"));
 assert.throws(()=>silhouette(new Uint8ClampedArray(1),bg,width,height));
});
