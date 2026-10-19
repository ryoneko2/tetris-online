// p5.js Tetris SRS (スーパーローテーションシステム) Mod - CPU対戦版
// プレイヤー (左) vs CPU (右) の対戦モードを実装
// ★ 2本先取 (Best of 3) ルールを追加
// ★ ゲームモード選択 (SOLO, VS_LOCAL, VS_CPU) を追加
// ★ UIレイアウトを P1/P2 で統一

// ▼▼▼ 修正点 1 (テトリス25): ブロックサイズとレイアウト定数を変更 ▼▼▼
const RETSU = 10; // ゲームボードの列数
const GYO = 20; // ゲームボードの行数
const BLOKU_SAIZU = 22; // ★ ブロックのサイズ (25 -> 22)

// --- レイアウト定数 (P1/P2 共通UIのため変更) ---
const UI_RETSU = 4; // UIの幅 (ブロック単位)
const P1_UI_HOLD_X_OFFSET = 0; // P1 Hold (4)
const P1_BOARD_X_OFFSET = P1_UI_HOLD_X_OFFSET + UI_RETSU * BLOKU_SAIZU; // P1 Board (10)
const P1_UI_NEXT_X_OFFSET = P1_BOARD_X_OFFSET + RETSU * BLOKU_SAIZU; // P1 Next (4)
const P2_UI_HOLD_X_OFFSET = P1_UI_NEXT_X_OFFSET + UI_RETSU * BLOKU_SAIZU; // P2 Hold (4)
const P2_BOARD_X_OFFSET = P2_UI_HOLD_X_OFFSET + UI_RETSU * BLOKU_SAIZU; // P2 Board (10)
const P2_UI_NEXT_X_OFFSET = P2_BOARD_X_OFFSET + RETSU * BLOKU_SAIZU; // P2 Next (4)
const TOTAL_WIDTH_RETSU = UI_RETSU + RETSU + UI_RETSU + UI_RETSU + RETSU + UI_RETSU; // (4 + 10 + 4 + 4 + 10 + 4 = 36)
// 40ラインスコアアタックでは、P1のUI＋盤面＋NEXTを画面中央に配置する。
function getP1LayoutOffset() {
  return gameMode === 'SCORE_ATTACK' ? Math.max(0, (width - (UI_RETSU + RETSU + UI_RETSU) * BLOKU_SAIZU) / 2) : 0;
}
function getP1BoardX() { return getP1LayoutOffset() + P1_BOARD_X_OFFSET; }
// --- ▲▲▲ ---

var gameMode = 'TITLE'; // 'TITLE', 'SOLO', 'VS_LOCAL', 'VS_CPU', 'ONLINE'
var gameCanvas = null;

// --- オンライン対戦 (WebSocket) ---
// ローカルテスト: ws://localhost:8080
// インターネット公開時は、デプロイしたWebSocketサーバーのURLに変更してください。
const ONLINE_SERVER_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
var onlineSocket = null;
var onlineRole = 0; // 1 = ホスト(P1), 2 = ゲスト(P2)
var onlinePlayerCount = 2;
var onlineRemoteStates = {};
var onlinePlayerNames = {};
var onlinePlayerName = '';
var onlineQueueMode = ''; // 'ranked' / 'free' / 'password'
var onlineUser = null;
var onlineIdToken = '';
var onlineProfile = null;
var onlineMatchStartRequested = false;
var onlineJoinedCount = 0;
const ONLINE_BUILD_VERSION = 'PLAYERNAME-20260904-14';
var onlineMatchStarted = false;
var onlineScores = {};
var onlineAlive = {};
var onlineRoundWinnerRole = 0;
var onlineMatchWinnerRole = 0;
var onlineRoundReadySent = false;
var onlineLastLocalStateSend = 0;
var onlineRoom = '';
var onlineConnected = false;
var onlineOpponentConnected = false;
var onlineStatus = '';
var onlineGuestKeyState = { left:false, right:false, down:false };
var onlineLastInputSend = 0;
var onlineLastStateSend = 0;
var onlineStateSeq = 0;
var onlineLastAppliedSeq = 0;
var onlinePendingState = null;
var onlineStateApplyTimer = null;
var onlinePrevHardDrop = false;
var onlinePrevHold = false;
var onlineRoundRequestSent = false;
var onlineRound = 0;
var onlineGuestInitialized = false;
var onlineInitialStateSent = false;
var titleButtons = [];
var selectedButtonIndex = 0;
var helpOpen = false;
// アカウント連携キーコンフィグ（P1/オンライン共通）
var keyConfigOpen = false;
var rankingOpen = false;
var rankingEntries = [];
var rankingMyRank = null;
var rankingNotice = 'ランキングを読み込んでいます...';
// 40ライン・スコアアタック
var scoreAttackLines = 0;
var scoreAttackStartMs = 0;
var scoreAttackElapsedMs = 0;
var scoreAttackFinished = false;
var scoreAttackSaving = false;
var scoreAttackNotice = '';
var scoreAttackRanking = [];
var scoreAttackBestMs = null;
var scoreAttackRankingOpen = false;
var scoreAttackStartPending = false;

var profileTab = 'profile';
var profileNotice = '';
var keyCaptureAction = '';
var keyConfigNotice = '';
var keyConfig = { left:['KeyA'], right:['KeyD'], down:['KeyS'], hardDrop:['KeyW'], rotateLeft:['KeyG'], rotateRight:['KeyF'], hold:['KeyC'] };
var keyConfigDefaults = { left:['KeyA'], right:['KeyD'], down:['KeyS'], hardDrop:['KeyW'], rotateLeft:['KeyG'], rotateRight:['KeyF'], hold:['KeyC'] };
var keyConfigActions = [ ['left','左移動'], ['right','右移動'], ['down','下移動'], ['hardDrop','ハードドロップ'], ['rotateLeft','左回転'], ['rotateRight','右回転'], ['hold','ホールド'] ];
function keyCodeLabel(code){ const names={Space:'Space',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Enter:'Enter',ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',AltLeft:'左Alt'}; if(names[code])return names[code]; return String(code||'').replace(/^Key/,'').replace(/^Digit/,''); }
function keyCodeNumber(code){ if(code==='Space')return 32; if(code==='ArrowLeft')return LEFT_ARROW; if(code==='ArrowRight')return RIGHT_ARROW; if(code==='ArrowUp')return UP_ARROW; if(code==='ArrowDown')return DOWN_ARROW; if(/^Key[A-Z]$/.test(code))return code.charCodeAt(3); if(/^Digit[0-9]$/.test(code))return code.charCodeAt(5); return -1; }
function normalizeKeyConfig(config){ const out={}; keyConfigActions.forEach(([name])=>{const v=config&&config[name];out[name]=Array.from(new Set((Array.isArray(v)?v:[v]).filter(x=>typeof x==='string'&&x.length)));if(!out[name].length)out[name]=[keyConfigDefaults[name][0]];});return out;}
function keysForAction(action){const v=keyConfig[action];return Array.isArray(v)?v:[v].filter(Boolean);}
function actionHasKey(action,code){return keysForAction(action).includes(code);}
function isBoundKey(code){ return keyConfigActions.some(([name])=>keysForAction(name).includes(code));}
function keyConfigLabel(action){return keysForAction(action).map(keyCodeLabel).join(' + ');}
function keyConfigNumberFor(action){return keysForAction(action).map(keyCodeNumber).filter(n=>n>=0);}
function keyCodeToCode(n){if(n===32)return 'Space';if(n===LEFT_ARROW)return 'ArrowLeft';if(n===RIGHT_ARROW)return 'ArrowRight';if(n===UP_ARROW)return 'ArrowUp';if(n===DOWN_ARROW)return 'ArrowDown';if(n>=65&&n<=90)return 'Key'+String.fromCharCode(n);if(n>=48&&n<=57)return 'Digit'+String.fromCharCode(n);return '';} 
function keyConfigIsDown(action){return keyConfigNumberFor(action).some(n=>keyIsDown(n));}
function requestKeyConfigSave(){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){keyConfigNotice='先にGoogleログインしてください';return;}
  user.getIdToken().then(token=>{
    const sock=new WebSocket(ONLINE_SERVER_URL);
    sock.onopen=()=>sock.send(JSON.stringify({type:'keyConfigSave',idToken:token,uid:user.uid,keyConfig:normalizeKeyConfig(keyConfig)}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='keyConfigSaved')keyConfigNotice='アカウントに保存しました';else if(m.type==='error')keyConfigNotice=m.message||'保存できませんでした';}catch(_){}};
    sock.onerror=()=>{keyConfigNotice='保存に失敗しました（通信を確認してください）'};
    setTimeout(()=>{try{sock.close()}catch(_){}},4000);
  }).catch(()=>{keyConfigNotice='ログイン情報を確認できませんでした'});
}
function requestKeyConfigLoad(){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){
    if(auth){const provider=new firebase.auth.GoogleAuthProvider();auth.signInWithPopup(provider).then(()=>requestKeyConfigLoad()).catch(()=>{keyConfigNotice='Googleログインできませんでした。オンライン対戦からログインしてください';});}else keyConfigNotice='Firebase設定が必要です';
    keyConfigNotice='Googleログイン画面を開いています...';return;
  }
  user.getIdToken().then(token=>{
    const sock=new WebSocket(ONLINE_SERVER_URL);
    sock.onopen=()=>sock.send(JSON.stringify({type:'keyConfigGet',idToken:token,uid:user.uid}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='keyConfig'){if(m.keyConfig&&typeof m.keyConfig==='object')keyConfig=normalizeKeyConfig({...keyConfigDefaults,...m.keyConfig});keyConfigNotice=m.keyConfig?'アカウントのキー設定を読み込みました':'保存済み設定はありません';}}catch(_){}};
    setTimeout(()=>{try{sock.close()}catch(_){}},4000);
  }).catch(()=>{});
}

function profileSocketRequest(payload, onMessage){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){profileNotice='Googleログインしてください';return;}
  user.getIdToken().then(token=>{
    const sock=new WebSocket(ONLINE_SERVER_URL);
    sock.onopen=()=>sock.send(JSON.stringify({...payload,idToken:token,uid:user.uid}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='error'){profileNotice=m.message||'通信エラー';return;}onMessage&&onMessage(m);}catch(_){}};
    sock.onerror=()=>{profileNotice='サーバーに接続できませんでした'};
    setTimeout(()=>{try{sock.close()}catch(_){}},5000);
  }).catch(()=>{profileNotice='ログイン情報を確認できませんでした'});
}
function requestProfileLoad(){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  if(!auth){profileNotice='Firebase設定が必要です';return;}
  if(!auth.currentUser){profileNotice='Googleログイン画面を開いています...';auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(requestProfileLoad).catch(()=>{profileNotice='Googleログインに失敗しました';});return;}
  profileSocketRequest({type:'profileRequest'},m=>{if(m.type==='profile'){onlineProfile={...(onlineProfile||{}),...m.profile,displayName:m.profile.name||onlineProfile?.displayName};profileNotice='プロフィールを読み込みました';}});
}
function saveProfileName(){
  const current=onlineProfile?.name||onlineProfile?.displayName||'プレイヤー';
  const entered=prompt('プロフィールに表示する名前を入力してください（1〜16文字）。',current);
  if(entered===null)return;
  const name=entered.trim().replace(/[<>]/g,'').slice(0,16);
  if(!name){profileNotice='名前を入力してください';return;}
  profileSocketRequest({type:'profileSave',name},m=>{if(m.type==='profileSaved'){onlineProfile={...(onlineProfile||{}),...m.profile,displayName:m.profile.name};profileNotice='名前を保存しました';}});
}


function requestLeaderboard(){
  rankingNotice='ランキングを読み込んでいます...';
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){rankingNotice='自分の順位を表示するにはGoogleログインが必要です';return;}
  user.getIdToken().then(token=>{
    let sock;
    try { sock=new WebSocket(ONLINE_SERVER_URL); } catch(e) { rankingNotice='サーバーに接続できません'; return; }
    sock.onopen=()=>sock.send(JSON.stringify({type:'leaderboardRequest',idToken:token,uid:user.uid}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='leaderboard'){rankingEntries=Array.isArray(m.entries)?m.entries:[];rankingMyRank=m.myRank||null;rankingNotice=rankingEntries.length?'':'まだランキングデータがありません';sock.close();}else if(m.type==='error'){rankingNotice=m.message||'読み込みに失敗しました';sock.close();}}catch(_){} };
    sock.onerror=()=>{rankingNotice='サーバーに接続できません'};
    setTimeout(()=>{if(sock.readyState===WebSocket.OPEN||sock.readyState===WebSocket.CONNECTING){if(!rankingEntries.length)rankingNotice='応答がありません。再読み込みしてください';try{sock.close()}catch(_){}}},5000);
  }).catch(()=>{rankingNotice='ログイン情報を確認できませんでした';});
}
function requestScoreAttackSave(timeMs){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){scoreAttackNotice='記録をランキングに保存するにはGoogleログインしてください';scoreAttackSaving=false;return;}
  scoreAttackSaving=true; scoreAttackNotice='ランキングに記録を保存しています...';
  user.getIdToken().then(token=>{
    const sock=new WebSocket(ONLINE_SERVER_URL);
    sock.onopen=()=>sock.send(JSON.stringify({type:'scoreAttackSave',idToken:token,uid:user.uid,timeMs}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='scoreAttackSaved'){scoreAttackBestMs=m.bestMs;scoreAttackNotice=m.updated?'ランキングに記録を保存しました':'自己ベストを維持しました';requestScoreAttackLeaderboard(false);sock.close();}else if(m.type==='error'){scoreAttackNotice=m.message||'記録を保存できませんでした';sock.close();}}catch(_){} };
    sock.onerror=()=>{scoreAttackNotice='ランキングサーバーに接続できません';scoreAttackSaving=false;};
    setTimeout(()=>{try{sock.close()}catch(_){}},5000);
  }).catch(()=>{scoreAttackNotice='ログイン情報を確認できませんでした';scoreAttackSaving=false;});
}
function requestScoreAttackLeaderboard(showNotice=true){
  const auth=window.firebase&&firebase.apps&&firebase.apps.length?firebase.auth():null;
  const user=auth&&auth.currentUser;
  if(!user){if(showNotice)scoreAttackNotice='ランキングを見るにはGoogleログインしてください';return;}
  user.getIdToken().then(token=>{
    const sock=new WebSocket(ONLINE_SERVER_URL);
    sock.onopen=()=>sock.send(JSON.stringify({type:'scoreAttackLeaderboardRequest',idToken:token,uid:user.uid}));
    sock.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='scoreAttackLeaderboard'){scoreAttackRanking=Array.isArray(m.entries)?m.entries:[];scoreAttackBestMs=m.myBestMs??scoreAttackBestMs;if(showNotice)scoreAttackNotice='';sock.close();}else if(m.type==='error'){scoreAttackNotice=m.message||'ランキングを読み込めませんでした';sock.close();}}catch(_){} };
    sock.onerror=()=>{scoreAttackNotice='ランキングサーバーに接続できません';};
    setTimeout(()=>{try{sock.close()}catch(_){}},5000);
  }).catch(()=>{scoreAttackNotice='ログイン情報を確認できませんでした';});
}
function finishScoreAttack(){
  if(scoreAttackFinished)return;
  scoreAttackFinished=true; scoreAttackLines=40; scoreAttackElapsedMs=Math.max(1,millis()-scoreAttackStartMs);
  isMatchOver=true; isRoundOver=false; scoreAttackNotice='クリア！';
  requestScoreAttackSave(scoreAttackElapsedMs);
}
function formatAttackTime(ms){const v=Math.max(0,Number(ms)||0);const minutes=Math.floor(v/60000);const seconds=Math.floor((v%60000)/1000);const centis=Math.floor((v%1000)/10);return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+'.'+String(centis).padStart(2,'0');}
function drawScoreAttackHUD(){
  const elapsed=scoreAttackFinished?scoreAttackElapsedMs:Math.max(0,millis()-scoreAttackStartMs);
  noStroke();fill(255);textAlign(CENTER,CENTER);textSize(20);
  text('40 LINE SPRINT',width/2,22);text('TIME  '+formatAttackTime(elapsed),width/2,48);
  text('LINES  '+Math.min(40,scoreAttackLines)+' / 40',width/2,73);
}
function drawScoreAttackResult(){
  push();rectMode(CORNER);noStroke();fill(5,8,20,235);rect(0,0,width,height);
  fill(18,24,44);stroke(110,190,255);strokeWeight(2);rect(width/2-390,90,780,620,18);
  noStroke();fill('#9fe7ff');textAlign(CENTER,CENTER);textSize(30);text(scoreAttackFinished?'40ライン クリア！':'ゲームオーバー',width/2,140);
  fill(255);textSize(23);text('TIME  '+formatAttackTime(scoreAttackElapsedMs),width/2,185);
  fill(190,215,245);textSize(15);text(scoreAttackFinished?'最速タイムを目指して再挑戦しよう':'もう一度挑戦して40ラインを目指そう',width/2,215);
  fill('#ffe082');textSize(15);text(scoreAttackNotice||'ランキングを読み込んでいます...',width/2,246);
  fill(255);textSize(19);text('40ライン スコアアタックランキング（上位10人）',width/2,285);
  const top=310;
  for(let i=0;i<10;i++){
    const e=scoreAttackRanking[i];fill(i%2?'#182239':'#202b45');rect(width/2-300,top+i*29,600,26,4);
    if(e){fill(i<3?['#ffe082','#d7e1ef','#e5a87a'][i]:'#fff');textAlign(LEFT,CENTER);textSize(14);text((i+1)+'. '+String(e.name||'プレイヤー').slice(0,18),width/2-285,top+i*29+13);fill('#9fe7ff');textAlign(RIGHT,CENTER);text(formatAttackTime(e.bestMs),width/2+285,top+i*29+13);}
  }
  fill(55,85,125);rect(width/2-290,620,170,42,8);rect(width/2-85,620,170,42,8);rect(width/2+120,620,170,42,8);
  fill(255);textAlign(CENTER,CENTER);textSize(15);text('もう一度',width/2-205,641);text('ランキング更新',width/2,641);text('タイトルへ',width/2+205,641);pop();
}
function handleScoreAttackResultPointer(px,py){
  if(gameMode!=='SCORE_ATTACK'||!isMatchOver)return false;
  if(py>=620&&py<=662){if(px>=width/2-290&&px<=width/2-120){startScoreAttack();return true;}if(px>=width/2-85&&px<=width/2+85){requestScoreAttackLeaderboard();return true;}if(px>=width/2+120&&px<=width/2+290){gameMode='TITLE';isStarted=false;isMatchOver=false;return true;}}
  return true;
}
function startScoreAttack(){
  gameMode='SCORE_ATTACK';scoreAttackLines=0;scoreAttackElapsedMs=0;scoreAttackFinished=false;scoreAttackSaving=false;scoreAttackNotice='';scoreAttackRanking=[];isMatchOver=false;isRoundOver=false;isPaused=false;roundWinner='';scoreAttackStartMs=0;scoreAttackStartPending=true;nextRound();requestScoreAttackLeaderboard(false);
}

function drawRankingOverlay(){
  push(); rectMode(CORNER); noStroke(); fill(5,8,20,238); rect(0,0,width,height);
  const panelW=Math.min(820,width-40), panelH=Math.min(700,height-40), x=(width-panelW)/2, y=(height-panelH)/2;
  stroke(110,190,255); strokeWeight(2); fill(18,24,44); rect(x,y,panelW,panelH,16);
  noStroke(); fill(255); textAlign(CENTER,CENTER); textSize(30); text('ランキング',width/2,y+42);
  fill(170,205,245); textSize(14); text('レート順 • 上位50人',width/2,y+73);
  if(rankingMyRank && rankingMyRank.rank>50){fill('#ffe082');textAlign(CENTER,CENTER);textSize(14);text(`あなたの順位：${rankingMyRank.rank}位（レート ${rankingMyRank.rating}）`,width/2,y+91);}
  const top=y+112, rowH=34, left=x+35, right=x+panelW-35;
  fill('#293653'); rect(left,top,right-left,32,5); fill(210,225,245); textSize(14);
  textAlign(CENTER,CENTER); text('順位',left+32,top+16); textAlign(LEFT,CENTER); text('プレイヤー',left+70,top+16);
  textAlign(RIGHT,CENTER); text('レート',right-245,top+16); text('勝利',right-145,top+16); text('敗北',right-55,top+16);
  const visible=Math.min(14,Math.floor((panelH-205)/rowH));
  for(let i=0;i<visible;i++){
    const yy=top+37+i*rowH, entry=rankingEntries[i];
    fill(i%2===0?'#202b45':'#182239'); rect(left,yy,right-left,rowH-2,4);
    if(!entry)continue;
    fill(i<3?['#ffe082','#d7e1ef','#e5a87a'][i]: '#ffffff'); textAlign(CENTER,CENTER); textSize(15); text(String(i+1),left+32,yy+16);
    fill(245); textAlign(LEFT,CENTER); textSize(16); text(String(entry.name||'プレイヤー').slice(0,18),left+70,yy+16);
    fill('#9fe7ff'); textAlign(RIGHT,CENTER); text(String(Number(entry.rating)||1000),right-245,yy+16);
    fill(220); text(String(Number(entry.wins)||0),right-145,yy+16); text(String(Number(entry.losses)||0),right-55,yy+16);
  }
  if(!rankingEntries.length){fill(255,220,120);textAlign(CENTER,CENTER);textSize(15);text(rankingNotice,width/2,top+95);}
  fill(190); textAlign(CENTER,CENTER); textSize(13); text('ランキングはランク対戦のレートを基準に表示します',width/2,y+panelH-65);
  fill(55,85,125); rect(width/2-180,y+panelH-50,150,34,7); rect(width/2+30,y+panelH-50,150,34,7);
  fill(255); textSize(15); text('再読み込み',width/2-105,y+panelH-33); text('閉じる',width/2+105,y+panelH-33);
  pop();
}
function handleRankingPointer(px,py){
  if(!rankingOpen)return false;
  const panelW=Math.min(820,width-40), panelH=Math.min(700,height-40), y=(height-panelH)/2;
  if(py>=y+panelH-52&&py<=y+panelH-12){
    if(px>=width/2-180&&px<=width/2-30){requestLeaderboard();return true;}
    if(px>=width/2+30&&px<=width/2+180){rankingOpen=false;return true;}
  }
  if(px< (width-panelW)/2||px>(width+panelW)/2||py<y||py>y+panelH){rankingOpen=false;return true;}
  return true;
}

function drawKeyConfigOverlay(){
  push(); rectMode(CORNER); noStroke(); fill(8,10,24,245); rect(90,65,width-180,height-130,18);
  stroke(110,190,255); strokeWeight(2); noFill(); rect(90,65,width-180,height-130,18);
  noStroke(); fill(255); textAlign(CENTER,CENTER); textSize(30); text('プロフィール',width/2,103);
  // タブはキー設定ボタンがあった同じ場所から開くプロフィール画面内に配置
  fill(profileTab==='profile'?'#385b83':'#202943'); rect(180,125,300,42,8);
  fill(profileTab==='keys'?'#385b83':'#202943'); rect(500,125,300,42,8);
  fill(255); textSize(17); text('プロフィール・戦績',330,146); text('キーコンフィグ',650,146);
  if(profileTab==='profile'){
    const pr=onlineProfile||{};
    textAlign(LEFT,CENTER); fill(190,220,255); textSize(15); text('プレイヤー名',205,210);
    fill(255); textSize(26); text(pr.name||pr.displayName||'未設定',205,246);
    fill(55,70,105); rect(700,218,190,48,8); fill(255); textAlign(CENTER,CENTER); textSize(17); text('名前を変更',795,242);
    const stats=[['レート',pr.rating===undefined?'—':pr.rating],['勝利',pr.wins||0],['敗北',pr.losses||0],['対戦数',pr.games||0]];
    stats.forEach((a,i)=>{const x=190+i*180;fill('#202943');rect(x,315,160,105,10);fill(175,205,240);textSize(16);text(a[0],x+80,342);fill(255);textSize(30);text(String(a[1]),x+80,383);});
    fill(200); textSize(14); textAlign(CENTER,CENTER); text('戦績はランク対戦・フリーマッチの結果を表示します',width/2,460);
    fill(255,220,120); text(profileNotice,width/2,520);
    fill(55,70,105); rect(640,560,280,44,8); fill(255); textSize(17); text('プロフィールを再読み込み',780,582);
  }else{
    textAlign(CENTER,CENTER); textSize(13); fill(205); text('操作を選び、割り当てたいキーを押してください',width/2,183);
    const startY=205, rowH=43;
    keyConfigActions.forEach((a,i)=>{const y=startY+i*rowH; fill(keyCaptureAction===a[0]?'#385b83':'#202943'); rect(180,y,740,35,7); fill(255); textAlign(LEFT,CENTER); textSize(17); text(a[1],205,y+17); textAlign(RIGHT,CENTER); fill(keyCaptureAction===a[0]?'#ffe082':'#9fe7ff'); text(keyCaptureAction===a[0]?'キーを押してください':keyConfigLabel(a[0]),895,y+17);});
    const by=520; fill(55,70,105); rect(180,by,210,42,8); rect(410,by,210,42,8); fill(255); textAlign(CENTER,CENTER); textSize(16); text('初期設定に戻す',285,by+21); text('アカウントに保存',515,by+21);
    fill(255,220,120); textSize(14); text(keyConfigNotice,width/2,by+62);
  }
  fill(55,70,105); rect(640,650,280,42,8); fill(255); textAlign(CENTER,CENTER); textSize(16); text('閉じる',780,671); pop();
}

function handleKeyConfigPointer(px,py){
  if(!keyConfigOpen)return false;
  if(px>=180&&px<=480&&py>=125&&py<=167){profileTab='profile';keyCaptureAction='';return true;}
  if(px>=500&&px<=800&&py>=125&&py<=167){profileTab='keys';keyCaptureAction='';keyConfigNotice='';requestKeyConfigLoad();return true;}
  if(px>=640&&px<=920&&py>=650&&py<=692){keyConfigOpen=false;keyCaptureAction='';return true;}
  if(profileTab==='profile'){
    if(px>=700&&px<=890&&py>=218&&py<=266){saveProfileName();return true;}
    if(px>=640&&px<=920&&py>=560&&py<=604){requestProfileLoad();return true;}
    return true;
  }
  const startY=205,rowH=43;
  for(let i=0;i<keyConfigActions.length;i++){const y=startY+i*rowH;if(px>=180&&px<=920&&py>=y&&py<=y+35){keyCaptureAction=keyConfigActions[i][0];keyConfig[keyCaptureAction]=[];keyConfigNotice='追加するキーを押してください（Enterで終了）';return true;}}
  const by=520;
  if(py>=by&&py<=by+42){if(px>=180&&px<=390){keyConfig=normalizeKeyConfig(keyConfigDefaults);keyCaptureAction='';keyConfigNotice='初期設定に戻しました';}
    else if(px>=410&&px<=620){requestKeyConfigSave();}
    return true;}
  return true;
}

window.addEventListener('keydown',function(e){
  if(keyConfigOpen){e.preventDefault();e.stopPropagation();if(!keyCaptureAction){if(e.code==='Escape'){keyConfigOpen=false;}return;}if(e.code==='Enter'){keyCaptureAction='';keyConfigNotice='キーの追加を終了しました。保存ボタンを押してください';return;}if(e.code==='Escape'){keyCaptureAction='';keyConfigNotice='キー追加を終了しました';return;}if(['Tab','CapsLock'].includes(e.code))return;const list=keysForAction(keyCaptureAction).slice();if(list.includes(e.code)){keyConfigNotice=keyCodeLabel(e.code)+' はすでに登録されています';return;}if(isBoundKey(e.code)){keyConfigNotice='そのキーは別の操作に設定済みです';return;}list.push(e.code);keyConfig[keyCaptureAction]=list;keyConfigNotice=keyCodeLabel(e.code)+' を追加しました。続けてキーを押すか Enter で終了';return;}
},{capture:true});


// --- プレイヤー (P1) の状態 ---
var gameBoard = []; // P1 ゲームボード
var imaNoBurokku; // P1 いまのブロック
var sukoa = 0; // P1 スコア
var attackPower = 0; // P1 蓄積された攻撃力
var backToBack = 0;  // P1 B2B カウンター
var comboCount = 0;  // P1 コンボカウンター
var horudoBurokku = null; // P1 ホールド中のブロックタイプ
var horudoShiyouzumi = false; // P1 このターンでホールドを既に使用したか
var playerAttackQueue = []; // P1 が受けるおじゃまブロックの行数

// --- P2 / CPU の状態 ---
var gameBoardP2 = []; // P2/C ゲームボード
var imaNoBurokkuP2; // P2/C いまのブロック
var cpuScore = 0; // P2/C スコア
var cpuAttackPower = 0; // P2/C 蓄積された攻撃力
var cpuBackToBack = 0; 
var cpuComboCount = 0; 
var cpuHoldBlock = null;
var cpuHoldUsed = false;
var cpuNextMove = null; // C の計算済み最善手
var player2AttackQueue = []; // P2/C が受けるおじゃまブロックの行数

var burokkuShurui; // ブロックのしゅるい (形状データ)
var burokkuIro; // ブロックの色

// --- ▼ 速度/アクション関連の調整 ▼ ---
var framesPerDrop = 30; // 通常の落下速度 (1マス/30フレーム)
var lastAction = 'NONE'; // P1 最後に成功したアクション
var dasDelay = 150; // ぷよテト2寄り：左右のタメ時間 (ミリ秒)
var arrDelay = 35;  // ぷよテト2寄り：左右のリピート速度 (ミリ秒)
var dasStartTimeLeft = 0;
var dasStartTimeRight = 0;
var arrTimeLeft = 0;
var arrTimeRight = 0;
var lastMoveDownTime = 0;
var moveDownDelay = 40; // ぷよテト2寄り：下入力の間隔 (ミリ秒)

// --- ▼ P2 (VS_LOCAL) 用の入力変数 ▼ ---
var lastActionP2 = 'NONE';
var dasStartTimeLeftP2 = 0;
var dasStartTimeRightP2 = 0;
var arrTimeLeftP2 = 0;
var arrTimeRightP2 = 0;
var lastMoveDownTimeP2 = 0;
var wasHardDropPressedP2 = false; // ★ P2ハードドロップフラグ
// --- ▲ ---

// コントローラー/キーボード入力フラグ (プレイヤー用)
var wasAGamepadPressed = false;
var wasBGamepadPressed = false;
var wasXGamepadPressed = false;
var wasYGamepadPressed = false; 
var wasUpGamepadPressed = false;
var wasLGamepadPressed = false; 
var wasRGamepadPressed = false;
var wasStartGamepadPressed = false; 

// 接続中のゲームパッドをまとめて読む。
// Switch Joy-Conは左右が別々のGamepadとして公開されることがあるため、
// 片方だけを選ぶと、もう片方のボタン入力をゲームが受け取れない。
function getActiveGamepad() {
  try {
    if (!navigator.getGamepads) return null;
    const pads = Array.from(navigator.getGamepads() || []).filter(p => p && p.connected !== false);
    if (!pads.length) return null;
    if (pads.length === 1) return pads[0];

    const buttonCount = Math.max(0, ...pads.map(p => p.buttons ? p.buttons.length : 0));
    const axisCount = Math.max(0, ...pads.map(p => p.axes ? p.axes.length : 0));
    const buttons = Array.from({length: buttonCount}, (_, i) => {
      const pressed = pads.some(p => p.buttons && p.buttons[i] && p.buttons[i].pressed);
      const values = pads.map(p => p.buttons && p.buttons[i]).filter(Boolean);
      const value = Math.max(0, ...values.map(b => Number(b.value) || (b.pressed ? 1 : 0)));
      return { pressed, value, touched: values.some(b => !!b.touched) };
    });
    const axes = Array.from({length: axisCount}, (_, i) => {
      const values = pads.map(p => p.axes && Number.isFinite(p.axes[i]) ? p.axes[i] : 0);
      return values.reduce((best, v) => Math.abs(v) > Math.abs(best) ? v : best, 0);
    });
    return { connected: true, index: -1, id: pads.map(p => p.id || 'Gamepad').join(' + '), buttons, axes };
  } catch (e) {
    return null;
  }
}

var wasTitleUpPressed = false;
var wasTitleDownPressed = false;

var p1BurokkuBaggu = []; // プレイヤーの現在の袋
var p1TsugiBurokkuBaggu = []; // プレイヤーの次の袋
var p2BurokkuBaggu = []; // P2/CPUの現在の袋
var p2TsugiBurokkuBaggu = []; // P2/CPUの次の袋

var isStarted = false; // ゲームがアクティブか (カウントダウン含む)
var isPaused = false; // ポーズ
var countdownTime = 0;
var countdownDuration = 3000;

var isRoundOver = false; 
var isMatchOver = false; 
var roundWinner = ''; // 'PLAYER1', 'PLAYER2', 'CPU', 'SOLO_END'

const MATCH_WIN_COUNT = 2; // 勝利に必要なラウンド数
var playerWins = 0;
var p2Wins = 0; // P2またはCPUの勝利数


// ★ P1 ロックディレイ
var isLanded = false; 
var lockDelayTimer = 0; 
const lockDelayDuration = 500; 
var lockDelayResetCount = 0; 
const MAX_LOCK_DELAY_RESETS = 15; 
var lowestY = 0; 

// ★ P2 (VS_LOCAL) ロックディレイ
var isLandedP2 = false;
var lockDelayTimerP2 = 0;
var lockDelayResetCountP2 = 0;
var lowestYP2 = 0;


// SRSのキックテーブルと ATTACK_TABLE 

const ATTACK_TABLE = {
    1: 0,   // Single
    2: 1,   // Double
    3: 2,   // Triple
    4: 4    // Tetris (基本攻撃力)
};

const JLSTZ_KICK_DATA = [
  // 0 -> 1 (右回転)
  [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
  // 1 -> 0 (左回転)
  [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
  // 1 -> 2 (右回転)
  [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
  // 2 -> 1 (左回転)
  [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
  // 2 -> 3 (右回転)
  [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
  // 3 -> 2 (左回転)
  [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
  // 3 -> 0 (右回転)
  [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
  // 0 -> 3 (左回転)
  [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
];

const I_KICK_DATA = [
  // 0 -> 1 (右回転)
  [[ 0, 0], [-2, 0], [ 1, 0], [-2,-1], [ 1, 2]],
  // 1 -> 0 (左回転)
  [[ 0, 0], [ 2, 0], [-1, 0], [ 2, 1], [-1,-2]],
  // 1 -> 2 (右回転)
  [[ 0, 0], [-1, 0], [ 2, 0], [-1, 2], [ 2,-1]],
  // 2 -> 1 (左回転)
  [[ 0, 0], [ 1, 0], [-2, 0], [ 1,-2], [-2, 1]],
  // 2 -> 3 (右回転)
  [[ 0, 0], [ 2, 0], [-1, 0], [ 2, 1], [-1,-2]],
  // 3 -> 2 (左回転)
  [[ 0, 0], [-2, 0], [ 1, 0], [-2,-1], [ 1, 2]],
  // 3 -> 0 (右回転)
  [[ 0, 0], [ 1, 0], [-2, 0], [ 1,-2], [-2, 1]],
  // 0 -> 3 (左回転)
  [[ 0, 0], [-1, 0], [ 2, 0], [-1, 2], [ 2,-1]],
];


// --- Joy-Con診断パネル（調査用・ゲームロジックは変更しない） ---
var joyconDebugPanel = null;
var joyconDebugTimerStarted = false;
function startJoyconDebugPanel() {
  if (joyconDebugTimerStarted || !document.body) return;
  joyconDebugTimerStarted = true;
  const panel = document.createElement('div');
  joyconDebugPanel = panel;
  panel.id = 'joycon-debug-panel';
  panel.style.cssText = 'position:fixed;z-index:2147483647;top:8px;right:8px;width:min(420px,48vw);max-height:45vh;overflow:auto;background:rgba(0,0,0,.88);color:#b8ffb8;border:2px solid #55cc77;border-radius:8px;padding:8px;font:12px/1.4 monospace;white-space:pre-wrap;pointer-events:auto;';
  const close = document.createElement('button');
  close.textContent = '診断パネルを閉じる';
  close.style.cssText = 'display:block;margin-bottom:6px;font-size:12px;';
  close.onclick = () => { panel.remove(); joyconDebugPanel = null; };
  panel.appendChild(close);
  const output = document.createElement('div');
  output.textContent = 'Gamepadを確認中...';
  panel.appendChild(output);
  document.body.appendChild(panel);
  const update = () => {
    if (!joyconDebugPanel || !joyconDebugPanel.isConnected) return;
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) {}
    const connected = pads.map((p, slot) => p ? {p, slot} : null).filter(x => x && x.p.connected !== false);
    if (!connected.length) { output.textContent = 'Gamepad API: 利用可能=' + !!navigator.getGamepads + '\n接続中のGamepadなし\nJoy-Conを接続してボタンを押してください'; return; }
    output.textContent = connected.map(({p, slot}) => {
      const pressed = [];
      const buttons = Array.from(p.buttons || []);
      buttons.forEach((b, i) => { if (b && (b.pressed || Number(b.value) > 0.15)) pressed.push(i + ':' + (Number(b.value).toFixed(2)) + (b.pressed ? '*' : '')); });
      const axes = Array.from(p.axes || []).map((v, i) => i + ':' + Number(v).toFixed(2)).join('  ') || '(なし)';
      return 'slot=' + slot + ' / index=' + p.index + '\nID: ' + p.id + '\nbuttons=' + buttons.length + ' / axes=' + (p.axes || []).length + '\n押されているボタン: ' + (pressed.join(', ') || '(なし)') + '\naxes: ' + axes;
    }).join('\n\n--------------------\n\n') + '\n\n※ボタンを押した瞬間に番号が表示されるか確認してください。';
  };
  update();
  setInterval(update, 100);
}

function setup() {
  // ▼▼▼ 修正点 2 (テトリス25): キャンバスサイズを変更 (36 * 22 = 792) ▼▼▼
  const canvas = createCanvas(1100, 810);
  gameCanvas = canvas;
  // スマホのタッチをブラウザのスクロール/ズームとして処理させず、
  // p5.js の touchStarted() に確実に渡す。
  if (canvas && canvas.elt) {
    canvas.elt.style.touchAction = 'none';
    canvas.elt.style.webkitUserSelect = 'none';
    canvas.elt.style.userSelect = 'none';
  }
 
  // ブロックの形状データ
  burokkuShurui = [
    // 0: O 
    [
      [[1, 1],
       [1, 1]]
    ],
    // 1: I 
    [
      [[0, 0, 0, 0],
       [1, 1, 1, 1],
       [0, 0, 0, 0],
       [0, 0, 0, 0]],
      [[0, 0, 1, 0],
       [0, 0, 1, 0],
       [0, 0, 1, 0],
       [0, 0, 1, 0]],
      [[0, 0, 0, 0],
       [0, 0, 0, 0],
       [1, 1, 1, 1],
       [0, 0, 0, 0]],
      [[0, 1, 0, 0],
       [0, 1, 0, 0],
       [0, 1, 0, 0],
       [0, 1, 0, 0]]
    ],
    // 2: L 
    [
      [[0, 0, 1],
       [1, 1, 1],
       [0, 0, 0]],
      [[0, 1, 0],
       [0, 1, 0],
       [0, 1, 1]],
      [[0, 0, 0],
       [1, 1, 1],
       [1, 0, 0]],
      [[1, 1, 0],
       [0, 1, 0],
       [0, 1, 0]]
    ],
    // 3: J 
    [
      [[1, 0, 0],
       [1, 1, 1],
       [0, 0, 0]],
      [[0, 1, 1],
       [0, 1, 0],
       [0, 1, 0]],
      [[0, 0, 0],
       [1, 1, 1],
       [0, 0, 1]],
      [[0, 1, 0],
       [0, 1, 0],
       [1, 1, 0]]
    ],
    // 4: S 
    [
      [[0, 1, 1],
       [1, 1, 0],
       [0, 0, 0]],
      [[0, 1, 0],
       [0, 1, 1],
       [0, 0, 1]],
      [[0, 0, 0],
       [0, 1, 1],
       [1, 1, 0]],
      [[1, 0, 0],
       [1, 1, 0],
       [0, 1, 0]]
    ],
    // 5: Z 
    [
      [[1, 1, 0],
       [0, 1, 1],
       [0, 0, 0]],
      [[0, 0, 1],
       [0, 1, 1],
       [0, 1, 0]],
      [[0, 0, 0],
       [1, 1, 0],
       [0, 1, 1]],
      [[0, 1, 0],
       [1, 1, 0],
       [1, 0, 0]]
    ],
    // 6: T 
    [
      [[0, 1, 0],
       [1, 1, 1],
       [0, 0, 0]],
      [[0, 1, 0],
       [0, 1, 1],
       [0, 1, 0]],
      [[0, 0, 0],
       [1, 1, 1],
       [0, 1, 0]],
      [[0, 1, 0],
       [1, 1, 0],
       [0, 1, 0]]
    ]
  ];
 
  // ブロックの色
  burokkuIro = [
    color(0, 0, 0, 0),    // 0: 透明 (空)
    color(255, 220, 0), // 1: O (黄)
    color(0, 220, 255), // 2: I (水)
    color(255, 140, 0), // 3: L (橙)
    color(0, 100, 255), // 4: J (青)
    color(0, 220, 0),   // 5: S (緑)
    color(255, 0, 0),   // 6: Z (赤)
    color(170, 0, 255), // 7: T (紫)
    color(130, 130, 130) // 8: おじゃまブロック (灰)
  ];
 
  // --- タイトルボタンの初期化 ---
  titleButtons.push({ y: 300, text: '1P SOLO', mode: 'SOLO' });
  titleButtons.push({ y: 360, text: '40 LINE SCORE ATTACK', mode: 'SCORE_ATTACK' });
  titleButtons.push({ y: 420, text: '1P vs CPU', mode: 'VS_CPU' });
  titleButtons.push({ y: 480, text: '1P vs 2P (Local)', mode: 'VS_LOCAL' });
  titleButtons.push({ y: 540, text: 'ONLINE BATTLE', mode: 'ONLINE' });

  restartGame();
  startJoyconDebugPanel();
}

// ▼▼▼ 修正点 3 (テトリス25): draw() の translate() を修正 ▼▼▼
function drawOnlineFourPlayerScreen() {
  background(18,18,30);
  const count=Math.max(2,Math.min(4,Number(onlinePlayerCount)||2));
  // オンライン画面を横長にして、自分の盤面の右にNEXT 6個を配置。
  const selfCell=22, selfW=RETSU*selfCell, selfH=GYO*selfCell;
  const smallCell=13, oppW=RETSU*smallCell, oppH=GYO*smallCell;
  const holdW=118, nextW=122, gap=20, oppGapX=26;
  const totalW=holdW+selfW+gap+nextW+gap+oppW;
  const startX=Math.max(10,(width-totalW)/2);
  const selfY=70;

  // 左：HOLD / ATTACK
  drawOnlineSelfHud(startX,selfY,holdW);

  // 中央：自分の盤面
  const boardX=startX+holdW;
  drawOnlineBoardAt(boardX,selfY,selfCell,gameBoard,imaNoBurokku);
  noStroke(); fill(255); textAlign(CENTER,CENTER); textSize(18);
  text(`${onlinePlayerNames[onlineRole] || 'PLAYER '+onlineRole}  YOU`,boardX+selfW/2,selfY-28);
  fill(220); textSize(14); text(`SCORE ${sukoa}`,boardX+selfW/2,selfY+selfH+20);
  // 獲得した星は全員の画面で、自分の盤面の下に表示する。
  const selfWins = Number(onlineScores[onlineRole] || 0);
  if(selfWins > 0){
    fill(255,220,0); stroke(0); strokeWeight(2); textSize(32);
    text('★'.repeat(Math.min(selfWins, MATCH_WIN_COUNT)),boardX+selfW/2,selfY+selfH+52);
  }

  // 自分の盤面の右：NEXT 6個
  const nextX=boardX+selfW+gap;
  drawOnlineNextPanel(nextX,selfY,nextW);

  // さらに右：相手盤面
  const opponents=[];
  for(let role=1;role<=count;role++) if(role!==onlineRole) opponents.push(role);
  const oppX=nextX+nextW+gap;
  const oppGapY=22;
  const allH=opponents.length*oppH+(opponents.length-1)*oppGapY;
  const oppTop=selfY+Math.max(0,(selfH-allH)/2);
  opponents.forEach((role,i)=>{
    const y=oppTop+i*(oppH+oppGapY), st=onlineRemoteStates[role];
    drawOnlineRemoteBoardAt(oppX,y,smallCell,st);
    noStroke(); fill(215); textSize(14); text(`${onlinePlayerNames[role] || 'PLAYER '+role}`,oppX+oppW/2,y-16);
    fill(190); textSize(12); text(`SCORE ${st?Number(st.score)||0:0}`,oppX+oppW/2,y+oppH+15);
    const oppWins = Number(onlineScores[role] || (st && st.wins) || 0);
    if(oppWins > 0){
      fill(255,220,0); stroke(0); strokeWeight(2); textSize(28);
      text('★'.repeat(Math.min(oppWins, MATCH_WIN_COUNT)),oppX+oppW/2,y+oppH+43);
    }
  });

  noStroke(); fill(255); textSize(15); text(`ROOM ${onlineRoom}   ${count} PLAYERS`,width/2,18);
  textSize(9); fill(120); text(ONLINE_BUILD_VERSION,width/2,31);
  if(onlineRole===1 && onlineJoinedCount>=count && !onlineMatchStarted){
    const bx=width/2-160, by=605, bw=320, bh=58;
    stroke(255); strokeWeight(3); fill(45,125,75); rect(bx,by,bw,bh,10);
    noStroke(); fill(255); textAlign(CENTER,CENTER); textSize(22); text('対戦を開始する（START）',width/2,by+bh/2);
    fill(235); textSize(12); text('ホストだけが押せます',width/2,by+bh+15);
  }
  if(onlineStatus){fill(190);textSize(13);text(onlineStatus,width/2,onlineRole===1 && onlineJoinedCount>=count && !onlineMatchStarted ? height-98 : height-18);}

  if(countdownTime>0) drawOnlineCountdown(selfY,selfH);
  if(isPaused && !isRoundOver){
    fill(0,0,0,160); rect(0,0,width,height); fill(255); textSize(32); text('PAUSED',width/2,height/2);
  }
  if(isRoundOver){
    fill(0,0,0,175); rect(0,0,width,height); fill(255); textSize(27);
    const winnerRole = onlineMatchWinnerRole || onlineRoundWinnerRole;
    const winnerName = onlinePlayerNames[winnerRole] || ('PLAYER ' + winnerRole);
    if(isMatchOver && onlineMatchWinnerRole) text(`${winnerName} Win`,width/2,height/2-20);
    else if(onlineRoundWinnerRole) text(`${winnerName} WINS ROUND!`,width/2,height/2-20);
    textSize(16); text(isMatchOver ? '何かキーを押すとモード選択へ' : '次のラウンドを開始します',width/2,height/2+25);

  }
}

function drawOnlineNextPanel(x,y,w){
  const panelH=GYO*BLOKU_SAIZU;
  noStroke(); fill(10,10,20,235); rect(x,y,w,panelH);
  fill(255); textAlign(CENTER,CENTER); textSize(15); text('NEXT',x+w/2,y+10);

  const preview=[];
  const bag=Array.isArray(p1BurokkuBaggu)?p1BurokkuBaggu:[];
  const nextBag=Array.isArray(p1TsugiBurokkuBaggu)?p1TsugiBurokkuBaggu:[];
  for(let i=bag.length-1;i>=0 && preview.length<6;i--) preview.push(bag[i]);
  for(let i=nextBag.length-1;i>=0 && preview.length<6;i--) preview.push(nextBag[i]);

  const boxH=61, boxGap=5, top=y+28;
  for(let i=0;i<6;i++){
    const cy=top+i*(boxH+boxGap);
    stroke(75); noFill(); rect(x+8,cy,w-16,boxH,4);
    if(preview[i]!==undefined) drawMiniBurokku(preview[i],x+w/2,cy+boxH/2);
  }
}

function drawOnlineScaledBoard(board,cell){
  if (!Array.isArray(board) || board.length !== GYO) return;
  push();
  noStroke();
  for(let y=0;y<GYO;y++){
    const row=board[y];
    if(!Array.isArray(row) || row.length !== RETSU) continue;
    for(let x=0;x<RETSU;x++){
      const v=Number(row[x]);
      if(Number.isInteger(v) && v>0 && v<burokkuIro.length){
        fill(burokkuIro[v]);
        rect(x*cell,y*cell,cell,cell);
      }
    }
  }
  pop();
}

function drawOnlineScaledBlock(block,cell){
  if(!block || !Array.isArray(block.shape)) return;
  const bx=Number(block.x), by=Number(block.y);
  if(!Number.isFinite(bx) || !Number.isFinite(by)) return;
  const blockColor=(Number(block.color)>=1 && Number(block.color)<burokkuIro.length)
    ? burokkuIro[Number(block.color)] : color(255);

  // ゴースト
  const board=Array.isArray(gameBoard) ? gameBoard : null;
  let ghostY=by;
  if(board && board.length===GYO){
    for(let n=0;n<=GYO+4;n++){
      const test={...block,y:ghostY+1};
      if(butsukaru(test,board)) break;
      ghostY++;
    }
  }
  push();
  noFill();
  stroke(255,255,255,100);
  strokeWeight(Math.max(1,cell/10));
  for(let r=0;r<block.shape.length;r++){
    const row=block.shape[r];
    if(!Array.isArray(row)) continue;
    for(let c=0;c<row.length;c++){
      if(row[c]!==0){
        const px=(bx+c)*cell, py=(ghostY+r)*cell;
        if(py+cell>=0 && py<=GYO*cell && px+cell>=0 && px<=RETSU*cell){
          rect(px,py,cell,cell);
        }
      }
    }
  }
  pop();

  push();
  noStroke();
  fill(blockColor);
  for(let r=0;r<block.shape.length;r++){
    const row=block.shape[r];
    if(!Array.isArray(row)) continue;
    for(let c=0;c<row.length;c++){
      if(row[c]!==0){
        const px=(bx+c)*cell, py=(by+r)*cell;
        if(py+cell>=0 && py<=GYO*cell && px+cell>=0 && px<=RETSU*cell){
          rect(px,py,cell,cell);
        }
      }
    }
  }
  pop();
}

function drawOnlineBoardAt(x,y,cell,board,block){
  const bw=RETSU*cell,bh=GYO*cell; push(); translate(x,y);
  fill(10,10,20,220); noStroke(); rect(0,0,bw,bh);
  stroke(80); noFill(); rect(0,0,bw,bh);
  for(let gx=0;gx<=RETSU;gx++) line(gx*cell,0,gx*cell,bh);
  for(let gy=0;gy<=GYO;gy++) line(0,gy*cell,bw,gy*cell);
  drawOnlineScaledBoard(board,cell); if(block) drawOnlineScaledBlock(block,cell); pop();
}
function drawOnlineRemoteBoardAt(x,y,cell,st){
  drawOnlineBoardAt(x,y,cell,st&&st.board?st.board:null,st&&st.block?st.block:null);
}
function drawOnlineSelfHud(x,y,w){
  const box=4*BLOKU_SAIZU;
  const panelH=GYO*BLOKU_SAIZU;
  noStroke(); fill(10,10,20,235); rect(x,y,w,panelH);
  fill(255); textAlign(CENTER,CENTER); textSize(15); text('HOLD',x+w/2,y+10);
  stroke(100); noFill(); rect(x+8,y+22,w-16,box/1.6,5);
  if(horudoBurokku!==null) drawMiniBurokku(horudoBurokku,x+w/2,y+22+(box/1.6)/2);

  const gaugeY=y+220, gaugeH=170, gaugeW=22;
  noStroke(); fill(255); textSize(13); text('ATTACK',x+w/2,gaugeY-10);
  fill(45,45,65); rect(x+(w-gaugeW)/2,gaugeY,gaugeW,gaugeH);
  const totalAttack=Math.max(0,Number(attackPower)||0)+((playerAttackQueue||[]).reduce((a,v)=>a+(Number(v)||0),0));
  const barH=Math.min(gaugeH,gaugeH*Math.min(totalAttack,12)/12);
  fill(255,60,60); rect(x+(w-gaugeW)/2,gaugeY+gaugeH-barH,gaugeW,barH);
  fill(255); textSize(12); text(`AP ${attackPower||0}`,x+w/2,gaugeY+gaugeH+18);
}
function drawOnlineCountdown(y,h){
  const sec=Math.ceil((countdownDuration-(millis()-countdownTime))/1000);
  if(sec<=0){countdownTime=0;isPaused=false;return;}
  fill(0,0,0,145); rect(0,y,width,h); fill(255,255,0); textAlign(CENTER,CENTER); textSize(88); text(sec,width/2,y+h/2);
}

function draw() {
  background(30, 30, 50);
  if (gameMode === 'TITLE') { drawTitleScreen(); handlePlayerInput(); return; }

  if (gameMode === 'ONLINE') {
    drawOnlineFourPlayerScreen();
    if (countdownTime > 0) {
      // drawOnlineCountdown() が0に更新するので、3秒後に通常ゲームへ移行する。
      drawOnlineCountdown(70, GYO*BLOKU_SAIZU);
    } else if (!isMatchOver && !isRoundOver && !isPaused && isStarted) {
      handlePlayerInput();
      if (isLanded && lockDelayTimer > 0 && millis() > lockDelayTimer) hardDrop(1);
      else if (!isLanded && frameCount % framesPerDrop === 0) moveDown(1);
    }
    sendLocalOnlineState(false);
    return;
  }

  // 1. UIは常に描画
  drawUI();

  // 2. P1ボードを描画
  push();
  translate(getP1BoardX(), 0); // スコアアタック時は中央配置
  drawGrid();
  drawGameBoard(gameBoard, 0);
  drawImaNoBurokku(imaNoBurokku, 0);
  pop();

  // 3. P2/CPUボードを描画 (SOLOモード以外)
  if (gameMode === 'VS_CPU' || gameMode === 'VS_LOCAL' || gameMode === 'ONLINE') {
    push();
    translate(P2_BOARD_X_OFFSET, 0); // P2ボード (x=484)
    drawGrid();
    drawGameBoard(gameBoardP2, 0);
    drawImaNoBurokku(imaNoBurokkuP2, 0);
    pop();
  }
 
  // 4. オンラインのゲスト(P2)は「自分の操作・自分の表示」を最優先。
  // 入力は即座にローカルP2へ反映し、同じ入力をホストへ送る。
  if (gameMode === 'ONLINE' && onlineRole >= 2) {
    handleOnlineGuestInput();
    if (isMatchOver) {
      drawMatchOverScreen();
    } else if (isRoundOver) {
      drawRoundOverScreen();
    } else if (countdownTime > 0) {
      drawCountdown();
    } else if (isPaused) {
      drawPauseScreen();
    } else if (isStarted) {
      // P2のゲーム処理をゲスト側でも動かす。ホストからの往復を待たない。
      handleOnlineHostP2Input();
      if (isLandedP2 && lockDelayTimerP2 > 0 && millis() > lockDelayTimerP2) {
        hardDrop(2);
      } else if (!isLandedP2 && frameCount % framesPerDrop === 0 && !onlineGuestKeyState.down) {
        moveDown(2);
      }
    }
    return;
  }

  // 40ライン・スコアアタック専用表示と終了判定
  if (gameMode === 'SCORE_ATTACK') {
    if (isMatchOver) { drawScoreAttackResult(); return; }
    if (countdownTime <= 0) drawScoreAttackHUD();
    if (scoreAttackLines >= 40) { finishScoreAttack(); drawScoreAttackResult(); return; }
  }

  // 4. 状態ごとの処理
  if (isMatchOver) {
    drawMatchOverScreen(); 
    handlePlayerInput(); 
    if (gameMode === 'VS_LOCAL') handlePlayer2Input(); 
  }
  else if (isRoundOver) {
    drawRoundOverScreen(); 
    handlePlayerInput(); 
    if (gameMode === 'VS_LOCAL') handlePlayer2Input(); 
  }
  else if (!isStarted) {
    // (nextRound で isStarted = true になる)
  } 
  else if (countdownTime > 0) {
    drawCountdown();
    handlePlayerInput();
    if (gameMode === 'VS_LOCAL') handlePlayer2Input();
  } 
  else if (isPaused) {
    drawPauseScreen();
    handlePlayerInput();
    if (gameMode === 'VS_LOCAL') handlePlayer2Input();
  } 
  else {
    // --- 通常のゲームロジック ---
    handlePlayerInput(); // P1 入力
    
    // P1: ロックディレイ
    if (isLanded && lockDelayTimer > 0 && millis() > lockDelayTimer) {
      hardDrop(1); 
    }
    // P1: 自然落下
    else if (!isLanded && frameCount % framesPerDrop === 0) {
        let isSoftDropping = false;
        const gp = getActiveGamepad();
        if (gp) {
             isSoftDropping = isSoftDropping || (gp.axes[1] > 0.5 || gp.buttons[13].pressed);
        }
        if (!isSoftDropping) {
             moveDown(1);
        }
    }

    // --- P2 または CPU のロジック ---
    if (gameMode === 'VS_CPU') {
      if (frameCount % 5 === 0) { 
          cpuTurn();
      }
    } else if (gameMode === 'VS_LOCAL' || gameMode === 'ONLINE') {
      if (gameMode === 'VS_LOCAL') {
        handlePlayer2Input(); // P2 入力
      } else {
        handleOnlineHostP2Input(); // オンラインP2はゲスト入力をホストで実行
      }
      
      // P2: ロックディレイ
      if (isLandedP2 && lockDelayTimerP2 > 0 && millis() > lockDelayTimerP2) {
        hardDrop(2); 
      }
      // P2: 自然落下
      else if (!isLandedP2 && frameCount % framesPerDrop === 0) {
          if (gameMode === 'ONLINE' ? !onlineGuestKeyState.down : !keyConfigIsDown('down')) {
               moveDown(2);
          }
      }
    }
  }

  if (gameMode === 'ONLINE' && onlineRole === 1) {
    sendOnlineStateIfNeeded();
  }
}
// ▲▲▲

// ボード背景とグリッド線
function drawGrid() {
  fill(10, 10, 20, 200); 
  noStroke();
  rect(0, 0, RETSU * BLOKU_SAIZU, GYO * BLOKU_SAIZU); 
 
  stroke(80, 80, 120); 
  strokeWeight(1);
  for (let j = 0; j <= RETSU; j++) {
    line(j * BLOKU_SAIZU, 0, j * BLOKU_SAIZU, GYO * BLOKU_SAIZU); 
  }
  for (let i = 0; i <= GYO; i++) {
    line(0, i * BLOKU_SAIZU, RETSU * BLOKU_SAIZU, i * BLOKU_SAIZU);
  }

  // ゲーム開始後もボード枠の下辺を白く表示する（横のグリッド線と同じ太さ）
  stroke(255);
  strokeWeight(1);
  line(0, GYO * BLOKU_SAIZU, RETSU * BLOKU_SAIZU, GYO * BLOKU_SAIZU);
}

// ▼▼▼ 修正点 4 (テトリス25): drawUI() を新レイアウトに合わせて変更 ▼▼▼
function drawUI() {
  let uiWidth = UI_RETSU * BLOKU_SAIZU;

  // --- プレイヤー側 (左) HOLD UI ---
  drawHoldUI(
    P1_UI_HOLD_X_OFFSET + getP1LayoutOffset(), // スコアアタック時は中央配置
    uiWidth,
    "PLAYER 1", 
    horudoBurokku, 
    playerWins,
    playerAttackQueue,
    1 // Player Index
  );
 
  // --- プレイヤー側 (右) NEXT/SCORE UI ---
  drawNextAndStatsUI(
    P1_UI_NEXT_X_OFFSET + getP1LayoutOffset(), // スコアアタック時は中央配置
    uiWidth,
    p1BurokkuBaggu, 
    p1TsugiBurokkuBaggu, 
    sukoa, 
    attackPower, 
    playerAttackQueue.reduce((sum, val) => sum + val, 0), 
    lockDelayResetCount,
    MAX_LOCK_DELAY_RESETS,
    1 // Player Index
  );

  // --- P2 / CPU側 (SOLOモード以外) ---
  if (gameMode !== 'SOLO' && gameMode !== 'SCORE_ATTACK') {
    let p2Title = (gameMode === 'VS_CPU') ? "CPU" : (gameMode === 'ONLINE' ? "PLAYER 2 ONLINE" : "PLAYER 2");
    
    // --- P2/CPU側 (左) HOLD UI ---
    drawHoldUI(
      P2_UI_HOLD_X_OFFSET, // 396
      uiWidth,
      p2Title, 
      cpuHoldBlock, 
      p2Wins,
      player2AttackQueue,
      2 // Player Index
    );

    // --- P2/CPU側 (右) NEXT/SCORE UI ---
    drawNextAndStatsUI(
      P2_UI_NEXT_X_OFFSET, // 704
      uiWidth,
      p2BurokkuBaggu, 
      p2TsugiBurokkuBaggu, 
      cpuScore, 
      cpuAttackPower, 
      player2AttackQueue.reduce((sum, val) => sum + val, 0), 
      lockDelayResetCountP2,
      MAX_LOCK_DELAY_RESETS,
      2 // Player Index
    );
  }
 
  // 区切り線
  stroke(255); 
  strokeWeight(4);
  
  if (gameMode !== 'SOLO' && gameMode !== 'SCORE_ATTACK') {
    line(P2_UI_HOLD_X_OFFSET, 0, P2_UI_HOLD_X_OFFSET, height); // 396
    line(P2_BOARD_X_OFFSET, 0, P2_BOARD_X_OFFSET, height); // 484
    line(P2_UI_NEXT_X_OFFSET, 0, P2_UI_NEXT_X_OFFSET, height); // 704
  }
}
// ▲▲▲

// ▼▼▼ 修正点 5 (テトリス25): drawHoldUI を P1/P2/CPU 共通化 ▼▼▼
function drawHoldUI(uiStartX, uiWidth, title, holdType, winCount, queueArray, playerIndex) {
  let boxSize = 4 * BLOKU_SAIZU; 
 
  fill(10, 10, 20); // 背景
  noStroke();
  rect(uiStartX, 0, uiWidth, height); 

  // --- Y座標の管理 ---
  let yPos = 20;

  // --- タイトル ---
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(20);
  text(title, uiStartX + uiWidth / 2, yPos); // Y: 20
  yPos += 30; // 50

  // --- 勝利数 (★) ---
  let winText = "";
  for(let i = 0; i < winCount; i++) {
    winText += "★"; 
  }
  textSize(25);
  fill(255, 255, 0); 
  text(winText, uiStartX + uiWidth / 2, yPos); // Y: 50
  yPos += 20; // 70

  // --- HOLD ---
  let holdBoxY = yPos; // Y: 70
  noFill();
  stroke(100); 
  rect(uiStartX + (uiWidth - boxSize) / 2, holdBoxY, boxSize, boxSize, 5);
  drawMiniBurokku(holdType, uiStartX + uiWidth / 2, holdBoxY + (boxSize / 2));
  yPos += boxSize + 15; // 70 + 88 + 15 = 173

  // ★★★ アタックゲージ ★★★
  if (gameMode !== 'SOLO' && gameMode !== 'SCORE_ATTACK') { 
    let gaugeY = yPos; // Y: 173
    let gaugeWidth = 30;
    let gaugeHeight = (GYO * BLOKU_SAIZU) - gaugeY - 15; // 440 - 173 - 15 = 252px
    let gaugeX = uiStartX + (uiWidth - gaugeWidth) / 2;
    
    textAlign(CENTER, CENTER);
    fill(255);
    textSize(18);
    text("ATTACK", uiStartX + uiWidth / 2, gaugeY);
    yPos += 25; // 198
    gaugeY = yPos; // ゲージ本体の開始Y
    gaugeHeight = (GYO * BLOKU_SAIZU) - gaugeY - 15; // 440 - 198 - 15 = 227px

    // ゲージ背景
    fill(40, 40, 60);
    noStroke();
    rect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    // ゲージ計算
    let totalAttack = queueArray.reduce((sum, val) => sum + val, 0);
    let maxGaugeDisplay = 12; 
    let barHeight = min(map(totalAttack, 0, maxGaugeDisplay, 0, gaugeHeight), gaugeHeight);
    
    // ゲージ本体 (12ラインまでは赤)
    fill(255, 50, 50); // 赤
    rect(gaugeX, gaugeY + gaugeHeight - barHeight, gaugeWidth, barHeight);

    // 12ラインを超えた分 (黄色)
    if (totalAttack > maxGaugeDisplay) {
        let overAttack = totalAttack - maxGaugeDisplay;
        let overHeight = min(map(overAttack, 0, maxGaugeDisplay, 0, gaugeHeight), gaugeHeight); 
        overHeight = min(overHeight, gaugeHeight - barHeight); 
        
        fill(255, 255, 0); // 黄色
        rect(gaugeX, gaugeY + gaugeHeight - barHeight - overHeight, gaugeWidth, overHeight);
    }
  }
}
// ▲▲▲

// ▼▼▼ 修正点 6 (テトリス25): drawNextAndStatsUI を P1/P2/CPU 共通化 ▼▼▼
function drawNextAndStatsUI(
    uiStartX, uiWidth, bag, tsugiBag, score, attack, queueCount, lockResets, maxResets, playerIndex
) {
  let boxSize = 4 * BLOKU_SAIZU; // 88px
  let miniBoxSize = 2.5 * BLOKU_SAIZU; // 55px
  let nextBoxMargin = 5; 

  fill(10, 10, 20); // 背景
  noStroke();
  rect(uiStartX, 0, uiWidth, height); 

  // --- Y座標の管理 ---
  let yPos = 20; // Y座標をリセット

  // --- NEXT表示 ---
  let nextBoxY = yPos; // Y: 20
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(20);
  text("NEXT", uiStartX + uiWidth / 2, nextBoxY);
  yPos += 25; // 45 (Nextブロックの開始Y)

  let nextDrawX = uiStartX + uiWidth / 2;
  let boxLeftX = uiStartX + (uiWidth - miniBoxSize) / 2; 

  for (let i = 0; i < 6; i++) { // 6個表示
    let nextType = null;
    let currentBag = bag; 
    let indexInCurrentBag = currentBag.length - 1 - i;

    if (indexInCurrentBag >= 0) {
      nextType = currentBag[indexInCurrentBag];
    } else {
      let indexInNextBag = tsugiBag.length - 1 - (i - currentBag.length);
      if (tsugiBag.length > 0 && indexInNextBag >= 0) { 
        nextType = tsugiBag[indexInNextBag];
      }
    }

    if (nextType === null) break; 
   
    let currentNextBoxY = yPos + i * (miniBoxSize + nextBoxMargin); // Y: 45 + ...
   
    noFill();
    stroke(100); 
    rect(boxLeftX, currentNextBoxY, miniBoxSize, miniBoxSize, 5); 

    let nextDrawY = currentNextBoxY + (miniBoxSize / 2);
   
    push();
    translate(nextDrawX, nextDrawY);
    let scaleFactor = miniBoxSize / boxSize; 
    scale(scaleFactor);
    drawMiniBurokku(nextType, 0, 0);
    pop();
  }
 
  yPos += 6 * (miniBoxSize + nextBoxMargin); // 45 + 6 * (55 + 5) = 45 + 360 = 405

  // --- スコア表示 ---
  let scoreY = yPos + 15; // Y: 420
  textAlign(CENTER, CENTER); 
  fill(255);
  textSize(20); 
  text("SCORE", uiStartX + uiWidth / 2, scoreY);
  textSize(25); 
  text(score, uiStartX + uiWidth / 2, scoreY + 25); // Y: 445
  yPos = scoreY + 45; // 465

  // --- 攻撃力 (AP) / 待機キュー表示 (SOLOモード以外) ---
  if (gameMode !== 'SOLO') {
    let attackY = yPos; // Y: 465
    textSize(18); 
    fill(255);
    text("ATTACK (AP)", uiStartX + uiWidth / 2, attackY);
    textSize(25); 
    fill(50, 50, 255);
    text(attack, uiStartX + uiWidth / 2, attackY + 25); // Y: 490
    yPos = attackY + 45; // 510

    // --- 攻撃キュー (Garbage Queue) ---
    let queueY = yPos; // Y: 510
    textSize(18); 
    fill(255);
    text("QUEUE", uiStartX + uiWidth / 2, queueY);
    textSize(25); 
    fill(255, 100, 50); 
    text(queueCount, uiStartX + uiWidth / 2, queueY + 25); // Y: 535
    yPos = queueY + 45; // 580
  }

  // --- ロック遅延リセット回数表示 (P1 または P2 のみ) ---
  if (playerIndex === 1 || playerIndex === 2) {
    let resetCountY = yPos; // Y: 580 (または 465)
    textSize(18); 
    fill(255);
    text("LOCK RESETS", uiStartX + uiWidth / 2, resetCountY);
    textSize(25); 
   
    if (lockResets >= maxResets) {
      fill(255, 50, 50);
    } else {
      fill(50, 150, 255);
    }

    text(`${lockResets} / ${maxResets}`, uiStartX + uiWidth / 2, resetCountY + 25); // Y: 605
  }
}
// ▲▲▲

// (drawSingleUI は削除)


// ゲームボードの描画
function drawGameBoard(board, xOffset) {
  // オンライン受信データが壊れても描画ループを止めない。
  if (!Array.isArray(board) || board.length !== GYO) return;
  for (let i = 0; i < GYO; i++) {
    if (!Array.isArray(board[i]) || board[i].length !== RETSU) continue;
    for (let j = 0; j < RETSU; j++) {
      const cell = Number(board[i][j]);
      if (cell !== 0 && Number.isInteger(cell) && cell >= 1 && cell < burokkuIro.length) {
        fill(burokkuIro[cell]);
        stroke(10, 10, 20, 100);
        strokeWeight(1);
        rect(j * BLOKU_SAIZU, i * BLOKU_SAIZU, BLOKU_SAIZU, BLOKU_SAIZU);
      }
    }
  }
}

// 操作ブロックとゴーストブロックの描画
function drawImaNoBurokku(burokku, xOffset) {
  if (!burokku || !Array.isArray(burokku.shape) || !Number.isFinite(Number(burokku.x)) || !Number.isFinite(Number(burokku.y))) return;
  const board = burokku === imaNoBurokku ? gameBoard : gameBoardP2;
  if (!Array.isArray(board) || board.length !== GYO) return;

  // ゴースト位置の探索は安全上 GYO+4 回までに制限。
  let dropY = Number(burokku.y);
  for (let n = 0; n <= GYO + 4; n++) {
    const test = { ...burokku, y: dropY + 1 };
    if (butsukaru(test, board)) break;
    dropY++;
  }

  push();
  noFill();
  stroke(255, 255, 255, 100);
  strokeWeight(2);
  for (let i = 0; i < burokku.shape.length; i++) {
    if (!Array.isArray(burokku.shape[i])) continue;
    for (let j = 0; j < burokku.shape[i].length; j++) {
      if (burokku.shape[i][j] !== 0) {
        rect(
          (Number(burokku.x) + j) * BLOKU_SAIZU,
          (dropY + i) * BLOKU_SAIZU,
          BLOKU_SAIZU,
          BLOKU_SAIZU
        );
      }
    }
  }
  pop();

  push();
  noStroke();
  if (burokku.color >= 1 && burokku.color < burokkuIro.length) fill(burokkuIro[burokku.color]);
  else fill(255);
  for (let i = 0; i < burokku.shape.length; i++) {
    if (!Array.isArray(burokku.shape[i])) continue;
    for (let j = 0; j < burokku.shape[i].length; j++) {
      if (burokku.shape[i][j] !== 0) {
        rect(
          (Number(burokku.x) + j) * BLOKU_SAIZU,
          (Number(burokku.y) + i) * BLOKU_SAIZU,
          BLOKU_SAIZU,
          BLOKU_SAIZU
        );
      }
    }
  }
  pop();
}

// ミニブロック (HOLD/NEXT) の描画
function drawMiniBurokku(type, centerX, centerY) {
  if (type === null || type === undefined) return;
 
  let katachi = burokkuShurui[type][0];
  let iro = burokkuIro[type + 1];
  let burokkuNari = katachi.length; 

  let burokkuHabu = burokkuNari * BLOKU_SAIZU;

  let startX = centerX - burokkuHabu / 2;
  let startY = centerY - burokkuHabu / 2;

  fill(iro);
  stroke(10, 10, 20, 100); 
  strokeWeight(1);
  for (let i = 0; i < katachi.length; i++) {
    for (let j = 0; j < katachi[i].length; j++) {
      if (katachi[i][j] !== 0) {
        rect(
          startX + (j * BLOKU_SAIZU), 
          startY + (i * BLOKU_SAIZU), 
          BLOKU_SAIZU, 
          BLOKU_SAIZU
        );
      }
    }
  }
}

// ▼▼▼ 修正点 7 (テトリス25): タイトル画面の描画 ▼▼▼
function drawTitleScreen() {
    fill(10, 10, 20, 200); 
    rect(0, 0, width, height); 

    fill(0, 255, 0);
    stroke(0);
    textSize(60);
    textAlign(CENTER, CENTER);
    text("TETRIS BATTLE", width / 2, height / 2 - 150); 
    
    textSize(20);
    fill(255);
    text("Press A (Gamepad/Keyboard) or Click to Select", width / 2, height / 2 - 80);

    // ボタンの描画
    let btnWidth = 250;
    let btnHeight = 45;
    let btnX = (width - btnWidth) / 2;
    
    for (let i = 0; i < titleButtons.length; i++) {
        let btn = titleButtons[i];
        
        if (i === selectedButtonIndex) {
            fill(70, 70, 120);
            stroke(255, 255, 0); 
            strokeWeight(3);
        } else {
            fill(40, 40, 80);
            stroke(150);
            strokeWeight(2);
        }
        rect(btnX, btn.y, btnWidth, btnHeight, 10);
        
        if (i !== selectedButtonIndex && mouseX > btnX && mouseX < btnX + btnWidth && mouseY > btn.y && mouseY < btn.y + btnHeight) {
            fill(70, 70, 120);
            rect(btnX, btn.y, btnWidth, btnHeight, 10);
        }
        
        noStroke();
        if (btn.mode === 'ONLINE') {
            fill(255);
        } else {
            fill(255);
        }
        textSize(24);
        textAlign(CENTER, CENTER);
        text(btn.text, btnX + btnWidth / 2, btn.y + btnHeight / 2);
    }

    if (onlineStatus) {
        fill(255, 255, 0);
        textSize(18);
        const onlineCountForTitle = Math.max(2, Math.min(4, Number(onlinePlayerCount) || 2));
        const showHostStartTitle = !!(onlineRoom && onlineRole === 1 && onlineJoinedCount >= onlineCountForTitle && !onlineMatchStarted);
        text(onlineStatus, width / 2, showHostStartTitle ? 540 : 650);
        if (onlineRoom) {
            fill(255);
            textSize(24);
            text('ROOM: ' + onlineRoom, width / 2, showHostStartTitle ? 575 : 685);
        }
    }

    // 人数がそろったホストだけ、タイトル画面上にSTARTボタンを表示する。
    const onlineCount = Math.max(2, Math.min(4, Number(onlinePlayerCount) || 2));
    if (onlineRoom && onlineRole === 1 && onlineJoinedCount >= onlineCount && !onlineMatchStarted) {
        const bx = width / 2 - 160;
        const by = 605;
        const bw = 320;
        const bh = 58;
        stroke(255, 255, 0);
        strokeWeight(3);
        fill(45, 125, 75);
        rect(bx, by, bw, bh, 10);
        noStroke();
        fill(255);
        textSize(24);
        text('対戦を開始する（START）', width / 2, by + bh / 2);
        fill(220);
        textSize(12);
        text('ホストだけが押せます', width / 2, by + bh + 16);
    }

    if (onlineProfile && onlineProfile.rating !== undefined) {
      noStroke(); fill(220); textSize(14); textAlign(LEFT, TOP);
      text(`Google: ${onlineProfile.displayName || 'ログイン中'}  レート ${onlineProfile.rating}  勝 ${onlineProfile.wins || 0} 敗 ${onlineProfile.losses || 0}`, 18, 18);
    }

    // ホーム画面右上のプロフィール・ランキングボタン
    stroke(220); strokeWeight(2); fill(40, 40, 75); rect(width - 395, 18, 125, 42, 8); noStroke(); fill(255); textSize(17); textAlign(CENTER, CENTER); text('ランキング', width - 332, 39);
    stroke(220); strokeWeight(2); fill(40, 40, 75); rect(width - 260, 18, 125, 42, 8); noStroke(); fill(255); textSize(17); textAlign(CENTER, CENTER); text('プロフィール', width - 197, 39);

    // ホーム画面右上のヘルプボタン
    stroke(220); strokeWeight(2); fill(40, 40, 75);
    rect(width - 125, 18, 105, 42, 8);
    noStroke(); fill(255); textSize(19); textAlign(CENTER, CENTER);
    text('？ ヘルプ', width - 72, 39);

    if (helpOpen) drawHelpOverlay();
    if (keyConfigOpen) drawKeyConfigOverlay();
    if (rankingOpen) drawRankingOverlay();
}
// ▲▲▲

function drawHelpOverlay() {
    push();
    noStroke(); fill(0, 0, 0, 205); rect(0, 0, width, height);
    const panelW = Math.min(820, width - 32), panelH = Math.min(700, height - 24);
    const x = (width - panelW) / 2, y = (height - panelH) / 2;
    stroke(210); strokeWeight(2); fill(24, 24, 43); rect(x, y, panelW, panelH, 14);
    noStroke(); fill(255); textAlign(CENTER, CENTER); textSize(28); text('操作ヘルプ', width / 2, y + 32);
    textAlign(LEFT, TOP); textSize(15);
    const lines = [
      '■ ゲーム操作',
      '1P SOLO / 1P vs CPU：A・D＝左右移動、S＝下移動、W または Space＝ハードドロップ',
      '回転＝矢印キー、ホールド＝C、P＝一時停止／再開',
      '■ Switchコントローラー（対応ブラウザ）',
      '十字キー／左スティック＝移動、上＝ハードドロップ、A/B＝回転、X/Y/L/R＝ホールド、＋＝ポーズ',
      '接続後、ゲーム画面を一度クリックしてから操作してください。ブラウザによって対応状況が異なります。',
      '',
      '■ 1P vs 2P（同じ端末で対戦）',
      '1P：A・D・S＝移動、W＝ハードドロップ、E・Q・C＝ホールド、F・G＝回転',
      '2P：J・L・K＝移動、I＝ハードドロップ、U・O・>＝ホールド、矢印キー＝回転',
      '',
      '■ ONLINE BATTLE（オンライン対戦）',
      'ランク対戦：相手と自動マッチング。勝つとレートが上がり、負けると下がります。',
      'フリー対戦：相手と自動マッチング。ランクレートを競うモードではありません。',
      'パスワード対戦：ルームを作成し、同じルームコードを相手に伝えて参加してもらいます。',
      'オンライン画面の表示と案内に従って、マッチングまたはルーム参加を進めてください。',
      '',
      '■ ランキング・プロフィール',
      'ランキング：レート順の上位プレイヤーを表示します。ログイン中は自分の順位も確認できます。',
      '上位50位より下の場合も、自分の順位・レートが別枠で表示されます。',
      'プロフィール：表示名や戦績を確認できます。キーコンフィグで操作キーを変更できます。',
      '',
      '閉じる：右下の「閉じる」を押すか、Esc キーを押してください。'
    ];
    let yy = y + 58;
    const lineH = Math.max(17, Math.min(21, (panelH - 112) / lines.length));
    for (const line of lines) {
      if (yy + lineH > y + panelH - 42) break;
      if (line.startsWith('■')) { fill(255, 220, 120); } else { fill(240); }
      text(line, x + 20, yy, panelW - 40, lineH + 2);
      yy += lineH;
    }
    stroke(220); fill(55, 55, 90); rect(x + panelW - 125, y + panelH - 36, 105, 26, 7);
    noStroke(); fill(255); textAlign(CENTER, CENTER); textSize(14); text('閉じる', x + panelW - 72, y + panelH - 23);
    pop();
}

// ▼▼▼ 修正点 8 (テトリス25): ポーズ画面の描画を修正 ▼▼▼
function drawPauseScreen() {
    let boardWidth = RETSU * BLOKU_SAIZU;
    let boardHeight = GYO * BLOKU_SAIZU;
    
    // P1ボードにカバー
    push();
    translate(getP1BoardX(), 0); 
    fill(0, 0, 0, 150); 
    rect(0, 0, boardWidth, boardHeight); 
    pop();

    // P2/CPUボードにもカバー (SOLOモード以外)
    if (gameMode !== 'SOLO' && gameMode !== 'SCORE_ATTACK') {
        push();
        translate(P2_BOARD_X_OFFSET, 0); 
        fill(0, 0, 0, 150); 
        rect(0, 0, boardWidth, boardHeight); 
        pop(); 
    }

    // 中央にメッセージ
    fill(255);
    stroke(0);
    textSize(40);
    textAlign(CENTER, CENTER);
    text("PAUSED", width / 2, height / 2); 
    textSize(20);
    text("Press Start/P to Resume", width / 2, height / 2 + 40); 
}
// ▲▲▲

// ▼▼▼ 修正点 9 (テトリス25): カウントダウン画面の描画を修正 ▼▼▼
function drawCountdown() {
    let timeLeft = countdownDuration - (millis() - countdownTime);
    let seconds = ceil(timeLeft / 1000);
   
    if (seconds <= 0) {
        countdownTime = 0;
        isPaused = false;
        if (gameMode === 'SCORE_ATTACK' && scoreAttackStartPending) { scoreAttackStartMs = millis(); scoreAttackStartPending = false; }
        if (gameMode === 'VS_CPU') {
           cpuNextMove = calculateBestMove(gameBoardP2, imaNoBurokkuP2);
        }
        return;
    }

    let boardWidth = RETSU * BLOKU_SAIZU;
    let boardHeight = GYO * BLOKU_SAIZU;
    
    // P1ボードに表示
    push();
    translate(getP1BoardX(), 0);
    fill(0, 0, 0, 150);
    rect(0, 0, boardWidth, boardHeight); 
    fill(255, 255, 0);
    stroke(0);
    textSize(100);
    textAlign(CENTER, CENTER);
    text(seconds, boardWidth / 2, boardHeight / 2);
    pop();

    // P2/CPUボードに表示 (SOLOモード以外)
    if (gameMode !== 'SOLO' && gameMode !== 'SCORE_ATTACK') {
        push();
        translate(P2_BOARD_X_OFFSET, 0);
        fill(0, 0, 0, 150);
        rect(0, 0, boardWidth, boardHeight); 
        fill(255, 255, 0);
        stroke(0);
        textSize(100);
        textAlign(CENTER, CENTER);
        text(seconds, boardWidth / 2, boardHeight / 2);
        pop();
    }
}
// ▲▲▲

// ▼▼▼ 修正点 10 (テトリス25): ラウンド/マッチ終了画面の描画を修正 ▼▼▼
function drawRoundOverScreen() {
    let message = "";
    let color = [255, 0, 0];
   
    if (roundWinner === 'CPU' || roundWinner === 'PLAYER2') {
        message = `${roundWinner} WINS ROUND`;
        color = [255, 0, 0];
    } else if (roundWinner === 'PLAYER1') {
        message = "PLAYER 1 WINS ROUND";
        color = [0, 255, 0];
    }
   
    // メッセージを画面中央に表示
    fill(color);
    stroke(0);
    textSize(30);
    textAlign(CENTER, CENTER);
    text(message, width / 2, height / 2 - 20); 
    textSize(20);
    fill(255);
    text("Press Rotate for Next Round", width / 2, height / 2 + 20);
}

function drawMatchOverScreen() {
    let message = "";
    let color = [255, 0, 0];
   
    if (playerWins >= MATCH_WIN_COUNT) {
        message = "PLAYER 1 WINS MATCH!";
        color = [0, 255, 0];
    } else if (p2Wins >= MATCH_WIN_COUNT) {
        message = (gameMode === 'VS_CPU' ? 'CPU' : 'PLAYER 2') + " WINS MATCH!";
        color = [255, 0, 0];
    } else if (roundWinner === 'SOLO_END') { // SOLOモードの終了
        message = "GAME OVER";
        color = [255, 255, 0]; 
    }
   
    // メッセージを画面中央に表示
    fill(color);
    stroke(0);
    textSize(35);
    textAlign(CENTER, CENTER);
    text(message, width / 2, height / 2 - 20); 
    textSize(20);
    fill(255);
    text("Press Rotate to Restart", width / 2, height / 2 + 20);
}
// ▲▲▲


// プレイヤーの入力処理
function handlePlayerInput() {
    const gp = getActiveGamepad(); 
   
    // --- 汎用ボタン状態 (コントローラー) ---
    let isAPressed = false;
    let isBPressed = false;
    let isXPressed = false;
    let isYPressed = false;
    let isLPressed = false;
    let isRPressed = false;
    let isStartPressed = false;
    
    let axisX = 0;
    let axisY = 0;
    let dpadUp = false;
    let dpadDown = false;
    let dpadLeft = false;
    let dpadRight = false;
    
    if (gp) {
        isAPressed = gp.buttons[0].pressed;
        isBPressed = gp.buttons[1].pressed;
        isXPressed = gp.buttons[2].pressed; 
        isYPressed = gp.buttons[3].pressed; 
        isLPressed = gp.buttons[4].pressed;
        isRPressed = gp.buttons[5].pressed;
        isStartPressed = gp.buttons[9].pressed;
        
        axisX = gp.axes[0]; 
        axisY = gp.axes[1]; 
        dpadUp = gp.buttons[12].pressed;
        dpadDown = gp.buttons[13].pressed;
        dpadLeft = gp.buttons[14].pressed;
        dpadRight = gp.buttons[15].pressed;
    }
   
    // 状態 1: マッチ終了 (タイトルに戻る)
    if (isMatchOver) {
        if ((isAPressed && !wasAGamepadPressed) || (isBPressed && !wasBGamepadPressed) ||
            (isLPressed && !wasLGamepadPressed) || (isRPressed && !wasRGamepadPressed)) {
            restartGame(); 
        }
    } 
    // 状態 2: ラウンド終了 (次のラウンドへ)
    else if (isRoundOver) {
        if ((isAPressed && !wasAGamepadPressed) || (isBPressed && !wasBGamepadPressed) ||
            (isLPressed && !wasLGamepadPressed) || (isRPressed && !wasRGamepadPressed)) {
            nextRound(); 
        }
    }
    // 状態 3: スタート画面
    else if (gameMode === 'TITLE') { 
        
        let isUpPressed = (axisY < -0.5 || dpadUp);
        let isDownPressed = (axisY > 0.5 || dpadDown);

        if (isDownPressed && !wasTitleDownPressed) {
            selectedButtonIndex = (selectedButtonIndex + 1) % titleButtons.length;
        }
        if (isUpPressed && !wasTitleUpPressed) {
            selectedButtonIndex = (selectedButtonIndex - 1 + titleButtons.length) % titleButtons.length;
        }
        
        if ((isAPressed && !wasAGamepadPressed) || (isBPressed && !wasBGamepadPressed)) {
             let selectedMode = titleButtons[selectedButtonIndex].mode;
             if (selectedMode === 'ONLINE') {
                 startOnlineMenu();
             } else {
                 gameMode = selectedMode;
                 nextRound(); 
             }
        }

    } 
    // 状態 4: カウントダウン中 (ポーズのみ受付)
    else if (countdownTime > 0) {
       // (ポーズボタンは countdownTime === 0 でチェックされる)
    }
    // 状態 5: ポーズ中
    else if (isPaused) {
       // (ポーズボタンは countdownTime === 0 でチェックされる)
    }
    // 状態 6: ゲーム中
    else {
        let now = millis();
       
        // --- 左右移動 (キーボード WASD OR コントローラー) ---
        let isLeftPressed = (axisX < -0.5 || dpadLeft || keyConfigIsDown('left')); // P1: A
        let isRightPressed = (axisX > 0.5 || dpadRight || keyConfigIsDown('right')); // P1: D

        if (isLeftPressed) {
            if (dasStartTimeLeft === 0) {
                moveLeft(1);
                dasStartTimeLeft = now; 
                arrTimeLeft = now;      
            } else if (now - dasStartTimeLeft > dasDelay) {
                if (now - arrTimeLeft > arrDelay) {
                    moveLeft(1);
                    arrTimeLeft = now; 
                }
            }
        } else {
            dasStartTimeLeft = 0; 
        }

        if (isRightPressed) {
            if (dasStartTimeRight === 0) {
                moveRight(1);
                dasStartTimeRight = now;
                arrTimeRight = now;
            } else if (now - dasStartTimeRight > dasDelay) {
                if (now - arrTimeRight > arrDelay) {
                    moveRight(1);
                    arrTimeRight = now;
                }
            }
        } else {
            dasStartTimeRight = 0;
        }
       
        // --- 下移動 (キーボード S OR コントローラー) ---
        if (axisY > 0.5 || dpadDown || keyConfigIsDown('down')) { // P1: S
            if (now - lastMoveDownTime > moveDownDelay) {
                moveDown(1); 
                lastMoveDownTime = now;
            }
        } else {
            lastMoveDownTime = 0;
        }
       
        // --- ハードドロップ・回転・ホールド ---
        // ONLINEは専用Gamepadハンドラーからサーバーにも入力を送るため、ここでの二重実行を避ける。
        const isUpPressed = (axisY < -0.5 || dpadUp);
        if (gameMode !== 'ONLINE') {
            if (isUpPressed && !wasUpGamepadPressed) hardDrop(1);
            if ((isBPressed && !wasBGamepadPressed) || (isYPressed && !wasYGamepadPressed)) rotateRight(1);
            if ((isAPressed && !wasAGamepadPressed) || (isXPressed && !wasXGamepadPressed)) rotateLeft(1);
            if ((isLPressed && !wasLGamepadPressed) || (isRPressed && !wasRGamepadPressed)) horudoSuru(1);
        }
        wasUpGamepadPressed = isUpPressed;
    }
   
    // ポーズボタンは常にチェック
    if (gameMode !== 'TITLE' && !isMatchOver) {
       if (countdownTime === 0) { 
            if (isStartPressed && !wasStartGamepadPressed) {
                if (isPaused) {
                    countdownTime = millis(); 
                }
                isPaused = !isPaused;
            }
        }
        wasStartGamepadPressed = isStartPressed;
    }

    // ★ 入力バグ修正: 操作中/終了画面/タイトル画面でのみフラグを更新
    if ( (isStarted && countdownTime === 0 && !isPaused) || isMatchOver || isRoundOver || gameMode === 'TITLE' ) {
        wasAGamepadPressed = isAPressed;
        wasBGamepadPressed = isBPressed;
        wasXGamepadPressed = isXPressed;
        wasYGamepadPressed = isYPressed;
        wasLGamepadPressed = isLPressed; 
        wasRGamepadPressed = isRPressed; 
        
        if (! (isStarted && countdownTime === 0 && !isPaused) ) {
            wasUpGamepadPressed = (axisY < -0.5 || dpadUp); 
        }
    }
    
    if (gameMode === 'TITLE') {
        let isUpPressed = (axisY < -0.5 || dpadUp);
        let isDownPressed = (axisY > 0.5 || dpadDown);
        wasTitleUpPressed = isUpPressed;
        wasTitleDownPressed = isDownPressed;
    } else {
        wasTitleUpPressed = false;
        wasTitleDownPressed = false;
    }
}

// P2 (VS_LOCAL) のキーボード入力
function handlePlayer2Input() {
    
    // ラウンド/マッチ終了画面での入力
    if (isRoundOver || isMatchOver) {
        if (keyIsDown(85) || keyIsDown(79)) { // U or O
            if (isMatchOver) restartGame(); 
            else if (isRoundOver) nextRound();
        }
        wasHardDropPressedP2 = keyIsDown(73); // I 
        return;
    }
    
    // ポーズ中、カウントダウン中は操作不能
    if (isPaused || countdownTime > 0) {
        dasStartTimeLeftP2 = 0;
        dasStartTimeRightP2 = 0;
        lastMoveDownTimeP2 = 0;
        wasHardDropPressedP2 = keyIsDown(73); // I 
        return; 
    }
    
    let now = millis();
    
    // --- 左右移動 (J, L) ---
    let isLeftPressed = keyIsDown(74); // J
    let isRightPressed = keyIsDown(76); // L

    if (isLeftPressed) {
        if (dasStartTimeLeftP2 === 0) {
            moveLeft(2);
            dasStartTimeLeftP2 = now;
            arrTimeLeftP2 = now;
        } else if (now - dasStartTimeLeftP2 > dasDelay) {
            if (now - arrTimeLeftP2 > arrDelay) {
                moveLeft(2);
                arrTimeLeftP2 = now;
            }
        }
    } else {
        dasStartTimeLeftP2 = 0;
    }

    if (isRightPressed) {
        if (dasStartTimeRightP2 === 0) {
            moveRight(2);
            dasStartTimeRightP2 = now;
            arrTimeRightP2 = now;
        } else if (now - dasStartTimeRightP2 > dasDelay) {
            if (now - arrTimeRightP2 > arrDelay) {
                moveRight(2);
                arrTimeRightP2 = now;
            }
        }
    } else {
        dasStartTimeRightP2 = 0;
    }
       
    // --- 下移動 (K) ---
    if (keyIsDown(75)) { // K
        if (now - lastMoveDownTimeP2 > moveDownDelay) {
            moveDown(2); 
            lastMoveDownTimeP2 = now;
        }
    } else {
        lastMoveDownTimeP2 = 0;
    }

    // --- ハードドロップ (I) ---
    const isIPressed = keyIsDown(73); // I
    if (isIPressed && !wasHardDropPressedP2) {
        hardDrop(2);
    }
    wasHardDropPressedP2 = isIPressed;
}



// モード選択のクリック/タッチ処理
function handleTitlePointer(px, py) {
  if (gameMode !== 'TITLE') return false;

  if (keyConfigOpen) return handleKeyConfigPointer(px,py);
  if (rankingOpen) return handleRankingPointer(px,py);
  // ヘルプを開閉。表示中は背後のゲームモードを選択させない。
  if (helpOpen) {
    const panelW = Math.min(760, width - 40), panelH = Math.min(620, height - 40);
    const x = (width - panelW) / 2, y = (height - panelH) / 2;
    if ((px >= x + panelW - 150 && px <= x + panelW - 10 && py >= y + panelH - 65 && py <= y + panelH - 5) || px < x || px > x + panelW || py < y || py > y + panelH) helpOpen = false;
    return true;
  }
  if (px >= width - 395 && px <= width - 270 && py >= 12 && py <= 65) { rankingOpen=true; requestLeaderboard(); return true; }
  if (px >= width - 270 && px <= width - 135 && py >= 12 && py <= 65) { keyConfigOpen=true; profileTab='profile'; profileNotice=''; requestProfileLoad(); return true; }
  if (px >= width - 130 && px <= width - 15 && py >= 12 && py <= 65) { helpOpen = true; return true; }

  // オンラインのホストは、人数がそろったらSTARTボタンを押して開始する。
  const onlineCount = Math.max(2, Math.min(4, Number(onlinePlayerCount) || 2));
  if (onlineRoom && onlineRole === 1 && onlineJoinedCount >= onlineCount && !onlineMatchStarted) {
    const bx = width / 2 - 160;
    const by = 605;
    const bw = 320;
    const bh = 58;
    if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) {
      requestOnlineMatchStart();
      return true;
    }
  }

  const btnWidth = 250;
  const btnHeight = 50;
  const btnX = (width - btnWidth) / 2;

  for (let i = 0; i < titleButtons.length; i++) {
    const btn = titleButtons[i];
    if (px >= btnX && px <= btnX + btnWidth && py >= btn.y && py <= btn.y + btnHeight) {
      selectedButtonIndex = i;
      if (btn.mode === 'ONLINE') {
        startOnlineMenu();
      } else if (btn.mode === 'SCORE_ATTACK') {
        startScoreAttack();
      } else {
        gameMode = btn.mode;
        nextRound();
      }
      return true;
    }
  }
  return false;
}

function mousePressed() {
  if (gameMode === 'SCORE_ATTACK' && isMatchOver) { handleScoreAttackResultPointer(Number(mouseX),Number(mouseY)); return false; }
  // p5.js標準のmouseX/mouseYを使い、既存のメニュー操作を維持する。
  if (gameMode === 'ONLINE') {
    const count = Math.max(2, Math.min(4, Number(onlinePlayerCount) || 2));
    if (onlineRole === 1 && onlineJoinedCount >= count && !onlineMatchStarted) {
      const bx = width / 2 - 160, by = 605, bw = 320, bh = 58;
      if (mouseX >= bx && mouseX <= bx + bw && mouseY >= by && mouseY <= by + bh) {
        requestOnlineMatchStart();
        return false;
      }
    }
    return false;
  }
  if (gameMode !== 'TITLE') return;
  if (handleTitlePointer(Number(mouseX), Number(mouseY))) return false;
}

// スマホでは mousePressed だけに依存せず、タッチを直接処理する。
function touchStarted(event) {
  if (gameMode === 'TITLE') {
    // iPhone/Safariではp5のmouseX/mouseYがCSS表示倍率とずれることがあるため、
    // 実際のcanvasの表示矩形から論理座標(1100x810)へ変換する。
    const cnv = (gameCanvas && gameCanvas.elt) ? gameCanvas.elt : document.querySelector('canvas');
    let px = NaN;
    let py = NaN;

    if (event && event.touches && event.touches.length > 0 && cnv) {
      const r = cnv.getBoundingClientRect();
      const t = event.touches[0];
      if (r.width > 0 && r.height > 0) {
        px = (t.clientX - r.left) * (width / r.width);
        py = (t.clientY - r.top) * (height / r.height);
      }
    }

    // p5が既に論理座標へ変換している場合のフォールバック。
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      px = Number(touchX);
      py = Number(touchY);
    }
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      px = Number(mouseX);
      py = Number(mouseY);
    }

    handleTitlePointer(px, py);
    return false;
  }
  return false;
}

function keyReleased() {
  if (gameMode === 'ONLINE' && onlineRole >= 2) {
    if (key === 'a' || key === 'A') onlineGuestKeyState.left = false;
    else if (key === 'd' || key === 'D') onlineGuestKeyState.right = false;
    else if (key === 's' || key === 'S') onlineGuestKeyState.down = false;
  }
}

// プレイヤー/CPUに応じてバッグを管理
function getNextBlockType(playerIndex) { // 1 or 2 (CPU)
  let bag = (playerIndex === 1) ? p1BurokkuBaggu : p2BurokkuBaggu;
  let nextBag = (playerIndex === 1) ? p1TsugiBurokkuBaggu : p2TsugiBurokkuBaggu;

  // 現在の袋が空になったら、次の7種セットへ切り替える。
  // 「7個ごとに I/J/L/O/S/T/Z を必ず1回ずつ」を厳密に維持するため、
  // 次バッグは新しく別順序で作らず、同じ7個の順序を繰り返す。
  if (!Array.isArray(bag) || bag.length === 0) {
    bag = (Array.isArray(nextBag) && nextBag.length > 0) ? nextBag : fuyasuBaggu();
    nextBag = bag.slice();
  }

  if (playerIndex === 1) {
    p1BurokkuBaggu = bag;
    p1TsugiBurokkuBaggu = nextBag;
  } else {
    p2BurokkuBaggu = bag;
    p2TsugiBurokkuBaggu = nextBag;
  }

  return bag.pop();
}

// spawnNewBlock を playerIndex (1, 2) に対応
function spawnNewBlock(playerIndex, preserveHoldUsed = false) { // 1: P1, 2: P2/CPU
  let type = getNextBlockType(playerIndex); 
  let rotation = 0;
  let katachi = burokkuShurui[type][rotation];
  let iro = type + 1; 

  let newBlock = { 
    type: type, 
    shape: katachi, 
    rotation: rotation,
    color: iro, 
    x: 3, 
    y: 0 
  }; 
 
  if (playerIndex === 1) {
    imaNoBurokku = newBlock;
    if (!preserveHoldUsed) horudoShiyouzumi = false;
    lastAction = 'NONE';
    isLanded = false;
    lockDelayTimer = 0;
    lockDelayResetCount = 0; 
    lowestY = newBlock.y; 
   
    if (butsukaru(imaNoBurokku, gameBoard)) {
      handleRoundOver('PLAYER1'); 
    }
  } else {
    imaNoBurokkuP2 = newBlock;
    if (!preserveHoldUsed) cpuHoldUsed = false;
    lastActionP2 = 'NONE';
    isLandedP2 = false;
    lockDelayTimerP2 = 0;
    lockDelayResetCountP2 = 0;
    lowestYP2 = newBlock.y;
    
    if (gameMode === 'VS_CPU') {
        cpuNextMove = null; 
    }
   
    if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
      if (gameMode === 'VS_CPU') handleRoundOver('CPU'); 
      else handleRoundOver('PLAYER2'); 
    }
  }
}

// 7種1巡バッグ：I/J/L/O/S/T/Zを必ず1回ずつ含む袋を作る。
function fuyasuBaggu() {
  const newBag = [0, 1, 2, 3, 4, 5, 6];
  shaffuru(newBag);
  return newBag;
}

// Fisher-Yates シャッフル関数
function shaffuru(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex > 0) {
    randomIndex = floor(random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
}


// 衝突判定
function butsukaru(burokku, board) {
  for (let i = 0; i < burokku.shape.length; i++) {
    for (let j = 0; j < burokku.shape[i].length; j++) {
      if (burokku.shape[i][j] !== 0) {
        let x = burokku.x + j;
        let y = burokku.y + i;

        if (x < 0 || x >= RETSU || y >= GYO) {
          return true;
        }
        if (y < 0) {
          continue;
        }
        if (y >= 0 && board[y] && board[y][x] !== 0) {
          return true;
        }
      }
    }
  }
  return false;
}

// Perfect Clear判定用
function isPerfectClear(board) {
    for (let i = 0; i < GYO; i++) {
        for (let j = 0; j < RETSU; j++) {
            if (board[i][j] !== 0) {
                return false;
            }
        }
    }
    return true;
}

// ぷよテト2準拠のRENボーナス。
// 1～2RENは+0、3RENから+1ずつ増え、
// 11～12RENは+4、13REN以降は+5。
const PUYOTETO2_REN_ATTACK = [
    0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 5
];

function getPuyoTeto2RenAttack(ren) {
    if (ren <= 0) return 0;
    return PUYOTETO2_REN_ATTACK[Math.min(ren, PUYOTETO2_REN_ATTACK.length - 1)];
}

// T-Spinの4隅を調べ、ぷよテト2系のMini/通常を判定する。
// 3隅が埋まっていて、回転方向の前側2隅が両方埋まっていれば通常T-Spin、
// 片方でも空いていればT-Spin Miniとして扱う。
function detectTSpin(board, burokku) {
    if (!burokku || burokku.type !== 6) return { isTSpin: false, isTSpinMini: false };

    const corners = [
        {x: burokku.x,     y: burokku.y},
        {x: burokku.x + 2, y: burokku.y},
        {x: burokku.x,     y: burokku.y + 2},
        {x: burokku.x + 2, y: burokku.y + 2}
    ];

    const blocked = corners.map(c => {
        if (c.x < 0 || c.x >= RETSU || c.y < 0 || c.y >= GYO) return true;
        return board[c.y][c.x] !== 0;
    });

    const count = blocked.filter(Boolean).length;
    if (count < 3) return { isTSpin: false, isTSpinMini: false };

    // rotation 0: 下2隅、1: 左2隅、2: 上2隅、3: 右2隅がfront。
    const frontPairs = [
        [2, 3],
        [0, 2],
        [0, 1],
        [1, 3]
    ];
    const front = frontPairs[burokku.rotation % 4];
    const frontBlocked = blocked[front[0]] && blocked[front[1]];

    return frontBlocked
        ? { isTSpin: true, isTSpinMini: false }
        : { isTSpin: false, isTSpinMini: true };
}


// koteiBurokku を playerIndex (1, 2, 0) に対応
function koteiBurokku(playerIndex) {
 
  // 1. 対象のボードと変数を選択
  let board, burokku, action;
  let isPlayer = (playerIndex > 0); 
  
  if (playerIndex === 1) {
    board = gameBoard;
    burokku = imaNoBurokku;
    action = lastAction;
    isLanded = false;
    lockDelayTimer = 0;
    lockDelayResetCount = 0;
  } else if (playerIndex === 2) {
    board = gameBoardP2;
    burokku = imaNoBurokkuP2;
    action = lastActionP2;
    isLandedP2 = false;
    lockDelayTimerP2 = 0;
    lockDelayResetCountP2 = 0;
  } else { // 0 = CPU
    board = gameBoardP2;
    burokku = imaNoBurokkuP2;
    action = 'HARD_DROP'; 
  }
 
  // --- T-Spin / T-Spin Mini 判定 ---
  let isTSpin = false;
  let isTSpinMini = false;
  if (burokku.type === 6 && action === 'ROTATE') {
    const spin = detectTSpin(board, burokku);
    isTSpin = spin.isTSpin;
    isTSpinMini = spin.isTSpinMini;
  }
  // --- T-Spin / T-Spin Mini 判定 終わり ---


  // ブロックを固定する
  for (let i = 0; i < burokku.shape.length; i++) {
    for (let j = 0; j < burokku.shape.length; j++) {
      if (burokku.shape[i][j] !== 0) {
        let x = burokku.x + j;
        let y = burokku.y + i;
        if (y < 0) { 
           if (playerIndex === 1) handleRoundOver('PLAYER1');
           else if (playerIndex === 2) handleRoundOver('PLAYER2');
           else handleRoundOver('CPU');
           return;
        }
        board[y][x] = burokku.color;
      }
    }
  }
 
  // おじゃまブロックを先に適用 (攻撃を受ける側)
  if (gameMode !== 'SOLO') {
    const attackQueue = (playerIndex === 1) ? playerAttackQueue : player2AttackQueue;
    while(attackQueue.length > 0) {
        const attackCount = attackQueue.shift();
        addGarbageLines(board, attackCount, burokku, playerIndex);
        if (isRoundOver) return; 
    }
  }


  // 行を消去する
  let linesCleared = 0;
  for (let i = GYO - 1; i >= 0; i--) { 
    if (board[i].every((cell) => cell !== 0)) { 
      board.splice(i, 1); 
      board.unshift(new Array(RETSU).fill(0)); 
      linesCleared++;
      i++; 
    }
  }

  // ==========================================================
  // 攻撃力、コンボ、スコアの計算ロジック
  // ==========================================================
  
  // SOLOモードでは攻撃計算をスキップ
  if (gameMode === 'SCORE_ATTACK') {
      if (linesCleared > 0) {
        scoreAttackLines += linesCleared;
        if (scoreAttackLines >= 40) { finishScoreAttack(); return; }
      }
      if (linesCleared > 0) {
          if (isTSpin) sukoa += 800;
          if (linesCleared === 1) sukoa += 100;
          else if (linesCleared === 2) sukoa += 300;
          else if (linesCleared === 3) sukoa += 500;
          else if (linesCleared === 4) sukoa += 800;
      }
      spawnNewBlock(playerIndex);
      return;
  }
  if (gameMode === 'SOLO') {
      if (linesCleared > 0) {
          if (isTSpin) sukoa += 800;
          if (linesCleared === 1) sukoa += 100;
          else if (linesCleared === 2) sukoa += 300;
          else if (linesCleared === 3) sukoa += 500;
          else if (linesCleared === 4) sukoa += 800;
      }
      spawnNewBlock(playerIndex); 
      return; 
  }
  
  // (VS_CPU / VS_LOCAL のみ)
  let currentAttack = 0;
  let isTetris = (linesCleared === 4);
  let isSpecialClear = isTSpin || isTSpinMini || isTetris;

  let currentScore = (playerIndex === 1) ? sukoa : cpuScore;
  let currentAttackPower = (playerIndex === 1) ? attackPower : cpuAttackPower;
  let currentBackToBack = (playerIndex === 1) ? backToBack : cpuBackToBack;
  let currentComboCount = (playerIndex === 1) ? comboCount : cpuComboCount;
 
  if (linesCleared > 0) {
    currentComboCount++;

    // 1. ぷよテト2準拠の基本攻撃力
    // T-Spin Mini = 0 / Single = 2 / Double = 4 / Triple = 6
    // Tetris = 4
    if (isTSpin) {
      if (linesCleared === 1) { currentAttack = 2; currentScore += 800; }
      else if (linesCleared === 2) { currentAttack = 4; currentScore += 1200; }
      else if (linesCleared === 3) { currentAttack = 6; currentScore += 1600; }
    } else if (isTSpinMini) {
      currentAttack = 0;
      if (linesCleared === 1) currentScore += 200;
    } else {
      currentAttack = ATTACK_TABLE[linesCleared] || 0;
      if (linesCleared === 1) { currentScore += 100; }
      else if (linesCleared === 2) { currentScore += 300; }
      else if (linesCleared === 3) { currentScore += 500; }
      else if (linesCleared === 4) { currentScore += 800; }
    }

    // 2. RENボーナス（ぷよテト2 Ver.1.3.2系）
    currentAttack += getPuyoTeto2RenAttack(currentComboCount);

    // 3. B2Bボーナス
    // Tetris / T-Spin / T-Spin MiniがB2B対象。
    // Perfect Clearは後段で攻撃力を10に固定するため、ここでは加算しない。
    if (isSpecialClear) {
        if (currentBackToBack > 0) {
            currentAttack += 1;
            currentBackToBack++;
        } else {
            currentBackToBack = 1;
        }
    } else {
        currentBackToBack = 0;
    }

  } else if (isTSpinMini) {
    // ラインを消さないT-Spin MiniもB2B継続対象。
    // RENは継続しないので、ここでは+1だけ。
    if (currentBackToBack > 0) {
      currentAttack = 1;
      currentBackToBack++;
    } else {
      currentBackToBack = 1;
    }
    currentAttack += getPuyoTeto2RenAttack(currentComboCount);
  } else {
    // ★★★ ぷよテト式ルール: RENが途切れたら攻撃 ★★★
    if (currentComboCount > 0) { 
        sendAttack(playerIndex); 
    }
    currentComboCount = 0;
    // ▲▲▲
  }
 
  // --- パーフェクトクリア (PC) ---
  // ぷよテト2ではPCの攻撃力はライン数やREN/B2Bによらず10。
  if (linesCleared > 0 && isPerfectClear(board)) {
      currentAttack = 10;
      currentScore += 2000;
  }
 
  // 4. 攻撃力交換（相殺）
  const myAttackQueue = (playerIndex === 1) ? playerAttackQueue : player2AttackQueue;

  // 4a. まず自分のキュー（おじゃまブロック）と相殺する
  if (currentAttack > 0 && myAttackQueue.length > 0) {
    while (myAttackQueue.length > 0 && currentAttack > 0) {
      let garbageAmount = myAttackQueue[0];
      
      if (currentAttack >= garbageAmount) {
        currentAttack -= garbageAmount;
        myAttackQueue.shift(); 
      } else {
        myAttackQueue[0] -= currentAttack;
        currentAttack = 0; 
      }
    }
  }

  // 4b. 残った攻撃力を自分のアタックゲージに溜める
  currentAttackPower += currentAttack;
 
  // 状態変数を更新
  if (playerIndex === 1) {
      sukoa = currentScore;
      attackPower = currentAttackPower; 
      backToBack = currentBackToBack;
      comboCount = currentComboCount;
  } else { // P2 または CPU
      cpuScore = currentScore;
      cpuAttackPower = currentAttackPower; 
      cpuBackToBack = currentBackToBack;
      cpuComboCount = currentComboCount;
  }

  spawnNewBlock(playerIndex); 
}
// ▲▲▲

// アタックゲージに溜まった攻撃を送る
function sendAttack(playerIndex) {
    let attackToSend = 0;
    if (playerIndex === 1) { attackToSend = attackPower; attackPower = 0; }
    else { attackToSend = cpuAttackPower; cpuAttackPower = 0; }
    if (attackToSend <= 0) return;

    if (gameMode === 'ONLINE') {
      sendOnlineAction('attack', { amount: Math.max(0, Math.min(40, attackToSend)) });
      return;
    }
    if (playerIndex === 1) player2AttackQueue.push(attackToSend);
    else playerAttackQueue.push(attackToSend);
}

// addGarbageLines の敗北判定修正
function addGarbageLines(board, count, currentBurokku, playerIndex) {
  if (count <= 0) return;

  board.splice(0, count);

  for (let k = 0; k < count; k++) {
    const holeX = floor(random(RETSU));
    const garbageRow = new Array(RETSU).fill(8); 
    garbageRow[holeX] = 0; 
    board.push(garbageRow);
  }
 
  while (butsukaru(currentBurokku, board)) {
      currentBurokku.y--;
      if (currentBurokku.y < -4) { 
           if (playerIndex === 1) handleRoundOver('PLAYER1');
           else if (playerIndex === 2) handleRoundOver('PLAYER2');
           else handleRoundOver('CPU');
           return;
      }
  }
}

// ==========================================================
// --- ONLINE BATTLE / WebSocket ---
// ==========================================================
function makeOnlinePassword() {
  return String(floor(100000 + random(900000))).padStart(6, '0');
}

async function startOnlineMenu() {
  if (onlineSocket && onlineSocket.readyState === WebSocket.OPEN) {
    onlineStatus = 'すでにオンライン接続中です';
    return;
  }

  const mode = prompt(
    'オンライン対戦を選んでください。\n\n' +
    '1：ランク対戦（Googleログイン必須）\n' +
    '2：フリーマッチ（レート変動なし）\n' +
    '3：パスワード対戦（従来方式）', '1'
  );
  if (mode === null) return;

  let playerName = prompt('オンラインで表示するプレイヤーネームを入力してください。', onlineProfile?.displayName || 'プレイヤー');
  if (playerName === null) return;
  playerName = playerName.trim().replace(/[<>]/g, '').slice(0,16);
  if (!playerName) { alert('プレイヤーネームを入力してください。'); return; }
  onlinePlayerName = playerName;

  if (mode.trim() === '1') {
    if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) {
      alert('Firebaseの設定がまだ完了していません。firebase-config.js を設定してください。');
      return;
    }
    try {
      const auth = firebase.auth();
      if (!auth.currentUser) {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
      }
      onlineUser = auth.currentUser;
      onlineIdToken = await onlineUser.getIdToken(true);
      onlineProfile = { uid: onlineUser.uid, displayName: onlineUser.displayName || playerName, email: onlineUser.email || '' };
    } catch (e) {
      alert('Googleログインに失敗しました。Firebaseの承認済みドメインと設定を確認してください。');
      return;
    }
    onlineQueueMode = 'ranked';
    onlinePlayerCount = 2; onlineRole = 0; onlineRoom = ''; onlineStatus = 'ランク対戦の相手を探しています...';
    connectOnlineSocket('queue');
    return;
  }
  if (mode.trim() === '2') {
    onlineQueueMode = 'free'; onlinePlayerCount = 2; onlineRole = 0; onlineRoom = ''; onlineStatus = 'フリーマッチの相手を探しています...';
    connectOnlineSocket('queue');
    return;
  }
  if (mode.trim() === '3') {
    onlineQueueMode = 'password';
    const roomMode = prompt('パスワード対戦\n\n1：部屋を作る（ホスト）\n2：相手の部屋に入る（ゲスト）', '1');
    if (roomMode === null) return;
    if (roomMode.trim() === '1') {
      let count = prompt('何人対戦にしますか？\n\n2 / 3 / 4 のいずれかを入力してください。', '2');
      if (count === null) return;
      count = Number(count.trim());
      if (![2,3,4].includes(count)) { alert('人数は2、3、4のいずれかです。'); return; }
      onlinePlayerCount = count; onlineRole = 0; onlineRoom = makeOnlinePassword(); onlineStatus = '部屋を作成中...';
      connectOnlineSocket('create'); return;
    }
    if (roomMode.trim() === '2') {
      let password = prompt('ホストから教えてもらった6桁のパスワードを入力してください。');
      if (password === null) return;
      password = password.trim();
      if (!/^\d{6}$/.test(password)) { alert('パスワードは6桁の数字です。'); return; }
      let count = prompt('この部屋は何人対戦ですか？\n\n2 / 3 / 4', '2');
      if (count === null) return;
      count = Number(count.trim());
      if (![2,3,4].includes(count)) { alert('人数は2、3、4のいずれかです。'); return; }
      onlineRole = 0; onlinePlayerCount = count; onlineRoom = password; onlineStatus = '部屋に参加中...';
      connectOnlineSocket('join'); return;
    }
    alert('1 または 2 を入力してください。'); return;
  }
  alert('1、2、3のいずれかを入力してください。');
}

function connectOnlineSocket(action) {
  try {
    onlineSocket = new WebSocket(ONLINE_SERVER_URL);
  } catch (e) {
    onlineStatus = 'WebSocket接続を開始できません';
    return;
  }

  onlineSocket.onopen = () => {
    onlineConnected = true;
    onlineStatus = action === 'create' ? '部屋を作成中...' : 'パスワードを確認中...';
    onlineSocket.send(JSON.stringify({
      type: action,
      mode: onlineQueueMode,
      idToken: onlineIdToken,
      uid: onlineProfile?.uid || '',
      password: onlineRoom,
      playerCount: onlinePlayerCount,
      name: onlinePlayerName
    }));
  };

  onlineSocket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }

    if (msg.type === 'queueStatus') {
      onlineStatus = msg.message || '対戦相手を探しています...';
      return;
    }

    if (msg.type === 'queueMatched') {
      onlineQueueMode = msg.mode || onlineQueueMode;
      onlineRole = Number(msg.role) || 1;
      onlinePlayerCount = 2;
      onlineRoom = String(msg.room || '');
      onlineJoinedCount = 2;
      onlinePlayerNames = msg.names || {};
      onlineScores = msg.scores || {};
      onlineMatchStartRequested = true;
      onlineStatus = msg.mode === 'ranked' ? 'ランク対戦が見つかりました！' : '対戦相手が見つかりました！';
      return;
    }

    if (msg.type === 'profile') {
      onlineProfile = { ...(onlineProfile || {}), ...msg.profile };
      onlineStatus = `レート ${msg.profile.rating} / 勝 ${msg.profile.wins} 敗 ${msg.profile.losses}`;
      return;
    }

    if (msg.type === 'leaderboard') {
      const rows = (msg.entries || []).map((e, i) => `${i+1}. ${e.name} — ${e.rating} (勝${e.wins}/敗${e.losses})`).join('\n');
      alert('レートランキング\n\n' + (rows || 'まだランキングデータがありません。'));
      return;
    }

    if (msg.type === 'roomJoined') {
      onlineMatchStarted = false;
      onlineMatchStartRequested = false;
      onlineJoinedCount = 1;
      onlineRole = Number(msg.role) || 0;
      onlinePlayerCount = Number(msg.playerCount) || onlinePlayerCount || 2;
      onlineRoom = String(msg.password || msg.room || onlineRoom);
      onlineScores = msg.scores || onlineScores || {};
      onlineAlive = msg.alive || onlineAlive || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      if (onlineRole === 1) {
        onlineStatus = `部屋を作りました。${onlinePlayerCount}人そろうまで待っています...`;
        alert('部屋を作りました！\n\n対戦パスワード：' + onlineRoom + '\n\n' + onlinePlayerCount + '人対戦です。\nこの6桁の数字を参加者に伝えてください。');
      } else {
        onlineStatus = '参加しました。メンバーがそろうまで待っています...';
      }
      return;
    }

    if (msg.type === 'roomStatus') {
      onlinePlayerCount = Number(msg.playerCount) || onlinePlayerCount;
      const joinedCount = Number(msg.count) || 0;
      onlineJoinedCount = joinedCount;
      onlineScores = msg.scores || onlineScores || {};
      onlineAlive = msg.alive || onlineAlive || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      if (msg.roundOver) isRoundOver = true;
      if (msg.round && Number(msg.round) > 0) onlineRound = Number(msg.round);
      if (joinedCount >= onlinePlayerCount) {
        onlineStatus = '人数がそろいました。ホストのスタートを待っています。';
      } else {
        onlineStatus = `参加者 ${joinedCount}/${onlinePlayerCount}人`;
      }
      return;
    }

    if (msg.type === 'start') {
      onlineMatchStartRequested = true;
      onlinePlayerCount = Number(msg.playerCount) || onlinePlayerCount || 2;
      onlineScores = msg.scores || {};
      onlineAlive = msg.alive || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      beginOnlineMatchLocal();
      return;
    }

    if (msg.type === 'playerState') {
      const role = Number(msg.player);
      if (role >= 1 && role <= 4 && role !== onlineRole && msg.state && typeof msg.state === 'object') {
        if (isValidOnlineBoard(msg.state.board) && isValidOnlineBlock(msg.state.block)) {
          onlineRemoteStates[role] = msg.state;
        }
      }
      return;
    }

    if (msg.type === 'attack') {
      const amount = Math.max(0, Math.min(40, Number(msg.amount) || 0));
      if (amount > 0) {
        // どのROLEでも受信した攻撃は自分のP1盤面へ入れる。
        if (onlineRole >= 1) playerAttackQueue.push(amount);
      }
      return;
    }

    if (msg.type === 'playerDead') {
      const role = Number(msg.player);
      if (role >= 1 && role <= 4) onlineAlive[role] = false;
      return;
    }

    if (msg.type === 'roundOver') {
      onlineRoundWinnerRole = Number(msg.winner) || 0;
      onlineScores = msg.scores || onlineScores || {};
      onlineAlive = msg.alive || onlineAlive || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      isRoundOver = true;
      isMatchOver = !!msg.matchOver;
      // ラウンド終了時に古いポーズ状態を持ち越さない。
      isPaused = false;
      countdownTime = 0;
      onlineMatchWinnerRole = Number(msg.matchWinner) || 0;
      roundWinner = onlineRoundWinnerRole ? `PLAYER${onlineRoundWinnerRole}` : '';
      onlineRoundReadySent = false;
      return;
    }

    if (msg.type === 'startRound') {
      onlineScores = msg.scores || onlineScores || {};
      onlineAlive = msg.alive || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      onlineRoundWinnerRole = 0;
      onlineRoundReadySent = false;
      onlineRoundRequestSent = false;
      isMatchOver = false;
      isRoundOver = false;
      isPaused = false;
      isStarted = false;
      countdownTime = 0;
      gameMode = 'ONLINE';
      onlineRemoteStates = {};
      nextRound();
      sendLocalOnlineState(true);
      return;
    }

    if (msg.type === 'matchOver') {
      onlineScores = msg.scores || onlineScores || {};
      onlinePlayerNames = msg.names || onlinePlayerNames || {};
      onlineMatchWinnerRole = Number(msg.winner) || 0;
      onlineRoundWinnerRole = 0;
      isMatchOver = true;
      isRoundOver = true;
      isPaused = false;
      countdownTime = 0;
      onlineStatus = (onlinePlayerNames[onlineMatchWinnerRole] || ('PLAYER ' + onlineMatchWinnerRole)) + ' Win';
      return;
    }

    if (msg.type === 'peerLeft') {
      if (!onlineMatchStarted) onlineMatchStartRequested = false;
      onlineOpponentConnected = false;
      onlineStatus = '参加者が切断しました';
      if (gameMode === 'ONLINE') isPaused = true;
      return;
    }

    if (msg.type === 'error') {
      onlineStatus = msg.message || 'オンラインエラー';
      alert(onlineStatus);
    }
  };

  onlineSocket.onclose = () => {
    onlineConnected = false;
    onlinePendingState = null;
    if (onlineStateApplyTimer) { clearTimeout(onlineStateApplyTimer); onlineStateApplyTimer = null; }
    if (gameMode === 'ONLINE') {
      onlineStatus = 'サーバーとの接続が切れました';
      isPaused = true;
    }
  };

  onlineSocket.onerror = () => {
    onlineStatus = 'オンライン接続エラー';
  };
}

function requestOnlineMatchStart() {
  if (onlineRole !== 1 || onlineMatchStarted) return;
  const count=Math.max(2,Math.min(4,Number(onlinePlayerCount)||2));
  if (onlineJoinedCount < count) return;
  if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) { onlineStatus='サーバーに接続されていません'; return; }
  onlineMatchStartRequested=true; onlineStatus='対戦を開始しています...';
  try { onlineSocket.send(JSON.stringify({type:'input',action:'startMatch'})); } catch(e) { onlineMatchStartRequested=false; }
}

function beginOnlineMatchLocal() {
  if (onlineRole < 1 || onlineMatchStarted) return;
  onlineMatchStarted = true;
  onlineMatchStartRequested = true;
  onlineRoundWinnerRole = 0;
  onlineMatchWinnerRole = 0;
  onlineRemoteStates = {};
  onlineRoundReadySent = false;
  gameMode = 'ONLINE';
  onlineGuestInitialized = false;
  onlineLastAppliedSeq = 0;
  onlineInitialStateSent = false;
  restartGame();
  gameMode = 'ONLINE';
  nextRound();
  onlineStatus = '対戦開始！';
  sendLocalOnlineState(true);
}

function sendOnlineAction(action, extra = {}) {
  if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN || onlineRole < 1) return;
  if (onlineSocket.bufferedAmount > 64 * 1024) return;
  try { onlineSocket.send(JSON.stringify({ type:'input', action:action, ...extra })); } catch (e) {}
}

// ラウンド終了後の開始要求。通信の取りこぼしに備えて短時間だけ再送する。
function requestOnlineNextRound() {
  if (isMatchOver || !isRoundOver || onlineRole < 1) return;
  onlineRoundRequestSent = true;
  const sendRequest = () => {
    if (isMatchOver || !isRoundOver) return;
    sendOnlineAction('nextRound');
  };
  sendRequest();
  [250, 600, 1200].forEach(ms => setTimeout(sendRequest, ms));
}

function serializeLocalOnlinePlayerState() {
  // オンラインはROLEに関係なく、各端末のP1エンジンを自分の盤面として送信する。
  return {
    board: cloneOnlineValue(gameBoard),
    block: cloneOnlineValue(imaNoBurokku),
    score: sukoa,
    attack: attackPower,
    backToBack: backToBack,
    combo: comboCount,
    hold: horudoBurokku,
    queue: cloneOnlineValue(playerAttackQueue),
    alive: !isRoundOver,
    wins: Number(onlineScores[onlineRole] || 0)
  };
}

function sendLocalOnlineState(force=false) {
  if (onlineRole < 1 || !onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) return;
  const now = millis();
  if (!force && now - onlineLastLocalStateSend < 120) return;
  if (onlineSocket.bufferedAmount > 128 * 1024) return;
  const state = serializeLocalOnlinePlayerState();
  if (!isValidOnlineBoard(state.board) || !isValidOnlineBlock(state.block)) return;
  onlineLastLocalStateSend = now;
  try {
    onlineSocket.send(JSON.stringify({ type:'playerState', player:onlineRole, state }));
  } catch (e) {}
}

function handleOnlineGuestInput() {
  if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN || onlineRole < 2) return;
  const now = millis();
  if (now - onlineLastInputSend < 10) return;
  onlineLastInputSend = now;
  if (onlineSocket.bufferedAmount > 64 * 1024) return;
  try {
    onlineSocket.send(JSON.stringify({
      type:'inputState',
      state: {
        left:!!onlineGuestKeyState.left || keyConfigIsDown('left'),
        right:!!onlineGuestKeyState.right || keyConfigIsDown('right'),
        down:!!onlineGuestKeyState.down || keyConfigIsDown('down')
      }
    }));
  } catch (e) {}
}

function handleOnlineHostP2Input() {
  const now = millis();
  const s = onlineGuestKeyState;

  // A/Dを押した瞬間の1マス移動はkeyPressed側で行う。
  // ここではDAS待ち後の連続移動だけを担当し、初回の二重移動を防ぐ。
  if (s.left) {
    if (dasStartTimeLeftP2 !== 0 && now - dasStartTimeLeftP2 >= dasDelay && now - arrTimeLeftP2 >= arrDelay) {
      moveLeft(2); arrTimeLeftP2 = now;
    }
  } else dasStartTimeLeftP2 = 0;

  if (s.right) {
    if (dasStartTimeRightP2 !== 0 && now - dasStartTimeRightP2 >= dasDelay && now - arrTimeRightP2 >= arrDelay) {
      moveRight(2); arrTimeRightP2 = now;
    }
  } else dasStartTimeRightP2 = 0;

  if (s.down) {
    if (now - lastMoveDownTimeP2 > moveDownDelay) {
      moveDown(2); lastMoveDownTimeP2 = now;
    }
  } else lastMoveDownTimeP2 = 0;
}

function handleOnlineRemoteAction(action) {
  if (isRoundOver || isMatchOver) {
    if (action === 'nextRound' && !onlineRoundRequestSent) {
      onlineRoundRequestSent = true;
      if (isMatchOver) {
        restartGame();
        gameMode = 'ONLINE';
        nextRound();
      } else {
        nextRound();
      }
    }
    return;
  }

  if (action === 'rotateRight') rotateRight(2);
  else if (action === 'rotateLeft') rotateLeft(2);
  else if (action === 'hardDrop') hardDrop(2);
  else if (action === 'hold') horudoSuru(2);
  else if (action === 'pause') {
    if (countdownTime === 0) isPaused = !isPaused;
  }
}

function cloneOnlineValue(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
}

function isValidOnlineBoard(board) {
  if (!Array.isArray(board) || board.length !== GYO) return false;
  for (let i = 0; i < GYO; i++) {
    if (!Array.isArray(board[i]) || board[i].length !== RETSU) return false;
    for (let j = 0; j < RETSU; j++) {
      const v = Number(board[i][j]);
      if (!Number.isInteger(v) || v < 0 || v > 8) return false;
    }
  }
  return true;
}

function isValidOnlineBlock(block) {
  if (!block || typeof block !== 'object') return false;
  if (!Number.isInteger(Number(block.type)) || Number(block.type) < 0 || Number(block.type) > 6) return false;
  if (!Number.isFinite(Number(block.x)) || !Number.isFinite(Number(block.y))) return false;
  if (!Number.isInteger(Number(block.rotation)) || Number(block.rotation) < 0 || Number(block.rotation) > 3) return false;
  if (!Array.isArray(block.shape) || block.shape.length < 2 || block.shape.length > 4) return false;
  for (const row of block.shape) {
    if (!Array.isArray(row) || row.length < 2 || row.length > 4) return false;
    for (const cell of row) if (cell !== 0 && cell !== 1) return false;
  }
  return true;
}

function isValidOnlineArray(value, maxLength) {
  return Array.isArray(value) && value.length <= maxLength;
}

function serializeOnlineState(includeP2 = false) {
  onlineStateSeq++;
  const state = {
    seq: onlineStateSeq,
    gameMode:'ONLINE',
    // ホスト側（P1）の情報。ゲストが相手の盤面として表示する。
    gameBoard:cloneOnlineValue(gameBoard),
    imaNoBurokku:cloneOnlineValue(imaNoBurokku),
    sukoa:sukoa,
    attackPower:attackPower,
    backToBack:backToBack,
    comboCount:comboCount,
    horudoBurokku:horudoBurokku,
    horudoShiyouzumi:horudoShiyouzumi,
    playerAttackQueue:cloneOnlineValue(playerAttackQueue),
    // ゲスト自身が受けるおじゃまだけは常時同期する。
    player2AttackQueue:cloneOnlineValue(player2AttackQueue),
    playerWins:playerWins,
    p2Wins:p2Wins,
    isStarted:isStarted,
    isPaused:isPaused,
    isRoundOver:isRoundOver,
    isMatchOver:isMatchOver,
    roundWinner:roundWinner,
    isLanded:isLanded,
    lockDelayResetCount:lockDelayResetCount,
    countdownRemaining:Math.max(0, Math.min(countdownDuration, countdownDuration - (millis() - countdownTime)))
  };

  // 最初の1回だけP2の初期状態を送る。
  // 以後はゲスト自身がP2を動かすため、P2盤面を毎回送らない。
  if (includeP2) {
    state.gameBoardP2 = cloneOnlineValue(gameBoardP2);
    state.imaNoBurokkuP2 = cloneOnlineValue(imaNoBurokkuP2);
    state.cpuScore = cpuScore;
    state.cpuAttackPower = cpuAttackPower;
    state.cpuBackToBack = cpuBackToBack;
    state.cpuComboCount = cpuComboCount;
    state.cpuHoldBlock = cpuHoldBlock;
    state.cpuHoldUsed = cpuHoldUsed;
    state.player2AttackQueue = cloneOnlineValue(player2AttackQueue);
    state.p2BurokkuBaggu = cloneOnlineValue(p2BurokkuBaggu);
    state.p2TsugiBurokkuBaggu = cloneOnlineValue(p2TsugiBurokkuBaggu);
    state.isLandedP2 = isLandedP2;
    state.lockDelayResetCountP2 = lockDelayResetCountP2;
  }

  return state;
}

function sendOnlineState(force=false) {
  if (onlineRole !== 1 || !onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) return;
  const now = millis();
  // 相手の盤面は少し遅れてもよいので、通信量を大幅に減らす。
  // 自分の操作はローカルで即時処理するため、ここを遅くしても操作感には影響しない。
  if (!force && now - onlineLastStateSend < 120) return;
  if (onlineSocket.bufferedAmount > 128 * 1024) return;
  onlineLastStateSend = now;

  const includeP2 = !onlineInitialStateSent;
  try {
    const payload = JSON.stringify({ type:'state', state:serializeOnlineState(includeP2) });
    if (payload.length > 128 * 1024) return;
    onlineSocket.send(payload);
    if (includeP2) onlineInitialStateSent = true;
  } catch (e) {
    onlineStatus = '状態送信エラー';
  }
}

function sendOnlineStateIfNeeded() {
  sendOnlineState(false);
}

function applyOnlineState(s) {
  if (!s || typeof s !== 'object') return false;

  const seq = Number(s.seq || 0);
  if (seq && seq <= onlineLastAppliedSeq) return false;

  // ゲストは自分のP2をローカルで動かす。P2情報は最初の同期時だけ必要。
  if (!isValidOnlineBoard(s.gameBoard)) return false;
  const keepGuestP2 = (onlineRole >= 2 && onlineGuestInitialized);
  if (!keepGuestP2 && (!isValidOnlineBoard(s.gameBoardP2) || !isValidOnlineBlock(s.imaNoBurokkuP2))) return false;
  const localP2 = keepGuestP2 ? {
    gameBoardP2, imaNoBurokkuP2, cpuScore, cpuAttackPower, cpuBackToBack, cpuComboCount,
    cpuHoldBlock, cpuHoldUsed, player2AttackQueue, p2BurokkuBaggu, p2TsugiBurokkuBaggu,
    isLandedP2, lockDelayTimerP2, lockDelayResetCountP2, lowestYP2, lastActionP2,
    dasStartTimeLeftP2, dasStartTimeRightP2, arrTimeLeftP2, arrTimeRightP2, lastMoveDownTimeP2,
    wasHardDropPressedP2
  } : null;
  if (!isValidOnlineBlock(s.imaNoBurokku)) return false;
  if (!isValidOnlineArray(s.playerAttackQueue, 40)) return false;
  if (!keepGuestP2 && (!isValidOnlineArray(s.player2AttackQueue, 40) ||
      !isValidOnlineArray(s.p2BurokkuBaggu, 20) || !isValidOnlineArray(s.p2TsugiBurokkuBaggu, 20))) return false;

  gameMode = 'ONLINE';
  gameBoard = cloneOnlineValue(s.gameBoard);
  gameBoardP2 = cloneOnlineValue(s.gameBoardP2);
  imaNoBurokku = cloneOnlineValue(s.imaNoBurokku);
  imaNoBurokkuP2 = cloneOnlineValue(s.imaNoBurokkuP2);
  sukoa = Number.isFinite(Number(s.sukoa)) ? Number(s.sukoa) : sukoa;
  cpuScore = Number.isFinite(Number(s.cpuScore)) ? Number(s.cpuScore) : cpuScore;
  attackPower = Number.isFinite(Number(s.attackPower)) ? Number(s.attackPower) : attackPower;
  cpuAttackPower = Number.isFinite(Number(s.cpuAttackPower)) ? Number(s.cpuAttackPower) : cpuAttackPower;
  backToBack = Number.isFinite(Number(s.backToBack)) ? Number(s.backToBack) : backToBack;
  cpuBackToBack = Number.isFinite(Number(s.cpuBackToBack)) ? Number(s.cpuBackToBack) : cpuBackToBack;
  comboCount = Number.isFinite(Number(s.comboCount)) ? Number(s.comboCount) : comboCount;
  cpuComboCount = Number.isFinite(Number(s.cpuComboCount)) ? Number(s.cpuComboCount) : cpuComboCount;
  horudoBurokku = (s.horudoBurokku === null || Number.isInteger(Number(s.horudoBurokku))) ? s.horudoBurokku : horudoBurokku;
  cpuHoldBlock = (s.cpuHoldBlock === null || Number.isInteger(Number(s.cpuHoldBlock))) ? s.cpuHoldBlock : cpuHoldBlock;
  horudoShiyouzumi = !!s.horudoShiyouzumi;
  cpuHoldUsed = !!s.cpuHoldUsed;
  playerAttackQueue = cloneOnlineValue(s.playerAttackQueue);
  if (!keepGuestP2) {
    player2AttackQueue = cloneOnlineValue(s.player2AttackQueue);
    p2BurokkuBaggu = cloneOnlineValue(s.p2BurokkuBaggu);
    p2TsugiBurokkuBaggu = cloneOnlineValue(s.p2TsugiBurokkuBaggu);
  }
  playerWins = Math.max(0, Math.min(MATCH_WIN_COUNT, Number(s.playerWins) || 0));
  p2Wins = Math.max(0, Math.min(MATCH_WIN_COUNT, Number(s.p2Wins) || 0));
  // オンラインのラウンド状態はサーバーの roundOver / startRound / matchOver 通知を正として扱う。
  // 他プレイヤーの playerState で自分の終了状態が上書きされると、
  // ラウンド終了画面から抜けられなくなるため、ここでは isStarted / isPaused /
  // isRoundOver / isMatchOver / roundWinner をリモート状態から上書きしない。
  // 次ラウンド開始時は startRound メッセージ側で明示的にリセットする。
  roundWinner = typeof s.roundWinner === 'string' ? s.roundWinner : roundWinner;
  isLanded = !!s.isLanded;
  isLandedP2 = !!s.isLandedP2;
  lockDelayResetCount = Math.max(0, Math.min(MAX_LOCK_DELAY_RESETS, Number(s.lockDelayResetCount) || 0));
  lockDelayResetCountP2 = Math.max(0, Math.min(MAX_LOCK_DELAY_RESETS, Number(s.lockDelayResetCountP2) || 0));

  const remain = Math.max(0, Math.min(countdownDuration, Number(s.countdownRemaining) || 0));
  countdownTime = remain > 0 ? millis() - (countdownDuration - remain) : 0;

  if (localP2) {
    gameBoardP2 = localP2.gameBoardP2;
    imaNoBurokkuP2 = localP2.imaNoBurokkuP2;
    cpuScore = localP2.cpuScore;
    cpuAttackPower = localP2.cpuAttackPower;
    cpuBackToBack = localP2.cpuBackToBack;
    cpuComboCount = localP2.cpuComboCount;
    cpuHoldBlock = localP2.cpuHoldBlock;
    cpuHoldUsed = localP2.cpuHoldUsed;
    p2BurokkuBaggu = localP2.p2BurokkuBaggu;
    p2TsugiBurokkuBaggu = localP2.p2TsugiBurokkuBaggu;
    isLandedP2 = localP2.isLandedP2;
    lockDelayTimerP2 = localP2.lockDelayTimerP2;
    lockDelayResetCountP2 = localP2.lockDelayResetCountP2;
    lowestYP2 = localP2.lowestYP2;
    lastActionP2 = localP2.lastActionP2;
    dasStartTimeLeftP2 = localP2.dasStartTimeLeftP2;
    dasStartTimeRightP2 = localP2.dasStartTimeRightP2;
    arrTimeLeftP2 = localP2.arrTimeLeftP2;
    arrTimeRightP2 = localP2.arrTimeRightP2;
    lastMoveDownTimeP2 = localP2.lastMoveDownTimeP2;
    wasHardDropPressedP2 = localP2.wasHardDropPressedP2;
    const hostQ = Array.isArray(s.player2AttackQueue) ? s.player2AttackQueue : [];
    const hostTotal = hostQ.reduce((a,v)=>a + (Number(v)||0), 0);
    const localTotal = player2AttackQueue.reduce((a,v)=>a + (Number(v)||0), 0);
    player2AttackQueue = hostTotal > localTotal ? cloneOnlineValue(hostQ) : localP2.player2AttackQueue;
  } else {
    onlineGuestInitialized = true;
  }

  if (seq) onlineLastAppliedSeq = seq;
  return true;
}

// keyPressed を gameMode で分岐
// ゲーム中に矢印キーやSpaceでブラウザ画面がスクロールするのを防ぐ。
// オンライン専用ハンドラとは別に、ローカル対戦を含む全ゲームモードで有効にする。
window.addEventListener('keydown', function(e) {
  const gameControlKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  if (gameControlKeys.includes(e.code) && typeof gameMode !== 'undefined' && gameMode !== 'TITLE') {
    e.preventDefault();
  }
}, { passive: false, capture: true });

function keyPressed() {
  if (gameMode === 'TITLE' && helpOpen) {
    if (keyCode === ESCAPE || key === 'Escape') helpOpen = false;
    return false;
  }
  // オンラインはROLE 1〜4の全員が自分のP1エンジンを操作する。
  if (gameMode === 'ONLINE' && onlineRole >= 1) {
    if (isMatchOver) {
      // マッチ終了後は何らかのキー入力でオンラインを終了してモード選択へ戻る。
      if (onlineSocket) { try { onlineSocket.close(); } catch(e) {} }
      onlineSocket = null;
      onlineConnected = false;
      onlineMatchStarted = false;
      onlineMatchStartRequested = false;
      onlineRoundRequestSent = false;
      gameMode = 'TITLE';
      isStarted = false;
      isRoundOver = false;
      isMatchOver = false;
      onlineStatus = '';
      return false;
    }
    if (isRoundOver) {
      if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || keyCode === UP_ARROW || keyCode === DOWN_ARROW ||
          key === 'w' || key === 'W' || key === 'a' || key === 'A' || key === 's' || key === 'S' ||
          key === 'd' || key === 'D' || key === 'c' || key === 'C') {
        sendOnlineAction('nextRound');
      }
      return false;
    }
    // 通常のオンライン操作は下のwindow.keydownだけで処理する。
    // p5.jsのkeyPressedも同時に実行すると、W等が二重発火するためここでは止める。
    return false;
    if (actionHasKey('left', keyCodeToCode(keyCode))) {
      const now = millis();
      moveLeft(1); dasStartTimeLeft = now; arrTimeLeft = now;
    }
    else if (actionHasKey('right', keyCodeToCode(keyCode))) {
      const now = millis();
      moveRight(1); dasStartTimeRight = now; arrTimeRight = now;
    }
    else if (actionHasKey('down', keyCodeToCode(keyCode))) {
      moveDown(1); lastMoveDownTime = millis();
    }
    else if (actionHasKey('hardDrop', keyCodeToCode(keyCode))) hardDrop(1);
    else if (actionHasKey('rotateLeft', keyCodeToCode(keyCode))) rotateLeft(1);
    else if (actionHasKey('rotateRight', keyCodeToCode(keyCode))) rotateRight(1);
    else if (keyCode === UP_ARROW && keyConfig.rotateLeft === 'ArrowUp') rotateLeft(1);
    else if (keyCode === DOWN_ARROW && keyConfig.rotateRight === 'ArrowDown') rotateRight(1);
    else if (actionHasKey('hold', keyCodeToCode(keyCode))) horudoSuru(1);
    else if (key === 'p' || key === 'P') {
      if (countdownTime === 0) isPaused = !isPaused;
    }
    return false;
  }

  if (isMatchOver) {
    if (key === 'a' || key === 'A' || key === 'x' || key === 'X' || key === 'z' || key === 'Z' || key === 'c' || key === 'C') { 
      restartGame(); 
    }
    if (gameMode === 'VS_LOCAL' && (key === 'u' || key === 'U' || key === 'o' || key === 'O')) {
      restartGame();
    }
  }
  else if (isRoundOver) {
    if (key === 'a' || key === 'A' || key === 'x' || key === 'X' || key === 'z' || key === 'Z' || key === 'c' || key === 'C') { 
      nextRound(); 
    }
    if (gameMode === 'VS_LOCAL' && (key === 'u' || key === 'U' || key === 'o' || key === 'O')) {
      nextRound();
    }
  }
  else if (gameMode === 'TITLE') {
     if (key === 'a' || key === 'A' || key === ' ' || keyCode === ENTER) { 
         let selectedMode = titleButtons[selectedButtonIndex].mode;
         if (selectedMode === 'ONLINE') {
             startOnlineMenu();
         } else {
             gameMode = selectedMode;
             nextRound(); 
         }
     } else if (keyCode === DOWN_ARROW) {
         selectedButtonIndex = (selectedButtonIndex + 1) % titleButtons.length;
     } else if (keyCode === UP_ARROW) {
         selectedButtonIndex = (selectedButtonIndex - 1 + titleButtons.length) % titleButtons.length;
     }
  } else if (countdownTime === 0) { 
    if (key === 'p' || key === 'P') { 
        if (isPaused) {
            countdownTime = millis();
        }
        isPaused = !isPaused;
    }
  }
   
  if (isPaused || countdownTime > 0 || gameMode === 'TITLE' || isRoundOver || isMatchOver) {
    return;
  }

  // --- P1 ゲーム中の操作（キー設定に従う） ---
  if (actionHasKey('hardDrop', keyCodeToCode(keyCode))) { hardDrop(1); return false; }
  if (actionHasKey('rotateLeft', keyCodeToCode(keyCode))) { rotateLeft(1); return false; }
  if (actionHasKey('rotateRight', keyCodeToCode(keyCode))) { rotateRight(1); return false; }
  if (actionHasKey('hold', keyCodeToCode(keyCode))) { horudoSuru(1); return false; }

  // --- P2 ゲーム中の操作 (VS_LOCAL のみ) ---
  if (gameMode === 'VS_LOCAL') {
      if (key === 'u' || key === 'U' || key === 'o' || key === 'O' || key === '>') { // P2 ホールド
          horudoSuru(2);
      }
      else if (keyCode === LEFT_ARROW) rotateRight(2);
      else if (keyCode === RIGHT_ARROW) rotateLeft(2);
      else if (keyCode === UP_ARROW) rotateLeft(2);
      else if (keyCode === DOWN_ARROW) rotateRight(2);
  }
}

// P1/P2/CPU のロジックを playerIndex で分離

// 左移動
function moveLeft(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  let landed = (playerIndex === 1) ? isLanded : isLandedP2;
  let resets = (playerIndex === 1) ? lockDelayResetCount : lockDelayResetCountP2;

  let originalX = burokku.x;
  burokku.x--;
  if (butsukaru(burokku, board)) {
    burokku.x++;
  } else {
    if (originalX !== burokku.x) {
        if (playerIndex === 1) lastAction = 'MOVE';
        else lastActionP2 = 'MOVE';
        
        if (landed) { 
            if (resets < MAX_LOCK_DELAY_RESETS) { 
                if (playerIndex === 1) { lockDelayTimer = millis() + lockDelayDuration; lockDelayResetCount++; }
                else { lockDelayTimerP2 = millis() + lockDelayDuration; lockDelayResetCountP2++; }
            } else {
                hardDrop(playerIndex); 
            }
        }
    }
  }
}

// 右移動
function moveRight(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  let landed = (playerIndex === 1) ? isLanded : isLandedP2;
  let resets = (playerIndex === 1) ? lockDelayResetCount : lockDelayResetCountP2;

  let originalX = burokku.x;
  burokku.x++;
  if (butsukaru(burokku, board)) {
    burokku.x--;
  } else {
    if (originalX !== burokku.x) {
        if (playerIndex === 1) lastAction = 'MOVE';
        else lastActionP2 = 'MOVE';

        if (landed) { 
            if (resets < MAX_LOCK_DELAY_RESETS) { 
                if (playerIndex === 1) { lockDelayTimer = millis() + lockDelayDuration; lockDelayResetCount++; }
                else { lockDelayTimerP2 = millis() + lockDelayDuration; lockDelayResetCountP2++; }
            } else {
                hardDrop(playerIndex); 
            }
        }
    }
  }
}

// ▼▼▼ 修正点 (バグ修正): 欠落していた checkIfLanded 関数を追加 ▼▼▼
function checkIfLanded(burokku, board) {
    burokku.y++;
    let landed = butsukaru(burokku, board);
    burokku.y--;
    return landed;
}
// ▲▲▲

// 下移動
function moveDown(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  let landed = (playerIndex === 1) ? isLanded : isLandedP2;
  let lY = (playerIndex === 1) ? lowestY : lowestYP2;

  if (checkIfLanded(burokku, board)) {
    if (!landed) {
      if (playerIndex === 1) { isLanded = true; lockDelayTimer = millis() + lockDelayDuration; }
      else { isLandedP2 = true; lockDelayTimerP2 = millis() + lockDelayDuration; }
      
      if (burokku.y > lY) {
         if (playerIndex === 1) { lowestY = burokku.y; lockDelayResetCount = 0; }
         else { lowestYP2 = burokku.y; lockDelayResetCountP2 = 0; }
      }
    }
  } else {
    burokku.y++;
    if (playerIndex === 1) { lastAction = 'MOVE'; isLanded = false; lockDelayTimer = 0; }
    else { lastActionP2 = 'MOVE'; isLandedP2 = false; lockDelayTimerP2 = 0; }
    
    if (burokku.y > lY) {
        if (playerIndex === 1) { lowestY = burokku.y; lockDelayResetCount = 0; }
        else { lowestYP2 = burokku.y; lockDelayResetCountP2 = 0; }
    }
  }
}

// 右回転
function rotateRight(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  let landed = (playerIndex === 1) ? isLanded : isLandedP2;
  let lY = (playerIndex === 1) ? lowestY : lowestYP2;
  let resets = (playerIndex === 1) ? lockDelayResetCount : lockDelayResetCountP2;

  if (burokku.type === 0) return;
  let newRotation = (burokku.rotation + 1) % 4;
  let newShape = burokkuShurui[burokku.type][newRotation];
  let kickData = burokku.type === 1 ? I_KICK_DATA : JLSTZ_KICK_DATA;
  let kickIndexOffset = burokku.rotation * 2;
 
  for (let i = 0; i < 5; i++) {
    let test = kickData[kickIndexOffset][i];
    let testBurokku = { ...burokku, shape: newShape, x: burokku.x + test[0], y: burokku.y - test[1] };
   
    if (!butsukaru(testBurokku, board)) {
      burokku.shape = newShape;
      burokku.rotation = newRotation;
      burokku.x = testBurokku.x;
      burokku.y = testBurokku.y;
      
      if (playerIndex === 1) lastAction = 'ROTATE';
      else lastActionP2 = 'ROTATE';
     
      if (burokku.y > lY) {
          if (playerIndex === 1) { lowestY = burokku.y; lockDelayResetCount = 0; }
          else { lowestYP2 = burokku.y; lockDelayResetCountP2 = 0; }
      } 
      else if (landed) { 
          if (resets < MAX_LOCK_DELAY_RESETS) { 
              if (playerIndex === 1) { lockDelayTimer = millis() + lockDelayDuration; lockDelayResetCount++; }
              else { lockDelayTimerP2 = millis() + lockDelayDuration; lockDelayResetCountP2++; }
          } else {
              hardDrop(playerIndex); 
              return; 
          }
      }
      return; 
    }
  }
}

// 左回転
function rotateLeft(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  let landed = (playerIndex === 1) ? isLanded : isLandedP2;
  let lY = (playerIndex === 1) ? lowestY : lowestYP2;
  let resets = (playerIndex === 1) ? lockDelayResetCount : lockDelayResetCountP2;

  if (burokku.type === 0) return;
  let newRotation = (burokku.rotation - 1 + 4) % 4;
  let newShape = burokkuShurui[burokku.type][newRotation];
  let kickData = burokku.type === 1 ? I_KICK_DATA : JLSTZ_KICK_DATA;
  let kickIndexOffset = (newRotation * 2) + 1;
 
  for (let i = 0; i < 5; i++) {
    let test = kickData[kickIndexOffset][i];
    let testBurokku = { ...burokku, shape: newShape, x: burokku.x + test[0], y: burokku.y - test[1] };
   
    if (!butsukaru(testBurokku, board)) {
      burokku.shape = newShape;
      burokku.rotation = newRotation;
      burokku.x = testBurokku.x;
      burokku.y = testBurokku.y;
      
      if (playerIndex === 1) lastAction = 'ROTATE';
      else lastActionP2 = 'ROTATE';
     
      if (burokku.y > lY) {
          if (playerIndex === 1) { lowestY = burokku.y; lockDelayResetCount = 0; }
          else { lowestYP2 = burokku.y; lockDelayResetCountP2 = 0; }
      } 
      else if (landed) { 
          if (resets < MAX_LOCK_DELAY_RESETS) { 
              if (playerIndex === 1) { lockDelayTimer = millis() + lockDelayDuration; lockDelayResetCount++; }
              else { lockDelayTimerP2 = millis() + lockDelayDuration; lockDelayResetCountP2++; }
          } else {
              hardDrop(playerIndex); 
              return; 
          }
      }
      return; 
    }
  }
}

// ハードドロップ
function hardDrop(playerIndex) {
  let burokku = (playerIndex === 1) ? imaNoBurokku : imaNoBurokkuP2;
  let board = (playerIndex === 1) ? gameBoard : gameBoardP2;
  
  let originalY = burokku.y;
  while (!butsukaru(burokku, board)) {
    burokku.y++;
  }
  burokku.y--;
 
  if (originalY !== burokku.y) {
     if (playerIndex === 1) lastAction = 'HARD_DROP';
     else lastActionP2 = 'HARD_DROP';
  }

  koteiBurokku(playerIndex); 
 
  if (playerIndex === 1) {
    isLanded = false;
    lockDelayTimer = 0;
    lockDelayResetCount = 0;
  } else {
    isLandedP2 = false;
    lockDelayTimerP2 = 0;
    lockDelayResetCountP2 = 0;
  }
}

// ホールド処理
function horudoSuru(playerIndex) {
  if (playerIndex === 1) {
    if (horudoShiyouzumi || isRoundOver || isPaused || !isStarted) return;
    horudoShiyouzumi = true;
    lastAction = 'NONE';
    isLanded = false;
    lockDelayTimer = 0;
    lockDelayResetCount = 0; 
    
    let tempType = imaNoBurokku.type;
    if (horudoBurokku === null) {
      horudoBurokku = tempType;
      spawnNewBlock(1, true); 
    } else {
      let newType = horudoBurokku;
      horudoBurokku = tempType;
      // 新しいブロックを生成
      let rotation = 0;
      let katachi = burokkuShurui[newType][rotation];
      let iro = newType + 1;
      imaNoBurokku = { type: newType, shape: katachi, rotation: rotation, color: iro, x: 3, y: 0 };
      lowestY = imaNoBurokku.y;
      if (butsukaru(imaNoBurokku, gameBoard)) {
        imaNoBurokku.y = -1; 
        if (butsukaru(imaNoBurokku, gameBoard)) {
           handleRoundOver('PLAYER1'); 
        }
      }
    }
  } else { // P2 (VS_LOCAL) または CPU (0)
    if (cpuHoldUsed || isRoundOver || isPaused || !isStarted) return;
    cpuHoldUsed = true;
    
    if (playerIndex === 2) { // P2のみ
        lastActionP2 = 'NONE';
        isLandedP2 = false;
        lockDelayTimerP2 = 0;
        lockDelayResetCountP2 = 0;
    } else { // CPU
        cpuNextMove = null; 
    }
    
    let tempType = imaNoBurokkuP2.type;
    if (cpuHoldBlock === null) {
      cpuHoldBlock = tempType;
      spawnNewBlock(2, true); 
    } else {
      let newType = cpuHoldBlock;
      cpuHoldBlock = tempType;
      let rotation = 0;
      let katachi = burokkuShurui[newType][rotation];
      let iro = newType + 1;
      imaNoBurokkuP2 = { type: newType, shape: katachi, rotation: rotation, color: iro, x: 3, y: 0 };
      lowestYP2 = imaNoBurokkuP2.y;
      if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
        imaNoBurokkuP2.y = -1; 
        if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
           if (playerIndex === 2) handleRoundOver('PLAYER2');
           else handleRoundOver('CPU');
        }
      }
    }
  }
}
// ▲▲▲


// ▼▼▼ 修正点 13 (テトリス23): restartGame() と nextRound() を gameMode 対応 ▼▼▼
function restartGame() {
  gameMode = 'TITLE'; // タイトル画面に戻る
  playerWins = 0;
  p2Wins = 0; 
  sukoa = 0;
  cpuScore = 0;
  
  // バッグの完全リセット。各プレイヤーごとにランダムな7種順序を1つ作り、
  // 現在バッグと次バッグへ同じ順序を設定する。
  const p1Bag = fuyasuBaggu();
  const p2Bag = fuyasuBaggu();
  p1BurokkuBaggu = p1Bag.slice();
  p1TsugiBurokkuBaggu = p1Bag.slice();
  p2BurokkuBaggu = p2Bag.slice();
  p2TsugiBurokkuBaggu = p2Bag.slice();
  
  isStarted = false; 
  isMatchOver = false;
  isRoundOver = false; 
  wasHardDropPressedP2 = false; // ★ P2フラグもリセット
  
  // (nextRound() は呼ばない)
}

// 次のラウンドへ（ボードリセット、スコア・勝利数は維持）
function nextRound() {
  // P1 のボード初期化
  gameBoard = [];
  for (let i = 0; i < GYO; i++) {
    gameBoard[i] = new Array(RETSU).fill(0);
  }
  
  // P2/C のボード初期化
  gameBoardP2 = [];
  for (let i = 0; i < GYO; i++) {
    gameBoardP2[i] = new Array(RETSU).fill(0);
  }
 
  // P1 状態リセット
  attackPower = 0; 
  backToBack = 0; 
  comboCount = 0; 
  playerAttackQueue = [];
  horudoBurokku = null;
  horudoShiyouzumi = false; 
  isLanded = false;
  lockDelayTimer = 0;
 
  // P2/C 状態リセット
  cpuAttackPower = 0; 
  cpuBackToBack = 0;
  cpuComboCount = 0;
  player2AttackQueue = []; 
  cpuHoldBlock = null;
  cpuHoldUsed = false; 
  isLandedP2 = false;
  lockDelayTimerP2 = 0;
  wasHardDropPressedP2 = false; // ★ P2フラグもリセット
 
  isRoundOver = false;
  isPaused = false;

  // オンラインは各ラウンドを新しい7種一巡から開始する。
  // 各プレイヤーの7個の順序を1つだけ作り、バッグ境界をまたいでも一巡を崩さない。
  if (gameMode === 'ONLINE') {
    const p1Bag = fuyasuBaggu();
    const p2Bag = fuyasuBaggu();
    p1BurokkuBaggu = p1Bag.slice();
    p1TsugiBurokkuBaggu = p1Bag.slice();
    p2BurokkuBaggu = p2Bag.slice();
    p2TsugiBurokkuBaggu = p2Bag.slice();
  }

  isStarted = true; // ★ ゲーム開始
  countdownTime = millis(); 
 
  // P1/P2/C のピースを生成
  spawnNewBlock(1); 
  if (gameMode !== 'SOLO') {
     spawnNewBlock(2); // P2 または CPU
  }
}
// ▲▲▲

// ▼▼▼ 修正点 14 (テトリス23): handleRoundOver() の勝者判定を変更 ▼▼▼
function handleRoundOver(loser) { // 'PLAYER1', 'PLAYER2', 'CPU', または 'SOLO_END'
  if (isRoundOver) return;
  isRoundOver = true;
  if (gameMode === 'SCORE_ATTACK') { isMatchOver = true; scoreAttackFinished=false; scoreAttackElapsedMs=Math.max(1,millis()-scoreAttackStartMs); scoreAttackNotice='ゲームオーバー。記録は保存されません'; return; }
  if (gameMode === 'SOLO') { isMatchOver = true; roundWinner = 'SOLO_END'; return; }

  if (gameMode === 'ONLINE') {
    onlineStatus = '脱落しました。ほかのプレイヤーを待っています...';
    onlineAlive[onlineRole] = false;
    sendOnlineAction('playerDead');
    sendLocalOnlineState(true);
    return;
  }

  if (loser === 'PLAYER1') {
      p2Wins++;
      roundWinner = (gameMode === 'VS_CPU') ? 'CPU' : 'PLAYER2';
  } else {
      playerWins++;
      roundWinner = 'PLAYER1';
  }
  if (playerWins >= MATCH_WIN_COUNT || p2Wins >= MATCH_WIN_COUNT) isMatchOver = true;
}
// ▲▲▲

// ==========================================================
// --- ▼ CPU AI/ターン処理 ▼ ---
// ==========================================================

// AIの最善手計算
function calculateBestMove(board, currentBurokku) {
  let bestScore = -Infinity;
  let bestMove = null;
  
  if (!currentBurokku) return null; 

  for (let rotation = 0; rotation < 4; rotation++) {
    if (currentBurokku.type === 0 && rotation > 0) continue; 
   
    let shape = burokkuShurui[currentBurokku.type][rotation];
   
    for (let x = -2; x < RETSU; x++) { 
     
      let simulatedBurokku = {
        ...currentBurokku, 
        shape: shape,
        rotation: rotation,
        x: x, 
        y: 0 
      };
     
      while (simulatedBurokku.y > -4 && butsukaru(simulatedBurokku, board)) {
          simulatedBurokku.y--;
      }
      if (simulatedBurokku.y < -4) continue; 
     
      let dropY = simulatedBurokku.y;
      while (!butsukaru({...simulatedBurokku, y: dropY + 1}, board)) {
        dropY++;
      }
     
      let finalBurokku = {
          ...simulatedBurokku,
          y: dropY
      };
     
      if (butsukaru(finalBurokku, board)) continue;
     
      // --- Tスピン判定 ---
      let isTSpin = false;
      if (finalBurokku.type === 6) { 
          let cornerChecks = 0;
          const corners = [
              {x: finalBurokku.x + 0, y: finalBurokku.y + 0}, 
              {x: finalBurokku.x + 2, y: finalBurokku.y + 0}, 
              {x: finalBurokku.x + 0, y: finalBurokku.y + 2}, 
              {x: finalBurokku.x + 2, y: finalBurokku.y + 2}  
          ];

          for (const c of corners) {
              let blocked = false;
              if (c.x < 0 || c.x >= RETSU || c.y >= GYO) {
                  blocked = true; 
              } 
              else if (c.y >= 0 && board[c.y] && board[c.y][c.x] !== 0) { 
                  blocked = true; 
              }
              if (blocked) {
                  cornerChecks++;
              }
          }
         
          if (cornerChecks >= 3) {
              isTSpin = true;
          }
      }
      // --- Tスピン判定 終わり ---
     
      let tempBoard = board.map(arr => [...arr]);
      for (let i = 0; i < finalBurokku.shape.length; i++) {
        for (let j = 0; j < finalBurokku.shape[i].length; j++) {
          if (finalBurokku.shape[i][j] !== 0) {
            let cx = finalBurokku.x + j;
            let cy = finalBurokku.y + i;
            if (cy >= 0 && cy < GYO && cx >= 0 && cx < RETSU) {
              tempBoard[cy][cx] = finalBurokku.color;
            }
          }
        }
      }
     
      let linesCleared = 0;
      for (let i = GYO - 1; i >= 0; i--) { 
        if (tempBoard[i].every((cell) => cell !== 0 && cell !== 8)) {
          linesCleared++;
          tempBoard.splice(i, 1);
          tempBoard.unshift(new Array(RETSU).fill(0));
          i++; 
        }
      }

      // --- 盤面評価メトリクス ---
      let holes = 0; 
      let aggregateHeight = 0; 
      let bumpiness = 0;
      let columnHeight = new Array(RETSU).fill(GYO); 
      let maxHeight = 0;

      for (let j = 0; j < RETSU; j++) {
        let blockFound = false;
        for (let i = 0; i < GYO; i++) {
          if (tempBoard[i][j] !== 0) {
            if (!blockFound) {
              columnHeight[j] = i; 
              blockFound = true;
            }
          } else if (blockFound) {
            holes++; 
          }
        }
      }
     
      for(let j = 0; j < RETSU; j++) {
          let h = GYO - columnHeight[j]; 
          aggregateHeight += h;
          if (h > maxHeight) maxHeight = h;
         
          if (j > 0) {
              bumpiness += abs(h - (GYO - columnHeight[j-1]));
          }
      }
     
      // --- スコア計算 (重み付け) ---
      let score = 0;
      if (isTSpin) {
          if (linesCleared === 1) score += 8000;
          else if (linesCleared === 2) score += 12000;
          else if (linesCleared === 3) score += 16000;
          else score += 1000;
      } else if (linesCleared === 4) {
          score += 10000; 
      } else {
          score += linesCleared * 1000; 
      }

      // 盤面に対するペナルティ
      score -= aggregateHeight * 50; 
      score -= holes * 350;             
      score -= bumpiness * 25;          
      score -= maxHeight * 50;        

      if (score > bestScore) {
        bestScore = score;
        bestMove = { x: finalBurokku.x, rotation: rotation, y: finalBurokku.y, score: score }; 
      }
    }
  }
 
  return bestMove; 
}


// CPUのターン実行ロジック (AI)
function cpuTurn() {
    if (isRoundOver || isPaused || countdownTime > 0) return; 
    if (!imaNoBurokkuP2) return;

    // --- AIの意思決定 (ホールドを含む) ---
    if (!cpuNextMove) {
        // 1. 現在のブロックでのベストムーブを計算
        let bestMoveCurrent = calculateBestMove(gameBoardP2, imaNoBurokkuP2);
       
        // 2. ホールド中のブロック (または次のブロック) でのベストムーブを計算
        let bestMoveHold = null;
        let heldBlockType = cpuHoldBlock;
       
        if (heldBlockType === null) {
            if (p2BurokkuBaggu.length > 0) {
                heldBlockType = p2BurokkuBaggu[p2BurokkuBaggu.length - 1]; 
            }
        }
       
        if (heldBlockType !== null) {
            let simulatedHeldBlock = {
                type: heldBlockType,
                shape: burokkuShurui[heldBlockType][0],
                rotation: 0,
                color: heldBlockType + 1,
                x: 3, 
                y: 0 
            };
            bestMoveHold = calculateBestMove(gameBoardP2, simulatedHeldBlock);
        }

        // 3. スコアを比較して、ホールドするかどうか決定
        if (bestMoveHold && !cpuHoldUsed && (!bestMoveCurrent || bestMoveHold.score > bestMoveCurrent.score)) {
            horudoSuru(0); // 0 = CPU
            return; 
        } else {
            cpuNextMove = bestMoveCurrent;
        }

        // 最善手が見つからない場合 (エラー対策)
        if (!cpuNextMove) {
            while (!checkIfLanded(imaNoBurokkuP2, gameBoardP2)) { imaNoBurokkuP2.y++; }
            koteiBurokku(0); // 0 = CPU
            return;
        }
    }
    // --- AIの意思決定 終わり ---
   
    let targetX = cpuNextMove.x;
    let targetRotation = cpuNextMove.rotation;

    // A) 回転
    if (imaNoBurokkuP2.rotation !== targetRotation) {
        let newRotation = (imaNoBurokkuP2.rotation + 1) % 4;
        let newShape = burokkuShurui[imaNoBurokkuP2.type][newRotation];
       
        let kickData = imaNoBurokkuP2.type === 1 ? I_KICK_DATA : JLSTZ_KICK_DATA;
        let kickIndexOffset = imaNoBurokkuP2.rotation * 2;
       
        for (let i = 0; i < 5; i++) {
            let test = kickData[kickIndexOffset][i];
            let testBurokku = {
                ...imaNoBurokkuP2, 
                shape: newShape,
                x: imaNoBurokkuP2.x + test[0],
                y: imaNoBurokkuP2.y - test[1] 
            };
           
            if (!butsukaru(testBurokku, gameBoardP2)) {
                imaNoBurokkuP2.shape = newShape;
                imaNoBurokkuP2.rotation = newRotation;
                imaNoBurokkuP2.x = testBurokku.x;
                imaNoBurokkuP2.y = testBurokku.y;
                return; 
            }
        }
    }
   
    // B) 横移動
    else if (imaNoBurokkuP2.x !== targetX) {
        if (imaNoBurokkuP2.x > targetX) {
            imaNoBurokkuP2.x--;
            if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
                imaNoBurokkuP2.x++; 
            }
        } else {
            imaNoBurokkuP2.x++;
            if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
                imaNoBurokkuP2.x--;
            }
        }
        return; 
    }
   
    // C) ハードドロップ
    else {
        let originalY = imaNoBurokkuP2.y;

        while (!butsukaru(imaNoBurokkuP2, gameBoardP2)) {
            imaNoBurokkuP2.y++;
        }
        imaNoBurokkuP2.y--;
       
        koteiBurokku(0); // 0 = CPU
    }
}

// CPUのホールド処理
function cpuHoldSuru() { // (horudoSuru(0) と同じ)
  if (cpuHoldUsed || isRoundOver || isPaused || !isStarted) return;
  cpuHoldUsed = true;
  cpuNextMove = null; 

  let tempType = imaNoBurokkuP2.type;

  if (cpuHoldBlock === null) {
    cpuHoldBlock = tempType;
    spawnNewBlock(2); // P2/CPU
  } else {
    let newType = cpuHoldBlock;
    cpuHoldBlock = tempType;

    let rotation = 0;
    let katachi = burokkuShurui[newType][rotation];
    let iro = newType + 1;
    imaNoBurokkuP2 = { 
      type: newType, 
      shape: katachi, 
      rotation: 0,
      color: iro, 
      x: 3, 
      y: 0 
    };
   
    if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
      imaNoBurokkuP2.y = -1; 
      if (butsukaru(imaNoBurokkuP2, gameBoardP2)) {
         handleRoundOver('CPU'); 
      }
    }
  }
}

// ============================================================
// オンライン操作（キーボード＋タッチ）
// すべてROLE 1～4で自分のP1エンジンを直接操作する。
// ============================================================
(function setupOnlineKeyboardControls(){
  const active=()=>typeof gameMode!=='undefined'&&gameMode==='ONLINE'&&typeof onlineRole!=='undefined'&&onlineRole>=1;
  // Switch Pro Controller / Joy-Con等のGamepad API入力。押しっぱなしの連続発火を防ぐ。
  let previousPadButtons = [];
  let previousPadUp = false;
  function pollOnlineGamepad(){
    try {
      const gp = getActiveGamepad();
      if (!gp) { previousPadButtons = []; previousPadUp = false; return; }
      const pressed = i => !!(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
      const edge = i => pressed(i) && !previousPadButtons[i];
      if (active()) {
        if (isMatchOver) {
          if ([0,1,4,5,9].some(edge)) { if (onlineSocket) { try { onlineSocket.close(); } catch(e) {} } onlineSocket=null; onlineConnected=false; onlineMatchStarted=false; onlineMatchStartRequested=false; onlineRoundRequestSent=false; gameMode='TITLE'; isStarted=false; isRoundOver=false; isMatchOver=false; onlineStatus=''; }
        } else if (isRoundOver) {
          if ([0,1,2,3,4,5,9].some(edge) || (pressed(12)&&!previousPadUp)) requestOnlineNextRound();
        } else if (!isPaused && countdownTime===0 && isStarted) {
          // D-pad and left stick feed the same continuous movement state as keyboard controls.
          const axisX = gp.axes && Number.isFinite(gp.axes[0]) ? gp.axes[0] : 0;
          const axisY = gp.axes && Number.isFinite(gp.axes[1]) ? gp.axes[1] : 0;
          onlineGuestKeyState.left = !!(pressed(14) || axisX < -0.5);
          onlineGuestKeyState.right = !!(pressed(15) || axisX > 0.5);
          onlineGuestKeyState.down = !!(pressed(13) || axisY > 0.5);
          if ((pressed(12) || axisY < -0.5) && !previousPadUp) { hardDrop(1); sendOnlineAction('hardDrop'); }
          if (edge(0)) { rotateLeft(1); sendOnlineAction('rotateLeft'); }
          if (edge(1)) { rotateRight(1); sendOnlineAction('rotateRight'); }
          if (edge(2)) { hardDrop(1); sendOnlineAction('hardDrop'); }
          if (edge(4) || edge(5) || edge(3)) { horudoSuru(1); sendOnlineAction('hold'); }
          if (edge(9)) { isPaused = !isPaused; if (!isPaused) countdownTime = millis(); }
        }
      }
      previousPadButtons = Array.from({length: gp.buttons ? gp.buttons.length : 0}, (_,i)=>pressed(i));
      previousPadUp = !!(pressed(12) || (gp.axes && gp.axes[1] < -0.5));
    } catch(e) {}
  }
  setInterval(pollOnlineGamepad, 16);
  window.addEventListener('keydown',e=>{
    if(!active()) return;
    const c=e.code;
    const isControlKey=keyConfigActions.some(a=>actionHasKey(a[0],c))||c==='Space'||['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(c);
    if(isControlKey) e.preventDefault();

    // ラウンド終了：指定された操作のいずれかで全員の次ラウンド開始を要求。
    if(isRoundOver && !isMatchOver) {
      if(isControlKey && !e.repeat) requestOnlineNextRound();
      return;
    }

    // マッチ終了：何らかのキー入力でモード選択画面へ戻る。
    if(isMatchOver) {
      if(onlineSocket) { try { onlineSocket.close(); } catch(err) {} }
      onlineSocket=null; onlineConnected=false; onlineMatchStarted=false; onlineMatchStartRequested=false;
      onlineRoundRequestSent=false; gameMode='TITLE'; isStarted=false; isRoundOver=false; isMatchOver=false;
      onlineStatus='';
      return;
    }

    if(isPaused||countdownTime>0||!isStarted) return;
    if(actionHasKey('left',c)) onlineGuestKeyState.left=true;
    else if(actionHasKey('right',c)) onlineGuestKeyState.right=true;
    else if(actionHasKey('down',c)) onlineGuestKeyState.down=true;
    else if(actionHasKey('hardDrop',c)&&!e.repeat){ hardDrop(1); sendOnlineAction('hardDrop'); }
    else if(actionHasKey('rotateLeft',c)&&!e.repeat){ rotateLeft(1); sendOnlineAction('rotateLeft'); }
    else if(actionHasKey('rotateRight',c)&&!e.repeat){ rotateRight(1); sendOnlineAction('rotateRight'); }
    else if(actionHasKey('hold',c)&&!e.repeat){ horudoSuru(1); sendOnlineAction('hold'); }
  },{passive:false});
  window.addEventListener('keyup',e=>{
    if(actionHasKey('left',e.code)) onlineGuestKeyState.left=false;
    if(actionHasKey('right',e.code)) onlineGuestKeyState.right=false;
    if(actionHasKey('down',e.code)) onlineGuestKeyState.down=false;
  });
  window.addEventListener('blur',()=>{onlineGuestKeyState.left=false;onlineGuestKeyState.right=false;onlineGuestKeyState.down=false;});
})();
