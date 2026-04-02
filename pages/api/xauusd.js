// pages/api/xauusd.js
// Primary:  Twelve Data  — https://twelvedata.com (free: 800 req/day, realtime XAU/USD)
// Fallback: Finnhub      — https://finnhub.io    (free: 60 req/min,  OANDA:XAU_USD)
// Symbol: XAU/USD (spot gold)

// Twelve Data interval mapping
const TD_INTERVAL = { M1:'1min', M5:'5min', M15:'15min', M30:'30min', H1:'1h', H4:'4h' };
// Finnhub resolution mapping (minutes)
const FH_RESOLUTION = { M1:1, M5:5, M15:15, M30:30, H1:60, H4:240 };

// ─── RSI Wilder Smoothing (standard/accurate) ───────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  
  // First avgGain / avgLoss = simple average of first `period` changes
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains  += d;
    else        losses -= d;
  }
  let avgGain = gains  / period;
  let avgLoss = losses / period;
  
  const rsi = [];
  for (let i = period; i < closes.length; i++) {
    // From index period+1 onwards: Wilder smoothing
    if (i > period) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0))  / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgLoss === 0) { rsi.push(100); continue; }
    const rs = avgGain / avgLoss;
    rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }
  return rsi;
}

// ─── Twelve Data candle fetch ────────────────────────────────────────────────
async function fetchTwelveData(interval, outputsize, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${outputsize}&order=ASC&apikey=${apiKey}`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'xauusd-dashboard/2.0' } });
  const data = await res.json();

  if (data.status === 'error') throw new Error('TwelveData: ' + data.message);
  if (!data.values || data.values.length === 0) throw new Error('TwelveData: no values');

  // TwelveData returns newest first when order not set, we set ASC
  const candles = data.values.map(v => ({
    time:  Math.floor(new Date(v.datetime).getTime() / 1000),
    open:  parseFloat(v.open),
    high:  parseFloat(v.high),
    low:   parseFloat(v.low),
    close: parseFloat(v.close),
  }));

  return candles;
}

// ─── Finnhub candle fetch ────────────────────────────────────────────────────
async function fetchFinnhub(resolution, apiKey) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - resolution * 60 * 250;
  const url  = `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;
  const res  = await fetch(url);
  const data = await res.json();

  if (data.s !== 'ok') throw new Error('Finnhub: ' + (data.s || 'no data'));

  return data.t.map((time, i) => ({
    time,
    open:  data.o[i],
    high:  data.h[i],
    low:   data.l[i],
    close: data.c[i],
  }));
}

// ─── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { tf = 'H1' } = req.query;

  const tdKey = process.env.TWELVEDATA_API_KEY;
  const fhKey = process.env.FINNHUB_API_KEY;

  let candles = null;
  let source  = 'simulated';

  // 1. Try Twelve Data
  if (tdKey) {
    try {
      candles = await fetchTwelveData(TD_INTERVAL[tf] || '1h', 200, tdKey);
      source  = 'twelvedata';
    } catch (e) {
      console.warn('[xauusd] TwelveData failed:', e.message);
    }
  }

  // 2. Try Finnhub
  if (!candles && fhKey) {
    try {
      candles = await fetchFinnhub(FH_RESOLUTION[tf] || 60, fhKey);
      source  = 'finnhub';
    } catch (e) {
      console.warn('[xauusd] Finnhub failed:', e.message);
    }
  }

  // 3. Simulated fallback (realistic, mean-reverting)
  if (!candles || candles.length === 0) {
    candles = generateSimulated(2355, 220, FH_RESOLUTION[tf] || 60);
    source  = 'simulated';
  }

  // Sort by time ascending (safety)
  candles.sort((a, b) => a.time - b.time);

  const closes     = candles.map(c => c.close);
  const rsiValues  = calcRSI(closes, 14);
  const currentRSI = rsiValues[rsiValues.length - 1] ?? null;

  return res.status(200).json({
    ok:           true,
    source,
    tf,
    currentPrice: candles[candles.length - 1].close,
    currentRSI,
    candles,
    rsi:          rsiValues,
    lastUpdated:  new Date().toISOString(),
  });
}

// ─── Realistic simulated candles (mean-reverting random walk) ────────────────
function generateSimulated(basePrice, count, resMin) {
  const candles = [];
  const now     = Math.floor(Date.now() / 1000);
  let   price   = basePrice;
  let   trend   = 0;

  for (let i = count; i >= 0; i--) {
    const time  = now - i * resMin * 60;
    // Slight mean reversion + momentum
    trend = trend * 0.92 + (basePrice - price) * 0.00008 + (Math.random() - 0.5) * 0.4;
    const vol   = price * 0.0018;
    const open  = price;
    const move  = trend + (Math.random() - 0.5) * vol;
    const close = Math.max(1900, Math.min(3000, open + move));
    const wick  = Math.abs(move) * 0.4 + Math.random() * vol * 0.3;
    const high  = Math.max(open, close) + wick;
    const low   = Math.min(open, close) - wick;
    candles.push({ time, open, high, low, close });
    price = close;
  }
  return candles;
}
