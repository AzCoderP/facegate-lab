import {test} from "node:test";
import assert from "node:assert/strict";
import {SelfLabel} from "../web/self-label.mjs";
test("only verified single selected profile is named; other tracks and stale matches are anonymous",()=>{const s=new SelfLabel(),tracks=[{id:1}];s.accept({verified:true,name:"Rahil"},tracks,0);assert.equal(s.label(tracks,1,100),"RAHIL");assert.equal(s.label([{id:2}],2,200),null);s.accept({verified:true,name:"Rahil"},tracks,0);assert.equal(s.label(tracks,1,2500),null);s.accept({verified:true,name:"Rahil"},[{id:1},{id:2}],0);assert.equal(s.name,null);s.accept({verified:false,name:"Rahil"},tracks,0);assert.equal(s.name,null);});
