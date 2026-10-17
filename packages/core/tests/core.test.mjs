// Run after: node --experimental-strip-types --test packages/core/tests/*.test.mjs (Node >=22.16)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,cardStackMembers,nearestFrameIndex,viewerTableRotation,playerSeatRotation,projectForActor,parseGamePack,gameFromPack,tcgMatCells,tcgMatRegions,centerMergeKey,tcgSnapPoint,tcgMatOrigin,opponentAtTablePoint,opposingMatLayout,alliedMatLayout,groupedMatchupLayout,matchupMatLayout,ALLY_MAT_GAP,OPPONENT_RELATION_BUTTON_OFFSET,OPPONENT_RELATION_BUTTON_RADIUS,OPPONENT_RELATION_BUTTON_HIT_RADIUS,opponentRelationButtonPosition,VIEW_BUTTON_RADIUS,VIEW_BUTTON_HIT_RADIUS,VIEW_BUTTON_CASTLE_OFFSET,PLAYMAT_BOTTOM_BUTTON_OFFSET,PLAYMAT_BOTTOM_BUTTON_Y,TCG_HAND_BOTTOM_LINE_Y,viewButtonPosition,toggleOpponentRelation,neighboringOpponentSeat,tcgMatWorld,tcgMatLocal,MIN_TABLE_ZOOM,MAX_TABLE_ZOOM,clampTableZoom,clampTablePan,TCG_ZONE_LABELS,TCG_ROW_COLORS,tcgRegionLabel,isTcgRemoveDrop,defaultPlaymatAppearance,normalizePlaymatAppearance,playmatAppearanceForSeat,playmatSectionIndex,TCG_MAT,TCG_MAT_WIDTH,TCG_MAT_HEIGHT,BOARD_CENTER,TABLE_APOTHEM} from '../src/index.ts';
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
  assert.equal(cfg.sections[0].textureLayers.matte.enabled,true);
  assert.equal(cfg.sections[0].textureLayers.glossy.enabled,true);
  assert.equal(cfg.sections[0].textureLayers.sandy.enabled,false);
  assert.equal(cfg.sections[0].textureLayers.matte.opacity,.18);
  assert.notEqual(cfg.sections[0].textureLayers,cfg.sections[1].textureLayers);
  assert.ok(cfg.sections[0].innerShadow&&cfg.sections[0].innerBevel);
  assert.equal(playmatSectionIndex(3,2),11);
  const first=tcgMatCells(0).find(cell=>cell.row===2&&cell.column===1);
  const pt=tcgMatWorld(25,tcgMatLocal(first.x,first.y,0).y+10,0);
  assert.ok(tcgSnapPoint(pt.x,pt.y,[],false));
  const input={...cfg,images:{bg_abcde:'data:image/png;base64,aGVsbG8=',fake:'javascript:bad'},
    selectedSections:[5,5,-1,12,2],
    sections:[{...cfg.sections[0],imageId:'fake',shadowOpacity:77,
      textureLayers:{
        matte:{enabled:true,opacity:7},
        sandy:{enabled:true,opacity:.43},
        glossy:{enabled:false,opacity:-5}
      }}]};
  const safe=normalizePlaymatAppearance(input);
  assert.deepEqual(safe.selectedSections,[2,5]);
  assert.equal(safe.sections[0].imageId,'');
  assert.equal(safe.sections[0].shadowOpacity,1);
  assert.equal(safe.sections[0].textureLayers.matte.opacity,1);
  assert.equal(safe.sections[0].textureLayers.sandy.opacity,.43);
  assert.equal(safe.sections[0].textureLayers.sandy.enabled,true);
  assert.equal(safe.sections[0].textureLayers.glossy.enabled,false);
  assert.equal(safe.sections[0].textureLayers.glossy.opacity,0);
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

test('legacy single-texture settings migrate to independent matte, sandy and glossy controls',()=>{
  const input=defaultPlaymatAppearance();
  const old=[
    {texture:'matte-glossy',textureOpacity:.23},
    {texture:'sandy',textureOpacity:.72},
    {texture:'none',textureOpacity:.4},
    {texture:'glossy',textureOpacity:.58}
  ];
  const migrated=normalizePlaymatAppearance({...input,sections:old});
  for(const [index,kind] of ['matte-glossy','sandy','none','glossy'].entries()){
    const layers=migrated.sections[index].textureLayers;
    assert.equal(layers.matte.enabled,kind==='matte-glossy');
    assert.equal(layers.sandy.enabled,kind==='sandy');
    assert.equal(layers.glossy.enabled,kind==='glossy'||kind==='matte-glossy');
    for(const layer of Object.values(layers))assert.equal(layer.opacity,old[index].textureOpacity);
  }
  const updated=defaultPlaymatAppearance();
  updated.sections[3].textureLayers.matte.enabled=false;
  assert.equal(updated.sections[2].textureLayers.matte.enabled,true);
  assert.deepEqual(normalizePlaymatAppearance(updated),updated);
});

test('multi-texture opacity sanitizes invalid values without disabling valid textures',()=>{
  const input={...defaultPlaymatAppearance(),sections:[
    {textureLayers:{
      matte:{enabled:false,opacity:-4},
      sandy:{enabled:true,opacity:5},
      glossy:{enabled:true,opacity:Infinity}
    }},
  ]};
  const layers=normalizePlaymatAppearance(input).sections[0].textureLayers;
  assert.deepEqual(layers.matte,{enabled:false,opacity:0});
  assert.deepEqual(layers.sandy,{enabled:true,opacity:1});
  assert.deepEqual(layers.glossy,{enabled:true,opacity:.18});
});

test('background image modes preserve independent section images and a separate full-mat image',()=>{
  const config=defaultPlaymatAppearance();
  assert.equal(config.imageMode,'repeat');
  assert.equal(config.spanningImageId,'');
  const images={
    bg_repeat0:'data:image/png;base64,aGVsbG8=',
    bg_repeat1:'https://example.com/second.webp',
    bg_continuous:'data:image/jpeg;base64,aGVsbG8='
  };
  const sections=config.sections.map((section,index)=>({
    ...section,imageId:index===0?'bg_repeat0':index===1?'bg_repeat1':''
  }));
  const span=normalizePlaymatAppearance({
    ...config,images,sections,imageMode:'span',spanningImageId:'bg_continuous'
  });
  assert.equal(span.imageMode,'span');
  assert.equal(span.spanningImageId,'bg_continuous');
  assert.equal(span.sections[0].imageId,'bg_repeat0');
  assert.equal(span.sections[1].imageId,'bg_repeat1');
  assert.equal(span.sections[5].textureLayers.matte.enabled,true);
  assert.equal(span.sections[5].innerShadow,true);
  assert.equal(span.sections[5].innerBevel,true);
  const repeated=normalizePlaymatAppearance({...span,imageMode:'repeat'});
  assert.equal(repeated.imageMode,'repeat');
  assert.equal(repeated.spanningImageId,'bg_continuous');
  assert.deepEqual(repeated.sections,span.sections);
  assert.deepEqual(repeated.images,images);
});

test('invalid spanning backgrounds cannot bypass image normalization and legacy preferences stay in repeat mode',()=>{
  const cfg=defaultPlaymatAppearance();
  const invalid=normalizePlaymatAppearance({...cfg,imageMode:'span',
    spanningImageId:'bad',
    images:{bad:'javascript:alert(1)',bg_good:'https://example.com/valid.jpg'}
  });
  assert.equal(invalid.imageMode,'span');
  assert.equal(invalid.spanningImageId,'');
  assert.equal(invalid.images.bg_good,'https://example.com/valid.jpg');
  assert.equal(invalid.images.bad,undefined);
  assert.equal(normalizePlaymatAppearance({...cfg,imageMode:'anywhere'}).imageMode,'repeat');
  assert.equal(normalizePlaymatAppearance({sections:cfg.sections}).imageMode,'repeat');
});

test('a viewer\'s custom playmat affects only their own seat, including in opponent view',()=>{
  const own=defaultPlaymatAppearance();
  own.sections[0].innerShadow=false;
  own.sections[4].outerBevel=true;
  own.sections[7].textureLayers.matte.opacity=.93;
  own.images.bg_personal='data:image/png;base64,aGVsbG8=';
  own.imageMode='span';
  own.spanningImageId='bg_personal';
  for(let viewer=0;viewer<12;viewer++){
    assert.equal(playmatAppearanceForSeat(own,viewer,viewer),own);
    for(let other=0;other<12;other++){
      if(other===viewer)continue;
      const remote=playmatAppearanceForSeat(own,viewer,other);
      const baseline=defaultPlaymatAppearance();
      assert.deepEqual(remote,baseline,'Other seats must retain built-in look');
      assert.equal(remote.spanningImageId,'');
      assert.equal(remote.sections[7].textureLayers.matte.opacity,.18);
    }
  }
  assert.equal(own.spanningImageId,'bg_personal','Isolation must not mutate user preferences');
});

test('personal merged snapping never applies to other players\' merged center sections',()=>{
  const base=createGame('tcg');
  const first=applyCommand(base,c('SET_CENTER_MERGE',{seat:0,boundary:0,merged:true}));
  const state=applyCommand(first,c('SET_CENTER_MERGE',{seat:1,boundary:0,merged:true}));
  const a=tcgMatCells(0).find(z=>z.column===1&&z.row===0);
  const b=tcgMatCells(1).find(z=>z.column===1&&z.row===0);
  assert.ok(tcgSnapPoint(a.x,a.y,state.centerMerges,true,0));
  assert.equal(tcgSnapPoint(b.x,b.y,state.centerMerges,true,0),null);
  assert.ok(tcgSnapPoint(b.x,b.y,state.centerMerges,true,1));
  const remote=applyCommand(state,c('MOVE',{id:'hero-a',x:b.x+8,y:b.y+6,snapMerged:true,snapMergedSeat:0})).objects.find(z=>z.id==='hero-a');
  assert.ok(Math.hypot(remote.x-(b.x+8),remote.y-(b.y+6))<1e-5,'Opponent merged section must remain freeform');
  const self=applyCommand(state,c('MOVE',{id:'hero-a',x:a.x+8,y:a.y+6,snapMerged:true,snapMergedSeat:0})).objects.find(z=>z.id==='hero-a');
  assert.ok(Math.hypot(self.x-(a.x+8),self.y-(a.y+6))>2,'Local merged section uses user setting');
  const other=tcgMatCells(1).find(z=>z.column===0&&z.row===2);
  assert.ok(tcgSnapPoint(other.x+3,other.y+3,state.centerMerges,true,0),'Unmerged sections always snap');
});

test('Sword and Shield are mutually exclusive and toggle per opponent',()=>{
  assert.equal(toggleOpponentRelation(null,'enemy'),'enemy');
  assert.equal(toggleOpponentRelation('enemy','enemy'),null);
  assert.equal(toggleOpponentRelation(null,'ally'),'ally');
  assert.equal(toggleOpponentRelation('ally','ally'),null);
  assert.equal(toggleOpponentRelation('enemy','ally'),'ally');
  assert.equal(toggleOpponentRelation('ally','enemy'),'enemy');
  const bySeat=new Map();
  bySeat.set(2,toggleOpponentRelation(bySeat.get(2)??null,'enemy'));
  bySeat.set(5,toggleOpponentRelation(bySeat.get(5)??null,'ally'));
  bySeat.set(2,toggleOpponentRelation(bySeat.get(2)??null,'enemy'));
  assert.equal(bySeat.get(2),null);
  assert.equal(bySeat.get(5),'ally');
});

test('Shield aligns ally beside viewer and facing the same direction at every seat',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const rotation=viewerTableRotation(viewer);
    const project=(p)=>{
      const dx=p.x-BOARD_CENTER,dy=p.y-BOARD_CENTER;
      return {x:Math.cos(rotation)*dx-Math.sin(rotation)*dy,
        y:Math.sin(rotation)*dx+Math.cos(rotation)*dy};
    };
    for(let other=0;other<12;other++){
      if(other===viewer)continue;
      const layout=alliedMatLayout(viewer,other);
      const a=project(layout.player),b=project(layout.opponent);
      assert.ok(Math.abs(a.y-TCG_MAT_HEIGHT/2)<1e-8,'Viewer remains at lower half');
      assert.ok(Math.abs(b.y-a.y)<1e-8,'Both players occupy same screen side');
      assert.ok(Math.abs(a.x+(TCG_MAT_WIDTH+ALLY_MAT_GAP)/2)<1e-8);
      assert.ok(Math.abs(b.x-(TCG_MAT_WIDTH+ALLY_MAT_GAP)/2)<1e-8);
      assert.ok(b.x-a.x>=TCG_MAT_WIDTH,'Playmats must not overlap');
      const viewerRotation=tcgMatOrigin(viewer).angle+layout.player.rotation+rotation;
      const allyRotation=tcgMatOrigin(other).angle+layout.opponent.rotation+rotation;
      const normalized=(value)=>Math.atan2(Math.sin(value),Math.cos(value));
      assert.ok(Math.abs(normalized(viewerRotation))<1e-8,'Viewer upright');
      assert.ok(Math.abs(normalized(allyRotation))<1e-8,'Ally faces same direction');
      const enemy=opposingMatLayout(viewer,other);
      const enemyPoint=project(enemy.opponent);
      assert.ok(enemyPoint.y<0,'Enemy remains on opposite side');
    }
  }
});

test('every Sword enemy remains across from the player, including when an ally is selected',()=>{
  const norm=n=>Math.atan2(Math.sin(n),Math.cos(n));
  for(let viewer=0;viewer<12;viewer++){
    const boardRotation=viewerTableRotation(viewer);
    const project=point=>{
      const x=point.x-BOARD_CENTER,y=point.y-BOARD_CENTER;
      return {x:x*Math.cos(boardRotation)-y*Math.sin(boardRotation),
        y:x*Math.sin(boardRotation)+y*Math.cos(boardRotation)};
    };
    const rivals=Array.from({length:12},(_,seat)=>seat).filter(seat=>seat!==viewer);
    const relations=Object.fromEntries(rivals.map((seat,index)=>
      [seat,index%3===0?'ally':index%3===1?'enemy':null]));
    for(const selected of rivals){
      const layout=groupedMatchupLayout(viewer,selected,relations);
      assert.ok(layout.mats.has(viewer));
      assert.ok(layout.mats.has(selected));
      const all=[viewer,...layout.enemySeats,...layout.allySeats];
      assert.equal(new Set(all).size,all.length);
      assert.equal(layout.columns,Math.max(layout.enemySeats.length,layout.allySeats.length+1));
      const own=project(layout.mats.get(viewer));
      assert.ok(Math.abs(own.y-TCG_MAT_HEIGHT/2)<1e-8);
      for(const enemy of layout.enemySeats){
        const target=layout.mats.get(enemy);
        const {y}=project(target);
        assert.ok(Math.abs(y+TCG_MAT_HEIGHT/2)<1e-8,'Swords always on opposing half');
        const angle=tcgMatOrigin(enemy).angle+target.rotation+boardRotation;
        assert.ok(Math.abs(norm(angle-Math.PI))<1e-8,'Sword enemy faces player');
      }
      for(const ally of layout.allySeats){
        const target=layout.mats.get(ally);
        const {y}=project(target);
        assert.ok(Math.abs(y-TCG_MAT_HEIGHT/2)<1e-8,'Shields beside viewer');
        const angle=tcgMatOrigin(ally).angle+target.rotation+boardRotation;
        assert.ok(Math.abs(norm(angle))<1e-8,'Shields face same direction');
      }
      for(const side of [layout.enemySeats,[viewer,...layout.allySeats]]){
        const xs=side.map(seat=>project(layout.mats.get(seat)).x).sort((a,b)=>a-b);
        for(let i=1;i<xs.length;i++){
          assert.ok(xs[i]-xs[i-1]>=TCG_MAT_WIDTH+ALLY_MAT_GAP-1e-8,
            'Mats on the same side must not overlap');
        }
      }
    }
  }
});

test('enemy/neutral matchup placement never inherits former ally position',()=>{
  for(let viewer=0;viewer<12;viewer++){
    for(let opposite=0;opposite<12;opposite++){
      if(viewer===opposite)continue;
      const original=opposingMatLayout(viewer,opposite);
      assert.deepEqual(matchupMatLayout(viewer,opposite,'enemy'),original);
      assert.deepEqual(matchupMatLayout(viewer,opposite,null),original);
      assert.deepEqual(matchupMatLayout(viewer,opposite,'ally'),alliedMatLayout(viewer,opposite));
      const afterAlly=matchupMatLayout(viewer,opposite,'enemy');
      assert.deepEqual(afterAlly,original,'Sword restores exactly original opposing coordinates');
    }
  }
});

test('Sword and Shield are centered directly on each opponent Hand-bottom line',()=>{
  const sword=opponentRelationButtonPosition('enemy');
  const shield=opponentRelationButtonPosition('ally');
  assert.equal((sword.x+shield.x)/2,0,'Symmetrical spacing');
  assert.equal(sword.x,-OPPONENT_RELATION_BUTTON_OFFSET);
  assert.equal(shield.x,OPPONENT_RELATION_BUTTON_OFFSET);
  assert.equal(sword.y,TCG_HAND_BOTTOM_LINE_Y);
  assert.equal(shield.y,TCG_HAND_BOTTOM_LINE_Y);
  assert.equal(OPPONENT_RELATION_BUTTON_RADIUS,16);
  assert.ok(shield.x-sword.x>=2*OPPONENT_RELATION_BUTTON_HIT_RADIUS,
    'Both controls remain independently clickable');
  // Enemy seats also use their own local Hand-bottom, not screen-bottom.
  for(const choice of ['enemy','ally']){
    assert.deepEqual(opponentRelationButtonPosition(choice,true),
      opponentRelationButtonPosition(choice,false));
  }
  for(let viewer=0;viewer<12;viewer++){
    const selected=(viewer+1)%12;
    const layout=groupedMatchupLayout(viewer,selected,{
      [(viewer+2)%12]:'enemy',[(viewer+3)%12]:'ally'
    });
    for(const target of layout.mats.keys()){
      const ownsEye=target===viewer;
      const ownsRelationshipButtons=target!==viewer;
      assert.notEqual(ownsEye,ownsRelationshipButtons);
      if(ownsRelationshipButtons){
        const relation=target===(viewer+2)%12?'enemy':target===(viewer+3)%12?'ally':null;
        assert.equal(toggleOpponentRelation(relation,'enemy'),relation==='enemy'?null:'enemy');
      }
    }
  }
});

test('all controls use the owning mat orientation and enemies remain above divider',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const others=Array.from({length:12},(_,seat)=>seat).filter(seat=>seat!==viewer);
    const relations=Object.fromEntries(others.map((seat,index)=>
      [seat,index%3===0?'enemy':index%3===1?'ally':null]));
    for(const selected of others){
      const layout=groupedMatchupLayout(viewer,selected,relations);
      const boardRotation=viewerTableRotation(viewer);
      for(const [seat,target] of layout.mats){
        const angle=tcgMatOrigin(seat).angle+target.rotation+boardRotation;
        const centerY=(target.x-BOARD_CENTER)*Math.sin(boardRotation)+
          (target.y-BOARD_CENTER)*Math.cos(boardRotation);
        const buttons=seat===viewer
          ?[viewButtonPosition('eye'),viewButtonPosition('castle')]
          :[opponentRelationButtonPosition('enemy',relations[seat]!=='ally'),
             opponentRelationButtonPosition('ally',relations[seat]!=='ally')];
        for(const button of buttons){
          assert.equal(button.y,TCG_HAND_BOTTOM_LINE_Y);
          const screenY=centerY+button.x*Math.sin(angle)+button.y*Math.cos(angle);
          if(seat!==viewer&&relations[seat]!=='ally'){
            assert.ok(screenY+VIEW_BUTTON_HIT_RADIUS<0,
              'Enemy controls stay above the battlefield divide');
          }else{
            assert.ok(screenY-VIEW_BUTTON_HIT_RADIUS>0,
              'Player and ally controls stay below the battlefield divide');
          }
        }
      }
    }
  }
});

test('Castle lineup shows marked allies and enemies only, never neutral/unmarked opponents',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const candidates=Array.from({length:12},(_,seat)=>seat).filter(seat=>seat!==viewer);
    const relations={
      [candidates[1]]:'enemy',
      [candidates[3]]:'ally',
      [candidates[5]]:'enemy',
      [candidates[7]]:null
    };
    const castle=groupedMatchupLayout(viewer,null,relations);
    assert.deepEqual([...castle.mats.keys()].sort((a,b)=>a-b),
      [viewer,candidates[1],candidates[3],candidates[5]].sort((a,b)=>a-b));
    assert.deepEqual(castle.enemySeats,[candidates[1],candidates[5]]);
    assert.deepEqual(castle.allySeats,[candidates[3]]);
    assert.equal(castle.columns,2);
    assert.equal(castle.mats.has(candidates[0]),false);
    assert.equal(castle.mats.has(candidates[7]),false);
    assert.equal(castle.mats.has(candidates[9]),false);
    const eye=groupedMatchupLayout(viewer,candidates[9],relations);
    assert.ok(eye.mats.has(candidates[9]),
      'Existing Eye targeting still displays the selected unclassified opponent');
    assert.ok(eye.mats.has(candidates[1]),'Sword-marked enemies still visible in Eye mode');
    assert.ok(eye.mats.has(candidates[3]),'Shield-marked allies still visible in Eye mode');
  }
});
test('Castle view with no classifications shows only own playmat',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const castle=groupedMatchupLayout(viewer,null,{});
    assert.deepEqual([...castle.mats.keys()],[viewer]);
    assert.deepEqual(castle.enemySeats,[]);
    assert.deepEqual(castle.allySeats,[]);
    assert.equal(castle.columns,1);
    const selected=groupedMatchupLayout(viewer,(viewer+1)%12,{});
    assert.equal(selected.mats.size,2,'Eye mode retains original selected-opponent behavior');
  }
});

test('Eye, Castle, Sword and Shield are centered ON the actual bottom line of HAND',()=>{
  assert.equal(TCG_ZONE_LABELS[3][1],'HAND');
  const hand=tcgMatCells(0).find(cell=>cell.row===3&&cell.column===1);
  assert.ok(hand,'The bottom middle pocket must be HAND');
  const local=tcgMatLocal(hand.x,hand.y,0);
  const handBottom=local.y+hand.height/2;
  assert.ok(Math.abs(handBottom-TCG_HAND_BOTTOM_LINE_Y)<1e-8);
  assert.equal(handBottom,TCG_MAT_HEIGHT/2);
  const pairs=[
    [viewButtonPosition('eye'),viewButtonPosition('castle')],
    [opponentRelationButtonPosition('enemy'),opponentRelationButtonPosition('ally')]
  ];
  for(const [left,right] of pairs){
    assert.equal(left.y,handBottom,'Circle CENTER, not its edge, must sit on the line');
    assert.equal(right.y,handBottom,'Circle CENTER, not its edge, must sit on the line');
    assert.equal(left.x,-right.x,'Pair evenly centered above Hand midpoint');
    assert.ok(Math.abs((left.x+right.x)/2-local.x)<1e-8);
    assert.equal(left.x,-PLAYMAT_BOTTOM_BUTTON_OFFSET);
    assert.equal(right.x,PLAYMAT_BOTTOM_BUTTON_OFFSET);
    assert.ok(right.x-left.x>=2*VIEW_BUTTON_HIT_RADIUS);
  }
  assert.equal(PLAYMAT_BOTTOM_BUTTON_Y,handBottom);
  assert.equal(VIEW_BUTTON_CASTLE_OFFSET,PLAYMAT_BOTTOM_BUTTON_OFFSET);
  assert.equal(VIEW_BUTTON_RADIUS,OPPONENT_RELATION_BUTTON_RADIUS);
  assert.equal(VIEW_BUTTON_HIT_RADIUS,OPPONENT_RELATION_BUTTON_HIT_RADIUS);
});

test('every seat anchors button centers to its own Hand lower boundary, including upside-down enemies',()=>{
  for(let viewer=0;viewer<12;viewer++){
    const rotation=viewerTableRotation(viewer);
    const others=Array.from({length:12},(_,seat)=>seat).filter(seat=>seat!==viewer);
    const relations={
      [others[0]]:'ally',[others[1]]:'enemy',
      [others[2]]:'ally',[others[3]]:'enemy'
    };
    for(const selected of [null,...others]){
      const layout=groupedMatchupLayout(viewer,selected,relations);
      for(const [seat,target] of layout.mats){
        const localHandCell=tcgMatCells(seat).find(cell=>cell.row===3&&cell.column===1);
        const localHand=tcgMatLocal(localHandCell.x,localHandCell.y,seat);
        const localBottom=localHand.y+localHandCell.height/2;
        const buttons=seat===viewer
          ?[viewButtonPosition('eye'),viewButtonPosition('castle')]
          :[opponentRelationButtonPosition('enemy',relations[seat]!=='ally'),
             opponentRelationButtonPosition('ally',relations[seat]!=='ally')];
        const angle=tcgMatOrigin(seat).angle+target.rotation+rotation;
        const centerDy=(target.x-BOARD_CENTER)*Math.sin(rotation)+
          (target.y-BOARD_CENTER)*Math.cos(rotation);
        for(const button of buttons){
          assert.ok(Math.abs(button.y-localBottom)<1e-8,
            'Player-perspective HAND bottom, not screen bottom');
          const actualScreenY=centerDy+button.x*Math.sin(angle)+button.y*Math.cos(angle);
          const expectedScreenY=centerDy+localBottom*Math.cos(angle);
          assert.ok(Math.abs(actualScreenY-expectedScreenY)<1e-8);
          // Half each circle is ABOVE the Hand-bottom border and half BELOW.
          assert.ok(button.y-VIEW_BUTTON_RADIUS<localBottom);
          assert.ok(button.y+VIEW_BUTTON_RADIUS>localBottom);
        }
      }
    }
  }
});
