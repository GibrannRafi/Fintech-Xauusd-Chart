# ⚡ XAUUSD Live Dashboard

Dashboard trading realtime XAUUSD — RSI akurat, multi-timeframe, push notification HP.

---

## 🚀 DEPLOY KE VERCEL (3 Langkah)

### Step 1 — Daftar Finnhub (gratis, 5 menit)
- Buka https://finnhub.io/register → daftar → copy API Key

### Step 2 — Upload ke GitHub
- Buka github.com → New Repository → "xauusd-dashboard"
- Extract ZIP ini → drag semua file → Commit

### Step 3 — Deploy
- Buka vercel.com → Login GitHub → New Project → Import repo
- Settings → Environment Variables → tambah: FINNHUB_API_KEY = (api key kamu)
- Redeploy → selesai!

---

## 📊 Fitur
- Harga realtime update tiap 5 detik
- Chart candlestick + RSI akurat (200+ candle)
- Timeframe: M1, M5, M15, M30, H1, H4
- RSI Zones: 15/20/30/50/70/80/85
- Push notification ke HP saat zona Buy/Sell
- Daily profit report (tanggal + profit + catatan)
- Equity curve
- PWA (install ke HP)

---

## 📍 RSI Zones
- ≤15 Entry Buy (Alert)
- ≤20 Buy (Alert)
- ≤30 Zona Buy
- ≤50 Sideways
- ≤70 Zona Sell
- ≤80 Sell (Alert)
- >80 Entry Sell (Alert)
