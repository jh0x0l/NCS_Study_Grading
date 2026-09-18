const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3'); // (혹시 사용 중이신 DB 모듈)

const app = express();
const server = http.createServer(app);
const io = new Server(server); // ★ 이 부분이 반드시 있어야 io를 사용할 수 있습니다!

// 정적 파일 서빙 및 데이터베이스 설정 등...
app.use(express.static('public'));

const db = new Database('database.sqlite');
db.prepare(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

const activeUsers = new Map();

// 그 다음에 기존에 작성하셨던 io.on('connection', ...) 코드가 와야 합니다.
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨:', socket.id);

  socket.on('joinUser', (name) => {
    if (name) {
      activeUsers.set(socket.id, name);
      io.emit('updateActiveUsers', Array.from(new Set(activeUsers.values())));
    }
  });

  socket.on('getData', (key, callback) => {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    callback(row ? JSON.parse(row.value) : null);
  });

  socket.on('setData', ({ key, value }) => {
    const stringValue = JSON.stringify(value);
    db.prepare(`
      INSERT INTO kv_store (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `).run(key, stringValue, stringValue);

    io.emit('dataUpdated', { key, value });
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('updateActiveUsers', Array.from(new Set(activeUsers.values())));
    console.log('클라이언트 연결 해제:', socket.id);
  });
});

// ★ 주의: app.listen이 아니라 server.listen으로 띄워야 소켓이 정상 작동합니다!
server.listen(3000, () => {
  console.log('Server is running at http://localhost:3000');
});