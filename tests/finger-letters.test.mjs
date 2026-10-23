import {test} from "node:test";
import assert from "node:assert/strict";
import {LetterGate,fingerCount} from "../web/finger-letters.mjs";
test("POLAD one letter per stable gesture and release",()=>{const g=new LetterGate();let text="",now=0;for(let count=1;count<=5;count++){assert.equal(g.update(count,now),null);text+=g.update(count,now+750);assert.equal(g.update(count,now+900),null);g.update(0,now+1000);g.update(0,now+1400);now+=1500;}assert.equal(text,"POLAD");});
test("flickering counts do not commit; invalid hand gives no letter",()=>{const g=new LetterGate();for(let i=0;i<10;i++)assert.equal(g.update(i%2+1,i*100),null);assert.equal(fingerCount(null),0);});
