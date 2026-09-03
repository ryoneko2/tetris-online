const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const rooms = new Map();
const MAX_PLAYERS = 4;
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'
};
function send(ws,msg){ if(!ws||ws.readyState!==WebSocket.OPEN)return false; try{ if(ws.bufferedAmount>1024*1024)return false; ws.send(JSON.stringify(msg)); return true;}catch(e){return false;} }
function makePassword(){let p;do{p=String(Math.floor(100000+Math.random()*900000));}while(rooms.has(p));return p;}
function roomInfo(room){
  const players={}; room.players.forEach((ws,r)=>players[r]=true);
  return {type:'roomStatus',count:room.players.size,playerCount:room.target,scores:room.scores,alive:room.alive,players};
}
function broadcast(room,msg,exclude=null){room.players.forEach(ws=>{if(ws!==exclude)send(ws,msg);});}
function removeFromRoom(ws,notify=true){
  const password=ws.room; if(!password)return; const room=rooms.get(password); ws.room=null; if(!room)return;
  if(room.players.has(ws)) room.players.delete(ws);
  if(notify) broadcast(room,{type:'peerLeft',player:ws.role});
  if(room.players.size===0){rooms.delete(password);return;}
  if(room.host===ws) room.host=[...room.players.keys()][0];
  if(room.started) checkWinner(room);
  else broadcast(room,roomInfo(room));
}
function checkWinner(room){
  if(!room.started||room.roundOver)return;
  const alive=[...room.players.values()].filter(ws=>room.alive[ws.role]!==false).map(ws=>ws.role);
  if(alive.length>1)return;
  if(alive.length===0)return;
  const winner=alive[0]; room.roundOver=true; room.scores[winner]=(room.scores[winner]||0)+1;
  const matchOver=room.scores[winner]>=2;
  if(matchOver) room.matchWinner=winner;
  const msg={type:'roundOver',winner,scores:room.scores,alive:room.alive,matchOver,matchWinner:matchOver?winner:0};
  broadcast(room,msg);
}
function startRound(room){
  room.roundOver=false; room.ready.clear(); room.matchWinner=0;
  room.players.forEach((role,ws)=>room.alive[role]=true);
  broadcast(room,{type:'startRound',scores:room.scores,alive:room.alive});
}
function startMatch(room){
  if(room.started || room.players.size<room.target)return;
  room.started=true; room.roundOver=false; room.ready.clear();
  room.players.forEach((role,ws)=>room.alive[role]=true);
  room.players.forEach((role,ws)=>send(ws,{type:'start',role,playerCount:room.target,scores:room.scores,alive:room.alive}));
}
const server=http.createServer((req,res)=>{
  const urlPath=decodeURIComponent((req.url||'/').split('?')[0]);
  const relative=urlPath==='/'?'index.html':urlPath.replace(/^\/+/, '');
  const filePath=path.resolve(ROOT,relative);
  if(!filePath.startsWith(ROOT+path.sep)&&filePath!==path.resolve(ROOT,'index.html')){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(filePath,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not Found');}
    const ext=path.extname(filePath).toLowerCase();res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'});res.end(data);});
});
const wss=new WebSocket.Server({server});
wss.on('connection',ws=>{
  ws.room=null;ws.role=0;
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return send(ws,{type:'error',message:'不正なメッセージです。'});}
    if(msg.type==='create'){
      removeFromRoom(ws,false);let password=/^\d{6}$/.test(String(msg.password||''))&&!rooms.has(String(msg.password))?String(msg.password):makePassword();
      let target=Math.max(2,Math.min(MAX_PLAYERS,Number(msg.playerCount)||2));
      const room={host:ws,target,players:new Map(),scores:{},alive:{},ready:new Set(),started:false,roundOver:false,matchWinner:0};
      room.players.set(ws,1);room.scores[1]=0;room.alive[1]=true;rooms.set(password,room);ws.room=password;ws.role=1;
      send(ws,{type:'roomJoined',role:1,room:password,password,playerCount:target,scores:room.scores,alive:room.alive});return;
    }
    if(msg.type==='join'){
      const password=String(msg.password||'').trim(),room=rooms.get(password);
      if(!/^\d{6}$/.test(password)||!room)return send(ws,{type:'error',message:'そのパスワードの部屋はありません。'});
      if(room.started)return send(ws,{type:'error',message:'この対戦はすでに開始しています。'});
      // 参加者側が指定した人数がホスト設定より大きい場合は、開始前に部屋を拡張する。
      // これにより3人・4人対戦で、ホスト側の古い設定や人数指定のズレが原因で
      // 2人目の参加後に「満員」になる問題を防ぐ。
      const requestedCount=Math.max(2,Math.min(MAX_PLAYERS,Number(msg.playerCount)||0));
      if(requestedCount>room.target) room.target=requestedCount;
      if(room.players.size>=room.target)return send(ws,{type:'error',message:`この部屋は満員です（${room.target}人対戦）。`});
      removeFromRoom(ws,false);let role=2;while(room.players.has(role))role++;
      room.players.set(ws,role);room.scores[role]=room.scores[role]||0;room.alive[role]=true;ws.room=password;ws.role=role;
      send(ws,{type:'roomJoined',role,room:password,password,playerCount:room.target,scores:room.scores,alive:room.alive});
      broadcast(room,roomInfo(room));
      if(room.players.size>=room.target)startMatch(room);
      return;
    }
    if(!ws.room)return send(ws,{type:'error',message:'先に部屋へ参加してください。'});
    const room=rooms.get(ws.room);if(!room||!room.players.has(ws))return;
    if(msg.type==='playerState'){
      if(Number(msg.player)!==ws.role||!msg.state||typeof msg.state!=='object')return;
      broadcast(room,{type:'playerState',player:ws.role,state:msg.state},ws);return;
    }
    if(msg.type==='attack'){
      const amount=Math.max(0,Math.min(40,Number(msg.amount)||0));if(amount>0)broadcast(room,{type:'attack',player:ws.role,amount},ws);return;
    }
    if(msg.type==='inputState' || msg.type==='input'){
      // 互換用。各プレイヤーのローカル操作は即時なので、他人のキー入力をゲーム処理には使わない。
      return;
    }
    if(msg.type==='playerDead'){
      room.alive[ws.role]=false;broadcast(room,{type:'playerDead',player:ws.role},ws);checkWinner(room);return;
    }
    if(msg.type==='nextRound'){
      if(!room.roundOver)return;
      if(room.matchWinner)return send(ws,{type:'matchOver',winner:room.matchWinner,scores:room.scores});
      room.ready.add(ws.role);
      if(room.ready.size>=room.players.size)startRound(room);return;
    }
  });
  ws.on('close',()=>removeFromRoom(ws,true));ws.on('error',()=>removeFromRoom(ws,true));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Tetris オンライン用サーバーが http://localhost:${PORT} で起動しました。`));
