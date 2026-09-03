const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    // 相手側の送信キューが異常に膨らんだら古い状態を積み続けない。
    if (ws.bufferedAmount > 1024 * 1024) return false;

    ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    return false;
  }
}

function makePassword() {
  let password;
  do {
    password = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(password));
  return password;
}

function removeFromRoom(ws, notify = true) {
  const password = ws.room;
  if (!password) return;

  const room = rooms.get(password);
  ws.room = null;

  if (!room) return;

  if (room.host === ws) {
    if (room.guest && notify) send(room.guest, { type: 'peerLeft' });
    if (room.guest) room.guest.room = null;
    rooms.delete(password);
  } else if (room.guest === ws) {
    room.guest = null;
    if (notify && room.host) send(room.host, { type: 'peerLeft' });
  }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);

  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.resolve(ROOT, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = 0;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: '不正なメッセージです。' });
    }

    if (msg.type === 'create') {
      removeFromRoom(ws, false);
      const password = /^\d{6}$/.test(String(msg.password || '')) && !rooms.has(String(msg.password))
        ? String(msg.password)
        : makePassword();

      rooms.set(password, { host: ws, guest: null });
      ws.room = password;
      ws.role = 1;

      send(ws, { type: 'roomJoined', role: 1, room: password, password });
      console.log(`ルーム作成: ${password}`);
      return;
    }

    if (msg.type === 'join') {
      const password = String(msg.password || '').trim();
      const room = rooms.get(password);

      if (!/^\d{6}$/.test(password) || !room) {
        return send(ws, { type: 'error', message: 'そのパスワードの部屋はありません。' });
      }
      if (room.guest) {
        return send(ws, { type: 'error', message: 'この部屋は満員です。' });
      }

      removeFromRoom(ws, false);
      room.guest = ws;
      ws.room = password;
      ws.role = 2;

      send(ws, { type: 'roomJoined', role: 2, room: password, password });
      send(room.host, { type: 'peerJoined' });
      send(room.guest, { type: 'start' });
      console.log(`ルーム参加: ${password}`);
      return;
    }

    if (!ws.room) return send(ws, { type: 'error', message: '先に部屋へ参加してください。' });
    const room = rooms.get(ws.room);
    if (!room) return;

    if (msg.type === 'state' && ws.role === 1) {
      if (!msg.state || typeof msg.state !== 'object') return;
      send(room.guest, { type: 'state', state: msg.state });
      return;
    }

    if (msg.type === 'input' && ws.role === 2) {
      if (typeof msg.action !== 'string') return;
      // 許可した操作だけをホストへ転送する。
      const allowed = new Set([
        'rotateRight', 'rotateLeft', 'hardDrop',
        'hold', 'pause', 'nextRound'
      ]);
      if (!allowed.has(msg.action)) return;
      send(room.host, { type: 'remoteAction', action: msg.action });
      return;
    }

    if (msg.type === 'inputState' && ws.role === 2) {
      const s = (msg.state && typeof msg.state === 'object') ? msg.state : {};
      send(room.host, {
        type: 'remoteInputState',
        state: {
          left: !!s.left,
          right: !!s.right,
          down: !!s.down
        }
      });
      return;
    }
  });

  ws.on('close', () => removeFromRoom(ws, true));
  ws.on('error', () => removeFromRoom(ws, true));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tetris オンライン用サーバーが http://localhost:${PORT} で起動しました。`);
});
