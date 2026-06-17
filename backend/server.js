// ============================================================
// backend/server.js
// فقط یک پروکسی برای Binance — رفع بلاک جغرافیایی + بلاک IP اشتراکی
// ============================================================

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BINANCE_REST = 'https://data-api.binance.vision';
const BINANCE_WS = 'wss://data-stream.binance.vision';

// کندل‌های تاریخی
app.get('/api/klines', async (req, res) => {
  const { symbol, interval = '15m', limit = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  try {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Binance HTTP ${r.status}` });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('klines proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch klines from Binance' });
  }
});

// قیمت لحظه‌ای همه کوین‌ها
app.get('/api/prices', async (req, res) => {
  try {
    const r = await fetch(`${BINANCE_REST}/api/v3/ticker/price`);
    if (!r.ok) return res.status(r.status).json({ error: `Binance HTTP ${r.status}` });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('prices proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch prices from Binance' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

const server = http.createServer(app);

// رله WebSocket — اپ به اینجا وصل می‌شود، اینجا به Binance وصل می‌شود
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (clientWs, req) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const streams = parsedUrl.searchParams.get('streams');

  if (!streams) {
    clientWs.close();
    return;
  }

  let closedByClient = false;
  const upstream = new WebSocket(`${BINANCE_WS}/stream?streams=${streams}`);

  upstream.on('message', (raw) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(raw.toString());
  });

  upstream.on('close', () => {
    if (!closedByClient && clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  upstream.on('error', (err) => {
    console.error('Upstream Binance WS error:', err.message);
    if (!closedByClient && clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  clientWs.on('close', () => {
    closedByClient = true;
    upstream.close();
  });

  clientWs.on('error', () => {
    closedByClient = true;
    upstream.close();
  });
});

server.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});