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
// --- ▲▲▲ ---

var gameMode = 'TITLE'; // 'TITLE', 'SOLO', 'VS_LOCAL', 'VS_CPU', 'ONLINE'
var gameCanvas = null;

// --- オンライン対戦 (WebSocket) ---
// ローカルテスト: ws://localhost:8080
// インターネット公開時は、デプロイしたWebSocketサーバーのURLに変更してください。
const ONLINE_SERVER_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
var onlineSocket = null;
var onlineRole = 0; // 1 = ホスト(P1), 2 = ゲスト(P2)
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
var onlineGuestInitialized = false;
var onlineInitialStateSent = false;
var titleButtons = [];
var selectedButtonIndex = 0; 

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
var dasDelay = 120; // 左右のタメ時間 (ミリ秒)
var arrDelay = 30;  // 左右のリピート速度 (ミリ秒)
var dasStartTimeLeft = 0;
var dasStartTimeRight = 0;
var arrTimeLeft = 0;
var arrTimeRight = 0;
var lastMoveDownTime = 0;
var moveDownDelay = 25; // 下入力の遅延 (ミリ秒)

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

function setup() {
  // ▼▼▼ 修正点 2 (テトリス25): キャンバスサイズを変更 (36 * 22 = 792) ▼▼▼
  const canvas = createCanvas(TOTAL_WIDTH_RETSU * BLOKU_SAIZU, 810);
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
  titleButtons.push({ y: 350, text: '1P SOLO', mode: 'SOLO' });
  titleButtons.push({ y: 420, text: '1P vs CPU', mode: 'VS_CPU' });
  titleButtons.push({ y: 490, text: '1P vs 2P (Local)', mode: 'VS_LOCAL' });
  titleButtons.push({ y: 560, text: 'ONLINE BATTLE', mode: 'ONLINE' });

  restartGame();
}

// ▼▼▼ 修正点 3 (テトリス25): draw() の translate() を修正 ▼▼▼
function draw() {
  // 全体の背景色
  background(30, 30, 50); 

  if (gameMode === 'TITLE') {
    drawTitleScreen();
    handlePlayerInput(); 
    return; 
  }

  // 1. UIは常に描画
  drawUI();

  // 2. P1ボードを描画
  push();
  translate(P1_BOARD_X_OFFSET, 0); // P1ボード (x=88)
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
  if (gameMode === 'ONLINE' && onlineRole === 2) {
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
        const gp = navigator.getGamepads()[0];
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
          if (gameMode === 'ONLINE' ? !onlineGuestKeyState.down : !keyIsDown(83)) {
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
}

// ▼▼▼ 修正点 4 (テトリス25): drawUI() を新レイアウトに合わせて変更 ▼▼▼
function drawUI() {
  let uiWidth = UI_RETSU * BLOKU_SAIZU;

  // --- プレイヤー側 (左) HOLD UI ---
  drawHoldUI(
    P1_UI_HOLD_X_OFFSET, // 0
    uiWidth,
    "PLAYER 1", 
    horudoBurokku, 
    playerWins,
    playerAttackQueue,
    1 // Player Index
  );
 
  // --- プレイヤー側 (右) NEXT/SCORE UI ---
  drawNextAndStatsUI(
    P1_UI_NEXT_X_OFFSET, // 308
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
  if (gameMode !== 'SOLO') {
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
  line(P1_BOARD_X_OFFSET, 0, P1_BOARD_X_OFFSET, height); // 88
  line(P1_UI_NEXT_X_OFFSET, 0, P1_UI_NEXT_X_OFFSET, height); // 308
  
  if (gameMode !== 'SOLO') {
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
  if (gameMode !== 'SOLO') { 
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
    let btnHeight = 50;
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
        text(onlineStatus, width / 2, 650);
        if (onlineRoom) {
            fill(255);
            textSize(24);
            text('ROOM: ' + onlineRoom, width / 2, 685);
        }
    }
}
// ▲▲▲

// ▼▼▼ 修正点 8 (テトリス25): ポーズ画面の描画を修正 ▼▼▼
function drawPauseScreen() {
    let boardWidth = RETSU * BLOKU_SAIZU;
    let boardHeight = GYO * BLOKU_SAIZU;
    
    // P1ボードにカバー
    push();
    translate(P1_BOARD_X_OFFSET, 0); 
    fill(0, 0, 0, 150); 
    rect(0, 0, boardWidth, boardHeight); 
    pop();

    // P2/CPUボードにもカバー (SOLOモード以外)
    if (gameMode !== 'SOLO') {
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
        if (gameMode === 'VS_CPU') {
           cpuNextMove = calculateBestMove(gameBoardP2, imaNoBurokkuP2);
        }
        return;
    }

    let boardWidth = RETSU * BLOKU_SAIZU;
    let boardHeight = GYO * BLOKU_SAIZU;
    
    // P1ボードに表示
    push();
    translate(P1_BOARD_X_OFFSET, 0);
    fill(0, 0, 0, 150);
    rect(0, 0, boardWidth, boardHeight); 
    fill(255, 255, 0);
    stroke(0);
    textSize(100);
    textAlign(CENTER, CENTER);
    text(seconds, boardWidth / 2, boardHeight / 2);
    pop();

    // P2/CPUボードに表示 (SOLOモード以外)
    if (gameMode !== 'SOLO') {
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
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; 
   
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
             if (selectedMode !== 'ONLINE') {
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
        let isLeftPressed = (axisX < -0.5 || dpadLeft || keyIsDown(65)); // A
        let isRightPressed = (axisX > 0.5 || dpadRight || keyIsDown(68)); // D

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
        if (axisY > 0.5 || dpadDown || keyIsDown(83)) { // S
            if (now - lastMoveDownTime > moveDownDelay) {
                moveDown(1); 
                lastMoveDownTime = now;
            }
        } else {
            lastMoveDownTime = 0;
        }
       
        // --- ハードドロップ (W OR コントローラー上) ---
        const isUpPressed = (axisY < -0.5 || dpadUp || keyIsDown(87)); // W 
        if (isUpPressed && !wasUpGamepadPressed) {
            hardDrop(1);
        }
        wasUpGamepadPressed = isUpPressed;
        // --- 回転 (コントローラー) ---
        if ((isBPressed && !wasBGamepadPressed) || (isYPressed && !wasYGamepadPressed)) { 
            rotateRight(1); 
        }
        if ((isAPressed && !wasAGamepadPressed) || (isXPressed && !wasXGamepadPressed)) { 
            rotateLeft(1); 
        }
       
        // --- ホールド (コントローラー) ---
        if ((isLPressed && !wasLGamepadPressed) || (isRPressed && !wasRGamepadPressed)) {
            horudoSuru(1);
        }
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
        if (keyIsDown(81) || keyIsDown(69)) { // Q or E
            if (isMatchOver) restartGame(); 
            else if (isRoundOver) nextRound();
        }
        wasHardDropPressedP2 = keyIsDown(87); 
        return;
    }
    
    // ポーズ中、カウントダウン中は操作不能
    if (isPaused || countdownTime > 0) {
        dasStartTimeLeftP2 = 0;
        dasStartTimeRightP2 = 0;
        lastMoveDownTimeP2 = 0;
        wasHardDropPressedP2 = keyIsDown(87); 
        return; 
    }
    
    let now = millis();
    
    // --- 左右移動 (A, D) ---
    let isLeftPressed = keyIsDown(65); // A
    let isRightPressed = keyIsDown(68); // D

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
       
    // --- 下移動 (S) ---
    if (keyIsDown(83)) { // S
        if (now - lastMoveDownTimeP2 > moveDownDelay) {
            moveDown(2); 
            lastMoveDownTimeP2 = now;
        }
    } else {
        lastMoveDownTimeP2 = 0;
    }

    // --- ハードドロップ (W) ---
    const isWPressed = keyIsDown(87); // W
    if (isWPressed && !wasHardDropPressedP2) {
        hardDrop(2);
    }
    wasHardDropPressedP2 = isWPressed;
}



// モード選択のクリック/タッチ処理
function handleTitlePointer(px, py) {
  if (gameMode !== 'TITLE') return false;

  const btnWidth = 250;
  const btnHeight = 50;
  const btnX = (width - btnWidth) / 2;

  for (let i = 0; i < titleButtons.length; i++) {
    const btn = titleButtons[i];
    if (px >= btnX && px <= btnX + btnWidth && py >= btn.y && py <= btn.y + btnHeight) {
      selectedButtonIndex = i;
      if (btn.mode === 'ONLINE') {
        startOnlineMenu();
      } else {
        gameMode = btn.mode;
        nextRound();
      }
      return true;
    }
  }
  return false;
}

function mousePressed(event) {
  if (gameMode !== 'TITLE') return;
  const cnv = (gameCanvas && gameCanvas.elt) ? gameCanvas.elt : document.querySelector('canvas');
  let px = Number(mouseX);
  let py = Number(mouseY);
  if (event && cnv && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    const r = cnv.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      px = (event.clientX - r.left) * (width / r.width);
      py = (event.clientY - r.top) * (height / r.height);
    }
  }
  if (handleTitlePointer(px, py)) return false;
}

// スマホでは mousePressed だけに依存せず、タッチを直接処理する。
function touchStarted(event) {
  if (gameMode === 'TITLE') {
    // iPhone/Safariではp5のmouseX/mouseYがCSS表示倍率とずれることがあるため、
    // 実際のcanvasの表示矩形から論理座標(792x810)へ変換する。
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
  if (gameMode === 'ONLINE' && onlineRole === 2) {
    if (keyCode === LEFT_ARROW) onlineGuestKeyState.left = false;
    else if (keyCode === RIGHT_ARROW) onlineGuestKeyState.right = false;
    else if (keyCode === DOWN_ARROW) onlineGuestKeyState.down = false;
  }
}

// プレイヤー/CPUに応じてバッグを管理
function getNextBlockType(playerIndex) { // 1 or 2 (CPU)
  let bag = (playerIndex === 1) ? p1BurokkuBaggu : p2BurokkuBaggu;
  let nextBag = (playerIndex === 1) ? p1TsugiBurokkuBaggu : p2TsugiBurokkuBaggu;

  if (bag.length === 0) {
    bag = nextBag;
    nextBag = fuyasuBaggu();
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
function spawnNewBlock(playerIndex) { // 1: P1, 2: P2/CPU
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
    horudoShiyouzumi = false;
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
    cpuHoldUsed = false;
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

// バッグを補充してシャッフルする
function fuyasuBaggu() {
  let newBag = [];
  for (let i = 0; i < burokkuShurui.length; i++) {
    newBag.push(i);
  }
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
 
  // --- T-Spin 判定 ---
  let isTSpin = false;
  if (burokku.type === 6 && action === 'ROTATE') {
    let cornerChecks = 0;
    const corners = [
        {x: burokku.x + 0, y: burokku.y + 0},
        {x: burokku.x + 2, y: burokku.y + 0},
        {x: burokku.x + 0, y: burokku.y + 2},
        {x: burokku.x + 2, y: burokku.y + 2}
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
  // --- T-Spin 判定 終わり ---


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
  let isSpecialClear = isTSpin; 

  let currentScore = (playerIndex === 1) ? sukoa : cpuScore;
  let currentAttackPower = (playerIndex === 1) ? attackPower : cpuAttackPower;
  let currentBackToBack = (playerIndex === 1) ? backToBack : cpuBackToBack;
  let currentComboCount = (playerIndex === 1) ? comboCount : cpuComboCount;
 
  if (linesCleared > 0) {
    currentComboCount++; 
   
    // 1. スコア計算と基本AP
    if (isTSpin) {
      if (linesCleared === 1) { currentAttack = 2; currentScore += 800; }
      else if (linesCleared === 2) { currentAttack = 4; currentScore += 1200; }
      else if (linesCleared === 3) { currentAttack = 6; currentScore += 1600; }
      else if (linesCleared === 0) { currentAttack = 0; currentScore += 100; }
    } else {
      currentAttack = ATTACK_TABLE[linesCleared] || 0;
      if (linesCleared === 1) { currentScore += 100; }
      else if (linesCleared === 2) { currentScore += 300; }
      else if (linesCleared === 3) { currentScore += 500; }
      else if (linesCleared === 4) { isSpecialClear = true; currentScore += 800; }
    }
   
    // 2. コンボボーナス
    if (currentComboCount > 1) {
        currentAttack += floor((currentComboCount - 1) / 2);
    }
   
    // 3. B2Bボーナス
    if (isSpecialClear) {
        if (currentBackToBack > 0) {
            currentAttack += 1; 
            currentBackToBack++;
        } else {
            currentBackToBack = 1;
        }
    } else if (linesCleared > 0 && !isSpecialClear) {
        currentBackToBack = 0; 
    }

  } else {
    // ★★★ ぷよテト式ルール: RENが途切れたら攻撃 ★★★
    if (currentComboCount > 0) { 
        sendAttack(playerIndex); 
    }
    currentComboCount = 0;
    // ▲▲▲
  }
 
  // --- パーフェクトクリア (PC) ボーナス ---
  if (linesCleared > 0 && isPerfectClear(board)) {
      currentAttack += 10;
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
    let opponentAttackQueue = null;

    if (playerIndex === 1) {
        attackToSend = attackPower;
        attackPower = 0;
        opponentAttackQueue = player2AttackQueue;
    } else { // P2 または CPU
        attackToSend = cpuAttackPower;
        cpuAttackPower = 0;
        opponentAttackQueue = playerAttackQueue;
    }

    if (attackToSend > 0) {
        opponentAttackQueue.push(attackToSend);
    }
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

function startOnlineMenu() {
  if (onlineSocket && onlineSocket.readyState === WebSocket.OPEN) {
    onlineStatus = 'すでにオンライン接続中です';
    return;
  }

  const mode = prompt(
    'オンライン対戦\n\n' +
    '1：部屋を作る（ホスト）\n' +
    '2：相手の部屋に入る（ゲスト）\n\n' +
    '数字を入力してください。'
  );

  if (mode === null) return;

  if (mode.trim() === '1') {
    onlineRole = 0;
    onlineRoom = makeOnlinePassword();
    onlineStatus = '部屋を作成中...';
    connectOnlineSocket('create');
    return;
  }

  if (mode.trim() === '2') {
    let password = prompt('ホストから教えてもらった6桁のパスワードを入力してください。');
    if (password === null) return;
    password = password.trim();

    if (!/^\d{6}$/.test(password)) {
      alert('パスワードは6桁の数字です。');
      return;
    }

    onlineRole = 0;
    onlineRoom = password;
    onlineStatus = '部屋に参加中...';
    connectOnlineSocket('join');
    return;
  }

  alert('1 または 2 を入力してください。');
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
      password: onlineRoom
    }));
  };

  onlineSocket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }

    if (msg.type === 'roomJoined') {
      onlineRole = msg.role;
      onlineRoom = String(msg.password || msg.room || onlineRoom);

      if (onlineRole === 1) {
        onlineStatus = '相手を待っています...';
        alert('部屋を作りました！\n\n対戦パスワード：' + onlineRoom + '\n\nこの6桁の数字を相手に伝えてください。');
      } else {
        onlineStatus = 'ホストを待っています...';
      }
      return;
    }

    if (msg.type === 'peerJoined') {
      onlineOpponentConnected = true;
      if (onlineRole === 1) {
        gameMode = 'ONLINE';
        restartGame();
        gameMode = 'ONLINE';
        nextRound();
        onlineStatus = '対戦開始！';
        onlineInitialStateSent = false;
        sendOnlineState(true);
      }
      return;
    }

    if (msg.type === 'start') {
      onlineOpponentConnected = true;
      if (onlineRole === 2) {
        gameMode = 'ONLINE';
        onlineGuestInitialized = false;
        onlineLastAppliedSeq = 0;
        onlineStatus = '対戦開始！';
      }
      return;
    }

    if (msg.type === 'state') {
      if (onlineRole === 2 && msg.state && typeof msg.state === 'object') {
        const seq = Number(msg.state.seq || 0);
        if (!seq || seq > onlineLastAppliedSeq) {
          // ゲスト側は受信した最新状態を即時反映。
          // ここで待ち時間を入れると、ゲストの操作が「ホストに合わせて遅れて動く」原因になる。
          onlinePendingState = null;
          if (onlineStateApplyTimer) { clearTimeout(onlineStateApplyTimer); onlineStateApplyTimer = null; }
          applyOnlineState(msg.state);
        }
      }
      return;
    }

    if (msg.type === 'remoteAction' && onlineRole === 1) {
      handleOnlineRemoteAction(msg.action);
      return;
    }

    if (msg.type === 'remoteInputState' && onlineRole === 1) {
      onlineGuestKeyState = {
        left: !!(msg.state && msg.state.left),
        right: !!(msg.state && msg.state.right),
        down: !!(msg.state && msg.state.down)
      };
      return;
    }

    if (msg.type === 'peerLeft') {
      onlineOpponentConnected = false;
      onlineStatus = '相手が切断しました';
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

function sendOnlineAction(action) {
  if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN || onlineRole !== 2) return;
  if (onlineSocket.bufferedAmount > 64 * 1024) return;
  try { onlineSocket.send(JSON.stringify({ type:'input', action:action })); } catch (e) {}
}

function handleOnlineGuestInput() {
  if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN || onlineRole !== 2) return;
  const now = millis();
  if (now - onlineLastInputSend < 10) return;
  onlineLastInputSend = now;

  if (onlineSocket.bufferedAmount > 64 * 1024) return;
  try {
    onlineSocket.send(JSON.stringify({
      type:'inputState',
      state: {
        left:!!onlineGuestKeyState.left || keyIsDown(65),
        right:!!onlineGuestKeyState.right || keyIsDown(68),
        down:!!onlineGuestKeyState.down || keyIsDown(83)
      }
    }));
  } catch (e) {}
}

function handleOnlineHostP2Input() {
  const now = millis();
  const s = onlineGuestKeyState;

  if (s.left) {
    if (dasStartTimeLeftP2 === 0) {
      moveLeft(2); dasStartTimeLeftP2 = now; arrTimeLeftP2 = now;
    } else if (now - dasStartTimeLeftP2 > dasDelay && now - arrTimeLeftP2 > arrDelay) {
      moveLeft(2); arrTimeLeftP2 = now;
    }
  } else dasStartTimeLeftP2 = 0;

  if (s.right) {
    if (dasStartTimeRightP2 === 0) {
      moveRight(2); dasStartTimeRightP2 = now; arrTimeRightP2 = now;
    } else if (now - dasStartTimeRightP2 > dasDelay && now - arrTimeRightP2 > arrDelay) {
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
  const keepGuestP2 = (onlineRole === 2 && onlineGuestInitialized);
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
  isStarted = !!s.isStarted;
  isPaused = !!s.isPaused;
  isRoundOver = !!s.isRoundOver;
  isMatchOver = !!s.isMatchOver;
  roundWinner = typeof s.roundWinner === 'string' ? s.roundWinner : '';
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
function keyPressed() {
  // オンラインのゲストは入力をローカルP2へ即時反映し、同じ操作をホストへ送る。
  if (gameMode === 'ONLINE' && onlineRole === 2) {
    if (isRoundOver || isMatchOver) {
      if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || keyCode === UP_ARROW || keyCode === DOWN_ARROW || key === 'w' || key === 'W' || key === 'a' || key === 'A') sendOnlineAction('nextRound');
      return false;
    }
    if (keyCode === LEFT_ARROW) { onlineGuestKeyState.left = true; moveLeft(2); }
    else if (keyCode === RIGHT_ARROW) { onlineGuestKeyState.right = true; moveRight(2); }
    else if (keyCode === DOWN_ARROW) { onlineGuestKeyState.down = true; moveDown(2); }
    else if (keyCode === UP_ARROW) { rotateRight(2); sendOnlineAction('rotateRight'); }
    else if (key === 'w' || key === 'W') { hardDrop(2); sendOnlineAction('hardDrop'); }
    else if (key === 'c' || key === 'C') { horudoSuru(2); sendOnlineAction('hold'); }
    else if (key === 'p' || key === 'P') sendOnlineAction('pause');
    return false;
  }

  if (isMatchOver) {
    if (key === 'a' || key === 'A' || key === 'x' || key === 'X' || key === 'z' || key === 'Z' || key === 'c' || key === 'C') { 
      restartGame(); 
    }
    if (gameMode === 'VS_LOCAL' && (key === 'q' || key === 'Q' || key === 'e' || key === 'E')) {
      restartGame();
    }
  }
  else if (isRoundOver) {
    if (key === 'a' || key === 'A' || key === 'x' || key === 'X' || key === 'z' || key === 'Z' || key === 'c' || key === 'C') { 
      nextRound(); 
    }
    if (gameMode === 'VS_LOCAL' && (key === 'q' || key === 'Q' || key === 'e' || key === 'E')) {
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

  // --- P1 ゲーム中の操作 ---
  // A = 左 / D = 右 / S = 下 / W = ハードドロップ
  // ← = 右回転 / → = 左回転 / ↑ = 左回転 / ↓ = 右回転
  // C = ホールド
  // 矢印キーの回転は keyPressed() で直接処理するため、
  // 押しっぱなしで毎フレーム回転しない。
  if (keyCode === LEFT_ARROW) {
    rotateRight(1);
  }
  else if (keyCode === RIGHT_ARROW) {
    rotateLeft(1);
  }
  else if (keyCode === UP_ARROW) {
    rotateLeft(1);
  }
  else if (keyCode === DOWN_ARROW) {
    rotateRight(1);
  }
  else if (key === 'c' || key === 'C') { 
    horudoSuru(1); 
  }
  
  // --- P2 ゲーム中の操作 (VS_LOCAL のみ) ---
  if (gameMode === 'VS_LOCAL') {
      if (key === 'w' || key === 'W') { // P2 ハードドロップ
          // hardDrop(2); // (handlePlayer2Inputに移動)
      }
      else if (key === 'e' || key === 'E') { // P2 右回転
          rotateRight(2);
      }
      else if (key === 'q' || key === 'Q') { // P2 左回転
          rotateLeft(2);
      }
      else if (key === 'f' || key === 'F') { // P2 ホールド
          horudoSuru(2);
      }
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
      spawnNewBlock(1); 
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
      spawnNewBlock(2); 
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
  
  // バッグの完全リセット
  p1BurokkuBaggu = fuyasuBaggu(); 
  p1TsugiBurokkuBaggu = fuyasuBaggu(); 
  p2BurokkuBaggu = fuyasuBaggu(); 
  p2TsugiBurokkuBaggu = fuyasuBaggu();
  
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
  
  if (gameMode === 'SOLO') {
      isMatchOver = true; 
      roundWinner = 'SOLO_END';
      return;
  }
  
  if (loser === 'PLAYER1') {
      p2Wins++; // P2またはCPUの勝利
      roundWinner = (gameMode === 'VS_CPU') ? 'CPU' : 'PLAYER2';
  } else { // P2 または CPU が負け
      playerWins++;
      roundWinner = 'PLAYER1';
  }
  
  // マッチ終了判定
  if (playerWins >= MATCH_WIN_COUNT || p2Wins >= MATCH_WIN_COUNT) {
      isMatchOver = true;
  }

  if (gameMode === 'ONLINE' && onlineRole === 1) {
    sendOnlineState(true);
  }
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
// スマホ用オンライン操作パネル
// キーボードイベントを偽装せず、オンライン入力変数/アクションを直接送る。
// ============================================================
(function setupOnlineMobileControls() {
  function makeButton(text, className, onDown, onUp) {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = 'online-mobile-btn ' + className;
    b.style.cssText = 'touch-action:none;user-select:none;-webkit-user-select:none;font-size:20px;font-weight:bold;min-width:58px;min-height:48px;border-radius:10px;border:1px solid #777;background:rgba(30,30,40,.9);color:white;';
    const down = e => { e.preventDefault(); onDown(); };
    const up = e => { e.preventDefault(); if (onUp) onUp(); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }
  function ensurePanel() {
    if (document.getElementById('online-mobile-controls')) return;
    const panel = document.createElement('div');
    panel.id = 'online-mobile-controls';
    panel.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:9999;display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;width:min(96vw,430px);padding:6px;box-sizing:border-box;pointer-events:auto;';
    const setKey = (k,v) => { onlineGuestKeyState[k]=v; };
    panel.appendChild(makeButton('←','left',()=>setKey('left',true),()=>setKey('left',false)));
    panel.appendChild(makeButton('↓','down',()=>setKey('down',true),()=>setKey('down',false)));
    panel.appendChild(makeButton('→','right',()=>setKey('right',true),()=>setKey('right',false)));
    panel.appendChild(makeButton('↻','rotate',()=>{ rotateRight(2); sendOnlineAction('rotateRight'); }));
    panel.appendChild(makeButton('DROP','drop',()=>{ hardDrop(2); sendOnlineAction('hardDrop'); }));
    panel.appendChild(makeButton('HOLD','hold',()=>{ horudoSuru(2); sendOnlineAction('hold'); }));
    // タイトル画面ではパネルを非表示にして、スマホのモード選択を邪魔しない。
    panel.style.display = 'none';
    document.body.appendChild(panel);

    // オンラインのゲストになった時だけ操作パネルを表示する。
    const updateVisibility = () => {
      const isOnlineGuest = (typeof gameMode !== 'undefined' && gameMode === 'ONLINE' && typeof onlineRole !== 'undefined' && onlineRole === 2);
      panel.style.display = isOnlineGuest ? 'flex' : 'none';
      // 非表示中はタッチを完全に下のキャンバスへ通す。
      panel.style.pointerEvents = isOnlineGuest ? 'auto' : 'none';
    };
    updateVisibility();
    setInterval(updateVisibility, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensurePanel);
  else ensurePanel();
})();
