// ============================================================
// services/signalEngine.ts
// موتور سیگنال حرفه‌ای — تمام اندیکاتورها + سیگنال ورود/خروج
// ============================================================

import { OHLCCandle } from './binanceApi';

export type { OHLCCandle };

export interface OHLCData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SignalResult {
  signal: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number;
  color: string;

  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;

  rsi: number;
  rsiSignal: 'oversold' | 'overbought' | 'neutral';

  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdCross: 'bullish' | 'bearish' | 'none';

  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  bbPosition: number;

  stoch: number;
  stochSignal: number;
  stochCross: 'bullish' | 'bearish' | 'none';

  atr: number;
  atrPercent: number;

  ema7: number;
  ema21: number;
  ema50: number;
  ema200: number;
  emaTrend: 'bullish' | 'bearish' | 'neutral';

  volume: number;
  volumeAvg: number;
  volumeSignal: 'high' | 'low' | 'normal';

  support: number;
  resistance: number;
  supportLevels: number[];
  resistanceLevels: number[];

  fibLevels: FibLevels;
  trendLines: TrendLine[];

  trend: string;
  change: string;

  priceHistory: number[];
  ohlcData: OHLCData[];
  volumeData: number[];
}

export interface FibLevels {
  high: number;
  low: number;
  level0: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  level1000: number;
}

export interface TrendLine {
  type: 'support' | 'resistance';
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  strength: number;
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return prices.map(() => prices[prices.length - 1] ?? 0);
  }
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      emas.push(prices[i]);
    } else if (i === period - 1) {
      emas.push(ema);
    } else {
      ema = prices[i] * k + ema * (1 - k);
      emas.push(ema);
    }
  }
  return emas;
}

function lastEMA(prices: number[], period: number): number {
  const arr = calculateEMA(prices, period);
  return arr[arr.length - 1] ?? 0;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function calculateMACD(prices: number[]): {
  macd: number; signal: number; histogram: number; cross: 'bullish' | 'bearish' | 'none';
} {
  if (prices.length < 35) return { macd: 0, signal: 0, histogram: 0, cross: 'none' };

  const ema12Arr = calculateEMA(prices, 12);
  const ema26Arr = calculateEMA(prices, 26);

  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(ema12Arr[i] - ema26Arr[i]);
  }

  const signalArr = calculateEMA(macdLine, 9);

  const macd = macdLine[macdLine.length - 1] ?? 0;
  const signal = signalArr[signalArr.length - 1] ?? 0;
  const histogram = macd - signal;

  const prevMacd = macdLine[macdLine.length - 2] ?? 0;
  const prevSignal = signalArr[signalArr.length - 2] ?? 0;

  let cross: 'bullish' | 'bearish' | 'none' = 'none';
  if (prevMacd <= prevSignal && macd > signal) cross = 'bullish';
  else if (prevMacd >= prevSignal && macd < signal) cross = 'bearish';

  return { macd, signal, histogram, cross };
}

function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
  upper: number; middle: number; lower: number; width: number; position: number;
} {
  if (prices.length < period) {
    const last = prices[prices.length - 1] ?? 0;
    return { upper: last * 1.02, middle: last, lower: last * 0.98, width: 4, position: 50 };
  }
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + stdDev * std;
  const lower = mean - stdDev * std;
  const width = ((upper - lower) / mean) * 100;
  const current = prices[prices.length - 1];
  const position = upper === lower ? 50 : Math.round(((current - lower) / (upper - lower)) * 100);
  return { upper, middle: mean, lower, width, position };
}

function calculateStochastic(prices: number[], period: number = 14, smooth: number = 3): {
  k: number; d: number; cross: 'bullish' | 'bearish' | 'none';
} {
  if (prices.length < period + smooth) return { k: 50, d: 50, cross: 'none' };

  const kValues: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice);
    const lowest = Math.min(...slice);
    kValues.push(highest === lowest ? 50 : ((prices[i] - lowest) / (highest - lowest)) * 100);
  }

  const dValues: number[] = [];
  for (let i = smooth - 1; i < kValues.length; i++) {
    dValues.push(kValues.slice(i - smooth + 1, i + 1).reduce((a, b) => a + b, 0) / smooth);
  }

  const k = Math.round(kValues[kValues.length - 1] ?? 50);
  const d = Math.round(dValues[dValues.length - 1] ?? 50);
  const prevK = kValues[kValues.length - 2] ?? k;
  const prevD = dValues[dValues.length - 2] ?? d;

  let cross: 'bullish' | 'bearish' | 'none' = 'none';
  if (prevK <= prevD && k > d) cross = 'bullish';
  else if (prevK >= prevD && k < d) cross = 'bearish';

  return { k, d, cross };
}

function calculateATR(ohlc: OHLCData[], period: number = 14): number {
  if (ohlc.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < ohlc.length; i++) {
    const h = ohlc[i].high;
    const l = ohlc[i].low;
    const pc = ohlc[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findSupportResistanceLevels(ohlc: OHLCData[], lookback: number = 50): {
  support: number; resistance: number; supportLevels: number[]; resistanceLevels: number[];
} {
  const slice = ohlc.slice(-lookback);
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const curr = slice[i];
    const isHigh =
      curr.high > slice[i - 1].high && curr.high > slice[i - 2].high &&
      curr.high > slice[i + 1].high && curr.high > slice[i + 2].high;
    const isLow =
      curr.low < slice[i - 1].low && curr.low < slice[i - 2].low &&
      curr.low < slice[i + 1].low && curr.low < slice[i + 2].low;

    if (isHigh) pivotHighs.push(curr.high);
    if (isLow) pivotLows.push(curr.low);
  }

  const currentPrice = ohlc[ohlc.length - 1].close;

  const clusterLevels = (levels: number[], threshold: number = 0.005): number[] => {
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      let sum = sorted[i];
      while (j + 1 < sorted.length && (sorted[j + 1] - sorted[i]) / sorted[i] < threshold) {
        j++;
        sum += sorted[j];
      }
      clusters.push(sum / (j - i + 1));
      i = j + 1;
    }
    return clusters;
  };

  const supLevels = clusterLevels(pivotLows).filter((l) => l < currentPrice).slice(-3);
  const resLevels = clusterLevels(pivotHighs).filter((l) => l > currentPrice).slice(0, 3);

  const support = supLevels.length > 0
    ? Math.max(...supLevels)
    : Math.min(...slice.map((c) => c.low));
  const resistance = resLevels.length > 0
    ? Math.min(...resLevels)
    : Math.max(...slice.map((c) => c.high));

  return { support, resistance, supportLevels: supLevels, resistanceLevels: resLevels };
}

function calculateFibonacci(ohlc: OHLCData[], lookback: number = 50): FibLevels {
  const slice = ohlc.slice(-lookback);
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const diff = high - low;

  return {
    high, low,
    level0: high,
    level236: high - diff * 0.236,
    level382: high - diff * 0.382,
    level500: high - diff * 0.5,
    level618: high - diff * 0.618,
    level786: high - diff * 0.786,
    level1000: low,
  };
}

function detectTrendLines(ohlc: OHLCData[], lookback: number = 60): TrendLine[] {
  const slice = ohlc.slice(-lookback);
  const lines: TrendLine[] = [];

  const lows: { i: number; price: number }[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (
      slice[i].low < slice[i - 1].low && slice[i].low < slice[i - 2].low &&
      slice[i].low < slice[i + 1].low && slice[i].low < slice[i + 2].low
    ) {
      lows.push({ i, price: slice[i].low });
    }
  }

  const highs: { i: number; price: number }[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (
      slice[i].high > slice[i - 1].high && slice[i].high > slice[i - 2].high &&
      slice[i].high > slice[i + 1].high && slice[i].high > slice[i + 2].high
    ) {
      highs.push({ i, price: slice[i].high });
    }
  }

  if (lows.length >= 2) {
    for (let a = 0; a < lows.length - 1; a++) {
      for (let b = a + 1; b < lows.length; b++) {
        if (lows[b].price >= lows[a].price) {
          lines.push({
            type: 'support',
            startIndex: lows[a].i, endIndex: lows[b].i,
            startPrice: lows[a].price, endPrice: lows[b].price,
            strength: 2,
          });
        }
      }
    }
  }

  if (highs.length >= 2) {
    for (let a = 0; a < highs.length - 1; a++) {
      for (let b = a + 1; b < highs.length; b++) {
        if (highs[b].price <= highs[a].price) {
          lines.push({
            type: 'resistance',
            startIndex: highs[a].i, endIndex: highs[b].i,
            startPrice: highs[a].price, endPrice: highs[b].price,
            strength: 2,
          });
        }
      }
    }
  }

  return lines.slice(-6);
}

function analyzeVolume(volumes: number[]): {
  current: number; avg: number; signal: 'high' | 'low' | 'normal';
} {
  if (volumes.length === 0) return { current: 0, avg: 0, signal: 'normal' };
  const recent = volumes.slice(-20);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const current = volumes[volumes.length - 1] ?? 0;
  const ratio = current / (avg || 1);
  return {
    current, avg,
    signal: ratio > 1.5 ? 'high' : ratio < 0.5 ? 'low' : 'normal',
  };
}

export function generateSignal(ohlcData: OHLCData[]): SignalResult {
  if (ohlcData.length < 30) {
    const last = ohlcData[ohlcData.length - 1] ?? { close: 0, open: 0, high: 0, low: 0, timestamp: 0 };
    return createEmptySignal(last.close, ohlcData);
  }

  const closes = ohlcData.map((c) => c.close);
  const volumes = ohlcData.map((c) => c.volume ?? 0);
  const currentPrice = closes[closes.length - 1];
  const previousPrice = closes[closes.length - 2] ?? currentPrice;
  const change = ((currentPrice - previousPrice) / previousPrice) * 100;

  const rsi = calculateRSI(closes);
  const rsiSignal: 'oversold' | 'overbought' | 'neutral' =
    rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral';

  const { macd, signal: macdSig, histogram, cross: macdCross } = calculateMACD(closes);

  const { upper: bbUpper, middle: bbMiddle, lower: bbLower, width: bbWidth, position: bbPosition } =
    calculateBollingerBands(closes);

  const { k: stoch, d: stochSig, cross: stochCross } = calculateStochastic(closes);

  const atr = calculateATR(ohlcData);
  const atrPercent = (atr / currentPrice) * 100;

  const ema7 = lastEMA(closes, 7);
  const ema21 = lastEMA(closes, 21);
  const ema50 = lastEMA(closes, 50);
  const ema200 = lastEMA(closes, 200);
  const emaTrend: 'bullish' | 'bearish' | 'neutral' =
    ema7 > ema21 && ema21 > ema50 ? 'bullish' :
    ema7 < ema21 && ema21 < ema50 ? 'bearish' : 'neutral';

  const { current: volume, avg: volumeAvg, signal: volumeSignal } = analyzeVolume(volumes);

  const { support, resistance, supportLevels, resistanceLevels } =
    findSupportResistanceLevels(ohlcData);

  const fibLevels = calculateFibonacci(ohlcData);
  const trendLines = detectTrendLines(ohlcData);

  let longScore = 0;
  let shortScore = 0;

  if (rsi < 25) longScore += 3;
  else if (rsi < 35) longScore += 2;
  else if (rsi < 45) longScore += 1;
  if (rsi > 75) shortScore += 3;
  else if (rsi > 65) shortScore += 2;
  else if (rsi > 55) shortScore += 1;

  if (macdCross === 'bullish') longScore += 3;
  else if (macd > macdSig && macd > 0) longScore += 2;
  else if (macd > macdSig) longScore += 1;
  if (macdCross === 'bearish') shortScore += 3;
  else if (macd < macdSig && macd < 0) shortScore += 2;
  else if (macd < macdSig) shortScore += 1;

  if (currentPrice <= bbLower) longScore += 2;
  else if (bbPosition < 25) longScore += 1;
  if (currentPrice >= bbUpper) shortScore += 2;
  else if (bbPosition > 75) shortScore += 1;

  if (stochCross === 'bullish' && stoch < 30) longScore += 2;
  else if (stoch < 20) longScore += 2;
  else if (stoch < 30) longScore += 1;
  if (stochCross === 'bearish' && stoch > 70) shortScore += 2;
  else if (stoch > 80) shortScore += 2;
  else if (stoch > 70) shortScore += 1;

  if (emaTrend === 'bullish') longScore += 2;
  else if (ema7 > ema21) longScore += 1;
  if (emaTrend === 'bearish') shortScore += 2;
  else if (ema7 < ema21) shortScore += 1;

  const distToSupport = (currentPrice - support) / currentPrice;
  const distToResistance = (resistance - currentPrice) / currentPrice;
  if (distToSupport < 0.015) longScore += 1;
  if (distToResistance < 0.015) shortScore += 1;

  if (volumeSignal === 'high' && macd > macdSig) longScore += 1;
  if (volumeSignal === 'high' && macd < macdSig) shortScore += 1;

  const fibLong = [fibLevels.level618, fibLevels.level786, fibLevels.level1000];
  const fibShort = [fibLevels.level0, fibLevels.level236, fibLevels.level382];
  const nearFibLong = fibLong.some((f) => Math.abs(currentPrice - f) / currentPrice < 0.01);
  const nearFibShort = fibShort.some((f) => Math.abs(currentPrice - f) / currentPrice < 0.01);
  if (nearFibLong) longScore += 1;
  if (nearFibShort) shortScore += 1;

  const maxScore = 16;
  let signal: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  let confidence = 50;

  if (longScore > shortScore && longScore >= 5) {
    signal = 'LONG';
    confidence = Math.min(95, Math.round(55 + (longScore / maxScore) * 40));
  } else if (shortScore > longScore && shortScore >= 5) {
    signal = 'SHORT';
    confidence = Math.min(95, Math.round(55 + (shortScore / maxScore) * 40));
  } else {
    confidence = 50 - Math.abs(longScore - shortScore) * 2;
  }

  const atrSafe = atr > 0 ? atr : currentPrice * 0.005;
  let stopLoss = currentPrice;
  let takeProfit = currentPrice;

  if (signal === 'LONG') {
    stopLoss = Math.min(currentPrice - atrSafe * 1.5, support * 0.998);
    takeProfit = Math.max(currentPrice + atrSafe * 3, resistance * 0.999);
  } else if (signal === 'SHORT') {
    stopLoss = Math.max(currentPrice + atrSafe * 1.5, resistance * 1.002);
    takeProfit = Math.min(currentPrice - atrSafe * 3, support * 1.001);
  }

  const risk = Math.abs(currentPrice - stopLoss);
  const reward = Math.abs(takeProfit - currentPrice);
  const riskReward = risk > 0 ? reward / risk : 0;

  const color = signal === 'LONG' ? '#22C55E' : signal === 'SHORT' ? '#EF4444' : '#FACC15';
  const trend = emaTrend === 'bullish' ? 'Bullish' : emaTrend === 'bearish' ? 'Bearish' : 'Sideways';

  return {
    signal, confidence, color,
    entryPrice: currentPrice, stopLoss, takeProfit, riskReward,
    rsi, rsiSignal,
    macd, macdSignal: macdSig, macdHistogram: histogram, macdCross,
    bbUpper, bbMiddle, bbLower, bbWidth, bbPosition,
    stoch, stochSignal: stochSig, stochCross,
    atr, atrPercent,
    ema7, ema21, ema50, ema200, emaTrend,
    volume, volumeAvg, volumeSignal,
    support, resistance, supportLevels, resistanceLevels,
    fibLevels, trendLines,
    trend, change: change.toFixed(4),
    priceHistory: closes.slice(-100),
    ohlcData: ohlcData.slice(-100),
    volumeData: volumes.slice(-100),
  };
}

function createEmptySignal(price: number, ohlcData: OHLCData[]): SignalResult {
  return {
    signal: 'WAIT', confidence: 50, color: '#FACC15',
    entryPrice: price, stopLoss: price * 0.98, takeProfit: price * 1.02, riskReward: 1,
    rsi: 50, rsiSignal: 'neutral',
    macd: 0, macdSignal: 0, macdHistogram: 0, macdCross: 'none',
    bbUpper: price * 1.02, bbMiddle: price, bbLower: price * 0.98, bbWidth: 4, bbPosition: 50,
    stoch: 50, stochSignal: 50, stochCross: 'none',
    atr: 0, atrPercent: 0,
    ema7: price, ema21: price, ema50: price, ema200: price, emaTrend: 'neutral',
    volume: 0, volumeAvg: 0, volumeSignal: 'normal',
    support: price * 0.97, resistance: price * 1.03,
    supportLevels: [], resistanceLevels: [],
    fibLevels: {
      high: price * 1.1, low: price * 0.9,
      level0: price * 1.1, level236: price * 1.076, level382: price * 1.062,
      level500: price * 1.0, level618: price * 0.938,
      level786: price * 0.921, level1000: price * 0.9,
    },
    trendLines: [],
    trend: 'Sideways', change: '0.0000',
    priceHistory: [price], ohlcData, volumeData: [],
  };
}