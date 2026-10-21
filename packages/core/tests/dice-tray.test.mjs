import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyCommand,replay,isTcgSideBoxDrop,tcgMatWorld,validThrowQuaternion} from '../src/index.ts';
import {stepDicePhysics,throwVelocity}
  from '../../../apps/web/src/lib/dicePhysics.ts';
import {dieGeometry,convexShape}
  from '../../../apps/web/src/lib/Dice3D.ts';
import * as CANNON from 'cannon-es';
const command=(id,throws,seat=0)=>({id,actor:'local',
  type:'THROW_TRAY',payload:{seat,throws}});
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-5,msg+': '+a+' vs '+b);
const body=(changes={})=>({
  x:120,y:120,vx:0,vy:0,z:0,vz:0,
  angle:0,spin:0,radius:15,mass:1,leftTrayExited:true,...changes
});
test('mixed tray throw creates just ONE result per die type with full rolled totals',()=>{
  const start=createGame('tcg');
  const throws=[
    {sides:2,rolls:[1,2,1,1],x:2030,y:2010,rotation:180},
    {sides:4,rolls:[2],x:2060,y:2100,rotation:40},
    {sides:6,rolls:Array(20).fill(6),x:2300,y:2350,rotation:275},
    {sides:100,rolls:[42,88],x:2240,y:2320,rotation:120}
  ];
  const action=command('multi-tray',throws);
  const state=applyCommand(start,action);
  const landed=state.objects.filter(o=>o.throwDice);
  assert.equal(landed.length,4,'only one physical item per selected denomination');
  assert.equal(landed[0].throwQuantity,4);
  assert.deepEqual(landed[0].throwRolls,[1,2,1,1]);
  assert.equal(landed[0].throwTotal,3,'Heads are counted separately from tails');
  assert.equal(landed[2].throwQuantity,20);
  assert.equal(landed[2].throwTotal,120);
  assert.equal(landed[3].throwTotal,130);
  assert.ok(state.message.includes('D06 ×20 = 120'));
  assert.deepEqual(state,replay(start,[action]));
});
test('throw validation rejects impossible faces, duplicate types and >20 rolls',()=>{
  const state=createGame('tcg');
  const normal={sides:6,rolls:[1,6],x:2000,y:2200,rotation:40};
  assert.throws(()=>applyCommand(state,command('invalid-face',[{...normal,rolls:[7]}])),/Invalid dice result/);
  assert.throws(()=>applyCommand(state,command('no-coin',[{...normal,sides:2,rolls:[3]}])),/Invalid dice result/);
  assert.throws(()=>applyCommand(state,command('over-20',[{...normal,rolls:Array(21).fill(2)}])),/Invalid dice result/);
  assert.throws(()=>applyCommand(state,command('duplicated',[normal,normal])),/duplicate die/i);
  assert.throws(()=>applyCommand(state,command('invalid-position',[{...normal,x:-1}])),/landing/);
});
test('die landing with its center on a card attaches without snapping',()=>{
  const initial=createGame('tcg');
  const card=initial.objects.find(o=>o.id==='hero-a');
  const x=card.x+9.375,y=card.y-6.875;
  const action=command('on-card',[{sides:8,rolls:[3,7],x,y,rotation:29}]);
  let state=applyCommand(initial,action);
  const die=state.objects.find(o=>o.throwDice);
  near(die.x,x,'landing exact X');near(die.y,y,'landing exact Y');
  assert.equal(die.carrierId,card.id);
  state=applyCommand(state,{id:'card-shift',actor:'local',
    type:'MOVE',payload:{id:card.id,x:card.x+50,y:card.y+50}});
  const carried=state.objects.find(o=>o.id===die.id);
  const movedCard=state.objects.find(o=>o.id===card.id);
  near(carried.x-movedCard.x,x-card.x,'carried X offset');
  near(carried.y-movedCard.y,y-card.y,'carried Y offset');
});
test('physics reflects dice from the screen bounds',()=>{
  const d=body({x:14,y:14,vx:-600,vy:-500});
  stepDicePhysics([d],1/60,800,600,[]);
  assert.ok(d.x>=17&&d.y>=17);
  assert.ok(d.vx>0&&d.vy>0);
});
test('dice collide and exchange momentum rather than passing through',()=>{
  const a=body({x:100,y:160,vx:440});
  const b=body({x:127,y:160,vx:-100});
  stepDicePhysics([a,b],1/60,700,500,[]);
  assert.ok(a.vx<440,'first die loses momentum');
  assert.ok(b.vx>0,'second die rebounds');
  assert.ok(Math.hypot(b.x-a.x,b.y-a.y)>=30);
});
test('tray rims prevent entry once the dice have exited the source tray',()=>{
  const tray={left:250,top:100,right:350,bottom:210};
  const die=body({x:237,y:155,vx:900,vy:0});
  stepDicePhysics([die],1/60,800,600,[tray]);
  assert.ok(die.x<=tray.left-15+.1);
  assert.ok(die.vx<0,'die rebounds from the tray wall');
});
test('source tray allows dice to escape but blocks subsequent re-entry',()=>{
  const tray={left:95,top:95,right:160,bottom:170};
  const die=body({x:120,y:130,vx:1000,vy:0,leftTrayExited:false});
  for(let i=0;i<7;i++)stepDicePhysics([die],1/60,800,600,[tray]);
  assert.ok(die.leftTrayExited);
  die.x=180;die.y=130;die.vx=-700;
  stepDicePhysics([die],1/60,800,600,[tray]);
  assert.ok(die.vx>0,'returning into source tray must bounce away');
});
test('faster throws travel farther before friction and collisions',()=>{
  const slow=throwVelocity(50,20,280);
  const fast=throwVelocity(350,150,280);
  assert.ok(fast.speed>slow.speed);
  assert.ok(fast.speed<=1120);
});

test('moving dice rebound from settled dice while settled pieces stay fixed',()=>{
  const flying=body({x:100,y:160,vx:580});
  const fixed=body({x:128,y:160,fixed:true,mass:1e9});
  stepDicePhysics([flying,fixed],1/60,900,600,[]);
  assert.ok(flying.vx<0,'moving die should rebound');
  assert.equal(fixed.x,128,'settled die remains stationary');
  assert.equal(fixed.vx,0);
  assert.ok(fixed.fixed);
});

test('all physical dice produce distinct real 3D geometry and stable collision hulls',()=>{
  for(const sides of [2,4,6,8,10,12,20,100]){
    const geometry=dieGeometry(sides,20);
    const coordinates=geometry.getAttribute('position');
    assert.ok(coordinates.count>=12,'D'+sides+' is a real mesh');
    const zValues=new Set();
    for(let i=0;i<coordinates.count;i++)
      zValues.add(coordinates.getZ(i).toFixed(2));
    assert.ok(zValues.size>=2,'D'+sides+' has physical depth');
    if(sides!==2&&sides!==100){
      const hull=convexShape(geometry);
      assert.ok(hull.vertices.length>=4,'D'+sides+' has a convex rigid-body shape');
      assert.ok(hull.faces.length>=4,'D'+sides+' has independently collidable faces');
    }
    geometry.dispose();
  }
});

test('special dice have authentic 10 and 100 faceted, tumbling 3D surfaces',()=>{
  for(const [sides,faces] of [[10,20],[100,100]]){
    const geometry=dieGeometry(sides,20);
    const triangleCount=geometry.getAttribute('position').count/3;
    assert.equal(triangleCount,faces,
      'D'+sides+' should have geometry for its full physical faces');
    const hull=convexShape(geometry);
    assert.ok(hull.faces.length>=faces,'Every facet must participate in physical collision');
    geometry.dispose();
  }
});

test('actual 3D rigid bodies tumble in quaternion space and collide with a floor',()=>{
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,-1050)});
  const floor=new CANNON.Body({mass:0,shape:new CANNON.Plane()});
  world.addBody(floor);
  const mesh=dieGeometry(20,17);
  const die=new CANNON.Body({mass:1,shape:convexShape(mesh),
    angularDamping:.08,linearDamping:.15});
  die.position.set(0,0,80);
  die.velocity.set(110,43,205);
  die.angularVelocity.set(8,11,4);
  world.addBody(die);
  const initialRotation=die.quaternion.clone();
  for(let n=0;n<180;n++)world.step(1/60);
  assert.ok(die.position.z<75,'gravity returns the die toward the table');
  assert.ok(die.quaternion.x!==initialRotation.x||
    die.quaternion.y!==initialRotation.y||
    die.quaternion.z!==initialRotation.z,
    'all three axes tumble instead of merely rotating a 2D sprite');
  assert.ok(die.position.z>=0,'solid table constrains downward penetration');
  mesh.dispose();
});

test('reroll updates the SAME physical die and its center numeral, never clones it',()=>{
  const original=createGame('tcg');
  const card=original.objects.find(o=>o.id==='hero-a');
  const thrown=applyCommand(original,command('first-roll',[
    {sides:6,rolls:[1,2,3],x:card.x+7,y:card.y-12,rotation:0},
    {sides:2,rolls:[1],x:card.x+90,y:card.y+60,rotation:0}
  ]));
  const die=thrown.objects.find(o=>o.id==='first-roll-throw-0');
  assert.ok(die);
  assert.equal(die.throwTotal,6);
  const reroll={id:'again',type:'REROLL_DIE',actor:'local',
    payload:{id:die.id,rolls:[6,6,5],x:card.x+14.25,
      y:card.y-8.5,rotation:47}};
  const result=applyCommand(thrown,reroll);
  assert.equal(result.objects.length,thrown.objects.length);
  const updated=result.objects.find(o=>o.id===die.id);
  assert.deepEqual(updated.throwRolls,[6,6,5]);
  assert.equal(updated.throwTotal,17);
  assert.equal(updated.value,17);
  assert.equal(updated.throwQuantity,3);
  assert.equal(updated.rotation,47);
  assert.equal(updated.carrierId,card.id);
  assert.equal(updated.x,card.x+14.25);
  assert.deepEqual(result,replay(thrown,[reroll]));
  assert.ok(result.message.includes('Rerolled D06 ×3 = 17'));
});
test('reroll respects original quantity and actual die face count',()=>{
  const start=applyCommand(createGame('tcg'),
    command('rolled',[{sides:20,rolls:[19,20],x:2200,y:2100,rotation:0}]));
  const mk=rolls=>applyCommand(start,{id:'reroll',type:'REROLL_DIE',actor:'local',
    payload:{id:'rolled-throw-0',rolls,x:2100,y:2000,rotation:15}});
  assert.throws(()=>mk([19]),/preserve the selected dice quantity/);
  assert.throws(()=>mk([7,21]),/preserve the selected dice quantity/);
  assert.throws(()=>mk([2,4,5]),/preserve the selected dice quantity/);
  assert.deepEqual(mk([9,13]).objects.find(o=>o.id==='rolled-throw-0').throwRolls,[9,13]);
});

test('Cannon 3D dice collide with each other and exchange x momentum',()=>{
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,0)});
  const mat=new CANNON.Material('solid-die');
  world.addContactMaterial(new CANNON.ContactMaterial(mat,mat,{
    friction:.2,restitution:.7
  }));
  const geom=dieGeometry(6,16),shape=convexShape(geom);
  const a=new CANNON.Body({mass:1,material:mat,linearDamping:0,angularDamping:0,
    shape});
  const b=new CANNON.Body({mass:1,material:mat,linearDamping:0,angularDamping:0,
    shape});
  a.position.set(-35,0,25);b.position.set(35,0,25);
  a.velocity.set(80,0,0);b.velocity.set(-80,0,0);
  world.addBody(a);world.addBody(b);
  for(let i=0;i<120;i++)world.step(1/60);
  assert.ok(a.velocity.x<0,'first die must rebound after impact');
  assert.ok(b.velocity.x>0,'second die must rebound after impact');
  assert.ok(b.position.x>a.position.x,'dice must stay physically separated');
  geom.dispose();
});

test('left and right retractable storage boxes accept die deletion by exact center',()=>{
  const top=-(4*94+3*4)/2+94+4;
  for(const seat of [0,3,6,9]){
    for(const side of [-1,1]){
      const x=side*( (7*62+6*2+2*62+2*4)/2+62/2+3);
      const center=tcgMatWorld(x,top+55,seat);
      assert.equal(isTcgSideBoxDrop(center.x,center.y,seat),true,
        'box '+side+' should accept a die at seat '+seat);
    }
    const outside=tcgMatWorld(0,0,seat);
    assert.equal(isTcgSideBoxDrop(outside.x,outside.y,seat),false);
  }
});
test('real quaternion orientation survives a throw and successive reroll',()=>{
  const q=[0.14,-0.21,0.30,Math.sqrt(1-.14**2-.21**2-.30**2)];
  assert.ok(validThrowQuaternion(q));
  let state=applyCommand(createGame('tcg'),command('actual-3d',[
    {sides:12,rolls:[8],x:2100,y:2100,rotation:33,quaternion:q}
  ]));
  const die=state.objects.find(o=>o.id==='actual-3d-throw-0');
  assert.deepEqual(die.throwQuaternion,q,'landed die retains its real 3D orientation');
  const second=[0.2,0.3,0.4,Math.sqrt(1-.2**2-.3**2-.4**2)];
  state=applyCommand(state,{id:'actual-reroll',type:'REROLL_DIE',actor:'local',
    payload:{id:die.id,rolls:[11],x:2100,y:2100,rotation:17,quaternion:second}});
  assert.deepEqual(state.objects.find(o=>o.id===die.id).throwQuaternion,second);
});

test('3D tabletop dice stay precisely anchored across high-DPI render targets',async()=>{
  const {diceToCssTransform}=await import('../../../apps/web/src/lib/diceCoordinates.ts');
  // Pixi stage coordinates remain logical viewport pixels even when the
  // HTML canvas backing bitmap is 2x or 3x the viewport resolution.
  for(const dpr of [1,1.25,1.5,2,3]){
    const css={width:1280,height:720};
    const backing={width:css.width*dpr,height:css.height*dpr};
    const stage={width:1280,height:720};
    const t=diceToCssTransform(css.width,css.height,stage.width,stage.height);
    assert.deepEqual(t,{x:1,y:1},'DPR '+dpr+' must not displace the die');
    const center={x:445.5,y:230.25};
    assert.equal(center.x*t.x,center.x);
    assert.equal(center.y*t.y,center.y);
    assert.ok(backing.width>0);
  }
  assert.deepEqual(diceToCssTransform(960,540,1280,720),{x:.75,y:.75});
  assert.deepEqual(diceToCssTransform(1280,720,0,0),{x:1,y:1},
    'invalid resize must not create infinity-sized dice');
});
test('the original 8 dice source models stay in the two-column wooden drawer',async()=>{
  const {diceRackLocations}=await import('../../../apps/web/src/lib/diceCoordinates.ts');
  const from=diceRackLocations(-250,-95);
  assert.equal(from.length,8);
  assert.deepEqual([...new Set(from.map(p=>p.x))],[-262,-238]);
  for(let i=0;i<from.length;i++){
    const p=from[i];
    assert.equal(p.y,-54+Math.floor(i/2)*62);
    // The largest rack object has <10 tabletop-unit projected radius:
    // its model cannot cross the drawer's 62-unit outside boundary.
    assert.ok(Math.abs(p.x+250)+10<=31);
    for(let j=i+1;j<from.length;j++){
      const other=from[j];
      assert.ok(Math.hypot(p.x-other.x,p.y-other.y)>20,
        'two source dice must never overlap or swap slots');
    }
  }
});
