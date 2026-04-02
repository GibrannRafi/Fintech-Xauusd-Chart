// pages/api/xauusd.js
// Fetches XAUUSD (Gold/USD) data
// Uses Metals-API or fallback to generate realistic data

export default async function handler(req, res) {
  try {
    // Try fetching from a free metals API
    // Using metals-api.com free tier or frankfurter as fallback
    // For production, use: https://metals-api.com or https://www.goldapi.io
    
    const apiKey = process.env.METALS_API_KEY || process.env.GOLD_API_KEY;
    
    let price = null;
    
    if (apiKey && process.env.GOLD_API_KEY) {
      // GoldAPI.io
      try {
        const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
          headers: { 'x-access-token': process.env.GOLD_API_KEY }
        });
        if (response.ok) {
          const data = await response.json();
          price = data.price;
        }
      } catch (e) {}
    }

    if (!price) {
      // Use Alpha Vantage free tier
      try {
        const avKey = process.env.ALPHAVANTAGE_KEY || 'demo';
        const response = await fetch(
          `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=XAU&to_currency=USD&apikey=${avKey}`
        );
        if (response.ok) {
          const data = await response.json();
          const rate = data['Realtime Currency Exchange Rate'];
          if (rate) price = parseFloat(rate['5. Exchange Rate']);
        }
      } catch (e) {}
    }

    // Generate realistic candle data for chart
    const basePrice = price || 2320 + (Math.random() * 100 - 50);
    const candles = generateCandles(basePrice, 200);
    const rsi = calculateRSI(candles.map(c => c.close), 14);

    res.status(200).json({
      currentPrice: candles[candles.length - 1].close,
      candles: candles,
      rsi: rsi,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function generateCandles(basePrice, count) {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;
  
  for (let i = count; i >= 0; i--) {
    const time = now - i * 3600; // 1h candles
    const volatility = price * 0.003;
    const open = price;
    const change = (Math.random() - 0.48) * volatility;
    const close = Math.max(1800, open + change);
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    candles.push({ time, open, high, low, close });
    price = close;
  }
  return candles;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  
  const rsiValues = [];
  let gains = 0, losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    rsiValues.push(Math.round(rsi * 100) / 100);
  }
  
  return rsiValues;
}
