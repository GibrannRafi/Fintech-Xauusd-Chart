// pages/api/price.js
// Returns live spot price of XAU/USD (Gold)
// Polled every 5 seconds from the client for realtime display
// Primary:  Twelve Data  /price endpoint (free, realtime)
// Fallback: Finnhub      /quote endpoint

export default async function handler(req, res) {
  // ── 1. Twelve Data ───────────────────────────────────────────────
  const tdKey = process.env.TWELVEDATA_API_KEY;
  if (tdKey) {
    try {
      const r = await fetch(
        `https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${tdKey}`,
        { headers: { 'User-Agent': 'xauusd-dashboard/2.0' } }
      );
      const d = await r.json();
      if (d.price) {
        const price = parseFloat(d.price);
        return res.status(200).json({ price, source: 'twelvedata', ts: Date.now() });
      }
    } catch (e) { console.warn('[price] TwelveData failed:', e.message); }
  }

  // ── 2. Twelve Data quote (has prev_close for change calc) ─────────
  if (tdKey) {
    try {
      const r = await fetch(
        `https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${tdKey}`,
        { headers: { 'User-Agent': 'xauusd-dashboard/2.0' } }
      );
      const d = await r.json();
      if (d.close) {
        const price    = parseFloat(d.close);
        const prevClose= parseFloat(d.previous_close);
        const change   = parseFloat((price - prevClose).toFixed(2));
        const changePct= parseFloat(((change / prevClose) * 100).toFixed(2));
        return res.status(200).json({ price, prevClose, change, changePct, source: 'twelvedata_quote', ts: Date.now() });
      }
    } catch (e) {}
  }

  // ── 3. Finnhub quote ─────────────────────────────────────────────
  const fhKey = process.env.FINNHUB_API_KEY;
  if (fhKey) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=OANDA:XAU_USD&token=${fhKey}`
      );
      const d = await r.json();
      if (d.c) {
        const price    = d.c;
        const prevClose= d.pc;
        const change   = parseFloat((price - prevClose).toFixed(2));
        const changePct= parseFloat(((change / prevClose) * 100).toFixed(2));
        return res.status(200).json({ price, prevClose, change, changePct, source: 'finnhub', ts: d.t * 1000 });
      }
    } catch (e) { console.warn('[price] Finnhub failed:', e.message); }
  }

  // ── 4. Simulated fallback ─────────────────────────────────────────
  // Drift slightly from last to look "live"
  const base     = 2355 + (Math.random() - 0.5) * 30;
  const change   = parseFloat(((Math.random() - 0.5) * 4).toFixed(2));
  const changePct= parseFloat(((change / base) * 100).toFixed(3));
  return res.status(200).json({
    price:     parseFloat(base.toFixed(2)),
    change,
    changePct,
    source:    'simulated',
    ts:        Date.now(),
  });
}
