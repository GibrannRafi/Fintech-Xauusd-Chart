// pages/api/xauusd.js
// Twelve Data primary (XAU/USD spot) → Finnhub fallback → simulated
// RSI: Wilder smoothing (standard), + SMA of RSI (MA RSI line, like TradingView)

const TD_INTERVAL  = { M1:'1min', M5:'5min', M15:'15min', M30:'30min', H1:'1h', H4:'4h' };
const FH_RES       = { M1:1, M5:5, M15:15, M30:30, H1:60, H4:240 };

// Wilder RSI (matches TradingView default)
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  const rsi = [];
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
      al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    rsi.push(al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2)));
  }
  return rsi;
}

// SMA of RSI values (the yellow MA line in your screenshot)
function calcSmaRsi(rsiArr, maPeriod = 14) {
  const sma = [];
  for (let i = 0; i < rsiArr.length; i++) {
    if (i < maPeriod - 1) { sma.push(null); continue; }
    const slice = rsiArr.slice(i - maPeriod + 1, i + 1);
    sma.push(parseFloat((slice.reduce((a, b) => a + b, 0) / maPeriod).toFixed(2)));
  }
  return sma;
}

async function fromTwelveData(interval, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=300&order=ASC&apikey=${apiKey}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'xauusd-dash/3' } });
  const d = await r.json();
  if (d.status === 'error') throw new Error('TD: ' + d.message);
  if (!d.values?.length) throw new Error('TD: empty');
  return d.values.map(v => ({
    time:  Math.floor(new Date(v.datetime).getTime() / 1000),
    open:  parseFloat(v.open),
    high:  parseFloat(v.high),
    low:   parseFloat(v.low),
    close: parseFloat(v.close),
  }));
}

async function fromFinnhub(resolution, apiKey) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - resolution * 60 * 300;
  const r = await fetch(`https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`);
  const d = await r.json();
  if (d.s !== 'ok') throw new Error('FH: ' + d.s);
  return d.t.map((time, i) => ({ time, open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i] }));
}

function simulate(base, count, resMin) {
  const now = Math.floor(Date.now() / 1000);
  let price = base, trend = 0;
  return Array.from({ length: count + 1 }, (_, idx) => {
    const i = count - idx;
    trend = trend * 0.93 + (base - price) * 0.00006 + (Math.random() - 0.5) * 0.3;
    const vol = price * 0.0016;
    const open = price;
    const move = trend + (Math.random() - 0.5) * vol;
    const close = Math.max(1800, open + move);
    const wick = Math.abs(move) * 0.5 + Math.random() * vol * 0.25;
    price = close;
    return { time: now - i * resMin * 60, open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close };
  });
}

export default async function handler(req, res) {
  const { tf = 'H1' } = req.query;
  const tdKey = process.env.TWELVEDATA_API_KEY;
  const fhKey = process.env.FINNHUB_API_KEY;

  let candles = null, source = 'simulated';

  if (tdKey) {
    try { candles = await fromTwelveData(TD_INTERVAL[tf] || '1h', tdKey); source = 'twelvedata'; }
    catch (e) { console.warn('TD failed:', e.message); }
  }
  if (!candles && fhKey) {
    try { candles = await fromFinnhub(FH_RES[tf] || 60, fhKey); source = 'finnhub'; }
    catch (e) { console.warn('FH failed:', e.message); }
  }
  if (!candles?.length) {
    // Simulated uses ~4600 base like Pepperstone XAU pricing
    candles = simulate(4600, 250, FH_RES[tf] || 60);
    source = 'simulated';
  }

  candles.sort((a, b) => a.time - b.time);

  const closes  = candles.map(c => c.close);
  const rsi     = calcRSI(closes, 14);
  const maRsi   = calcSmaRsi(rsi, 14);  // MA of RSI (yellow line)

  return res.status(200).json({
    ok: true, source, tf,
    currentPrice: candles.at(-1).close,
    currentRSI:   rsi.at(-1) ?? null,
    currentMaRsi: maRsi.at(-1) ?? null,
    candles, rsi, maRsi,
    lastUpdated: new Date().toISOString(),
  });
}
