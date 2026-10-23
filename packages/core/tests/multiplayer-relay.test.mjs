import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import WebSocket from 'ws';

async function vacantPort(){
  const net=createServer();
  net.listen(0,'127.0.0.1');
  await once(net,'listening');
  const port=net.address().port;
  await new Promise(resolve=>net.close(resolve));
  return port;
}
async function waitFor(fn,timeout=8000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
    try{const value=await fn();if(value)return value;}catch{}
    await pause(70);
  }
  throw new Error('Timed out waiting for relay');
}
async function connect(url,room,actor,token){
  const socket=new WebSocket(url);
  let joined=null;
  const snapshot=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Join timed out')),6000);
    socket.on('error',reject);
    socket.on('open',()=>socket.send(JSON.stringify({
      type:'join',room,actor,token,kind:'sandbox',seat:0,name:actor
    })));
    socket.on('message',raw=>{
      const data=JSON.parse(String(raw));
      if(data.type==='joined')joined=data;
      if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}
      if(data.type==='snapshot'){clearTimeout(timer);resolve(data);}
    });
  });
  return {socket,joined,snapshot};
}
function eventOfType(socket,type,timeout=5000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.off('message',listener);reject(new Error('Timed out waiting for '+type));},timeout);
    function listener(raw){
      const data=JSON.parse(String(raw));
      if(data.type===type){clearTimeout(timer);socket.off('message',listener);resolve(data);}
    }
    socket.on('message',listener);
  });
}
test('multiplayer rooms preserve individual seats and game state across disconnect and restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'sennet-multi-'));
  const port=await vacantPort();
  const url='ws://127.0.0.1:'+port;
  const room='pickup_'+process.pid;
  const first='player_alpha',second='player_beta';
  const firstToken='a'.repeat(64),secondToken='b'.repeat(64);
  let server;
  t.after(async()=>{server?.kill('SIGTERM');await rm(directory,{force:true,recursive:true});});
  async function start(){
    server=spawn('npm',['run','start','-w','@sennet/server'],{
      cwd:process.cwd(),env:{...process.env,PORT:String(port),SENNET_DATA_DIR:directory},
      stdio:'ignore'
    });
    await waitFor(async()=>{const response=await fetch('http://127.0.0.1:'+port+'/health');return response.ok;});
  }
  await start();
  const a=await connect(url,room,first,firstToken);
  assert.equal(a.joined.seat,0);
  const b=await connect(url,room,second,secondToken);
  assert.equal(b.joined.seat,1);
  assert.equal(b.snapshot.state.players.length,2);
  b.socket.close();
  await once(b.socket,'close');
  const nextEvent=eventOfType(a.socket,'event');
  a.socket.send(JSON.stringify({type:'command',command:{
    id:'move_'+process.pid,actor:first,type:'NEXT_TURN',payload:{}
  }}));
  assert.equal((await nextEvent).event.seq,1);
  const disk=join(directory,room+'.json');
  const saved=await waitFor(async()=>{
    const value=JSON.parse(await readFile(disk,'utf8'));
    return value.state.turnSeat===1&&!value.state.players[1].online?value:null;
  });
  assert.equal(saved.state.players[0].seat,0);
  assert.equal(saved.state.players[1].seat,1);
  assert.equal(saved.identities[first]?.length,64);
  assert.equal(saved.identities[second]?.length,64);
  a.socket.close();await once(a.socket,'close');
  server.kill('SIGTERM');await once(server,'exit');
  await start();
  const revived=await connect(url,room,first,firstToken);
  assert.equal(revived.joined.seat,0);
  assert.equal(revived.snapshot.state.turnSeat,1);
  assert.equal(revived.snapshot.state.players[1].online,false);
  revived.socket.close();await once(revived.socket,'close');
  await assert.rejects(()=>connect(url,room,first,'c'.repeat(64)),/different browser identity/);
});
