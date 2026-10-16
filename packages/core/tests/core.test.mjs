// Run after: node --experimental-strip-types --test packages/core/tests/*.test.mjs (Node >=22.16)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,cardStackMembers,nearestFrameIndex,viewerTableRotation,playerSeatRotation,projectForActor,parseGamePack,tcgMatCells,tcgMatRegions,centerMergeKey,tcgSnapPoint,tcgMatOrigin,tcgMatWorld,tcgMatLocal,MIN_TABLE_ZOOM,MAX_TABLE_ZOOM,clampTableZoom,clampTablePan,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,BOARD_CENTER,TABLE_APOTHEM} from '../src/index.ts';
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


test('Each of the twelve players has an independent four-row, three-column mat',()=>{
  const corners=[];
  for(let seat=0;seat<12;seat++){
    const cells=tcgMatCells(seat);
    assert.equal(cells.length,12);
    assert.deepEqual([...new Set(cells.map(c=>c.row))],[0,1,2,3]);
    assert.deepEqual([...new Set(cells.map(c=>c.column))],[0,1,2]);
    assert.ok(cells.every(cell=>cell.seat===seat));
    for(const row of [0,1,2,3]){
      for(const column of [0,1,2]){
        const cell=cells.find(c=>c.row===row&&c.column===column);
        assert.ok(cell);
        assert.equal(cell.width,column===1?TCG_MAT.centerWidth:TCG_MAT.outerWidth);
        assert.equal(cell.height,TCG_MAT.rowHeight);
      }
    }
    assert.equal(TCG_MAT.centerCards,7);
    assert.equal(TCG_MAT.centerWidth,7*TCG_MAT.cardWidth+6*2);
    const o=tcgMatOrigin(seat);
    assert.ok(Math.hypot(o.x-BOARD_CENTER,o.y-BOARD_CENTER)>1000);
    for(const localX of [-TCG_MAT_WIDTH/2,TCG_MAT_WIDTH/2])
      for(const localY of [-TCG_MAT_HEIGHT/2,TCG_MAT_HEIGHT/2]){
        const p=tcgMatWorld(localX,localY,seat);
        const angle=Math.atan2(p.y-BOARD_CENTER,p.x-BOARD_CENTER);
        const radial=-Math.PI/2+seat*Math.PI/6;
        const relative=Math.atan2(Math.sin(angle-radial),Math.cos(angle-radial));
        // Not even the innermost corners enter another player's sector.
        assert.ok(Math.abs(relative)<Math.PI/12, 'mat '+seat+' never overlaps an adjacent sector');
        corners.push(p);
      }
  }
  assert.equal(corners.length,48);
  assert.ok(TCG_MAT.outerRadius<TABLE_APOTHEM);
});

test('Wide middle column supports seven distinct card positions per row',()=>{
  const zone=tcgMatCells(0).find(cell=>cell.row===2&&cell.column===1);
  assert.ok(zone);
  const spots=[];
  for(let j=0;j<7;j++){
    const local=tcgMatLocal(zone.x,zone.y,0);
    const x=local.x+(j-3)*zone.width/7;
    const drop=tcgMatWorld(x,local.y,0);
    const snap=tcgSnapPoint(drop.x,drop.y);
    assert.ok(snap);
    assert.equal(snap.column,1);
    assert.equal(snap.seat,0);
    assert.equal(snap.row,2);
    assert.equal(snap.slot,j);
    spots.push([snap.x,snap.y]);
  }
  assert.equal(new Set(spots.map(([x,y])=>x.toFixed(4)+','+y.toFixed(4))).size,7);
});

test('Cards snap inside mats and just outside but stay free when far away',()=>{
  const zone=tcgMatCells(5).find(cell=>cell.row===1&&cell.column===0);
  assert.ok(zone);
  const state=createGame('tcg');
  const id='hero-a';
  const drop=(x,y)=>applyCommand(state,c('MOVE',{id,x,y})).objects.find(o=>o.id===id);
  const exactly=drop(zone.x,zone.y);
  assert.deepEqual([exactly.x,exactly.y],[zone.x,zone.y]);
  assert.equal(exactly.matSeat,5);
  const local=tcgMatLocal(zone.x,zone.y,5);
  const near=tcgMatWorld(local.x-zone.width/2-TCG_MAT.snapOutside+1,local.y,5);
  const nearby=drop(near.x,near.y);
  assert.deepEqual([nearby.x,nearby.y],[zone.x,zone.y]);
  const far=tcgMatWorld(local.x-zone.width/2-TCG_MAT.snapOutside-10,local.y,5);
  const unsnapped=drop(far.x,far.y);
  assert.notDeepEqual([unsnapped.x,unsnapped.y],[zone.x,zone.y]);
  assert.equal(unsnapped.matSeat,undefined);
  const command=c('MOVE',{id,x:near.x,y:near.y});
  assert.deepEqual(replay(state,[command]),applyCommand(state,command));
});

test('TCG mats move independently and sandbox cards retain free movement',()=>{
  const centers=Array.from({length:12},(_,seat)=>tcgMatCells(seat).find(cell=>cell.row===2&&cell.column===2));
  const ids=new Set(centers.map(cell=>cell.x.toFixed(3)+','+cell.y.toFixed(3)));
  assert.equal(ids.size,12);
  const state=createGame('tcg');
  for(let seat=0;seat<12;seat++){
    const cell=centers[seat];
    const moved=applyCommand(state,c('MOVE',{id:'hero-a',x:cell.x,y:cell.y}));
    assert.equal(moved.objects.find(o=>o.id==='hero-a').matSeat,seat);
  }
  const free=applyCommand(createGame('sandbox'),c('MOVE',{id:'card-demo',x:2011,y:2007}));
  assert.deepEqual([free.objects.find(o=>o.id==='card-demo').x,free.objects.find(o=>o.id==='card-demo').y],[2011,2007]);
});

test('Dragging a deck card into a seat mat turns it into a table card',()=>{
  const state=createGame('tcg');
  const zone=tcgMatCells(0).find(cell=>cell.row===1&&cell.column===1);
  const next=applyCommand(state,c('MOVE',{id:'alpha-1',x:zone.x,y:zone.y}));
  const card=next.objects.find(o=>o.id==='alpha-1');
  assert.equal(card.zone,'TABLE');
  assert.equal(card.matSeat,0);
});

test('Initial fit-to-table zoom is the maximum zoom-out limit',()=>{
  assert.equal(MIN_TABLE_ZOOM,1);
  assert.equal(clampTableZoom(MIN_TABLE_ZOOM),MIN_TABLE_ZOOM);
  assert.equal(clampTableZoom(.65),MIN_TABLE_ZOOM);
  assert.equal(clampTableZoom(0),MIN_TABLE_ZOOM);
  assert.equal(clampTableZoom(-10),MIN_TABLE_ZOOM);
  assert.equal(clampTableZoom(NaN),MIN_TABLE_ZOOM);
  assert.equal(clampTableZoom(1.5),1.5);
  assert.equal(clampTableZoom(999),MAX_TABLE_ZOOM);
});

test('cards stacked at the same spot form one group; adjacent mat cards do not',()=>{
  const state=createGame('tcg');
  const cards=cardStackMembers(state,'alpha-1');
  assert.equal(cards.length,12);
  assert.equal(cards[0].zone,'DECK');
  assert.ok(cards.every(card=>card.matSeat===0));
  assert.deepEqual(cardStackMembers(state,'hero-a').map(o=>o.id),['hero-a']);
  assert.deepEqual(cardStackMembers(state,'not-an-object'),[]);
  // Sharing x/y is not enough to group across separate deck/table zones.
  const combined={...state,objects:[...state.objects,{...cards[0],id:'table-card',zone:'TABLE'}]};
  assert.equal(cardStackMembers(combined,'alpha-1').length,12);
  assert.deepEqual(cardStackMembers(combined,'table-card').map(o=>o.id),['table-card']);
});

test('Normal short drag takes one top card, preserving the rest of its deck',()=>{
  const state=createGame('tcg');
  const target=tcgMatCells(0).find(cell=>cell.row===0&&cell.column===1);
  const moved=applyCommand(state,c('MOVE',{id:'alpha-1',x:target.x,y:target.y}));
  const card=moved.objects.find(o=>o.id==='alpha-1');
  assert.equal(card?.zone,'TABLE');
  assert.equal(card?.matSeat,0);
  assert.equal(moved.objects.filter(o=>o.id.startsWith('alpha-')&&o.zone==='DECK').length,11);
  assert.equal(cardStackMembers(moved,'alpha-2').length,11);
  const free=applyCommand(state,c('MOVE',{id:'alpha-1',x:BOARD_CENTER,y:BOARD_CENTER}));
  assert.equal(free.objects.find(o=>o.id==='alpha-1').zone,'TABLE');
});

test('Atomic stack move takes every card and preserves relative state',()=>{
  const start=createGame('tcg');
  const target=tcgMatCells(3).find(cell=>cell.row===2&&cell.column===1);
  const action=c('MOVE_STACK',{id:'alpha-1',x:target.x,y:target.y});
  const next=applyCommand(start,action);
  assert.equal(next.seq,start.seq+1);
  const before=start.objects.filter(o=>o.id.startsWith('alpha-'));
  const after=next.objects.filter(o=>o.id.startsWith('alpha-'));
  assert.equal(after.length,12);
  for(let i=0;i<before.length;i++){
    assert.equal(after[i].zone,'DECK');
    assert.equal(after[i].matSeat,3);
    assert.equal(after[i].order,before[i].order);
    assert.equal(after[i].faceUp,before[i].faceUp);
    assert.equal(after[i].owner,before[i].owner);
    assert.ok(Math.abs(after[i].x-target.x)<1e-6);
    assert.ok(Math.abs(after[i].y-target.y)<1e-6);
  }
  assert.deepEqual(next.objects.filter(o=>o.id.startsWith('beta-')),start.objects.filter(o=>o.id.startsWith('beta-')));
  assert.deepEqual(replay(start,[action]),next);
  assert.equal(cardStackMembers(next,'alpha-1').length,12);
});

test('Stack actions reject single cards, locked members and other players cards',()=>{
  const state=createGame('tcg');
  assert.throws(()=>applyCommand(state,c('MOVE_STACK',{id:'hero-a',x:1500,y:1500})),/No stack/);
  const locked={...state,objects:state.objects.map(o=>o.id==='alpha-5'?{...o,locked:true}:o)};
  assert.throws(()=>applyCommand(locked,c('MOVE_STACK',{id:'alpha-1',x:1500,y:1500})),/locked/);
  const owned={...state,objects:state.objects.map(o=>o.id==='alpha-5'?{...o,owner:'other-player'}:o)};
  assert.throws(()=>applyCommand(owned,c('MOVE_STACK',{id:'alpha-1',x:1500,y:1500})),/another player's card/);
});

test('camera cannot drag past the initial view at maximum zoom-out',()=>{
  const size={w:1280,h:720};
  for(const [dx,dy] of [[0,0],[400,500],[-400,-500],[1e6,-1e6]]){
    assert.deepEqual(clampTablePan(dx,dy,MIN_TABLE_ZOOM,size.w,size.h),{panX:0,panY:0});
  }
});

test('zoomed camera pans only within the world area visible on initial load',()=>{
  for(const [w,h] of [[1280,720],[375,812],[1024,1024]]){
    for(const zoom of [1.1,2,3,10,MAX_TABLE_ZOOM]){
      const halfLimitX=w*(zoom-1)/2;
      const halfLimitY=h*(zoom-1)/2;
      const [pX,pY]=[1e8,-1e8];
      assert.deepEqual(clampTablePan(pX,pY,zoom,w,h),
        {panX:halfLimitX,panY:-halfLimitY});
      assert.deepEqual(clampTablePan(-pX,-pY,zoom,w,h),
        {panX:-halfLimitX,panY:halfLimitY});
      // Convert camera translation back to world coordinates. Both the
      // left/right and top/bottom viewport edges remain inside the load
      // rectangle, even at the pan extremes.
      const fit=Math.min(w/3600,h/3600),scale=fit*zoom;
      const availableWorldWidth=w/fit,availableWorldHeight=h/fit;
      for(const {panX,panY} of [
        clampTablePan(pX,pY,zoom,w,h),
        clampTablePan(-pX,-pY,zoom,w,h)
      ]){
        const visibleLeft=(-w/2-panX)/scale;
        const visibleRight=(w/2-panX)/scale;
        const visibleTop=(-h/2-panY)/scale;
        const visibleBottom=(h/2-panY)/scale;
        assert.ok(visibleLeft>=-availableWorldWidth/2-1e-8);
        assert.ok(visibleRight<=availableWorldWidth/2+1e-8);
        assert.ok(visibleTop>=-availableWorldHeight/2-1e-8);
        assert.ok(visibleBottom<=availableWorldHeight/2+1e-8);
      }
    }
  }
});

test('camera panning clamps each axis independently and ignores invalid values',()=>{
  assert.deepEqual(clampTablePan(24,-40,2,1200,800),{panX:24,panY:-40});
  assert.deepEqual(clampTablePan(900,-700,2,1200,800),{panX:600,panY:-400});
  assert.deepEqual(clampTablePan(900,-700,.5,1200,800),{panX:0,panY:0});
  assert.deepEqual(clampTablePan(Infinity,NaN,2,1200,800),{panX:0,panY:0});
  assert.deepEqual(clampTablePan(900,-700,2,NaN,-100),{panX:0,panY:0});
});

test('center merge joins exactly two adjacent center rows without affecting other columns or players',()=>{
  const key=centerMergeKey(0,1);
  const base=createGame('tcg');
  const action=c('SET_CENTER_MERGE',{seat:0,boundary:1,merged:true});
  const next=applyCommand(base,action);
  assert.deepEqual(next.centerMerges,[key]);
  const zones=tcgMatRegions(0,next.centerMerges);
  assert.equal(zones.filter(z=>z.column===1).length,3);
  const joined=zones.find(z=>z.column===1&&z.row===1);
  assert.ok(joined);
  assert.equal(joined.lastRow,2);
  assert.equal(joined.height,2*TCG_MAT.rowHeight+TCG_MAT.gap);
  assert.equal(zones.filter(z=>z.column!==1).length,8);
  assert.equal(tcgMatRegions(1,next.centerMerges).length,12);
  assert.equal(tcgMatRegions(0,base.centerMerges).length,12);
  assert.deepEqual(replay(base,[action]),next);
});

test('adjacent merges combine into three- and four-row center areas, then undo cleanly',()=>{
  let state=createGame('tcg');
  const set=(boundary,merged)=>{state=applyCommand(state,c('SET_CENTER_MERGE',{seat:5,boundary,merged}));};
  set(0,true);set(2,true);
  assert.equal(tcgMatRegions(5,state.centerMerges).filter(z=>z.column===1).length,2);
  set(1,true);
  const joined=tcgMatRegions(5,state.centerMerges).find(z=>z.column===1);
  assert.equal(joined.row,0);
  assert.equal(joined.lastRow,3);
  assert.equal(joined.height,TCG_MAT_HEIGHT);
  set(1,false);
  assert.equal(tcgMatRegions(5,state.centerMerges).filter(z=>z.column===1).length,2);
  set(0,false);set(2,false);
  assert.equal(tcgMatRegions(5,state.centerMerges).length,12);
  assert.deepEqual(state.centerMerges,[]);
});

test('merged center rows share seven horizontal snap positions across their combined height',()=>{
  const base=createGame('tcg');
  const state=applyCommand(base,c('SET_CENTER_MERGE',{seat:0,boundary:0,merged:true}));
  const region=tcgMatRegions(0,state.centerMerges).find(z=>z.column===1&&z.row===0);
  const top=tcgMatCells(0).find(z=>z.column===1&&z.row===0);
  const bottom=tcgMatCells(0).find(z=>z.column===1&&z.row===1);
  for(const input of [top,bottom]){
    const dest=tcgSnapPoint(input.x,input.y,state.centerMerges);
    assert.equal(dest.row,0);
    assert.equal(dest.slot,3);
    assert.ok(Math.hypot(dest.x-region.x,dest.y-region.y)<1e-6);
    const card=applyCommand(state,c('MOVE',{id:'hero-a',x:input.x,y:input.y})).objects.find(z=>z.id==='hero-a');
    assert.ok(Math.hypot(card.x-region.x,card.y-region.y)<1e-6);
  }
});

test('merge command rejects invalid positions, unsupported games, and changing other players mats',()=>{
  const tcg=createGame('tcg');
  for(const payload of [{seat:12,boundary:0,merged:true},{seat:0,boundary:3,merged:true},
    {seat:0,boundary:0,merged:'true'},{seat:0.5,boundary:0,merged:true}]){
    assert.throws(()=>applyCommand(tcg,c('SET_CENTER_MERGE',payload)),/Invalid center mat merge/);
  }
  assert.throws(()=>applyCommand(createGame('sandbox'),c('SET_CENTER_MERGE',{seat:0,boundary:1,merged:true})),/only supported/);
  const players={...tcg,players:[{id:'P1',seat:3,name:'Player',online:true}]};
  assert.throws(()=>applyCommand(players,c('SET_CENTER_MERGE',{seat:0,boundary:0,merged:true})),/only merge/);
  assert.equal(applyCommand(players,c('SET_CENTER_MERGE',{seat:3,boundary:0,merged:true})).centerMerges[0],centerMergeKey(3,0));
});
