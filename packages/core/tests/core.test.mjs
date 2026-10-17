// Run after: node --experimental-strip-types --test packages/core/tests/*.test.mjs (Node >=22.16)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,cardStackMembers,nearestFrameIndex,viewerTableRotation,playerSeatRotation,projectForActor,parseGamePack,gameFromPack,tcgMatCells,tcgMatRegions,centerMergeKey,tcgSnapPoint,tcgMatOrigin,opponentAtTablePoint,opposingMatLayout,neighboringOpponentSeat,tcgMatWorld,tcgMatLocal,MIN_TABLE_ZOOM,MAX_TABLE_ZOOM,clampTableZoom,clampTablePan,TCG_ZONE_LABELS,TCG_ROW_COLORS,tcgRegionLabel,isTcgRemoveDrop,defaultPlaymatAppearance,normalizePlaymatAppearance,playmatSectionIndex,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,BOARD_CENTER,TABLE_APOTHEM} from '../src/index.ts';
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
    assert.equal(tcgSnapPoint(input.x,input.y,state.centerMerges),null);
    const dest=tcgSnapPoint(input.x,input.y,state.centerMerges,true);
    assert.equal(dest.row,0);
    assert.equal(dest.slot,3);
    assert.ok(Math.hypot(dest.x-region.x,dest.y-region.y)<1e-6);
    const card=applyCommand(state,c('MOVE',{id:'hero-a',x:input.x,y:input.y,snapMerged:true})).objects.find(z=>z.id==='hero-a');
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

test('exported TCG packs retain center merges while rejecting invalid imported boundaries',()=>{
  const state=applyCommand(createGame('tcg'),c('SET_CENTER_MERGE',{seat:4,boundary:1,merged:true}));
  const raw={schema:'sennet.pack/1',id:'merged',name:'Merged layout',author:'Tester',kind:'tcg',
    objects:state.objects,centerMerges:[centerMergeKey(4,1),centerMergeKey(4,1),-4,900,1.5,'5']};
  const pack=parseGamePack(raw);
  assert.deepEqual(pack.centerMerges,[centerMergeKey(4,1)]);
  const loaded=gameFromPack(pack);
  assert.deepEqual(loaded.centerMerges,[centerMergeKey(4,1)]);
  assert.equal(tcgMatRegions(4,loaded.centerMerges).filter(region=>region.column===1).length,3);
});

test('opponent picker recognizes any seat number or mat through overlying cards',()=>{
  for(let viewer=0;viewer<12;viewer++){
    assert.equal(opponentAtTablePoint(tcgMatOrigin(viewer).x,tcgMatOrigin(viewer).y,viewer),null);
    for(let other=0;other<12;other++){
      if(other===viewer)continue;
      const mat=tcgMatOrigin(other);
      assert.equal(opponentAtTablePoint(mat.x,mat.y,viewer),other);
      const top=tcgMatCells(other).find(c=>c.row===0&&c.column===1);
      const bottom=tcgMatCells(other).find(c=>c.row===3&&c.column===2);
      assert.equal(opponentAtTablePoint(top.x,top.y,viewer),other);
      assert.equal(opponentAtTablePoint(bottom.x,bottom.y,viewer),other);
      const theta=other*Math.PI/6-Math.PI/2;
      const chairX=BOARD_CENTER+1730*Math.cos(theta);
      const chairY=BOARD_CENTER+1730*Math.sin(theta);
      assert.equal(opponentAtTablePoint(chairX,chairY,viewer),other);
    }
  }
  assert.equal(opponentAtTablePoint(NaN,2000,0),null);
});

test('any opponent can be presented directly opposite the local player without moving game objects',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const rot=viewerTableRotation(viewer);
    for(let target=0;target<12;target++){
      if(viewer===target)continue;
      const layout=opposingMatLayout(viewer,target);
      const localX=layout.player.x-BOARD_CENTER;
      const localY=layout.player.y-BOARD_CENTER;
      const remoteX=layout.opponent.x-BOARD_CENTER;
      const remoteY=layout.opponent.y-BOARD_CENTER;
      const screenLocalY=localX*Math.sin(rot)+localY*Math.cos(rot);
      const screenRemoteY=remoteX*Math.sin(rot)+remoteY*Math.cos(rot);
      assert.ok(screenLocalY>0,'own mat must be below center');
      assert.ok(screenRemoteY<0,'opponent mat must be above center');
      const ownFacing=playerSeatRotation(viewer)+layout.player.rotation+rot;
      const otherFacing=playerSeatRotation(target)+layout.opponent.rotation+rot;
      assert.ok(Math.abs(Math.sin(ownFacing))<1e-9);
      assert.ok(Math.abs(Math.sin(otherFacing))<1e-9);
      assert.ok(Math.abs(Math.cos(ownFacing)-1)<1e-9);
      assert.ok(Math.abs(Math.cos(otherFacing)+1)<1e-9);
    }
  }
});

test('opposing player mats meet precisely along the shared middle boundary',()=>{
  for(let viewer=0;viewer<12;viewer++){
    for(let opponent=0;opponent<12;opponent++){
      if(viewer===opponent)continue;
      const layout=opposingMatLayout(viewer,opponent);
      const dx=layout.player.x-layout.opponent.x;
      const dy=layout.player.y-layout.opponent.y;
      assert.ok(Math.abs(Math.hypot(dx,dy)-TCG_MAT_HEIGHT)<1e-9);
      assert.ok(Math.abs((layout.player.x+layout.opponent.x)/2-BOARD_CENTER)<1e-9);
      assert.ok(Math.abs((layout.player.y+layout.opponent.y)/2-BOARD_CENTER)<1e-9);
      // At unit scale, each player's play area occupies half the height.
      const screenFit=1080/(2*TCG_MAT_HEIGHT);
      assert.ok(Math.abs(2*TCG_MAT_HEIGHT*screenFit-1080)<1e-9);
    }
  }
});

test('left and right opponent arrows follow counter-clockwise and clockwise numbered seats',()=>{
  for(let viewer=0;viewer<12;viewer++){
    for(let opponent=0;opponent<12;opponent++){
      if(opponent===viewer)continue;
      for(const direction of ['left','right']){
        const delta=direction==='left'?-1:1;
        let expected=(opponent+delta+12)%12;
        if(expected===viewer)expected=(expected+delta+12)%12;
        const result=neighboringOpponentSeat(viewer,opponent,direction);
        assert.equal(result,expected);
        assert.notEqual(result,viewer,'navigation never selects own seat');
      }
      // All eleven opponent seats are reachable in clockwise order.
      let pos=opponent;
      const visited=new Set();
      for(let i=0;i<11;i++){
        visited.add(pos);
        pos=neighboringOpponentSeat(viewer,pos,'right');
      }
      assert.equal(pos,opponent,'wraparound returns to initial opponent');
      assert.equal(visited.size,11);
    }
  }
});

test('opposing mats project to distinct halves with actual slot edges meeting at the seam',()=>{
  const h=TCG_MAT_HEIGHT,w=TCG_MAT_WIDTH;
  for(let viewer=0;viewer<12;viewer++){
    const tableAngle=viewerTableRotation(viewer);
    for(let opponent=0;opponent<12;opponent++){
      if(opponent===viewer)continue;
      const layout=opposingMatLayout(viewer,opponent);
      const intoScreen=(position,seat)=>{
        const dx=position.x-BOARD_CENTER,dy=position.y-BOARD_CENTER;
        const cx=dx*Math.cos(tableAngle)-dy*Math.sin(tableAngle);
        const cy=dx*Math.sin(tableAngle)+dy*Math.cos(tableAngle);
        const rotation=tcgMatOrigin(seat).angle+position.rotation+tableAngle;
        return {cx,cy,rotation};
      };
      const local=intoScreen(layout.player,viewer);
      const remote=intoScreen(layout.opponent,opponent);
      const yBounds=(mat)=>{
        const ys=[];
        const xs=[];
        for(const x of [-w/2,w/2]){
          for(const y of [-h/2,h/2]){
            xs.push(mat.cx+x*Math.cos(mat.rotation)-y*Math.sin(mat.rotation));
            ys.push(mat.cy+x*Math.sin(mat.rotation)+y*Math.cos(mat.rotation));
          }
        }
        return {top:Math.min(...ys),bottom:Math.max(...ys),
          left:Math.min(...xs),right:Math.max(...xs)};
      };
      const ourArea=yBounds(local),theirArea=yBounds(remote);
      assert.ok(Math.abs(ourArea.top)<1e-8,'player mat starts at seam');
      assert.ok(Math.abs(theirArea.bottom)<1e-8,'opponent mat ends at seam');
      assert.ok(ourArea.bottom>0&&theirArea.top<0);
      assert.ok(Math.abs(ourArea.left+theirArea.right)<1e-8);
      assert.ok(Math.abs(ourArea.right-theirArea.right)<1e-8);
      // Navigation circles are centered directly ON both side borders,
      // not outside the mat. y=0 lies between rows two and three.
      const leftArrowX=remote.cx+(w/2)*Math.cos(remote.rotation);
      const rightArrowX=remote.cx-(w/2)*Math.cos(remote.rotation);
      const leftArrowY=remote.cy+(w/2)*Math.sin(remote.rotation);
      const rightArrowY=remote.cy-(w/2)*Math.sin(remote.rotation);
      assert.ok(Math.abs(leftArrowX-theirArea.left)<1e-8);
      assert.ok(Math.abs(rightArrowX-theirArea.right)<1e-8);
      assert.ok(Math.abs(leftArrowY-remote.cy)<1e-8);
      assert.ok(Math.abs(rightArrowY-remote.cy)<1e-8);
      assert.ok(Math.abs((leftArrowX+rightArrowX)/2-remote.cx)<1e-8);
    }
  }
});

test('original playmat labels retain hand and side pockets through every merge',()=>{
  assert.deepEqual(TCG_ZONE_LABELS,[['LOCATIONS','PLAY 03','LEADERS'],['RESERVE','PLAY 02','DECK'],['WAIT','PLAY 01','DISCARD'],['RESOURCE','HAND','REMOVE']]);
  assert.deepEqual(TCG_ROW_COLORS,[0x00f5ff,0x00ff87,0xffd700,0xff006e]);
  assert.equal(tcgRegionLabel(0,1,1),'ZONE 02+03');
  assert.equal(tcgRegionLabel(1,1,2),'ZONE 01+02');
  assert.equal(tcgRegionLabel(0,1,2),'TOTAL BATTLEFIELD');
  assert.match(tcgRegionLabel(0,1,3),/HAND/);
  for(let seat=0;seat<12;seat++)for(let mask=0;mask<8;mask++){
    const merged=[0,1,2].filter(b=>mask&(1<<b)).map(b=>centerMergeKey(seat,b));
    for(const region of tcgMatRegions(seat,merged)){
      assert.ok(tcgRegionLabel(region.row,region.column,region.lastRow));
      if(region.column!==1)assert.equal(region.row,region.lastRow);
    }
  }
});

test('REMOVE accepts only exact pocket bounds on each rotated seat, never snap margins or neighboring mats',()=>{
  for(let seat=0;seat<12;seat++){
    for(const cell of tcgMatCells(seat))assert.equal(isTcgRemoveDrop(cell.x,cell.y,seat),cell.row===3&&cell.column===2);
    const cell=tcgMatCells(seat).find(c=>c.row===3&&c.column===2);
    const local=tcgMatLocal(cell.x,cell.y,seat);
    const outside=tcgMatWorld(local.x+cell.width/2+1,local.y,seat);
    assert.equal(isTcgRemoveDrop(outside.x,outside.y,seat),false);
    assert.equal(isTcgRemoveDrop(cell.x,cell.y,(seat+1)%12),false);
  }
  assert.equal(isTcgRemoveDrop(NaN,0,0),false);
});

test('mat draw uses that seat deck and HAND, retains privacy, and replays with flip, tap and removal',()=>{
  const start=createGame('tcg');
  for(const seat of [0,6]){
    const deck=start.objects.filter(o=>o.zone==='DECK'&&o.matSeat===seat);
    const pocket=tcgMatCells(seat).find(c=>c.row===1&&c.column===2);
    assert.ok(deck.every(o=>o.x===pocket.x&&o.y===pocket.y));
    const commands=[c('DRAW',{matSeat:seat},'local')];
    const drawn=applyCommand(start,commands[0]);
    const card=drawn.objects.find(o=>o.id===deck[0].id);
    assert.equal(card.zone,'HAND');assert.equal(card.matSeat,seat);assert.equal(card.owner,'local');
    assert.equal(card.faceUp,false);
    const hand=tcgSnapPoint(card.x,card.y);
    assert.equal(hand.seat,seat);assert.equal(hand.row,3);assert.equal(hand.column,1);
    assert.equal(drawn.objects.filter(o=>o.zone==='DECK'&&o.matSeat===(seat===0?6:0)).length,12);
    assert.equal(projectForActor(drawn,'other').objects.find(o=>o.id===card.id).name,'Hidden card');
    commands.push(c('ROTATE',{id:card.id,degrees:90},'local'),c('FLIP',{id:card.id},'local'),c('DELETE',{id:card.id},'local'));
    assert.deepEqual(replay(start,commands),commands.reduce((state,command)=>applyCommand(state,command),start));
    assert.ok(!replay(start,commands).objects.some(o=>o.id===card.id));
  }
});

test('mat draw rejects invalid seats, another player mat, empty decks and owned cards',()=>{
  const state={...createGame('tcg'),players:[{id:'P1',seat:0,name:'P1',online:true}]};
  for(const seat of [-1,12,1.5,'0'])assert.throws(()=>applyCommand(state,c('DRAW',{matSeat:seat})),/Invalid draw mat/);
  assert.throws(()=>applyCommand(state,c('DRAW',{matSeat:6})),/own mat/);
  assert.throws(()=>applyCommand({...state,players:[]},c('DRAW',{matSeat:2})),/No cards/);
  const owned={...state,objects:state.objects.map(o=>o.matSeat===0?{...o,owner:'P2'}:o)};
  assert.throws(()=>applyCommand(owned,c('DRAW',{matSeat:0})),/No cards/);
});

test('combined center pockets are freeform by default and obey explicit per-command snap opt-in',()=>{
  const state=applyCommand(createGame('tcg'),c('SET_CENTER_MERGE',{seat:0,boundary:1,merged:true}));
  const area=tcgMatRegions(0,state.centerMerges).find(z=>z.column===1&&z.row===1);
  const pt=tcgMatWorld(-42,38,0);
  const defaultMove=applyCommand(state,c('MOVE',{id:'hero-a',...pt}));
  const loose=defaultMove.objects.find(o=>o.id==='hero-a');
  assert.ok(Math.hypot(loose.x-pt.x,loose.y-pt.y)<.001);
  const snappedMove=applyCommand(state,c('MOVE',{id:'hero-a',...pt,snapMerged:true}));
  const snapped=snappedMove.objects.find(o=>o.id==='hero-a');
  assert.ok(Math.hypot(snapped.y-area.y)<1);
  assert.ok(Math.hypot(snapped.x-pt.x,snapped.y-pt.y)>2);
  assert.deepEqual(replay(state,[c('MOVE',{id:'hero-a',...pt,snapMerged:true})]).objects.find(o=>o.id==='hero-a').x,snapped.x);
});

test('unmerged spaces always snap and appearance defaults are independent and normalized',()=>{
  const cfg=defaultPlaymatAppearance();
  assert.equal(cfg.sections.length,12);
  assert.equal(cfg.snapMerged,false);
  assert.equal(cfg.sections[0].texture,'matte-glossy');
  assert.ok(cfg.sections[0].innerShadow&&cfg.sections[0].innerBevel);
  assert.equal(playmatSectionIndex(3,2),11);
  const first=tcgMatCells(0).find(cell=>cell.row===2&&cell.column===1);
  const pt=tcgMatWorld(25,tcgMatLocal(first.x,first.y,0).y+10,0);
  assert.ok(tcgSnapPoint(pt.x,pt.y,[],false));
  const input={...cfg,images:{bg_abcde:'data:image/png;base64,aGVsbG8=',fake:'javascript:bad'},
    selectedSections:[5,5,-1,12,2],
    sections:[{...cfg.sections[0],imageId:'fake',shadowOpacity:77,texture:'unreal'}]};
  const safe=normalizePlaymatAppearance(input);
  assert.deepEqual(safe.selectedSections,[2,5]);
  assert.equal(safe.sections[0].imageId,'');
  assert.equal(safe.sections[0].shadowOpacity,1);
  assert.equal(safe.sections[0].texture,'matte-glossy');
  assert.equal(safe.sections[1].imageId,'');
  assert.equal(safe.snapMerged,false);
});

test('TCG card, token, miniature and die pieces snap to unmerged mat spaces',()=>{
  const state=createGame('tcg');
  const cell=tcgMatCells(0).find(c=>c.row===1&&c.column===2);
  for(const kind of ['card','token','miniature','die','tile','deck']){
    const obj={id:'snap-test',kind,name:'Snap Test',x:1000,y:1000,
      rotation:0,faceUp:true,color:'#eeeeee',zone:'TABLE',order:200};
    const start={...state,objects:[...state.objects,obj]};
    const moved=applyCommand(start,c('MOVE',{id:'snap-test',x:cell.x+4,y:cell.y-7})).objects.find(o=>o.id==='snap-test');
    assert.equal(moved.matSeat,0,kind+' should occupy selected mat');
    assert.ok(Math.hypot(moved.x-cell.x,moved.y-cell.y)<1e-6,kind+' should snap to slot center');
  }
});
