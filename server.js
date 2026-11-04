'use strict';
/*
 * Chain Reaction: game server
 * Serves the game page and relays live "rooms" over WebSockets so phones
 * can follow the host's big screen. No database: the host's browser keeps
 * the game state, and this server only passes messages between devices.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
let QR = null;
try { QR = fs.readFileSync(require.resolve('qrcode-generator')); }
catch (e) { console.warn('qrcode-generator not found: join QR codes are off'); }

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (pathname === '/qrcode.js') {
    if (!QR) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    return res.end(req.method === 'HEAD' ? undefined : QR);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : INDEX);
});

/* ---------- live rooms ---------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const rooms = new Map();                       // room name -> Map(clientId -> { ws, presence })
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const sendTo = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function broadcast(room, obj) {
  const r = rooms.get(room); if (!r) return;
  const msg = JSON.stringify(obj);
  for (const m of r.values()) if (m.ws.readyState === 1) m.ws.send(msg);
}
function leaveRoom(ws, room) {
  const r = rooms.get(room);
  if (!r || !r.has(ws.id)) return;
  r.delete(ws.id); ws.rooms.delete(room);
  if (r.size === 0) rooms.delete(room);
  else broadcast(room, { t: 'left', room, id: ws.id });
}

wss.on('connection', ws => {
  ws.id = crypto.randomBytes(6).toString('hex');
  ws.rooms = new Set(); ws.alive = true; ws.tokens = 60; ws.last = Date.now();
  ws.on('pong', () => { ws.alive = true; });
  sendTo(ws, { t: 'hello', id: ws.id });

  ws.on('message', raw => {
    // simple rate limit: about 30 messages a second, bursts up to 60
    const now = Date.now();
    ws.tokens = Math.min(60, ws.tokens + (now - ws.last) * 0.03); ws.last = now;
    if (ws.tokens < 1) return; ws.tokens -= 1;

    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object' || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;

    if (m.t === 'join') {
      if (ws.rooms.has(m.room) || ws.rooms.size >= 4) return;
      let r = rooms.get(m.room);
      if (!r) { r = new Map(); rooms.set(m.room, r); }
      if (r.size >= 64) return sendTo(ws, { t: 'full', room: m.room });
      r.set(ws.id, { ws, presence: {} }); ws.rooms.add(m.room);
      sendTo(ws, { t: 'snapshot', room: m.room, peers: [...r].map(([id, v]) => ({ id, presence: v.presence })) });
      broadcast(m.room, { t: 'peer', room: m.room, id: ws.id, presence: {} });
    } else if (m.t === 'presence') {
      const me = rooms.get(m.room)?.get(ws.id);
      if (!me || !m.patch || typeof m.patch !== 'object' || Array.isArray(m.patch)) return;
      const next = { ...me.presence };
      for (const [k, v] of Object.entries(m.patch)) {
        if (BAD_KEYS.has(k)) continue;
        if (v === null) delete next[k]; else next[k] = v;
      }
      if (JSON.stringify(next).length > 6000) return;
      me.presence = next;
      broadcast(m.room, { t: 'peer', room: m.room, id: ws.id, presence: next });
    } else if (m.t === 'leave') {
      leaveRoom(ws, m.room);
    }
  });

  ws.on('close', () => { for (const room of [...ws.rooms]) leaveRoom(ws, room); });
});

// drop dead connections and keep proxies from closing idle sockets
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => console.log(`Chain Reaction is live on port ${PORT}`));
