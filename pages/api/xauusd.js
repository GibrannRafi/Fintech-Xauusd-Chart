// pages/api/xauusd.js
// Fetches real OHLCV candle data from Finnhub (free tier)
// Symbol: OANDA:XAU_USD
// Timeframes: 1, 5, 15, 30, 60, 240 (minutes)

const TF_MAP = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240 };

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const rsi = [];
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }
  return rsi;
}

export default async function handler(req, res) {
  const { tf = 'H1' } = req.query;
  const resolution = TF_MAP[tf] || 60;

  // Calculate time range — enough candles for accurate RSI (at least 200)
  const to = Math.floor(Date.now() / 1000);
  const candleCount = 250;
  const from = to - resolution * 60 * candleCount;

  const apiKey = process.env.FINNHUB_API_KEY || 'demo';

  try {
    // Finnhub OANDA forex candle endpoint
    const url = `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'xauusd-dashboard/1.0' } });
    const data = await resp.json();

    if (data.s === 'ok' && data.t && data.t.length > 0) {
      const candles = data.t.map((time, i) => ({
        time,
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v ? data.v[i] : 0,
      }));

      const closes = candles.map(c => c.close);
      const rsiValues = calcRSI(closes, 14);
      const currentPrice = candles[candles.length - 1].close;
      const currentRSI = rsiValues[rsiValues.length - 1];

      return res.status(200).json({
        ok: true,
        source: 'finnhub',
        currentPrice,
        currentRSI,
        candles,
        rsi: rsiValues,
        tf,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Fallback: try Alpha Vantage
    throw new Error('Finnhub returned no data: ' + (data.s || JSON.stringify(data)));
  } catch (err) {
    console.warn('Finnhub failed, using Alpha Vantage fallback:', err.message);

    // Alpha Vantage fallback for H1
    try {
      const avKey = process.env.ALPHAVANTAGE_KEY || 'demo';
      const avInterval = resolution <= 5 ? '5min' : resolution <= 15 ? '15min' : resolution <= 30 ? '30min' : '60min';
      const avUrl = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=XAU&to_symbol=USD&interval=${avInterval}&outputsize=full&apikey=${avKey}`;
      const avResp = await fetch(avUrl);
      const avData = await avResp.json();
      const series = avData[`Time Series FX (${avInterval})`];

      if (series) {
        const entries = Object.entries(series).sort((a, b) => new Date(a[0]) - new Date(b[0])).slice(-200);
        const candles = entries.map(([dateStr, v]) => ({
          time: Math.floor(new Date(dateStr).getTime() / 1000),
          open: parseFloat(v['1. open']),
          high: parseFloat(v['2. high']),
          low: parseFloat(v['3. low']),
          close: parseFloat(v['4. close']),
        }));
        const closes = candles.map(c => c.close);
        const rsiValues = calcRSI(closes, 14);
        return res.status(200).json({
          ok: true,
          source: 'alphavantage',
          currentPrice: candles[candles.length - 1].close,
          currentRSI: rsiValues[rsiValues.length - 1],
          candles,
          rsi: rsiValues,
          tf,
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (e2) {
      console.warn('Alpha Vantage also failed:', e2.message);
    }

    // Final fallback: realistic simulated data
    const basePrice = 2340 + Math.random() * 60;
    const candles = generateSimulatedCandles(basePrice, 200, resolution);
    const closes = candles.map(c => c.close);
    const rsiValues = calcRSI(closes, 14);
    return res.status(200).json({
      ok: true,
      source: 'simulated',
      currentPrice: candles[candles.length - 1].close,
      currentRSI: rsiValues[rsiValues.length - 1],
      candles,
      rsi: rsiValues,
      tf,
      lastUpdated: new Date().toISOString(),
    });
  }
}

function generateSimulatedCandles(basePrice, count, resolutionMin) {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;
  // Add slight trend + mean reversion
  let trend = (Math.random() - 0.5) * 0.0002;
  for (let i = count; i >= 0; i--) {
    const time = now - i * resolutionMin * 60;
    // Mean reversion toward base
    trend = trend * 0.98 + (basePrice - price) * 0.0001;
    const vol = price * 0.0025;
    const open = price;
    const move = trend + (Math.random() - 0.5) * vol;
    const close = Math.max(1900, open + move);
    const wick = Math.random() * vol * 0.6;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    candles.push({ time, open, high, low, close });
    price = close;
  }
  return candles;
}
