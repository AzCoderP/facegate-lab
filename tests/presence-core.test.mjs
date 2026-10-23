import {test} from "node:test";
import assert from "node:assert/strict";
import {mergeTracks} from "../web/presence-core.mjs";
const track = id => ({id,box:[.1,.1,.2,.2],first:"first",last:"last"});
const result = (ids, arrivals=ids, epoch="a") => ({tracks:ids.map(track),arrivals:arrivals.map(track),tracking_epoch:epoch});
test("one notification per new track, even on repeated response",()=>{
 const rows=[], state={epoch:null,lastId:0};
 assert.equal(mergeTracks(rows,result([1,2]),state).length,2);
 assert.equal(mergeTracks(rows,result([1,2]),state).length,0);
 assert.equal(rows.length,2);
 mergeTracks(rows,result([],[]),state);assert.ok(rows.every(r=>!r.active));
 assert.equal(mergeTracks(rows,result([1],[]),state).length,0);
 assert.equal(rows[0].first,"first");
});
test("expired server session resets temporary IDs without suppressing notifications",()=>{
 const rows=[], state={epoch:null,lastId:0};mergeTracks(rows,result([1,2]),state);
 assert.equal(mergeTracks(rows,result([1],[1],"b"),state).length,1);
 assert.equal(rows.length,1);
});
test("record history is bounded without losing notification watermark",()=>{
 const rows=[],state={epoch:null,lastId:0};
 for(let i=1;i<=550;i++) mergeTracks(rows,result([i]),state);
 assert.equal(rows.length,500);assert.equal(state.lastId,550);
 assert.equal(mergeTracks(rows,result([550],[1]),state).length,0);
});
