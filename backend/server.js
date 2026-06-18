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

// Cache برای قیمت‌ها
let pricesCache = null;
let pricesCacheTime = 0;
const PRICES_CACHE_TTL = 30000; // 30 ثانیه

// Cache برای کندل‌ها — کلید: symbol_interval_limit
const klinesCache = new Map();
const KLINES_CACHE_TTL = 60000; // 60 ثانیه

// کندل‌های تاریخی — با cache
app.get('/api/klines', async (req, res) => {
  const { symbol, interval = '15m', limit = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const cacheKey = `${symbol}_${interval}_${limit}`;
  const now = Date.now();
  const cached = klinesCache.get(cacheKey);

  if (cached && (now - cached.time) < KLINES_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) {
      if (cached) return res.json(cached.data);
      return res.status(r.status).json({ error: `Binance HTTP ${r.status}` });
    }
    const data = await r.json();
    klinesCache.set(cacheKey, { data, time: now });
    res.json(data);
  } catch (err) {
    console.error('klines proxy error:', err);
    if (cached) return res.json(cached.data);
    res.status(500).json({ error: 'Failed to fetch klines from Binance' });
  }
});

// قیمت لحظه‌ای — با cache
app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (pricesCache && (now - pricesCacheTime) < PRICES_CACHE_TTL) {
    return res.json(pricesCache);
  }

  try {
    const r = await fetch(`${BINANCE_REST}/api/v3/ticker/price`);
    if (!r.ok) {
      if (pricesCache) return res.json(pricesCache);
      return res.status(r.status).json({ error: `Binance HTTP ${r.status}` });
    }
    const data = await r.json();
    pricesCache = data;
    pricesCacheTime = now;
    res.json(data);
  } catch (err) {
    console.error('prices proxy error:', err);
    if (pricesCache) return res.json(pricesCache);
    res.status(500).json({ error: 'Failed to fetch prices from Binance' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

const server = http.createServer(app);

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