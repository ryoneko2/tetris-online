const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const rooms = new Map();
const queues = { ranked: [], free: [] };
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const DATA_DIR = process.env.DATA_DIR || ROOT;
const PROFILE_FILE = path.join(DATA_DIR, 'player_profiles.json');
let firebaseAdmin = null;
let firestore = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    firebaseAdmin = require('firebase-admin');
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!firebaseAdmin.apps.length) firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(credentials) });
    firestore = firebaseAdmin.firestore();
  }
} catch (e) { console.error('Firebase Admin 初期化失敗:', e.message); }
let profiles = {};
let profilesLoaded = false;
try { profiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')); } catch (_) { profiles = {}; }
async function loadProfiles(){
 if(profilesLoaded)return; profilesLoaded=true;
 if(firestore){ try { const snap=await firestore.collection('players').get(); snap.forEach(doc=>{profiles[doc.id]={...doc.data(),uid:doc.id};}); } catch(e){console.error('Firestoreプロフィール読込失敗:',e.message);} }
}
async function saveProfiles(){
 try { fs.mkdirSync(DATA_DIR,{recursive:true}); fs.writeFileSync(PROFILE_FILE,JSON.stringify(profiles,null,2)); } catch(e){ console.error('プロフィール保存失敗:',e.message); }
 if(firestore){ try { const batch=firestore.batch(); for(const p of Object.values(profiles)){if(p.uid)batch.set(firestore.collection('players').doc(p.uid),p,{merge:true});} await batch.commit(); } catch(e){console.error('Firestoreプロフィール保存失敗:',e.message);} }
}
function send(ws,msg){ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(room,msg,except=null){ for(const p of room.players) if(p && p!==except) send(p.ws,msg); }
function cleanName(name,fallback){ let s=String(name||'').trim().replace(/[<>]/g,''); if(!s)s=fallback; return Array.from(s).slice(0,16).join(''); }
function getProfile(uid,name){ if(!profiles[uid]) profiles[uid]={uid,name:cleanName(name,'プレイヤー'),rating:1000,wins:0,losses:0,games:0,updatedAt:Date.now()}; else if(name) profiles[uid].name=cleanName(name,profiles[uid].name); return profiles[uid]; }
function leaderboard(){ return Object.values(profiles).sort((a,b)=>(b.rating-a.rating)||(b.wins-a.wins)).slice(0,50).map(p=>({name:p.name,rating:p.rating,wins:p.wins,losses:p.losses})); }
function expected(r1,r2){ return 1/(1+Math.pow(10,(r2-r1)/400)); }
async function recordRankedResult(room,winner){
  if(!['ranked','free'].includes(room.mode)||room.resultRecorded) return;
  room.resultRecorded=true;
  const a=room.players[0], b=room.players[1]; if(!a||!b||!a.uid||!b.uid) return;
  const pa=getProfile(a.uid,a.name), pb=getProfile(b.uid,b.name);
  const ra=pa.rating, rb=pb.rating, sa=winner===a.role?1:0, sb=1-sa, k=32;
  if(room.mode==='ranked'){
    pa.rating=Math.max(0,Math.round(ra+k*(sa-expected(ra,rb))));
    pb.rating=Math.max(0,Math.round(rb+k*(sb-expected(rb,ra))));
  }
  pa.games++;pb.games++; if(sa){pa.wins++;pb.losses++;}else{pb.wins++;pa.losses++;}
  pa.updatedAt=pb.updatedAt=Date.now(); await saveProfiles();
  for(const p of room.players){ const profile=getProfile(p.uid,p.name); send(p.ws,{type:'profile',profile:{name:profile.name,rating:profile.rating,wins:profile.wins,losses:profile.losses,games:profile.games}}); send(p.ws,{type:'leaderboard',entries:leaderboard()}); }
}
function snapshot(room){ const scores={},alive={},names={}; for(const p of room.players){if(!p)continue;scores[p.role]=p.wins||0;alive[p.role]=p.alive!==false;names[p.role]=p.name||('PLAYER '+p.role);} return {scores,alive,names}; }
function roomStatus(room){const st=snapshot(room);return {type:'roomStatus',playerCount:room.playerCount,count:room.players.length,started:!!room.started,round:room.round||0,roundOver:!!room.roundOver,scores:st.scores,alive:st.alive,names:st.names};}
function alivePlayers(room){return room.players.filter(p=>p&&p.alive!==false);}
function finishRoundIfNeeded(room){
 if(!room.started||room.roundOver||room.ended)return false; const alive=alivePlayers(room); if(alive.length>1)return false;
 room.roundOver=true; const winner=alive.length===1?alive[0]:null; if(winner)winner.wins++; const st=snapshot(room); const matchWinner=winner&&winner.wins>=2?winner.role:0;
 if(matchWinner){const result={type:'matchOver',winner:matchWinner,scores:st.scores,alive:st.alive,names:st.names};for(const p of room.players)send(p.ws,result);recordRankedResult(room,matchWinner).catch(e=>console.error('戦績保存失敗:',e));room.ended=true; if(room.password)rooms.delete(room.password); for(const p of room.players){p.ws.room=null;p.ws.role=0;} console.log(`マッチ終了 mode=${room.mode||'password'} winner=${matchWinner}`);}
 else {broadcast(room,{type:'roundOver',winner:winner?winner.role:0,matchOver:false,matchWinner:0,scores:st.scores,alive:st.alive,names:st.names});setTimeout(()=>startNextRound(room),3000);} return true;
}
function startNextRound(room){if(!room||room.ended||!room.started||!room.roundOver)return;if(room.players.length<2)return;room.roundOver=false;room.round=(room.round||1)+1;for(const p of room.players)p.alive=true;const st=snapshot(room);for(const p of room.players)send(p.ws,{type:'startRound',round:room.round,started:true,...st});}
function makePassword(){let p;do p=String(Math.floor(100000+Math.random()*900000));while(rooms.has(p));return p;}
function removeFromQueue(ws){for(const mode of ['ranked','free'])queues[mode]=queues[mode].filter(p=>p.ws!==ws);}
function removePlayer(ws,notify=true){removeFromQueue(ws);const room=ws.room;if(!room)return;const idx=room.players.findIndex(p=>p.ws===ws);ws.room=null;ws.role=0;if(idx<0)return;const removed=room.players[idx];room.players.splice(idx,1);if(notify)broadcast(room,{type:'peerLeft',player:removed.role});if(room.players.length===0){if(room.password)rooms.delete(room.password);return;}broadcast(room,roomStatus(room));}
function beginQueueMatch(a,b,mode){
 const room={password:null,mode,playerCount:2,players:[],started:true,roundOver:false,round:1,ended:false,resultRecorded:false};
 const pair=[a,b]; pair.forEach((entry,i)=>{const role=i+1;const p={ws:entry.ws,role,wins:0,alive:true,name:entry.name,uid:entry.uid||null};room.players.push(p);entry.ws.room=room;entry.ws.role=role;});
 const st=snapshot(room); pair.forEach((entry,i)=>send(entry.ws,{type:'queueMatched',mode,room:'MATCH',role:i+1,names:st.names,scores:st.scores}));
 pair.forEach((entry)=>{send(entry.ws,{type:'roomStatus',playerCount:2,count:2,started:true,round:1,...st});send(entry.ws,{type:'start',playerCount:2,count:2,round:1,started:true,...st});});
 console.log(`マッチ成立 mode=${mode}`);
}
async function authenticate(msg){
 if(!firebaseAdmin) throw new Error('サーバー側Firebase設定が未完了です（FIREBASE_SERVICE_ACCOUNT_JSON）。');
 if(!msg.idToken) throw new Error('Googleログインが必要です。');
 const decoded=await firebaseAdmin.auth().verifyIdToken(String(msg.idToken));
 if(msg.uid && msg.uid!==decoded.uid) throw new Error('アカウント情報が一致しません。');
 return decoded.uid;
}
const server=http.createServer((req,res)=>{
 const urlPath=decodeURIComponent((req.url||'/').split('?')[0]); const rel=urlPath==='/'?'index.html':urlPath.replace(/^\/+/, ''); const filePath=path.resolve(ROOT,rel);
 if(!filePath.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
 fs.readFile(filePath,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not Found');}const ext=path.extname(filePath).toLowerCase();res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate','Pragma':'no-cache','Expires':'0'});res.end(data);});
});
const wss=new WebSocket.Server({server});
wss.on('connection',ws=>{
 ws.room=null;ws.role=0;ws.queueMode=null;ws.uid=null;ws.name='プレイヤー';
 ws.on('message',raw=>{(async()=>{
 let msg;try{msg=JSON.parse(raw.toString());}catch{return send(ws,{type:'error',message:'不正なメッセージです。'});}
 if(msg.type==='queue'){
  await loadProfiles();
  removePlayer(ws,false);removeFromQueue(ws);
  const mode=String(msg.mode||'');if(!['ranked','free'].includes(mode))return send(ws,{type:'error',message:'対戦モードが不正です。'});
  let uid=null;
  try{uid=await authenticate(msg);}catch(e){return send(ws,{type:'error',message:e.message||'Googleログインを確認できません。'});} if(!uid)return;
  const profile=getProfile(uid,msg.name);send(ws,{type:'profile',profile:{name:profile.name,rating:profile.rating,wins:profile.wins,losses:profile.losses,games:profile.games}});send(ws,{type:'leaderboard',entries:leaderboard()});
  ws.uid=uid;ws.name=cleanName(msg.name,'プレイヤー');ws.queueMode=mode;
  const entry={ws,uid,name:ws.name,queuedAt:Date.now(),rating:uid?getProfile(uid,ws.name).rating:1000};
  const q=queues[mode];let matchIndex=-1;
  if(mode==='ranked'){
   const waited=(Date.now()-entry.queuedAt)/1000;
   let range=100;
   for(const other of q){const elapsed=(Date.now()-other.queuedAt)/1000;range=100+Math.floor(Math.max(waited,elapsed)/5)*100;if(other.uid!==uid&&Math.abs(other.rating-entry.rating)<=range){matchIndex=q.indexOf(other);break;}}
  } else matchIndex=q.findIndex(other=>other.ws!==ws);
  if(matchIndex>=0){const other=q.splice(matchIndex,1)[0];beginQueueMatch(other,entry,mode);}
  else {q.push(entry);send(ws,{type:'queueStatus',message:mode==='ranked'?'ランク対戦の相手を探しています...':'フリーマッチの相手を探しています...'});}
  return;
 }
 if(msg.type==='keyConfigGet'){
  try{const uid=await authenticate(msg);await loadProfiles();const p=getProfile(uid,'プレイヤー');send(ws,{type:'keyConfig',keyConfig:p.keyConfig||null});}catch(e){send(ws,{type:'error',message:e.message||'キー設定を読み込めませんでした。'});}return;
 }
 if(msg.type==='keyConfigSave'){
  try{
   const uid=await authenticate(msg);await loadProfiles();
   const incoming=msg.keyConfig;
   const allowed=new Set(['KeyA','KeyB','KeyC','KeyD','KeyE','KeyF','KeyG','KeyH','KeyI','KeyJ','KeyK','KeyL','KeyM','KeyN','KeyO','KeyP','KeyQ','KeyR','KeyS','KeyT','KeyU','KeyV','KeyW','KeyX','KeyY','KeyZ','Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight','ControlLeft','AltLeft']);
   const actions=['left','right','down','hardDrop','rotateLeft','rotateRight','hold'];
   if(!incoming||typeof incoming!=='object'||actions.some(k=>!allowed.has(incoming[k])))return send(ws,{type:'error',message:'キー設定の内容が不正です。'});
   if(new Set(actions.map(k=>incoming[k])).size!==actions.length)return send(ws,{type:'error',message:'同じキーを複数の操作に設定できません。'});
   const p=getProfile(uid,'プレイヤー');p.keyConfig=Object.fromEntries(actions.map(k=>[k,incoming[k]]));p.updatedAt=Date.now();await saveProfiles();send(ws,{type:'keyConfigSaved'});
  }catch(e){send(ws,{type:'error',message:e.message||'キー設定を保存できませんでした。'});}return;
 }
 if(msg.type==='profileRequest'){
  try{await loadProfiles();const uid=await authenticate(msg);const p=getProfile(uid,msg.name);send(ws,{type:'profile',profile:{name:p.name,rating:p.rating,wins:p.wins,losses:p.losses,games:p.games}});send(ws,{type:'leaderboard',entries:leaderboard()});}catch(e){send(ws,{type:'error',message:e.message});}return;
 }
 if(msg.type==='create'){
  removePlayer(ws,false);const password=/^\d{6}$/.test(String(msg.password||''))&&!rooms.has(String(msg.password))?String(msg.password):makePassword();const n=[2,3,4].includes(Number(msg.playerCount))?Number(msg.playerCount):2;const room={password,mode:'password',playerCount:n,players:[],started:false,roundOver:false,round:0,ended:false,resultRecorded:false};rooms.set(password,room);const player={ws,role:1,wins:0,alive:true,name:cleanName(msg.name,'PLAYER 1'),uid:null};room.players.push(player);ws.room=room;ws.role=1;send(ws,{type:'roomJoined',role:1,room:password,password,playerCount:n,round:0,...snapshot(room)});send(ws,roomStatus(room));return;
 }
 if(msg.type==='join'){
  const password=String(msg.password||'').trim();const room=rooms.get(password);if(!/^\d{6}$/.test(password)||!room)return send(ws,{type:'error',message:'そのパスワードの部屋はありません。'});if(room.started||room.players.length>=room.playerCount)return send(ws,{type:'error',message:'この部屋は満員です。'});removePlayer(ws,false);const used=new Set(room.players.map(p=>p.role));let role=0;for(let r=1;r<=room.playerCount;r++)if(!used.has(r)){role=r;break;}if(!role)return send(ws,{type:'error',message:'この部屋は満員です。'});const player={ws,role,wins:0,alive:true,name:cleanName(msg.name,`PLAYER ${role}`),uid:null};room.players.push(player);ws.room=room;ws.role=role;send(ws,{type:'roomJoined',role,room:password,password,playerCount:room.playerCount,round:room.round||0,...snapshot(room)});broadcast(room,roomStatus(room));return;
 }
 const room=ws.room;if(!room||room.ended)return;const me=room.players.find(p=>p.ws===ws);if(!me)return;
 if(msg.type==='playerState'){if(msg.player!==me.role)return;const state=msg.state;if(!state||typeof state!=='object')return;if(typeof state.alive==='boolean'){me.alive=state.alive;finishRoundIfNeeded(room);}broadcast(room,{type:'playerState',player:me.role,state},ws);return;}
 if(msg.type==='input'){
  if(msg.action==='startMatch'){if(me.role!==1)return send(ws,{type:'error',message:'対戦を開始できるのはホストだけです。'});if(room.started)return;if(room.players.length!==room.playerCount)return send(ws,{type:'error',message:`まだ人数がそろっていません（${room.players.length}/${room.playerCount}人）。`});room.started=true;room.roundOver=false;room.round=1;for(const p of room.players)p.alive=true;const st=snapshot(room);for(const p of room.players){send(p.ws,{type:'roomStatus',playerCount:room.playerCount,count:room.players.length,started:true,...st});send(p.ws,{type:'start',playerCount:room.playerCount,count:room.players.length,round:1,started:true,...st});}return;}
  if(msg.action==='attack'){const amount=Math.max(0,Math.min(40,Number(msg.amount)||0));if(amount>0)broadcast(room,{type:'attack',player:me.role,amount},ws);return;}
  if(msg.action==='playerDead'){me.alive=false;broadcast(room,{type:'playerDead',player:me.role});finishRoundIfNeeded(room);return;}
  if(msg.action==='nextRound'){if(room.roundOver&&!room.ended)startNextRound(room);return;}
 }
 })().catch(e=>{console.error(e);send(ws,{type:'error',message:'サーバー内部エラーが発生しました。'});});});
 ws.on('close',()=>removePlayer(ws,true));ws.on('error',()=>removePlayer(ws,true));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Tetris オンライン用サーバーが http://localhost:${PORT} で起動しました。`));
