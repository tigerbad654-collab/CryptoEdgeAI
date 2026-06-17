// ============================================================
// services/aiAnalysis.ts
// تحلیل حرفه‌ای — موتور قانون‌محور، بدون نیاز به هیچ API خارجی
// ============================================================

import { SignalResult } from './signalEngine';

export async function getAIAnalysis(
  coin: string,
  sig: SignalResult,
  language: 'fa' | 'en'
): Promise<string> {
  return language === 'fa' ? buildFarsiAnalysis(coin, sig) : buildEnglishAnalysis(coin, sig);
}

// ---------------------------------------------------------------
// ابزارهای کمکی فرمت‌بندی
// ---------------------------------------------------------------
const fmtPrice = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// ---------------------------------------------------------------
// جمع‌آوری دلایل صعودی / نزولی از روی اندیکاتورها
// ---------------------------------------------------------------
function getBullishReasons(sig: SignalResult, isFa: boolean): string[] {
  const r: string[] = [];
  if (sig.rsi < 35) {
    r.push(isFa
      ? `RSI روی ${sig.rsi} نزدیک منطقه اشباع فروش است`
      : `RSI at ${sig.rsi} is near oversold territory`);
  }
  if (sig.macdCross === 'bullish') {
    r.push(isFa ? 'MACD تازه تقاطع صعودی داده' : 'MACD just formed a bullish crossover');
  }
  if (sig.stochCross === 'bullish' || sig.stoch < 20) {
    r.push(isFa
      ? `Stochastic (K=${sig.stoch}) سیگنال صعودی می‌دهد`
      : `Stochastic (K=${sig.stoch}) is signaling upside`);
  }
  if (sig.emaTrend === 'bullish') {
    r.push(isFa ? 'ترند EMA (7 بالای 21 بالای 50) صعودی است' : 'EMA trend (7 above 21 above 50) is bullish');
  }
  if (sig.bbPosition < 25) {
    r.push(isFa
      ? `قیمت نزدیک باند پایین بولینگر است (موقعیت ${sig.bbPosition}%)`
      : `Price sits near the lower Bollinger Band (position ${sig.bbPosition}%)`);
  }
  if (sig.volumeSignal === 'high') {
    r.push(isFa ? 'حجم معاملات بالاست و حرکت را تأیید می‌کند' : 'Volume is high, confirming the move');
  }
  return r;
}

function getBearishReasons(sig: SignalResult, isFa: boolean): string[] {
  const r: string[] = [];
  if (sig.rsi > 65) {
    r.push(isFa
      ? `RSI روی ${sig.rsi} نزدیک منطقه اشباع خرید است`
      : `RSI at ${sig.rsi} is near overbought territory`);
  }
  if (sig.macdCross === 'bearish') {
    r.push(isFa ? 'MACD تازه تقاطع نزولی داده' : 'MACD just formed a bearish crossover');
  }
  if (sig.stochCross === 'bearish' || sig.stoch > 80) {
    r.push(isFa
      ? `Stochastic (K=${sig.stoch}) سیگنال نزولی می‌دهد`
      : `Stochastic (K=${sig.stoch}) is signaling downside`);
  }
  if (sig.emaTrend === 'bearish') {
    r.push(isFa ? 'ترند EMA (7 زیر 21 زیر 50) نزولی است' : 'EMA trend (7 below 21 below 50) is bearish');
  }
  if (sig.bbPosition > 75) {
    r.push(isFa
      ? `قیمت نزدیک باند بالای بولینگر است (موقعیت ${sig.bbPosition}%)`
      : `Price sits near the upper Bollinger Band (position ${sig.bbPosition}%)`);
  }
  if (sig.volumeSignal === 'high') {
    r.push(isFa ? 'حجم معاملات بالاست و حرکت نزولی را تأیید می‌کند' : 'Volume is high, confirming the downside move');
  }
  return r;
}

// ---------------------------------------------------------------
// نسخه فارسی
// ---------------------------------------------------------------
function buildFarsiAnalysis(coin: string, sig: SignalResult): string {
  const change = parseFloat(sig.change);
  const dirWord = change >= 0 ? 'افزایش' : 'کاهش';
  const trendWord = sig.emaTrend === 'bullish' ? 'صعودی' : sig.emaTrend === 'bearish' ? 'نزولی' : 'خنثی';

  const bullish = getBullishReasons(sig, true);
  const bearish = getBearishReasons(sig, true);

  // --- بخش ۱: خلاصه وضعیت ---
  const summary =
    `${coin} در حال حاضر در قیمت ${fmtPrice(sig.entryPrice)} معامله می‌شود و در این بازه ${Math.abs(change).toFixed(2)}% ${dirWord} داشته است. ` +
    `سیگنال فعلی ${sig.signal} با سطح اطمینان ${sig.confidence}% است و روند کلی بازار ${trendWord} ارزیابی می‌شود.`;

  // --- بخش ۲: تأیید سیگنال ---
  let confirmation: string;
  if (sig.signal === 'LONG') {
    confirmation = bullish.length
      ? `از مجموع اندیکاتورها، ${bullish.length} مورد این سیگنال خرید را تأیید می‌کنند: ${bullish.join('؛ ')}.`
      : 'سیگنال صرفاً بر اساس ترکیب امتیازدهی کلی صادر شده و تأیید قوی از یک اندیکاتور خاص ندارد؛ با احتیاط بیشتری وارد شوید.';
  } else if (sig.signal === 'SHORT') {
    confirmation = bearish.length
      ? `از مجموع اندیکاتورها، ${bearish.length} مورد این سیگنال فروش را تأیید می‌کنند: ${bearish.join('؛ ')}.`
      : 'سیگنال صرفاً بر اساس ترکیب امتیازدهی کلی صادر شده و تأیید قوی از یک اندیکاتور خاص ندارد؛ با احتیاط بیشتری وارد شوید.';
  } else {
    confirmation = (bullish.length && bearish.length)
      ? `اندیکاتورها سیگنال یکدستی نمی‌دهند. از یک سو: ${bullish.join('، ')}. از سوی دیگر: ${bearish.join('، ')}. به همین دلیل وضعیت فعلی WAIT (در انتظار) در نظر گرفته شده.`
      : 'هیچ‌کدام از اندیکاتورها سیگنال قوی و یک‌جهته‌ای نمی‌دهند، بازار در حال استراحت یا رنج (سایدوی) است.';
  }

  // --- بخش ۳: ریسک‌ها ---
  const risks: string[] = [];
  if (sig.atrPercent > 3) {
    risks.push(`نوسان (ATR) فعلی ${sig.atrPercent.toFixed(2)}% است که نسبتاً بالاست؛ حد ضرر ممکن است با یک کندل بزرگ فعال شود`);
  }
  if (sig.volumeSignal === 'low') {
    risks.push('حجم معاملات پایین است، یعنی این حرکت ممکن است ضعیف باشد و به‌سادگی برگردد');
  }
  if (sig.signal === 'LONG' && bearish.length > 0) {
    risks.push(`در طرف مقابل: ${bearish.join('، ')} — این موارد می‌توانند سیگنال خرید را نقض کنند`);
  }
  if (sig.signal === 'SHORT' && bullish.length > 0) {
    risks.push(`در طرف مقابل: ${bullish.join('، ')} — این موارد می‌توانند سیگنال فروش را نقض کنند`);
  }
  if (sig.riskReward < 1.5 && sig.signal !== 'WAIT') {
    risks.push(`نسبت ریسک به سود فقط ۱:${sig.riskReward.toFixed(2)} است که پایین‌تر از حد ایده‌آل (۱:۲) محسوب می‌شود`);
  }
  if (risks.length === 0) {
    risks.push('در شرایط فعلی ریسک خاصی که به‌وضوح سیگنال را نقض کند مشاهده نمی‌شود، اما بازار کریپتو همیشه ریسک نوسان ناگهانی دارد');
  }

  // --- بخش ۴: استراتژی معامله ---
  let strategy: string;
  if (sig.signal === 'WAIT') {
    strategy =
      `پیشنهاد می‌شود فعلاً وارد معامله نشوید. منتظر بمانید تا قیمت یا به حمایت ${fmtPrice(sig.support)} نزدیک شود (فرصت خرید) ` +
      `یا به مقاومت ${fmtPrice(sig.resistance)} برسد (فرصت فروش)، و یکی از اندیکاتورهای MACD یا Stochastic تقاطع واضحی بدهد.`;
  } else {
    const dir = sig.signal === 'LONG' ? 'خرید' : 'فروش';
    strategy =
      `نقطه ورود حدود ${fmtPrice(sig.entryPrice)}. حد ضرر روی ${fmtPrice(sig.stopLoss)} و هدف سود روی ${fmtPrice(sig.takeProfit)} ` +
      `قرار بگیرد (نسبت ریسک به سود ۱:${sig.riskReward.toFixed(2)}). توصیه می‌شود بیش از ۱ تا ۲ درصد از کل سرمایه را روی این ${dir} ریسک نکنید. ` +
      `اگر قیمت به سطح فیبوناچی ${fmtPrice(sig.fibLevels.level500)} برگشت کرد، می‌توان آن را به‌عنوان نقطه ورود دوم یا میانگین‌گیری در نظر گرفت.`;
  }

  return `خلاصه وضعیت\n${summary}\n\nتأیید سیگنال\n${confirmation}\n\nریسک‌ها\n${risks.join('. ')}.\n\nاستراتژی معامله\n${strategy}`;
}

// ---------------------------------------------------------------
// English version
// ---------------------------------------------------------------
function buildEnglishAnalysis(coin: string, sig: SignalResult): string {
  const change = parseFloat(sig.change);
  const dirWord = change >= 0 ? 'gained' : 'lost';
  const trendWord = sig.emaTrend === 'bullish' ? 'bullish' : sig.emaTrend === 'bearish' ? 'bearish' : 'neutral';

  const bullish = getBullishReasons(sig, false);
  const bearish = getBearishReasons(sig, false);

  const summary =
    `${coin} is currently trading at ${fmtPrice(sig.entryPrice)} and has ${dirWord} ${Math.abs(change).toFixed(2)}% over this period. ` +
    `The current signal is ${sig.signal} with ${sig.confidence}% confidence, and the overall trend is assessed as ${trendWord}.`;

  let confirmation: string;
  if (sig.signal === 'LONG') {
    confirmation = bullish.length
      ? `${bullish.length} indicators confirm this buy signal: ${bullish.join('; ')}.`
      : 'This signal is based mainly on the overall scoring model without a strong single-indicator confirmation; proceed with extra caution.';
  } else if (sig.signal === 'SHORT') {
    confirmation = bearish.length
      ? `${bearish.length} indicators confirm this sell signal: ${bearish.join('; ')}.`
      : 'This signal is based mainly on the overall scoring model without a strong single-indicator confirmation; proceed with extra caution.';
  } else {
    confirmation = (bullish.length && bearish.length)
      ? `Indicators are mixed. On one hand: ${bullish.join(', ')}. On the other: ${bearish.join(', ')}. This is why the current status is WAIT.`
      : 'No indicator shows a strong directional signal right now; the market appears to be resting or ranging.';
  }

  const risks: string[] = [];
  if (sig.atrPercent > 3) {
    risks.push(`Current volatility (ATR) is ${sig.atrPercent.toFixed(2)}%, which is fairly high; the stop loss could be hit by a single large candle`);
  }
  if (sig.volumeSignal === 'low') {
    risks.push('Volume is low, meaning this move could be weak and easily reverse');
  }
  if (sig.signal === 'LONG' && bearish.length > 0) {
    risks.push(`On the flip side: ${bearish.join(', ')} — these could invalidate the buy signal`);
  }
  if (sig.signal === 'SHORT' && bullish.length > 0) {
    risks.push(`On the flip side: ${bullish.join(', ')} — these could invalidate the sell signal`);
  }
  if (sig.riskReward < 1.5 && sig.signal !== 'WAIT') {
    risks.push(`Risk/reward is only 1:${sig.riskReward.toFixed(2)}, below the ideal 1:2 ratio`);
  }
  if (risks.length === 0) {
    risks.push('No clear risk currently invalidates this signal, though crypto markets always carry sudden volatility risk');
  }

  let strategy: string;
  if (sig.signal === 'WAIT') {
    strategy =
      `Holding off on entry is advisable. Wait for price to approach support at ${fmtPrice(sig.support)} (buy opportunity) ` +
      `or resistance at ${fmtPrice(sig.resistance)} (sell opportunity), along with a clear MACD or Stochastic crossover.`;
  } else {
    const dir = sig.signal === 'LONG' ? 'long' : 'short';
    strategy =
      `Entry around ${fmtPrice(sig.entryPrice)}. Set stop loss at ${fmtPrice(sig.stopLoss)} and take profit at ${fmtPrice(sig.takeProfit)} ` +
      `(risk/reward 1:${sig.riskReward.toFixed(2)}). Avoid risking more than 1-2% of total capital on this ${dir}. ` +
      `If price pulls back to the ${fmtPrice(sig.fibLevels.level500)} fibonacci level, that could serve as a secondary entry or averaging point.`;
  }

  return `Situation Summary\n${summary}\n\nSignal Confirmation\n${confirmation}\n\nRisks\n${risks.join('. ')}.\n\nTrade Strategy\n${strategy}`;
}