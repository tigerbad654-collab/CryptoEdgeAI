export function getMarketTrend(
  currentPrice: number,
  previousPrice: number
) {
  const change =
    ((currentPrice - previousPrice) /
      previousPrice) *
    100;

  if (change > 0.05) {
    return {
      trend: 'BULLISH',
      change: Number(change.toFixed(2)),
    };
  }

  if (change < -0.05) {
    return {
      trend: 'BEARISH',
      change: Number(change.toFixed(2)),
    };
  }

  return {
    trend: 'SIDEWAYS',
    change: Number(change.toFixed(2)),
  };
}