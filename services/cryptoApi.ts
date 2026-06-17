import { OHLCData } from './signalEngine';

const COIN_IDS: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  xrp: 'ripple',
  bnb: 'binancecoin',
  doge: 'dogecoin',
  ada: 'cardano',
  avax: 'avalanche-2',
};

export async function getCryptoPrices(): Promise<Record<string, number> | null> {
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    const data = await response.json();
    if (!data.bitcoin) return null;

    const result: Record<string, number> = {};
    Object.entries(COIN_IDS).forEach(([key, id]) => {
      result[key] = data[id]?.usd ?? 0;
    });
    return result;
  } catch (error) {
    console.error('CoinGecko price error:', error);
    return null;
  }
}

// کندل‌های واقعی OHLC از CoinGecko — رایگان، بدون نیاز به کلید
export async function getOHLC(coinKey: string, days: number = 1): Promise<OHLCData[]> {
  try {
    const id = COIN_IDS[coinKey] ?? coinKey;
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`
    );
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((c: number[]) => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }));
  } catch (error) {
    console.error('CoinGecko OHLC error:', error);
    return [];
  }
}

type PriceUpdateCallback = (coinKey: string, price: number) => void;

// به‌جای WebSocket، هر چند ثانیه قیمت‌های واقعی رو poll می‌کنیم
export function subscribeLivePrices(
  coinKeys: string[],
  onUpdate: PriceUpdateCallback,
  onStatusChange?: (connected: boolean) => void,
  intervalMs: number = 8000
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;
    const prices = await getCryptoPrices();
    if (prices) {
      onStatusChange?.(true);
      coinKeys.forEach((key) => {
        if (prices[key] !== undefined) onUpdate(key, prices[key]);
      });
    } else {
      onStatusChange?.(false);
    }
  };

  poll();
  const interval = setInterval(poll, intervalMs);

  return () => {
    active = false;
    clearInterval(interval);
  };
}