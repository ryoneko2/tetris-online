const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

// ===============================
// HTTPサーバー
// ===============================
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];

    // トップページ
    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }

    // パストラバーサル対策
    const filePath = path.normalize(path.join(ROOT, urlPath));

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();

        const contentTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.txt': 'text/plain; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };

        res.writeHead(200, {
            'Content-Type': contentTypes[ext] || 'application/octet-stream'
        });

        res.end(data);
    });
});

// ===============================
// WebSocketサーバー
// ===============================
const wss = new WebSocket.Server({ server });

// パスワードごとのルーム
const rooms = new Map();

// ===============================
// 6桁パスワード生成
// ===============================
function makePassword() {
    let password;

    do {
        password = String(Math.floor(100000 + Math.random() * 900000));
    } while (rooms.has(password));

    return password;
}

// ===============================
// WebSocket接続
// ===============================
wss.on('connection', (ws) => {
    let currentRoom = null;
    let myRole = 0; // 1 = Host(P1), 2 = Guest(P2)

    console.log('WebSocket接続');

    ws.on('message', (message) => {
        let data;

        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.log('JSON解析エラー');
            return;
        }

        // =========================
        // ルーム作成
        // =========================
        if (data.type === 'create') {
            let password = String(data.password || '');

            // パスワードが不正なら自動生成
            if (!/^\d{6}$/.test(password) || rooms.has(password)) {
                password = makePassword();
            }

            rooms.set(password, {
                host: ws,
                guest: null
            });

            currentRoom = password;
            myRole = 1;

            ws.send(JSON.stringify({
                type: 'roomJoined',
                role: 1,
                room: password,
                password: password
            }));

            console.log(`ルーム作成: ${password} (Host)`);
        }

        // =========================
        // ルーム参加
        // =========================
        else if (data.type === 'join') {
            const password = String(data.password || data.room || '');

            const room = rooms.get(password);

            if (!room) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'そのパスワードのルームがありません'
                }));
                return;
            }

            if (room.guest) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'ルームは満員です'
                }));
                return;
            }

            room.guest = ws;

            currentRoom = password;
            myRole = 2;

            ws.send(JSON.stringify({
                type: 'roomJoined',
                role: 2,
                room: password,
                password: password
            }));

            console.log(`ルーム参加: ${password} (Guest)`);

            // 両者に対戦開始を通知
            room.host.send(JSON.stringify({
                type: 'peerJoined'
            }));

            room.guest.send(JSON.stringify({
                type: 'start'
            }));
        }

        // =========================
        // ゲスト → ホスト：操作
        // =========================
        else if (data.type === 'input') {
            const room = rooms.get(currentRoom);

            if (room && room.host) {
                room.host.send(JSON.stringify({
                    type: 'remoteAction',
                    action: data.action
                }));
            }
        }

        // =========================
        // ゲスト → ホスト：入力状態
        // =========================
        else if (data.type === 'inputState') {
            const room = rooms.get(currentRoom);

            if (room && room.host) {
                room.host.send(JSON.stringify({
                    type: 'remoteInputState',
                    state: data.state
                }));
            }
        }

        // =========================
        // ホスト → ゲスト：ゲーム状態
        // =========================
        else if (data.type === 'state') {
            const room = rooms.get(currentRoom);

            if (room && room.guest) {
                room.guest.send(JSON.stringify({
                    type: 'state',
                    state: data.state
                }));
            }
        }
    });

    // =========================
    // 切断
    // =========================
    ws.on('close', () => {
        if (!currentRoom) return;

        const room = rooms.get(currentRoom);

        if (!room) return;

        console.log(
            `切断: ${currentRoom} (Role: ${myRole})`
        );

        if (myRole === 1) {
            if (room.guest) {
                room.guest.send(JSON.stringify({
                    type: 'peerLeft'
                }));
            }

            rooms.delete(currentRoom);
        }

        else if (myRole === 2) {
            if (room.host) {
                room.host.send(JSON.stringify({
                    type: 'peerLeft'
                }));
            }

            room.guest = null;
        }
    });
});

// ===============================
// サーバー起動
// ===============================
server.listen(PORT, '0.0.0.0', () => {
    console.log(
        `Tetris オンライン用サーバーが http://localhost:${PORT} で起動しました。`
    );
});

