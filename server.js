const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite DB 연결
const db = new Database('database.sqlite');
db.prepare(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Socket.io 통신 처리
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨:', socket.id);

  // 데이터 조회 요청
  socket.on('getData', (key, callback) => {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    callback(row ? JSON.parse(row.value) : null);
  });

  // 데이터 저장 요청 및 실시간 전파
  socket.on('setData', ({ key, value }) => {
    const stringValue = JSON.stringify(value);
    
    db.prepare(`
      INSERT INTO kv_store (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `).run(key, stringValue, stringValue);

    // 접속한 모든 사용자에게 변경 사항 알림
    io.emit('dataUpdated', { key, value });
  });
});

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});