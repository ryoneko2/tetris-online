const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const rooms = new Map();
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};

function send(ws,msg){ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(room,msg,except=null){ for(const p of room.players) if(p && p!==except) send(p.ws,msg); }
function snapshot(room){
  const scores={}; const alive={}; const names={};
  for(const p of room.players){ if(!p) continue; scores[p.role]=p.wins||0; alive[p.role]=p.alive!==false; names[p.role]=p.name||('PLAYER '+p.role); }
  return {scores,alive,names};
}
function roomStatus(room){
  const st=snapshot(room); return {type:'roomStatus',playerCount:room.playerCount,count:room.players.length,started:!!room.started,scores:st.scores,alive:st.alive,names:st.names};
}
function makePassword(){ let p; do p=String(Math.floor(100000+Math.random()*900000)); while(rooms.has(p)); return p; }
function cleanName(name,fallback){
  let s=String(name||'').trim().replace(/[<>]/g,'');
  if(!s) s=fallback;
  return Array.from(s).slice(0,16).join('');
}
function removePlayer(ws,notify=true){
  const room=ws.room; if(!room) return;
  const idx=room.players.findIndex(p=>p.ws===ws);
  ws.room=null; ws.role=0;
  if(idx<0) return;
  const removed=room.players[idx]; room.players.splice(idx,1);
  if(notify) broadcast(room,{type:'peerLeft',player:removed.role});
  if(room.players.length===0){ rooms.delete(room.password); return; }
  broadcast(room,roomStatus(room));
}

const server=http.createServer((req,res)=>{
  const urlPath=decodeURIComponent((req.url||'/').split('?')[0]);
  const rel=urlPath==='/'?'index.html':urlPath.replace(/^\/+/, '');
  const filePath=path.resolve(ROOT,rel);
  if(!filePath.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(filePath,(err,data)=>{ if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not Found');} const ext=path.extname(filePath).toLowerCase(); res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate','Pragma':'no-cache','Expires':'0'}); res.end(data); });
});
const wss=new WebSocket.Server({server});

wss.on('connection',ws=>{
  ws.room=null; ws.role=0;
  ws.on('message',raw=>{
    let msg; try{msg=JSON.parse(raw.toString());}catch{return send(ws,{type:'error',message:'不正なメッセージです。'});}

    if(msg.type==='create'){
      removePlayer(ws,false);
      const password=/^\d{6}$/.test(String(msg.password||''))&&!rooms.has(String(msg.password))?String(msg.password):makePassword();
      const n=[2,3,4].includes(Number(msg.playerCount))?Number(msg.playerCount):2;
      const room={password,playerCount:n,players:[],started:false,roundOver:false};
      rooms.set(password,room);
      const player={ws,role:1,wins:0,alive:true,name:cleanName(msg.name, 'PLAYER 1')}; room.players.push(player); ws.room=room; ws.role=1;
      send(ws,{type:'roomJoined',role:1,room:password,password,playerCount:n,...snapshot(room)});
      send(ws,roomStatus(room));
      console.log(`ルーム作成: ${password} (${n}人)`);
      return;
    }

    if(msg.type==='join'){
      const password=String(msg.password||'').trim(); const room=rooms.get(password);
      if(!/^\d{6}$/.test(password)||!room) return send(ws,{type:'error',message:'そのパスワードの部屋はありません。'});
      if(room.started||room.players.length>=room.playerCount) return send(ws,{type:'error',message:'この部屋は満員です。'});
      removePlayer(ws,false);
      const used=new Set(room.players.map(p=>p.role)); let role=0; for(let r=1;r<=room.playerCount;r++) if(!used.has(r)){role=r;break;}
      if(!role) return send(ws,{type:'error',message:'この部屋は満員です。'});
      const player={ws,role,wins:0,alive:true,name:cleanName(msg.name, `PLAYER ${role}`)}; room.players.push(player); ws.room=room; ws.role=role;
      send(ws,{type:'roomJoined',role,room:password,password,playerCount:room.playerCount,...snapshot(room)});
      broadcast(room,roomStatus(room));
      console.log(`ルーム参加: ${password} PLAYER ${role} (${room.players.length}/${room.playerCount})`);
      // 人数がそろっても自動開始しない。ホストのSTART操作を待つ。
      return;
    }

    const room=ws.room; if(!room || room.ended) return;
    const me=room.players.find(p=>p.ws===ws); if(!me) return;

    if(msg.type==='playerState'){
      if(msg.player!==me.role) return;
      const state=msg.state; if(!state||typeof state!=='object') return;
      broadcast(room,{type:'playerState',player:me.role,state},ws); return;
    }

    if(msg.type==='input'){
      if(msg.action==='startMatch'){
        if(me.role!==1) return send(ws,{type:'error',message:'対戦を開始できるのはホストだけです。'});
        if(room.started) return;
        if(room.players.length!==room.playerCount) return send(ws,{type:'error',message:`まだ人数がそろっていません（${room.players.length}/${room.playerCount}人）。`});
        room.started=true; room.roundOver=false; for(const p of room.players)p.alive=true;
        const st=snapshot(room);
        const startMessage={type:'start',playerCount:room.playerCount,count:room.players.length,started:true,...st};
        for(const p of room.players){ send(p.ws,{type:'roomStatus',playerCount:room.playerCount,count:room.players.length,started:true,...st}); send(p.ws,startMessage); }
        for(const delay of [500,1500,3000]){
          setTimeout(()=>{ const r=rooms.get(room.password); if(!r||!r.started||r.players.length<r.playerCount)return; const latest=snapshot(r); for(const pl of r.players)send(pl.ws,{type:'start',playerCount:r.playerCount,count:r.players.length,started:true,...latest}); },delay);
        }
        console.log(`ホストが対戦開始: ${room.password}`);
        return;
      }
      if(msg.action==='attack'){
        const amount=Math.max(0,Math.min(40,Number(msg.amount)||0));
        if(amount>0) broadcast(room,{type:'attack',player:me.role,amount},ws);
        return;
      }
      if(msg.action==='playerDead'){
        me.alive=false; broadcast(room,{type:'playerDead',player:me.role});
        const alive=room.players.filter(p=>p.alive);
        if(alive.length<=1&&!room.roundOver){
          room.roundOver=true;
          const winner=alive.length===1?alive[0]:0;
          if(winner) winner.wins++;
          const matchWinner=winner&&winner.wins>=2?winner.role:0;
          const st=snapshot(room);
          if(matchWinner){
            // 2勝した時点でマッチ終了。結果を全員へ通知してから部屋を解散する。
            const result={type:'matchOver',winner:matchWinner,scores:st.scores,alive:st.alive,names:st.names};
            for(const p of room.players) send(p.ws,result);
            room.ended=true;
            rooms.delete(room.password);
            for(const p of room.players){ p.ws.room=null; p.ws.role=0; }
            console.log(`マッチ終了・部屋解散: ${room.password} winner=PLAYER ${matchWinner}`);
          } else {
            broadcast(room,{type:'roundOver',winner,matchOver:false,matchWinner:0,scores:st.scores,alive:st.alive,names:st.names});
          }
        }
        return;
      }
      if(msg.action==='nextRound'){
        // ラウンド終了中だけ受理。クライアントの再送・同時押しは安全に無視する。
        if(!room.roundOver || room.ended) return;
        room.roundOver=false;
        for(const p of room.players)p.alive=true;
        const st=snapshot(room);
        // 次ラウンド開始通知は、押した本人を含む全員へ送る。
        for(const p of room.players) send(p.ws,{type:'startRound',started:true,...st});
        console.log(`次ラウンド開始: ${room.password}`);
        return;
      }
      return;
    }
  });
  ws.on('close',()=>removePlayer(ws,true));
  ws.on('error',()=>removePlayer(ws,true));
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Tetris オンライン用サーバーが http://localhost:${PORT} で起動しました。`));
