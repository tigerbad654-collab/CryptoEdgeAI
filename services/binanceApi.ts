// ============================================================
// services/binanceApi.ts
// داده‌های واقعی از Binance — WebSocket لحظه‌ای + Klines تاریخی
// ============================================================

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

export async function getKlines(
  coinKey: CoinKey | string,
  interval: string = '15m',
  limit: number = 200
): Promise<OHLCCandle[]> {
  const symbol = SYMBOL_MAP[coinKey as CoinKey];
  if (!symbol) return [];

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((c: unknown[]) => ({
      timestamp: c[0] as number,
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  } catch (error) {
    console.error('Binance klines error:', error);
    return [];
  }
}

export async function getBinancePrices(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price`);
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
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

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

  let ws: WebSocket | null = null;
  let active = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 3000;

  const connect = () => {
    if (!active) return;
    try {
      ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
      );

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
          const msg = JSON.parse(event.data as string);
          const k = msg.k;
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