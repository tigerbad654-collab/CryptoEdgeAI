// ============================================================
// services/multiTimeframeSignal.ts
// تأیید سیگنال با چند تایم‌فریم (Multi-Timeframe Confirmation)
//
// این فایل کاملاً جدید و مستقل است — هیچ تغییری در signalEngine.ts,
// binanceApi.ts یا server.js نداده‌ایم. منطق generateSignal دست‌نخورده می‌ماند.
//
// منطق:
//   ۴ ساعته  → فقط جهت کلی بازار را نشان می‌دهد (نمایشی، شرط سخت نیست)
//   ۱ ساعته  → باید هم‌جهت با ۱۵ دقیقه باشد، وگرنه سیگنال رد می‌شود
//   ۱۵ دقیقه → نقطه‌ی دقیق ورود (Entry) را تعیین می‌کند
//
// سیگنال نهایی فقط زمانی LONG/SHORT می‌شود که:
//   1) سیگنال ۱۵ دقیقه LONG یا SHORT باشد (نه WAIT)
//   2) همان جهت در emaTrend تایم‌فریم ۱ ساعته هم دیده شود
// در غیر این صورت، سیگنال نهایی WAIT می‌شود.
// ============================================================

import { CoinKey, getKlines } from './binanceApi';
import { SignalResult, generateSignal } from './signalEngine';

export interface MultiTimeframeResult {
  // سیگنال نهایی، بعد از اعمال فیلتر تأیید چند تایم‌فریمی
  finalSignal: SignalResult;

  // آیا سیگنال ۱۵ دقیقه توسط ۱ ساعته تأیید شد؟
  confirmed: boolean;

  // جهت هر تایم‌فریم، برای نمایش/دیباگ
  timeframes: {
    m15: { signal: 'LONG' | 'SHORT' | 'WAIT'; emaTrend: 'bullish' | 'bearish' | 'neutral' };
    h1: { signal: 'LONG' | 'SHORT' | 'WAIT'; emaTrend: 'bullish' | 'bearish' | 'neutral' };
    h4: { signal: 'LONG' | 'SHORT' | 'WAIT'; emaTrend: 'bullish' | 'bearish' | 'neutral' };
  };

  // جهت کلی بازار طبق ۴ ساعته (فقط نمایشی)
  overallTrend: 'bullish' | 'bearish' | 'neutral';
}

// آیا جهت سیگنال ۱۵ دقیقه با emaTrend تایم‌فریم بالاتر هم‌خوانی دارد؟
function isAligned(signal: 'LONG' | 'SHORT' | 'WAIT', emaTrend: 'bullish' | 'bearish' | 'neutral'): boolean {
  if (signal === 'LONG') return emaTrend === 'bullish';
  if (signal === 'SHORT') return emaTrend === 'bearish';
  return false;
}

// نسخه‌ی "WAIT" از یک سیگنال موجود — برای زمانی که تأیید نگیریم
// (entryPrice و قیمت فعلی را حفظ می‌کند، فقط سیگنال و رنگ را خنثی می‌کند)
function downgradeToWait(sig: SignalResult): SignalResult {
  return {
    ...sig,
    signal: 'WAIT',
    color: '#FACC15',
    confidence: 50,
  };
}

export async function generateMultiTimeframeSignal(
  coinKey: CoinKey | string
): Promise<MultiTimeframeResult | null> {
  // هر ۳ تایم‌فریم را موازی می‌گیریم (هر کدام endpoint موجود /api/klines را صدا می‌زند،
  // فقط با interval متفاوت — هیچ endpoint جدیدی لازم نیست)
  const [candles15m, candles1h, candles4h] = await Promise.all([
    getKlines(coinKey, '15m', 200),
    getKlines(coinKey, '1h', 200),
    getKlines(coinKey, '4h', 200),
  ]);

  if (candles15m.length < 30 || candles1h.length < 30 || candles4h.length < 30) {
    return null; // داده‌ی کافی برای حداقل یکی از تایم‌فریم‌ها نیست
  }

  const sig15m = generateSignal(candles15m);
  const sig1h = generateSignal(candles1h);
  const sig4h = generateSignal(candles4h);

  const confirmed = sig15m.signal !== 'WAIT' && isAligned(sig15m.signal, sig1h.emaTrend);

  const finalSignal = confirmed ? sig15m : downgradeToWait(sig15m);

  return {
    finalSignal,
    confirmed,
    timeframes: {
      m15: { signal: sig15m.signal, emaTrend: sig15m.emaTrend },
      h1: { signal: sig1h.signal, emaTrend: sig1h.emaTrend },
      h4: { signal: sig4h.signal, emaTrend: sig4h.emaTrend },
    },
    overallTrend: sig4h.emaTrend,
  };
}