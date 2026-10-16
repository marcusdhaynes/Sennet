// Run after: node --experimental-strip-types --test packages/core/tests/*.test.mjs (Node >=22.16)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,nearestFrameIndex,viewerTableRotation,playerSeatRotation,projectForActor,parseGamePack,tcgMatCells,tcgSnapPoint,TCG_MAT} from '../src/index.ts';
const c=(type,payload={},actor='P1')=>({id:`${type}-${Math.random()}`,actor,type,payload});
test('12-seat angular sprite selection wraps correctly',()=>{
  assert.equal(nearestFrameIndex(0,0,12),0);
  assert.equal(nearestFrameIndex(1,0,12),1);
  assert.equal(nearestFrameIndex(11,0,12),11);
  assert.equal(nearestFrameIndex(3,90,24),0);
});
test('commands replay deterministically',()=>{
  const start=createGame('sandbox');
  const actions=[c('MOVE',{id:'token-moon',x:620,y:275}),c('ROTATE',{id:'token-moon',degrees:45}),c('FLIP',{id:'card-demo'}),c('ROLL',{id:'die-d6',seed:123456})];
  assert.deepEqual(replay(start,actions),actions.reduce((s,a)=>applyCommand(s,a),start));
  assert.equal(replay(start,actions).seq,4);
});
test('invalid or locked movement is rejected',()=>{
  assert.throws(()=>applyCommand(createGame('sandbox'),c('MOVE',{id:'nonexistent',x:500})),/does not exist/);
  assert.throws(()=>applyCommand(createGame('boardgame'),c('MOVE',{id:'game-board',x:500})),/locked/);
});
test('private hand details are redacted for other actors',()=>{
  let s=createGame('tcg');s=applyCommand(s,c('DRAW',{prefix:'alpha'}));
  const card=s.objects.find(o=>o.zone==='HAND');assert.ok(card);
  const privateView=projectForActor(s,'P2').objects.find(o=>o.id===card.id);
  assert.equal(privateView?.name,'Hidden card');
  assert.equal(projectForActor(s,'P1').objects.find(o=>o.id===card.id)?.name,card.name);
});
test('pack sanitization disallows javascript assets',()=>{
  const p=parseGamePack({schema:'sennet.pack/1',id:'foo',name:'Foo',objects:[{id:'x',kind:'miniature',name:'X',faceUrl:'javascript:alert(1)',frameUrls:['https://example.org/x.png','file:///etc/passwd']}]});
  assert.equal(p.objects[0].faceUrl,undefined);
  assert.deepEqual(p.objects[0].frameUrls,['https://example.org/x.png']);
});

test('event protocol rejects nondeterministic object IDs',()=>{
  assert.throws(()=>applyCommand(createGame('sandbox'),c('ADD',{object:{kind:'token',name:'X'}})),/Object ID required/);
  assert.throws(()=>applyCommand(createGame('sandbox'),c('CLONE',{id:'token-moon'})),/Clone ID required/);
});

test('the viewer is always at the bottom and all other players have relative facing angles',()=>{
  const eps=1e-9;
  for(let viewer=0;viewer<12;viewer++){
    const angle=viewer*Math.PI/6-Math.PI/2+viewerTableRotation(viewer);
    assert.ok(Math.abs(Math.sin(angle)-1)<eps,'viewer '+viewer+' is at bottom');
    assert.ok(Math.abs(Math.cos(angle))<eps);
    for(let other=0;other<12;other++){
      const facing=viewerTableRotation(viewer)+playerSeatRotation(other);
      const expected=(other-viewer)*Math.PI/6;
      assert.ok(Math.abs(facing-expected)<eps,'seat '+other+' relative to viewer '+viewer);
    }
  }
});

test('TCG mat has exactly four rows and three columns with narrow outer slots',()=>{
  const cells=tcgMatCells();
  assert.equal(cells.length,12);
  assert.deepEqual([...new Set(cells.map(c=>c.row))],[0,1,2,3]);
  assert.deepEqual([...new Set(cells.map(c=>c.column))],[0,1,2]);
  for(const row of [0,1,2,3]){
    assert.equal(cells.find(c=>c.row===row&&c.column===0)?.width,TCG_MAT.outerWidth);
    assert.equal(cells.find(c=>c.row===row&&c.column===2)?.width,TCG_MAT.outerWidth);
    assert.equal(cells.find(c=>c.row===row&&c.column===1)?.width,TCG_MAT.centerWidth);
    assert.equal(cells.find(c=>c.row===row)?.height,TCG_MAT.rowHeight);
  }
  for(let col=0;col<3;col++){
    const column=cells.filter(c=>c.column===col);
    for(let r=1;r<4;r++){
      assert.equal(column[r].y-column[r-1].y-column[r].height,TCG_MAT.gap);
    }
  }
});

test('TCG card drops snap inside, across narrow gutters, and when slightly outside the mat',()=>{
  const cells=tcgMatCells();
  const left=cells.find(c=>c.row===2&&c.column===0);
  const center=cells.find(c=>c.row===2&&c.column===1);
  assert.ok(left&&center);
  const state=createGame('tcg');
  const id='hero-a';
  const drop=(x,y)=>applyCommand(state,c('MOVE',{id,x,y})).objects.find(o=>o.id===id);
  assert.deepEqual([drop(left.x,left.y)?.x,drop(left.x,left.y)?.y],[left.x,left.y]);
  // A drop anywhere within the wide center is one center-section placement.
  const wideDrop=drop(center.x+center.width/2-2,center.y);
  assert.deepEqual([wideDrop.x,wideDrop.y],[center.x,center.y]);
  const matLeft=Math.min(...cells.map(v=>v.x-v.width/2));
  const outside=drop(matLeft-TCG_MAT.snapOutside+1,left.y);
  assert.equal(outside.x,left.x);
  assert.equal(outside.y,left.y);
  const tooFar=drop(matLeft-TCG_MAT.snapOutside-3,left.y);
  assert.ok(tooFar.x!==left.x);
  // Card movement must be reproducible through the serialized command alone.
  const action=c('MOVE',{id,x:matLeft-5,y:left.y});
  assert.deepEqual(replay(state,[action]),applyCommand(state,action));
});

test('Only TCG cards snap: tokens and other game types retain free tabletop movement',()=>{
  const state=createGame('tcg');
  const tokenCommand=c('ADD',{object:{id:'free-token',kind:'token',x:200,y:200}});
  const withToken=applyCommand(state,tokenCommand);
  const moved=applyCommand(withToken,c('MOVE',{id:'free-token',x:500,y:330}));
  assert.deepEqual([moved.objects.find(o=>o.id==='free-token')?.x,moved.objects.find(o=>o.id==='free-token')?.y],[500,330]);
  const free=applyCommand(createGame('sandbox'),c('MOVE',{id:'card-demo',x:501,y:329}));
  assert.deepEqual([free.objects.find(o=>o.id==='card-demo')?.x,free.objects.find(o=>o.id==='card-demo')?.y],[501,329]);
});

test('Dragging TCG cards from a deck onto a mat section makes them table cards',()=>{
  const start=createGame('tcg');
  const slot=tcgMatCells().find(c=>c.row===0&&c.column===1);
  assert.ok(slot);
  const next=applyCommand(start,c('MOVE',{id:'alpha-1',x:slot.x,y:slot.y}));
  const card=next.objects.find(o=>o.id==='alpha-1');
  assert.equal(card?.zone,'TABLE');
  assert.deepEqual([card?.x,card?.y],[slot.x,slot.y]);
});
