// ============================================================
// app/(tabs)/index.tsx
// صفحه اصلی — قیمت لایو Binance + Market Mood + سیگنال‌ها
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  COINS,
  COIN_NAMES,
  CoinKey,
  getKlines,
  subscribeLivePrices,
} from '../../services/binanceApi';
import { OHLCData, SignalResult, generateSignal } from '../../services/signalEngine';

const COIN_SYMBOLS: Record<CoinKey, string> = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL', xrp: 'XRP',
  bnb: 'BNB', doge: 'DOGE', ada: 'ADA', avax: 'AVAX',
};

type PriceData = Record<CoinKey, number>;

export default function HomeScreen() {
  const [prices, setPrices] = useState<Partial<PriceData>>({});
  const [signals, setSignals] = useState<Partial<Record<CoinKey, SignalResult>>>({});
  const [lastUpdate, setLastUpdate] = useState('');
  const [isLive, setIsLive] = useState(false);

  const ohlcHistories = useRef<Record<CoinKey, OHLCData[]>>({} as Record<CoinKey, OHLCData[]>);

  const loadData = useCallback(async () => {
    const newSignals: Partial<Record<CoinKey, SignalResult>> = {};
    const newPrices: Partial<PriceData> = {};

    await Promise.all(
      COINS.map(async (coin) => {
        const candles = await getKlines(coin, '15m', 200);
        if (candles.length < 30) return;
        ohlcHistories.current[coin] = candles;
        newSignals[coin] = generateSignal(candles);
        newPrices[coin] = candles[candles.length - 1].close;
      })
    );

    setSignals((prev) => ({ ...prev, ...newSignals }));
    setPrices((prev) => ({ ...prev, ...newPrices }));
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

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
    const updatedCandles = [...candles.slice(0, lastIndex), updatedLast];
    ohlcHistories.current[key] = updatedCandles;

    setSignals((prev) => ({ ...prev, [key]: generateSignal(updatedCandles) }));
    setPrices((prev) => ({ ...prev, [key]: price }));
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeLivePrices(COINS, onLivePrice, setIsLive);
    const interval = setInterval(loadData, 5 * 60 * 1000); // هر ۵ دقیقه کندل‌ها رو refresh
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadData, onLivePrice]);

  const signalList = Object.values(signals);
  const longCount = signalList.filter((s) => s?.signal === 'LONG').length;
  const shortCount = signalList.filter((s) => s?.signal === 'SHORT').length;
  const waitCount = signalList.filter((s) => s?.signal === 'WAIT').length;
  const marketMood =
    longCount > shortCount ? 'BULLISH' : shortCount > longCount ? 'BEARISH' : 'SIDEWAYS';
  const marketColor =
    marketMood === 'BULLISH' ? '#22C55E' : marketMood === 'BEARISH' ? '#EF4444' : '#FACC15';

  const formatPrice = (price?: number) => {
    if (!price) return '...';
    if (price < 1) return price.toFixed(5);
    if (price < 10) return price.toFixed(4);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>CryptoEdge AI</Text>
          <Text style={styles.subtitle}>Updated: {lastUpdate || '...'}</Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: isLive ? '#22C55E22' : '#EF444422' }]}>
          <View style={[styles.liveDot, { backgroundColor: isLive ? '#22C55E' : '#EF4444' }]} />
          <Text style={[styles.liveBadgeText, { color: isLive ? '#22C55E' : '#EF4444' }]}>
            {isLive ? 'LIVE' : 'Connecting'}
          </Text>
        </View>
      </View>

      {/* Market Mood */}
      <View style={[styles.moodCard, { borderColor: marketColor }]}>
        <Text style={styles.moodLabel}>Market Mood</Text>
        <Text style={[styles.moodValue, { color: marketColor }]}>
          {marketMood === 'BULLISH' ? '▲' : marketMood === 'BEARISH' ? '▼' : '◆'} {marketMood}
        </Text>
        <View style={styles.moodRow}>
          <View style={styles.moodStat}>
            <Text style={[styles.moodCount, { color: '#22C55E' }]}>{longCount}</Text>
            <Text style={[styles.moodStatLabel, { color: '#22C55E' }]}>LONG</Text>
          </View>
          <View style={styles.moodDivider} />
          <View style={styles.moodStat}>
            <Text style={[styles.moodCount, { color: '#EF4444' }]}>{shortCount}</Text>
            <Text style={[styles.moodStatLabel, { color: '#EF4444' }]}>SHORT</Text>
          </View>
          <View style={styles.moodDivider} />
          <View style={styles.moodStat}>
            <Text style={[styles.moodCount, { color: '#FACC15' }]}>{waitCount}</Text>
            <Text style={[styles.moodStatLabel, { color: '#FACC15' }]}>WAIT</Text>
          </View>
        </View>
      </View>

      {/* Prices Grid */}
      <Text style={styles.sectionTitle}>LIVE PRICES · BINANCE</Text>
      <View style={styles.pricesGrid}>
        {COINS.map((coin) => {
          const sig = signals[coin];
          const price = prices[coin];
          const color = sig?.color ?? '#FACC15';
          const signal = sig?.signal ?? 'WAIT';
          const change = parseFloat(sig?.change ?? '0');
          const isPositive = change >= 0;

          return (
            <View key={coin} style={[styles.priceCard, { borderColor: color + '33' }]}>
              <View style={styles.priceCardTop}>
                <Text style={styles.coinSymbol}>{COIN_SYMBOLS[coin]}</Text>
                <View style={[styles.signalBadge, { backgroundColor: color + '22' }]}>
                  <Text style={[styles.signalBadgeText, { color }]}>{signal}</Text>
                </View>
              </View>
              <Text style={styles.coinName}>{COIN_NAMES[coin]}</Text>
              <Text style={styles.coinPrice}>${formatPrice(price)}</Text>
              <View style={styles.priceCardBottom}>
                <Text style={[styles.changeText, { color: isPositive ? '#22C55E' : '#EF4444' }]}>
                  {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(3)}%
                </Text>
                {sig && (
                  <Text style={styles.rsiText}>RSI {sig.rsi}</Text>
                )}
              </View>
              {sig && (
                <View style={styles.confidenceBar}>
                  <View
                    style={[
                      styles.confidenceFill,
                      { width: `${sig.confidence}%` as any, backgroundColor: color },
                    ]}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isLive ? '#22C55E' : '#FACC15' }]} />
          <Text style={styles.statusText}>AI Engine Active · Binance WebSocket</Text>
        </View>
        <Text style={styles.statusInfo}>
          RSI · MACD · Bollinger · Stochastic · ATR · EMA · Volume · Fibonacci
        </Text>
        <Text style={styles.statusInfo}>
          Tracking {COINS.length} coins · 15m candles · Live data
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Text style={styles.refreshBtnText}>↻ Refresh Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020F3A', padding: 20 },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginTop: 50, marginBottom: 24,
  },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: '#64748B', fontSize: 12, marginTop: 2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveBadgeText: { fontSize: 12, fontWeight: '700' },

  moodCard: {
    backgroundColor: '#0D1F4A', borderRadius: 20, padding: 20,
    marginBottom: 24, borderWidth: 1.5, alignItems: 'center',
  },
  moodLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 6 },
  moodValue: { fontSize: 34, fontWeight: 'bold', marginBottom: 16 },
  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  moodStat: { alignItems: 'center' },
  moodCount: { fontSize: 24, fontWeight: 'bold' },
  moodStatLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  moodDivider: { width: 1, height: 32, backgroundColor: '#1E3A6E' },

  sectionTitle: {
    color: '#475569', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 12,
  },
  pricesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  priceCard: {
    backgroundColor: '#0D1F4A', borderRadius: 16, padding: 14,
    width: '47.5%', borderWidth: 1,
  },
  priceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  coinSymbol: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  signalBadge: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  signalBadgeText: { fontSize: 11, fontWeight: 'bold' },
  coinName: { color: '#475569', fontSize: 11, marginBottom: 6 },
  coinPrice: { color: '#E2E8F0', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  priceCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  changeText: { fontSize: 11, fontWeight: '600' },
  rsiText: { color: '#64748B', fontSize: 11 },
  confidenceBar: { height: 3, backgroundColor: '#1E3A6E', borderRadius: 2 },
  confidenceFill: { height: 3, borderRadius: 2 },

  statusCard: { backgroundColor: '#0D1F4A', borderRadius: 16, padding: 20, marginBottom: 40 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  statusInfo: { color: '#475569', fontSize: 12, marginTop: 4 },
  refreshBtn: {
    marginTop: 14, backgroundColor: '#1E3A6E', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  refreshBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
});