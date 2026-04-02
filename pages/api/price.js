// pages/api/price.js
export default async function handler(req, res) {
  const tdKey = process.env.TWELVEDATA_API_KEY;
  const fhKey = process.env.FINNHUB_API_KEY;

  if (tdKey) {
    try {
      const r = await fetch(`https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${tdKey}`);
      const d = await r.json();
      if (d.close) {
        const price = parseFloat(d.close);
        const prev  = parseFloat(d.previous_close);
        return res.status(200).json({
          price, prev,
          change:    parseFloat((price - prev).toFixed(2)),
          changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
          source: 'twelvedata',
        });
      }
    } catch (e) {}
  }

  if (fhKey) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:XAU_USD&token=${fhKey}`);
      const d = await r.json();
      if (d.c) {
        return res.status(200).json({
          price:     d.c,
          prev:      d.pc,
          change:    parseFloat((d.c - d.pc).toFixed(2)),
          changePct: parseFloat(((d.c - d.pc) / d.pc * 100).toFixed(2)),
          source: 'finnhub',
        });
      }
    } catch (e) {}
  }

  // Fallback simulated ~4600 range
  const base  = 4600 + (Math.random() - 0.5) * 40;
  const chg   = parseFloat(((Math.random() - 0.5) * 6).toFixed(2));
  return res.status(200).json({
    price: parseFloat(base.toFixed(2)), change: chg,
    changePct: parseFloat((chg / base * 100).toFixed(3)),
    source: 'simulated',
  });
}
