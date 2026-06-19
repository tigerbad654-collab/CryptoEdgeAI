// ============================================================
// services/binanceApi.ts
// دیتای واقعی Binance — از طریق بک‌اند خودمون (رفع بلاک جغرافیایی)
// ============================================================

import { BACKEND_URL, BACKEND_WS_URL } from './config';

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CoinKey = 'btc' | 'eth' | 'sol' | 'xrp' | 'bnb' | 'doge' | 'ada' | 'avax';

export const SYMBOL_MAP: Record<CoinKey, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
  xrp: 'XRPUSDT',
  bnb: 'BNBUSDT',
  doge: 'DOGEUSDT',
  ada: 'ADAUSDT',
  avax: 'AVAXUSDT',
};

export const COIN_NAMES: Record<CoinKey, string> = {
  btc: 'Bitcoin',
  eth: 'Ethereum',
  sol: 'Solana',
  xrp: 'XRP',
  bnb: 'BNB',
  doge: 'Dogecoin',
  ada: 'Cardano',
  avax: 'Avalanche',
};

export const COINS: CoinKey[] = ['btc', 'eth', 'sol', 'xrp', 'bnb', 'doge', 'ada', 'avax'];

function parseCandleArray(data: unknown[]): OHLCCandle[] {
  return data.map((c: unknown[]) => ({
    timestamp: c[0] as number,
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5]),
  }));
}

export async function getKlines(
  coinKey: CoinKey | string,
  interval: string = '15m',
  limit: number = 200
): Promise<OHLCCandle[]> {
  const symbol = SYMBOL_MAP[coinKey as CoinKey];
  if (!symbol) return [];

  try {
    const url = `${BACKEND_URL}/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return parseCandleArray(data);
  } catch (error) {
    console.error('Klines error:', error);
    return [];
  }
}

// نسخه‌ی batch: کندل‌های چند کوین رو با یک درخواست HTTP از بک‌اند می‌گیره
// (بک‌اند خودش پشت‌سرهم با Binance حرف می‌زند، نه موازی) — فشار کمتر روی Binance
export async function getKlinesBatch(
  coinKeys: (CoinKey | string)[],
  interval: string = '15m',
  limit: number = 200
): Promise<Partial<Record<CoinKey, OHLCCandle[]>>> {
  const symbols = coinKeys
    .map((key) => SYMBOL_MAP[key as CoinKey])
    .filter(Boolean);

  if (symbols.length === 0) return {};

  const symbolToCoin: Record<string, CoinKey> = {};
  coinKeys.forEach((key) => {
    const symbol = SYMBOL_MAP[key as CoinKey];
    if (symbol) symbolToCoin[symbol] = key as CoinKey;
  });

  const result: Partial<Record<CoinKey, OHLCCandle[]>> = {};

  try {
    const url = `${BACKEND_URL}/api/klines-batch?symbols=${symbols.join(',')}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    const data: Record<string, unknown> = await response.json();

    Object.entries(data).forEach(([symbol, value]) => {
      const coinKey = symbolToCoin[symbol];
      if (!coinKey) return;
      if (Array.isArray(value)) {
        result[coinKey] = parseCandleArray(value as unknown[]);
      } else {
        result[coinKey] = [];
      }
    });
  } catch (error) {
    console.error('Klines batch error:', error);
  }

  return result;
}

export async function getBinancePrices(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/prices`);
    if (!response.ok) return null;
    const data: { symbol: string; price: string }[] = await response.json();

    const result: Record<string, number> = {};
    const symbolToKey: Record<string, string> = {};
    Object.entries(SYMBOL_MAP).forEach(([key, sym]) => { symbolToKey[sym] = key; });

    data.forEach((item) => {
      const key = symbolToKey[item.symbol];
      if (key) result[key] = parseFloat(item.price);
    });

    return result;
  } catch {
    return null;
  }
}

type PriceUpdateCallback = (coinKey: string, price: number) => void;
type StatusCallback = (connected: boolean) => void;

export function subscribeLivePrices(
  coinKeys: (CoinKey | string)[],
  onUpdate: PriceUpdateCallback,
  onStatusChange?: StatusCallback
): () => void {
  const symbolToCoin: Record<string, string> = {};
  coinKeys.forEach((key) => {
    const symbol = SYMBOL_MAP[key as CoinKey];
    if (symbol) symbolToCoin[symbol] = key;
  });

  const streams = Object.keys(symbolToCoin)
    .map((s) => `${s.toLowerCase()}@aggTrade`)
    .join('/');

  if (!streams) return () => {};

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  let reconnectDelay = 3000;

  const connect = () => {
    if (!active) return;
    try {
      ws = new WebSocket(`${BACKEND_WS_URL}/ws?streams=${streams}`);

      ws.onopen = () => {
        reconnectDelay = 3000;
        onStatusChange?.(true);
      };

      ws.onclose = () => {
        onStatusChange?.(false);
        if (active) {
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      };

      ws.onerror = () => { onStatusChange?.(false); };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string);
          const payload = parsed.data;
          if (payload?.s && payload?.p) {
            const coinKey = symbolToCoin[payload.s];
            if (coinKey) onUpdate(coinKey, parseFloat(payload.p));
          }
        } catch {}
      };
    } catch {
      onStatusChange?.(false);
      if (active) reconnectTimer = setTimeout(connect, reconnectDelay);
    }
  };

  connect();

  return () => {
    active = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}

export function subscribeKlineStream(
  coinKey: CoinKey | string,
  interval: string,
  onCandle: (candle: OHLCCandle, isFinal: boolean) => void,
  onStatusChange?: StatusCallback
): () => void {
  const symbol = SYMBOL_MAP[coinKey as CoinKey];
  if (!symbol) return () => {};

  const streamName = `${symbol.toLowerCase()}@kline_${interval}`;

  let ws: WebSocket | null = null;
  let active = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 3000;

  const connect = () => {
    if (!active) return;
    try {
      ws = new WebSocket(`${BACKEND_WS_URL}/ws?streams=${streamName}`);

      ws.onopen = () => {
        reconnectDelay = 3000;
        onStatusChange?.(true);
      };

      ws.onclose = () => {
        onStatusChange?.(false);
        if (active) {
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      };

      ws.onerror = () => onStatusChange?.(false);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string);
          const k = parsed.data?.k;
          if (!k) return;
          onCandle(
            {
              timestamp: k.t as number,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
            },
            k.x as boolean
          );
        } catch {}
      };
    } catch {
      if (active) reconnectTimer = setTimeout(connect, reconnectDelay);
    }
  };

  connect();

  return () => {
    active = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}