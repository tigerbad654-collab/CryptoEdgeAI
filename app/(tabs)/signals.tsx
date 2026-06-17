// ============================================================
// app/(tabs)/signals.tsx
// صفحه سیگنال حرفه‌ای — چارت کامل + اندیکاتور + AI
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { getAIAnalysis } from '../../services/aiAnalysis';
import {
  COINS,
  COIN_NAMES,
  CoinKey,
  OHLCCandle,
  getKlines,
  subscribeKlineStream,
  subscribeLivePrices,
} from '../../services/binanceApi';
import { OHLCData, SignalResult, generateSignal } from '../../services/signalEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 260;
const CANDLE_AREA_HEIGHT = 180;
const VOLUME_HEIGHT = 40;
const PADDING = { top: 10, right: 50, bottom: 20, left: 8 };

const COIN_SYMBOLS_DISPLAY: Record<CoinKey, string> = {
  btc: '₿', eth: 'Ξ', sol: '◎', xrp: '✕',
  bnb: 'B', doge: 'Ð', ada: '₳', avax: 'A',
};

type AIState = { text: string; loading: boolean; visible: boolean; language: 'fa' | 'en' };
type IntervalKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const INTERVALS: IntervalKey[] = ['5m', '15m', '1h', '4h', '1d'];

// ============================================================
// چارت حرفه‌ای SVG
// ============================================================
interface ChartProps {
  data: OHLCData[];
  signal: SignalResult;
  interval: IntervalKey;
  width: number;
}

function ProfessionalChart({ data, signal, width }: ChartProps) {
  if (!data || data.length < 5) {
    return (
      <View style={{ width, height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#475569' }}>Loading chart...</Text>
      </View>
    );
  }

  const candles = data.slice(-60);
  const volumes = candles.map((c) => c.volume ?? 0);
  const maxVol = Math.max(...volumes) || 1;

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  let priceHigh = Math.max(...allHighs, signal.bbUpper, signal.resistance);
  let priceLow = Math.min(...allLows, signal.bbLower, signal.support);
  const pricePad = (priceHigh - priceLow) * 0.06;
  priceHigh += pricePad;
  priceLow -= pricePad;
  const priceRange = priceHigh - priceLow || 1;

  const chartW = width - PADDING.left - PADDING.right;
  const candleAreaH = CANDLE_AREA_HEIGHT;
  const candleW = Math.max(2, chartW / candles.length - 1);

  const priceToY = (p: number) =>
    PADDING.top + ((priceHigh - p) / priceRange) * candleAreaH;

  const idxToX = (i: number) =>
    PADDING.left + (i + 0.5) * (chartW / candles.length);

  // EMA روی چارت
  const ema7Arr = candles.map((_, i) => {
    const slice = candles.slice(Math.max(0, i - 6), i + 1).map((c) => c.close);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const ema21Arr = candles.map((_, i) => {
    const slice = candles.slice(Math.max(0, i - 20), i + 1).map((c) => c.close);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const buildLinePath = (vals: number[]): string =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${idxToX(i).toFixed(1)},${priceToY(v).toFixed(1)}`)
      .join(' ');

  // Bollinger Band fill path
  const bbPath = (() => {
    const upper = candles.map((_, i) => {
      const slice = candles.slice(Math.max(0, i - 19), i + 1).map((c) => c.close);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length);
      return mean + 2 * std;
    });
    const lower = candles.map((_, i) => {
      const slice = candles.slice(Math.max(0, i - 19), i + 1).map((c) => c.close);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length);
      return mean - 2 * std;
    });
    const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${idxToX(i).toFixed(1)},${Math.max(PADDING.top, priceToY(v)).toFixed(1)}`).join(' ');
    const bot = lower.map((v, i) => `L${idxToX(lower.length - 1 - i).toFixed(1)},${Math.min(PADDING.top + candleAreaH, priceToY(v)).toFixed(1)}`).reverse().join(' ');
    return `${top} ${bot} Z`;
  })();

  // Price labels روی محور Y
  const priceLabels = Array.from({ length: 5 }, (_, i) => {
    const price = priceHigh - (i / 4) * priceRange;
    const y = priceToY(price);
    const fmt = price >= 1000 ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : price >= 10 ? price.toFixed(2)
      : price.toFixed(4);
    return { price, y, fmt };
  });

  return (
    <Svg width={width} height={CHART_HEIGHT + VOLUME_HEIGHT + 20}>
      <Defs>
        <LinearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6366F1" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#6366F1" stopOpacity="0.02" />
        </LinearGradient>
        <LinearGradient id="volGreen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#22C55E" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#22C55E" stopOpacity="0.2" />
        </LinearGradient>
        <LinearGradient id="volRed" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EF4444" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#EF4444" stopOpacity="0.2" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {priceLabels.map((pl, i) => (
        <Line
          key={i}
          x1={PADDING.left}
          y1={pl.y}
          x2={width - PADDING.right}
          y2={pl.y}
          stroke="#1E3A6E"
          strokeWidth={0.5}
          strokeDasharray="4,4"
        />
      ))}

      {/* Price labels */}
      {priceLabels.map((pl, i) => (
        <SvgText
          key={i}
          x={width - PADDING.right + 4}
          y={pl.y + 4}
          fontSize={9}
          fill="#475569"
        >
          {pl.fmt}
        </SvgText>
      ))}

      {/* Bollinger Band fill */}
      <Path d={bbPath} fill="url(#bbGrad)" />

      {/* Bollinger upper/lower */}
      <Path
        d={buildLinePath(candles.map((_, i) => {
          const sl = candles.slice(Math.max(0, i - 19), i + 1).map((c) => c.close);
          const m = sl.reduce((a, b) => a + b, 0) / sl.length;
          const s = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / sl.length);
          return m + 2 * s;
        }))}
        stroke="#6366F1"
        strokeWidth={0.8}
        fill="none"
        strokeDasharray="3,3"
        opacity={0.6}
      />
      <Path
        d={buildLinePath(candles.map((_, i) => {
          const sl = candles.slice(Math.max(0, i - 19), i + 1).map((c) => c.close);
          const m = sl.reduce((a, b) => a + b, 0) / sl.length;
          const s = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / sl.length);
          return m - 2 * s;
        }))}
        stroke="#6366F1"
        strokeWidth={0.8}
        fill="none"
        strokeDasharray="3,3"
        opacity={0.6}
      />

      {/* EMA7 */}
      <Path d={buildLinePath(ema7Arr)} stroke="#F59E0B" strokeWidth={1.2} fill="none" opacity={0.9} />

      {/* EMA21 */}
      <Path d={buildLinePath(ema21Arr)} stroke="#8B5CF6" strokeWidth={1.2} fill="none" opacity={0.9} />

      {/* Support & Resistance خطوط */}
      <Line
        x1={PADDING.left} y1={priceToY(signal.support)}
        x2={width - PADDING.right} y2={priceToY(signal.support)}
        stroke="#22C55E" strokeWidth={1} strokeDasharray="6,3" opacity={0.7}
      />
      <Line
        x1={PADDING.left} y1={priceToY(signal.resistance)}
        x2={width - PADDING.right} y2={priceToY(signal.resistance)}
        stroke="#EF4444" strokeWidth={1} strokeDasharray="6,3" opacity={0.7}
      />

      {/* Fibonacci سطوح */}
      {[
        { level: signal.fibLevels.level382, color: '#FACC15' },
        { level: signal.fibLevels.level500, color: '#FB923C' },
        { level: signal.fibLevels.level618, color: '#F87171' },
      ].map(({ level, color }, i) => {
        const y = priceToY(level);
        if (y < PADDING.top || y > PADDING.top + candleAreaH) return null;
        return (
          <Line
            key={i}
            x1={PADDING.left} y1={y}
            x2={width - PADDING.right} y2={y}
            stroke={color} strokeWidth={0.6} strokeDasharray="2,4" opacity={0.5}
          />
        );
      })}

      {/* Trend Lines */}
      {signal.trendLines.slice(0, 3).map((tl, i) => {
        const startX = idxToX(Math.max(0, candles.length - (60 - tl.startIndex)));
        const endX = idxToX(Math.max(0, candles.length - (60 - tl.endIndex)));
        const startY = priceToY(tl.startPrice);
        const endY = priceToY(tl.endPrice);
        return (
          <Line
            key={i}
            x1={startX} y1={startY}
            x2={endX} y2={endY}
            stroke={tl.type === 'support' ? '#22C55E' : '#EF4444'}
            strokeWidth={1.5}
            opacity={0.6}
          />
        );
      })}

      {/* Candles */}
      {candles.map((c, i) => {
        const isGreen = c.close >= c.open;
        const color = isGreen ? '#22C55E' : '#EF4444';
        const x = idxToX(i);
        const openY = priceToY(c.open);
        const closeY = priceToY(c.close);
        const highY = priceToY(c.high);
        const lowY = priceToY(c.low);
        const bodyTop = Math.min(openY, closeY);
        const bodyH = Math.max(1, Math.abs(closeY - openY));

        return (
          <React.Fragment key={i}>
            {/* wick */}
            <Line
              x1={x} y1={highY} x2={x} y2={lowY}
              stroke={color} strokeWidth={0.8}
            />
            {/* body */}
            <Rect
              x={x - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={isGreen ? color : color}
              opacity={0.9}
            />
          </React.Fragment>
        );
      })}

      {/* Current price line */}
      {(() => {
        const cp = candles[candles.length - 1]?.close ?? 0;
        const y = priceToY(cp);
        return (
          <>
            <Line
              x1={PADDING.left} y1={y}
              x2={width - PADDING.right} y2={y}
              stroke="#FFFFFF" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4}
            />
            <Circle cx={width - PADDING.right} cy={y} r={3} fill="#FFFFFF" opacity={0.8} />
          </>
        );
      })()}

      {/* Stop Loss & Take Profit */}
      {signal.signal !== 'WAIT' && (() => {
        const slY = priceToY(signal.stopLoss);
        const tpY = priceToY(signal.takeProfit);
        const validSL = slY >= PADDING.top && slY <= PADDING.top + candleAreaH;
        const validTP = tpY >= PADDING.top && tpY <= PADDING.top + candleAreaH;
        return (
          <>
            {validSL && (
              <Line
                x1={PADDING.left} y1={slY}
                x2={width - PADDING.right} y2={slY}
                stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.8}
              />
            )}
            {validTP && (
              <Line
                x1={PADDING.left} y1={tpY}
                x2={width - PADDING.right} y2={tpY}
                stroke="#22C55E" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.8}
              />
            )}
          </>
        );
      })()}

      {/* Volume bars */}
      {candles.map((c, i) => {
        const isGreen = c.close >= c.open;
        const vol = c.volume ?? 0;
        const volH = Math.max(1, (vol / maxVol) * VOLUME_HEIGHT);
        const x = idxToX(i);
        const volY = CHART_HEIGHT + 10 + (VOLUME_HEIGHT - volH);
        return (
          <Rect
            key={i}
            x={x - candleW / 2}
            y={volY}
            width={candleW}
            height={volH}
            fill={isGreen ? '#22C55E' : '#EF4444'}
            opacity={0.4}
          />
        );
      })}

      {/* Legend */}
      <SvgText x={PADDING.left + 4} y={PADDING.top + 14} fontSize={9} fill="#F59E0B">─ EMA7</SvgText>
      <SvgText x={PADDING.left + 44} y={PADDING.top + 14} fontSize={9} fill="#8B5CF6">─ EMA21</SvgText>
      <SvgText x={PADDING.left + 90} y={PADDING.top + 14} fontSize={9} fill="#6366F1">── BB</SvgText>
    </Svg>
  );
}

// ============================================================
// ردیف اندیکاتور
// ============================================================
function IndicatorRow({ label, value, color, subValue }: {
  label: string; value: string; color: string; subValue?: string;
}) {
  return (
    <View style={styles.indicatorRow}>
      <Text style={styles.indicatorLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.indicatorValue, { color }]}>{value}</Text>
        {subValue && <Text style={styles.indicatorSub}>{subValue}</Text>}
      </View>
    </View>
  );
}

// ============================================================
// صفحه اصلی Signals
// ============================================================
export default function SignalsScreen() {
  const [prices, setPrices] = useState<Record<CoinKey, number> | null>(null);
  const [signals, setSignals] = useState<Record<CoinKey, SignalResult> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCoin, setExpandedCoin] = useState<CoinKey | null>(null);
  const [chartCoin, setChartCoin] = useState<CoinKey | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<IntervalKey>('15m');
  const [aiStates, setAiStates] = useState<Record<CoinKey, AIState>>(() => {
    const init = {} as Record<CoinKey, AIState>;
    COINS.forEach((c) => { init[c] = { text: '', loading: false, visible: false, language: 'fa' }; });
    return init;
  });

  const ohlcHistories = useRef<Record<CoinKey, OHLCData[]>>({} as Record<CoinKey, OHLCData[]>);
  const klineUnsubs = useRef<Record<CoinKey, (() => void)>>({} as any);

  const loadCandles = useCallback(async (interval: IntervalKey = selectedInterval) => {
    const newSignals = {} as Record<CoinKey, SignalResult>;
    const newPrices = {} as Record<CoinKey, number>;

    await Promise.all(
      COINS.map(async (coin) => {
        const candles = await getKlines(coin, interval, 200);
        if (candles.length < 30) return;
        ohlcHistories.current[coin] = candles;
        newSignals[coin] = generateSignal(candles);
        newPrices[coin] = candles[candles.length - 1].close;
      })
    );

    setSignals((prev) => ({ ...(prev ?? {}), ...newSignals } as Record<CoinKey, SignalResult>));
    setPrices((prev) => ({ ...(prev ?? {}), ...newPrices } as Record<CoinKey, number>));
  }, [selectedInterval]);

  const onLivePrice = useCallback((coin: string, price: number) => {
    const key = coin as CoinKey;
    const candles = ohlcHistories.current[key];
    if (!candles || candles.length === 0) return;
    const lastIndex = candles.length - 1;
    const updatedLast: OHLCData = {
      ...candles[lastIndex],
      close: price,
      high: Math.max(candles[lastIndex].high, price),
      low: Math.min(candles[lastIndex].low, price),
    };
    const updated = [...candles.slice(0, lastIndex), updatedLast];
    ohlcHistories.current[key] = updated;
    setSignals((prev) => ({ ...(prev as any), [key]: generateSignal(updated) }));
    setPrices((prev) => ({ ...(prev as any), [key]: price }));
  }, []);

  // WebSocket کندل برای کوین باز شده
  const subscribeKline = useCallback((coin: CoinKey, interval: IntervalKey) => {
    // unsubscribe قبلی
    klineUnsubs.current[coin]?.();
    const unsub = subscribeKlineStream(coin, interval, (candle: OHLCCandle, isFinal: boolean) => {
      const candles = ohlcHistories.current[coin];
      if (!candles || candles.length === 0) return;
      const lastIndex = candles.length - 1;
      const last = candles[lastIndex];

      let updated: OHLCData[];
      if (candle.timestamp === last.timestamp) {
        // آپدیت کندل جاری
        const updatedLast: OHLCData = {
          timestamp: candle.timestamp,
          open: candle.open,
          high: Math.max(last.high, candle.high),
          low: Math.min(last.low, candle.low),
          close: candle.close,
          volume: candle.volume,
        };
        updated = [...candles.slice(0, lastIndex), updatedLast];
      } else if (isFinal) {
        // کندل جدید
        updated = [...candles, {
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }].slice(-200);
      } else {
        return;
      }

      ohlcHistories.current[coin] = updated;
      setSignals((prev) => ({ ...(prev as any), [coin]: generateSignal(updated) }));
      setPrices((prev) => ({ ...(prev as any), [coin]: candle.close }));
    });
    klineUnsubs.current[coin] = unsub;
  }, []);

  useEffect(() => {
    loadCandles();
    const unsubPrice = subscribeLivePrices(COINS, onLivePrice, setIsLive);
    const candleRefresh = setInterval(() => loadCandles(), 5 * 60 * 1000);
    return () => {
      unsubPrice();
      clearInterval(candleRefresh);
      Object.values(klineUnsubs.current).forEach((u) => u?.());
    };
  }, [loadCandles, onLivePrice]);

  // وقتی interval تغییر کرد
  useEffect(() => {
    loadCandles(selectedInterval);
    if (chartCoin) subscribeKline(chartCoin, selectedInterval);
  }, [selectedInterval]);

  // وقتی چارت یه کوین باز میشه
  useEffect(() => {
    if (chartCoin) subscribeKline(chartCoin, selectedInterval);
    else {
      Object.values(klineUnsubs.current).forEach((u) => u?.());
    }
  }, [chartCoin]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCandles();
    setRefreshing(false);
  };

  const handleAIAnalysis = async (coin: CoinKey) => {
    if (!signals) return;
    const sig = signals[coin];
    const lang = aiStates[coin].language;

    if (aiStates[coin].visible && aiStates[coin].text) {
      setAiStates((prev) => ({ ...prev, [coin]: { ...prev[coin], visible: !prev[coin].visible } }));
      return;
    }

    setAiStates((prev) => ({ ...prev, [coin]: { ...prev[coin], loading: true, visible: true } }));
    const result = await getAIAnalysis(COIN_NAMES[coin], sig, lang);
    setAiStates((prev) => ({ ...prev, [coin]: { ...prev[coin], text: result, loading: false } }));
  };

  const toggleLanguage = async (coin: CoinKey) => {
    if (!signals) return;
    const sig = signals[coin];
    const newLang = aiStates[coin].language === 'fa' ? 'en' : 'fa';
    setAiStates((prev) => ({ ...prev, [coin]: { ...prev[coin], language: newLang, loading: true, text: '' } }));
    const result = await getAIAnalysis(COIN_NAMES[coin], sig, newLang);
    setAiStates((prev) => ({ ...prev, [coin]: { ...prev[coin], text: result, loading: false } }));
  };

  const fmt = (n: number) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : n >= 1 ? n.toFixed(4)
    : n.toFixed(6);

  if (!prices || !signals) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading from Binance...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>AI Signals</Text>
        <View style={[styles.liveBadge, { backgroundColor: isLive ? '#22C55E22' : '#EF444422' }]}>
          <View style={[styles.liveDot, { backgroundColor: isLive ? '#22C55E' : '#EF4444' }]} />
          <Text style={[styles.liveBadgeText, { color: isLive ? '#22C55E' : '#EF4444' }]}>
            {isLive ? 'Binance Live' : 'Connecting...'}
          </Text>
        </View>
      </View>

      {/* Interval Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.intervalRow}>
        {INTERVALS.map((iv) => (
          <TouchableOpacity
            key={iv}
            style={[styles.intervalBtn, selectedInterval === iv && styles.intervalBtnActive]}
            onPress={() => setSelectedInterval(iv)}
          >
            <Text style={[styles.intervalBtnText, selectedInterval === iv && styles.intervalBtnTextActive]}>
              {iv}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Coin Cards */}
      {COINS.map((coin) => {
        const sig = signals[coin];
        const price = prices[coin];
        const ai = aiStates[coin];
        const isExpanded = expandedCoin === coin;
        const isChartOpen = chartCoin === coin;
        if (!sig || price === undefined) return null;
        const change = parseFloat(sig.change);
        const isPositive = change >= 0;

        return (
          <View key={coin} style={styles.card}>
            {/* کارت هدر */}
            <View style={styles.cardTop}>
              <View style={styles.coinLeft}>
                <View style={[styles.coinIcon, { backgroundColor: sig.color + '22' }]}>
                  <Text style={[styles.coinSymbolDisplay, { color: sig.color }]}>
                    {COIN_SYMBOLS_DISPLAY[coin]}
                  </Text>
                </View>
                <View>
                  <Text style={styles.coinName}>{COIN_NAMES[coin]}</Text>
                  <Text style={styles.coinTicker}>{coin.toUpperCase()}/USDT</Text>
                </View>
              </View>
              <View style={styles.coinRight}>
                <Text style={styles.priceText}>${fmt(price)}</Text>
                <Text style={[styles.changeText, { color: isPositive ? '#22C55E' : '#EF4444' }]}>
                  {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(3)}%
                </Text>
              </View>
            </View>

            {/* سیگنال */}
            <View style={styles.signalRow}>
              <View style={[styles.signalBadge, { backgroundColor: sig.color }]}>
                <Text style={styles.signalText}>{sig.signal}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>RSI: {sig.rsi}</Text>
                <View style={[styles.trendBadge, {
                  backgroundColor: sig.emaTrend === 'bullish' ? '#22C55E22' :
                    sig.emaTrend === 'bearish' ? '#EF444422' : '#FACC1522'
                }]}>
                  <Text style={[styles.trendText, {
                    color: sig.emaTrend === 'bullish' ? '#22C55E' :
                      sig.emaTrend === 'bearish' ? '#EF4444' : '#FACC15'
                  }]}>
                    {sig.emaTrend === 'bullish' ? '▲ Bullish' : sig.emaTrend === 'bearish' ? '▼ Bearish' : '◆ Sideways'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Confidence Bar */}
            <View style={styles.progressContainer}>
              <Text style={styles.confidenceLabel}>Confidence: {sig.confidence}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, {
                  width: `${sig.confidence}%` as any,
                  backgroundColor: sig.color,
                }]} />
              </View>
            </View>

            {/* Entry/SL/TP */}
            {sig.signal !== 'WAIT' && (
              <View style={styles.levelsBox}>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Entry</Text>
                  <Text style={styles.levelValue}>${fmt(sig.entryPrice)}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Stop Loss</Text>
                  <Text style={[styles.levelValue, { color: '#EF4444' }]}>${fmt(sig.stopLoss)}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Take Profit</Text>
                  <Text style={[styles.levelValue, { color: '#22C55E' }]}>${fmt(sig.takeProfit)}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Risk / Reward</Text>
                  <Text style={[styles.levelValue, {
                    color: sig.riskReward >= 2 ? '#22C55E' : sig.riskReward >= 1 ? '#FACC15' : '#EF4444'
                  }]}>1 : {sig.riskReward.toFixed(2)}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Support</Text>
                  <Text style={[styles.levelValue, { color: '#22C55E' }]}>${fmt(sig.support)}</Text>
                </View>
                <View style={styles.levelRow}>
                  <Text style={styles.levelLabel}>Resistance</Text>
                  <Text style={[styles.levelValue, { color: '#EF4444' }]}>${fmt(sig.resistance)}</Text>
                </View>
              </View>
            )}

            {/* دکمه چارت */}
            <TouchableOpacity
              style={styles.chartToggle}
              onPress={() => setChartCoin(isChartOpen ? null : coin)}
            >
              <Text style={styles.chartToggleText}>
                {isChartOpen ? '▲ Close Chart' : '📊 Professional Chart'}
              </Text>
            </TouchableOpacity>

            {/* چارت حرفه‌ای */}
            {isChartOpen && (
              <View style={styles.chartBox}>
                <ProfessionalChart
                  data={ohlcHistories.current[coin] ?? []}
                  signal={sig}
                  interval={selectedInterval}
                  width={CHART_WIDTH}
                />
                {/* Legend */}
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: '#22C55E' }]} />
                    <Text style={styles.legendText}>Support</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.legendText}>Resistance</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.legendText}>EMA7</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: '#8B5CF6' }]} />
                    <Text style={styles.legendText}>EMA21</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: '#6366F1' }]} />
                    <Text style={styles.legendText}>BB</Text>
                  </View>
                </View>
              </View>
            )}

            {/* دکمه اندیکاتورها */}
            <TouchableOpacity
              style={styles.indicatorToggle}
              onPress={() => setExpandedCoin(isExpanded ? null : coin)}
            >
              <Text style={styles.indicatorToggleText}>
                {isExpanded ? '▲ Hide Indicators' : '▼ Show Indicators'}
              </Text>
            </TouchableOpacity>

            {/* اندیکاتورها */}
            {isExpanded && (
              <View style={styles.indicatorBox}>
                <Text style={styles.indicatorSection}>MOMENTUM</Text>
                <IndicatorRow
                  label="RSI (14)"
                  value={`${sig.rsi} — ${sig.rsiSignal === 'oversold' ? '🟢 Oversold' : sig.rsiSignal === 'overbought' ? '🔴 Overbought' : '🟡 Neutral'}`}
                  color={sig.rsi < 30 ? '#22C55E' : sig.rsi > 70 ? '#EF4444' : '#FACC15'}
                />
                <IndicatorRow
                  label="MACD"
                  value={`${sig.macd.toFixed(4)}`}
                  subValue={`Signal: ${sig.macdSignal.toFixed(4)} | ${sig.macdCross !== 'none' ? `${sig.macdCross} cross ⚡` : 'Histogram: ' + sig.macdHistogram.toFixed(4)}`}
                  color={sig.macd > sig.macdSignal ? '#22C55E' : '#EF4444'}
                />
                <IndicatorRow
                  label="Stochastic K/D"
                  value={`${sig.stoch} / ${sig.stochSignal}`}
                  subValue={sig.stochCross !== 'none' ? `${sig.stochCross} cross ⚡` : sig.stoch < 20 ? 'Oversold' : sig.stoch > 80 ? 'Overbought' : 'Neutral'}
                  color={sig.stoch < 20 ? '#22C55E' : sig.stoch > 80 ? '#EF4444' : '#FACC15'}
                />

                <Text style={[styles.indicatorSection, { marginTop: 10 }]}>TREND</Text>
                <IndicatorRow label="EMA 7" value={`$${fmt(sig.ema7)}`} color={sig.ema7 > sig.ema21 ? '#22C55E' : '#EF4444'} />
                <IndicatorRow label="EMA 21" value={`$${fmt(sig.ema21)}`} color={sig.ema21 > sig.ema50 ? '#22C55E' : '#EF4444'} />
                <IndicatorRow label="EMA 50" value={`$${fmt(sig.ema50)}`} color="#94A3B8" />
                <IndicatorRow
                  label="EMA Trend"
                  value={sig.emaTrend === 'bullish' ? '▲ Bullish' : sig.emaTrend === 'bearish' ? '▼ Bearish' : '◆ Sideways'}
                  color={sig.emaTrend === 'bullish' ? '#22C55E' : sig.emaTrend === 'bearish' ? '#EF4444' : '#FACC15'}
                />

                <Text style={[styles.indicatorSection, { marginTop: 10 }]}>VOLATILITY</Text>
                <IndicatorRow label="BB Upper" value={`$${fmt(sig.bbUpper)}`} color="#6366F1" />
                <IndicatorRow
                  label="BB Position"
                  value={`${sig.bbPosition}%`}
                  subValue={sig.bbPosition < 20 ? 'Near lower band' : sig.bbPosition > 80 ? 'Near upper band' : 'Mid band'}
                  color={sig.bbPosition < 20 ? '#22C55E' : sig.bbPosition > 80 ? '#EF4444' : '#94A3B8'}
                />
                <IndicatorRow label="BB Lower" value={`$${fmt(sig.bbLower)}`} color="#6366F1" />
                <IndicatorRow label="ATR (14)" value={`$${fmt(sig.atr)}`} subValue={`${sig.atrPercent.toFixed(2)}% volatility`} color="#94A3B8" />

                <Text style={[styles.indicatorSection, { marginTop: 10 }]}>LEVELS</Text>
                <IndicatorRow label="Support" value={`$${fmt(sig.support)}`} color="#22C55E" />
                <IndicatorRow label="Resistance" value={`$${fmt(sig.resistance)}`} color="#EF4444" />
                <IndicatorRow label="Fib 61.8%" value={`$${fmt(sig.fibLevels.level618)}`} color="#F87171" />
                <IndicatorRow label="Fib 50.0%" value={`$${fmt(sig.fibLevels.level500)}`} color="#FB923C" />
                <IndicatorRow label="Fib 38.2%" value={`$${fmt(sig.fibLevels.level382)}`} color="#FACC15" />

                <Text style={[styles.indicatorSection, { marginTop: 10 }]}>VOLUME</Text>
                <IndicatorRow
                  label="Volume Signal"
                  value={sig.volumeSignal === 'high' ? '🟢 High' : sig.volumeSignal === 'low' ? '🔴 Low' : '🟡 Normal'}
                  color={sig.volumeSignal === 'high' ? '#22C55E' : sig.volumeSignal === 'low' ? '#EF4444' : '#FACC15'}
                />
              </View>
            )}

            {/* دکمه AI */}
            <TouchableOpacity
              style={[styles.aiButton, ai.visible && { backgroundColor: '#6366F122', borderColor: '#6366F1' }]}
              onPress={() => handleAIAnalysis(coin)}
            >
              <Text style={styles.aiButtonText}>
                {ai.visible ? '🤖 Hide Analysis' : '🤖 AI Analysis'}
              </Text>
            </TouchableOpacity>

            {/* AI پنل */}
            {ai.visible && (
              <View style={styles.aiBox}>
                <View style={styles.langRow}>
                  <TouchableOpacity
                    style={[styles.langBtn, ai.language === 'fa' && styles.langBtnActive]}
                    onPress={() => ai.language !== 'fa' && toggleLanguage(coin)}
                  >
                    <Text style={[styles.langBtnText, ai.language === 'fa' && styles.langBtnTextActive]}>
                      FA 🇮🇷
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.langBtn, ai.language === 'en' && styles.langBtnActive]}
                    onPress={() => ai.language !== 'en' && toggleLanguage(coin)}
                  >
                    <Text style={[styles.langBtnText, ai.language === 'en' && styles.langBtnTextActive]}>
                      EN 🇺🇸
                    </Text>
                  </TouchableOpacity>
                </View>
                {ai.loading ? (
                  <View style={styles.aiLoading}>
                    <ActivityIndicator size="small" color="#6366F1" />
                    <Text style={styles.aiLoadingText}>
                      {ai.language === 'fa' ? 'در حال تحلیل با Claude AI...' : 'Analyzing with Claude AI...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.aiText, ai.language === 'fa' && styles.aiTextRTL]}>
                    {ai.text}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020F3A' },
  loadingContainer: { flex: 1, backgroundColor: '#020F3A', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 12,
  },
  header: { color: '#FFFFFF', fontSize: 26, fontWeight: 'bold' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveBadgeText: { fontSize: 11, fontWeight: '700' },

  intervalRow: { paddingHorizontal: 20, marginBottom: 12 },
  intervalBtn: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#0D1F4A', marginRight: 8, borderWidth: 1, borderColor: '#1E3A6E',
  },
  intervalBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  intervalBtnText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  intervalBtnTextActive: { color: '#FFFFFF' },

  card: {
    backgroundColor: '#0D1F4A', borderRadius: 20, marginHorizontal: 20,
    marginBottom: 16, padding: 16, borderWidth: 1, borderColor: '#1E3A6E',
  },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  coinLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  coinSymbolDisplay: { fontSize: 20, fontWeight: 'bold' },
  coinName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  coinTicker: { color: '#475569', fontSize: 12, marginTop: 1 },
  coinRight: { alignItems: 'flex-end' },
  priceText: { color: '#E2E8F0', fontSize: 18, fontWeight: '700' },
  changeText: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  signalBadge: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 8 },
  signalText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: '#94A3B8', fontSize: 13 },
  trendBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  trendText: { fontSize: 12, fontWeight: '600' },

  progressContainer: { marginBottom: 12 },
  confidenceLabel: { color: '#64748B', fontSize: 12, marginBottom: 5 },
  progressBar: { height: 6, backgroundColor: '#1E3A6E', borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },

  levelsBox: { backgroundColor: '#071330', borderRadius: 12, padding: 12, marginBottom: 12 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#0F2550' },
  levelLabel: { color: '#64748B', fontSize: 13 },
  levelValue: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },

  chartToggle: {
    backgroundColor: '#071330', borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 8,
  },
  chartToggleText: { color: '#6366F1', fontSize: 13, fontWeight: '600' },
  chartBox: { marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#071330', padding: 4 },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendText: { color: '#64748B', fontSize: 10 },

  indicatorToggle: {
    backgroundColor: '#071330', borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 8,
  },
  indicatorToggleText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  indicatorBox: { backgroundColor: '#071330', borderRadius: 12, padding: 12, marginBottom: 8 },
  indicatorSection: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  indicatorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0F2550' },
  indicatorLabel: { color: '#64748B', fontSize: 13, flex: 1 },
  indicatorValue: { fontSize: 13, fontWeight: '600', textAlign: 'right' },
  indicatorSub: { color: '#475569', fontSize: 10, textAlign: 'right', marginTop: 2 },

  aiButton: {
    borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#1E3A6E', marginBottom: 8,
  },
  aiButtonText: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
  aiBox: { backgroundColor: '#071330', borderRadius: 12, padding: 14 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  langBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0D1F4A', borderWidth: 1, borderColor: '#1E3A6E' },
  langBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  langBtnText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  langBtnTextActive: { color: '#FFFFFF' },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  aiLoadingText: { color: '#64748B', fontSize: 13 },
  aiText: { color: '#CBD5E1', fontSize: 14, lineHeight: 22 },
  aiTextRTL: { textAlign: 'right', writingDirection: 'rtl' },
});