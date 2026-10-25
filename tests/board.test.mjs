import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardReplica} from '../web/board-core.mjs';
test('board snapshots and ordered deltas reproduce phone strokes',()=>{
 const b=new BoardReplica();b.apply({generation:'g',revision:1,strokes:[]});
 b.apply({generation:'g',revision:4,events:[{revision:2,op:'begin',stroke:{id:'s',color:'#35b7ff',width:4,points:[[.1,.2]],ended:false}},{revision:3,op:'append',id:'s',points:[[.3,.4]]},{revision:4,op:'end',id:'s',points:[]}]});
 assert.deepEqual(b.strokes[0].points,[[.1,.2],[.3,.4]]);assert.equal(b.strokes[0].ended,true);
 b.apply({generation:'g',revision:4,events:[{revision:3,op:'append',id:'s',points:[[.3,.4]]}]});assert.equal(b.strokes[0].points.length,2);
 b.apply({generation:'g',revision:5,events:[{revision:5,op:'undo',id:'s'}]});assert.equal(b.strokes.length,0);
});
test('board generation snapshot replaces stale local content and gaps force resync',()=>{
 const b=new BoardReplica();b.apply({generation:'g',revision:1,strokes:[{id:'s',points:[[0,0]]}]});
 assert.throws(()=>b.apply({generation:'g',revision:3,events:[{revision:3,op:'undo',id:'s'}]}),/RESYNC/);
 b.apply({generation:'new',revision:4,strokes:[]});assert.equal(b.generation,'new');assert.equal(b.strokes.length,0);
});
