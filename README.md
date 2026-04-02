# ⚡ XAUUSD Gold Dashboard

Dashboard trading real-time untuk monitoring XAUUSD dengan RSI zones, daily profit tracker, dan push notification ke HP.

## 🚀 Fitur

- 📊 **Chart XAUUSD** — Candlestick + RSI real-time (auto-refresh 30 detik)
- 📍 **RSI Zone Lines** — 7 level: 15 Entry Buy, 20 Buy, 30 Zona Buy, 50 Sideways, 70 Zona Sell, 80 Sell, 85 Entry Sell
- 🔔 **Push Notification HP** — Alert otomatis saat RSI masuk zona Buy/Sell
- 📋 **Daily Profit Report** — Catat & track profit harian
- 📈 **Statistik & Equity Curve** — Win rate, total profit, dll
- 📱 **PWA** — Install ke HP seperti app native

---

## 🛠️ Setup & Deploy ke Vercel

### 1. Clone / Upload ke GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/USERNAME/xauusd-dashboard.git
git push -u origin main
```

### 2. Deploy ke Vercel
1. Buka [vercel.com](https://vercel.com) → Login
2. Klik **"New Project"**
3. Import repo dari GitHub
4. Klik **"Deploy"** (langsung jalan tanpa konfigurasi tambahan)

### 3. (Opsional) Pasang API Key untuk harga real XAUUSD
Di Vercel Dashboard → Settings → Environment Variables:

| Key | Value | Sumber |
|-----|-------|--------|
| `GOLD_API_KEY` | xxx | [goldapi.io](https://www.goldapi.io) (gratis) |
| `ALPHAVANTAGE_KEY` | xxx | [alphavantage.co](https://www.alphavantage.co) (gratis) |

Tanpa API key, dashboard tetap berjalan dengan data simulasi realistis.

---

## 📱 Install ke HP (PWA)

### Android (Chrome):
1. Buka website di Chrome
2. Tap menu (3 titik) → **"Add to Home Screen"**
3. Konfirmasi → App terpasang!

### iPhone (Safari):
1. Buka website di Safari
2. Tap tombol Share → **"Add to Home Screen"**
3. Konfirmasi → App terpasang!

---

## 🔔 Notifikasi HP

1. Buka website → Tap tombol 🔕 di pojok kanan atas
2. Izinkan notifikasi saat diminta
3. Notifikasi akan otomatis muncul ketika:
   - RSI ≤ 20 → **🟢 BUY SIGNAL**
   - RSI ≤ 15 → **🟢 ENTRY BUY KUAT**
   - RSI ≥ 80 → **🔴 SELL SIGNAL**
   - RSI ≥ 85 → **🔴 ENTRY SELL KUAT**

> ⚠️ **Agar notifikasi bekerja di HP**: Website harus diakses via HTTPS (otomatis di Vercel). Pastikan browser/HP mengizinkan notifikasi dari website ini.

---

## 💾 Persistent Data (Production)

Untuk menyimpan laporan secara permanen (tidak hilang saat restart), ganti storage di `pages/api/reports.js` dengan:

**Vercel KV (Gratis):**
```bash
npm install @vercel/kv
```

**Supabase (Gratis):**
```bash
npm install @supabase/supabase-js
```

---

## 📁 Struktur File

```
xauusd-dashboard/
├── pages/
│   ├── index.js          # Dashboard utama
│   └── api/
│       ├── xauusd.js     # API XAUUSD + RSI calculation
│       ├── reports.js    # CRUD profit reports
│       └── subscribe.js  # Push notification subscriptions
├── public/
│   ├── sw.js             # Service Worker (push notif)
│   ├── manifest.json     # PWA manifest
│   └── icon-*.png        # App icons
├── vercel.json           # Vercel config
└── package.json
```

---

## ⚙️ RSI Zones

| Level | Label | Aksi |
|-------|-------|------|
| 15 | Entry Buy | ✅ BUY KUAT |
| 20 | Buy | ✅ BUY |
| 30 | Zona Buy | 🟩 Siap-siap Buy |
| 50 | Sideways | 🟡 Tunggu |
| 70 | Zona Sell | 🟧 Siap-siap Sell |
| 80 | Sell | 🔴 SELL |
| 85 | Entry Sell | 🔴 SELL KUAT |
