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

// کوچک کمک‌کننده: یک تاخیر کوتاه بین درخواست‌ها به Binance
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// گرتن کندل‌های یک symbol از Binance (با کش)
async function fetchKlines(symbol, interval, limit) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  const now = Date.now();
  const cached = klinesCache.get(cacheKey);

  if (cached && (now - cached.time) < KLINES_CACHE_TTL) {
    return { data: cached.data, fromCache: true };
  }

  try {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) {
      if (cached) return { data: cached.data, fromCache: true };
      return { error: `Binance HTTP ${r.status}` };
    }
    const data = await r.json();
    klinesCache.set(cacheKey, { data, time: now });
    return { data, fromCache: false };
  } catch (err) {
    console.error(`klines fetch error for ${symbol}:`, err.message);
    if (cached) return { data: cached.data, fromCache: true };
    return { error: 'Failed to fetch klines from Binance' };
  }
}

// کندل‌های تاریخی — یک symbol (همونی که قبلاً بود، دست نخورده)
app.get('/api/klines', async (req, res) => {
  const { symbol, interval = '15m', limit = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const result = await fetchKlines(symbol, interval, limit);
  if (result.error) {
    return res.status(result.fromCache ? 200 : 502).json({ error: result.error });
  }
  res.json(result.data);
});

// کندل‌های چند symbol با یک درخواست از رانت‌اند —
// پشت‌صحنه پشت‌سرهم (نه موازی) به Binance درخواست می‌زند تا شار کمتر شود
app.get('/api/klines-batch', async (req, res) => {
  const { symbols, interval = '15m', limit = 200 } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols is required (comma separated)' });

  const symbolList = String(symbols).split(',').map((s) => s.trim()).filter(Boolean);
  const result = {};

  for (let i = 0; i < symbolList.length; i++) {
    const symbol = symbolList[i];
    const r = await fetchKlines(symbol, interval, limit);
    result[symbol] = r.error ? { error: r.error } : r.data;

    // اصله‌ی کوتاه بین درخواست‌ها به Binance، قط وقتی واقعاً درخواست تازه زده شد (نه از کش)
    if (!r.fromCache && i < symbolList.length - 1) {
      await sleep(150);
    }
  }

  res.json(result);
});

// کندل‌های تاریخی صفحه‌بندی‌شده — فقط برای بک‌تست (سمت کاربر اجرا می‌شود)
// هیچ ربطی به مسیر زنده‌ی اپ موبایل ندارد
app.get('/api/historical-klines', async (req, res) => {
  const { symbol, interval = '15m', startTime, endTime } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  if (!startTime || !endTime) {
    return res.status(400).json({ error: 'startTime and endTime are required (ms timestamps)' });
  }

  try {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: `Binance HTTP ${r.status}` });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('historical-klines proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch historical klines from Binance' });
  }
});

// قیمت لحظه‌ای — با cache (همه‌ی symbol‌ها با یک درخواست از Binance)
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