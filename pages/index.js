import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

// RSI levels matching screenshot exactly
const RSI_LEVELS = [
  { level: 80.09, label: 'Sell',       color: '#ef4444', dash: true  },
  { level: 70.56, label: 'Zona Sell',  color: '#3b82f6', dash: false },
  { level: 49.93, label: 'Sideways',   color: '#3b82f6', dash: false },
  { level: 30.70, label: 'Zona Buy',   color: '#3b82f6', dash: false },
  { level: 20.66, label: 'Buy',        color: '#3b82f6', dash: false },
];

// Extra alert-only levels (not drawn but used for signal logic)
const ALERT_LEVELS = [
  { level: 15, label: 'Entry Buy',  color: '#00ff88', zone: 'entry_buy',  alert: true  },
  { level: 20, label: 'Buy',        color: '#00e676', zone: 'buy',        alert: true  },
  { level: 30, label: 'Zona Buy',   color: '#69f0ae', zone: 'buy_weak',   alert: false },
  { level: 50, label: 'Sideways',   color: '#ffd740', zone: 'sideways',   alert: false },
  { level: 70, label: 'Zona Sell',  color: '#ff9800', zone: 'sell_weak',  alert: false },
  { level: 80, label: 'Sell',       color: '#ff1744', zone: 'sell',       alert: true  },
  { level: 85, label: 'Entry Sell', color: '#d50000', zone: 'entry_sell', alert: true  },
];

const TIMEFRAMES = ['M1','M5','M15','M30','H1','H4'];

function getRSIZone(rsi) {
  if (rsi == null) return { label: '—', color: '#888', alert: false, zone: '' };
  if (rsi <= 15) return { label: 'ENTRY BUY KUAT', color: '#00ff88', alert: true,  zone: 'entry_buy'  };
  if (rsi <= 20) return { label: 'ZONA BUY',        color: '#00e676', alert: true,  zone: 'buy'        };
  if (rsi <= 30) return { label: 'BUY',              color: '#69f0ae', alert: false, zone: 'buy_weak'   };
  if (rsi <= 50) return { label: 'SIDEWAYS',         color: '#ffd740', alert: false, zone: 'sideways'   };
  if (rsi <= 70) return { label: 'MULAI SELL',       color: '#ff9800', alert: false, zone: 'sell_weak'  };
  if (rsi <= 80) return { label: 'ZONA SELL',        color: '#ff1744', alert: true,  zone: 'sell'       };
  return                 { label: 'ENTRY SELL KUAT', color: '#d50000', alert: true,  zone: 'entry_sell' };
}

function today() { return new Date().toISOString().split('T')[0]; }

export default function App() {
  // Chart DOM refs
  const candleBox = useRef(null);
  const rsiBox    = useRef(null);
  // Chart instances
  const cc  = useRef(null);
  const rc  = useRef(null);
  const cs  = useRef(null);  // candle series
  const rsl = useRef(null);  // RSI line
  const mal = useRef(null);  // MA RSI line
  const built = useRef(false);
  const tfRef = useRef('H1');

  // Market state
  const [tf, setTf]           = useState('H1');
  const [price, setPrice]     = useState(null);
  const [change, setChange]   = useState(null);
  const [changePct, setChangePct] = useState(null);
  const [rsi, setRsi]         = useState(null);
  const [maRsi, setMaRsi]     = useState(null);
  const [rsiZone, setRsiZone] = useState(getRSIZone(null));
  const [source, setSource]   = useState('');
  const [isLive, setIsLive]   = useState(false);
  const [lastUpd, setLastUpd] = useState('');
  const [loading, setLoading] = useState(true);

  // App state
  const [notifOn, setNotifOn]       = useState(false);
  const [notifMsg, setNotifMsg]     = useState('');
  const [lastAlertZone, setLastAlertZone] = useState('');
  const [tab, setTab]               = useState('chart');
  const [reports, setReports]       = useState([]);
  const [stats, setStats]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState({ date: today(), profit: '', notes: '' });

  // ── Build / rebuild charts ──────────────────────────────────────
  const buildCharts = useCallback(async (data) => {
    if (!candleBox.current || !rsiBox.current) return;
    // Destroy previous
    try { cc.current?.remove(); rc.current?.remove(); } catch(e){}
    candleBox.current.innerHTML = '';
    rsiBox.current.innerHTML    = '';
    cc.current = rc.current = cs.current = rsl.current = mal.current = null;
    built.current = false;

    try {
      const { createChart, CrosshairMode, LineStyle } = await import('lightweight-charts');

      // ── CANDLE CHART ──────────────────────────────────────────────
      const cChart = createChart(candleBox.current, {
        layout: { background: { color: '#131722' }, textColor: '#868ea3' },
        grid:   { vertLines: { color: '#1c2333' }, horzLines: { color: '#1c2333' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#2a3350', scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { borderColor: '#2a3350', timeVisible: true, secondsVisible: false },
        width:  candleBox.current.clientWidth,
        height: candleBox.current.clientHeight,
      });

      const cSeries = cChart.addCandlestickSeries({
        upColor:         '#26a69a',
        downColor:       '#ef5350',
        borderUpColor:   '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor:     '#26a69a',
        wickDownColor:   '#ef5350',
      });
      cSeries.setData(data.candles);
      cChart.timeScale().fitContent();
      cc.current = cChart;
      cs.current = cSeries;

      // ── RSI CHART ─────────────────────────────────────────────────
      const rChart = createChart(rsiBox.current, {
        layout: { background: { color: '#131722' }, textColor: '#868ea3' },
        grid:   { vertLines: { color: '#1c2333' }, horzLines: { color: '#1c2333' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: '#2a3350',
          autoScale: false,
          scaleMargins: { top: 0.05, bottom: 0.05 },
        },
        timeScale: { borderColor: '#2a3350', timeVisible: true, secondsVisible: false },
        width:  rsiBox.current.clientWidth,
        height: rsiBox.current.clientHeight,
      });

      // RSI line (purple, like TradingView)
      const rsiSeries = rChart.addLineSeries({ color: '#9b59b6', lineWidth: 2, lastValueVisible: true, priceLineVisible: false });
      rsiSeries.applyOptions({ priceFormat: { type: 'custom', minMove: 0.01, formatter: v => v.toFixed(2) } });

      // MA RSI line (yellow/orange)
      const maSeries = rChart.addLineSeries({ color: '#f39c12', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      maSeries.applyOptions({ priceFormat: { type: 'custom', minMove: 0.01, formatter: v => v.toFixed(2) } });

      // Build RSI data arrays aligned to candle times
      const offset = data.candles.length - data.rsi.length;
      const rsiLineData = data.rsi.map((v, i) => ({ time: data.candles[offset + i].time, value: v }));
      rsiSeries.setData(rsiLineData);

      const maLineData = data.maRsi
        .map((v, i) => v != null ? { time: data.candles[offset + i].time, value: v } : null)
        .filter(Boolean);
      maSeries.setData(maLineData);

      // Set fixed RSI scale 0–100
      rChart.priceScale('right').applyOptions({ autoScale: false });
      rsiSeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

      // Price lines (horizontal RSI levels)
      RSI_LEVELS.forEach(({ level, label, color, dash }) => {
        rsiSeries.createPriceLine({
          price: level, color, lineWidth: dash ? 1 : 1,
          lineStyle: dash ? 1 : 0,   // 0=solid, 1=dotted, 2=dashed
          axisLabelVisible: true, title: label,
        });
      });

      // Shaded zones: Buy zone (below 30) and Sell zone (above 70)
      // lightweight-charts v4 doesn't have native fill, simulate with histogram
      // Use a baseline series for sell zone background
      const sellZone = rChart.addHistogramSeries({
        color: 'rgba(59,130,246,0.08)', priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false,
        base: 70.56,
      });
      const buyZone = rChart.addHistogramSeries({
        color: 'rgba(59,130,246,0.08)', priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false,
        base: 30.70,
      });

      // Sell zone fills: RSI - 70 (above 70, fill upward to 100 from 70)
      sellZone.setData(rsiLineData.map(d => ({ time: d.time, value: d.value > 70.56 ? d.value : 70.56 })));
      buyZone.setData(rsiLineData.map(d => ({ time: d.time, value: d.value < 30.70 ? d.value : 30.70 })));

      rChart.timeScale().fitContent();
      rc.current  = rChart;
      rsl.current = rsiSeries;
      mal.current = maSeries;
      built.current = true;

      // Sync crosshair candle ↔ RSI
      let sync = false;
      cChart.subscribeCrosshairMove(p => {
        if (sync) return; sync = true;
        if (p.point) rc.current?.setCrosshairPosition(p.point.x, 50, rsiSeries);
        sync = false;
      });
      rChart.subscribeCrosshairMove(p => {
        if (sync) return; sync = true;
        if (p.point) cc.current?.setCrosshairPosition(p.point.x, data.candles.at(-1)?.close ?? 0, cSeries);
        sync = false;
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (candleBox.current) cChart.applyOptions({ width: candleBox.current.clientWidth });
        if (rsiBox.current)    rChart.applyOptions({ width: rsiBox.current.clientWidth });
      });
      if (candleBox.current) ro.observe(candleBox.current);
      if (rsiBox.current)    ro.observe(rsiBox.current);
    } catch(e) { console.error('buildCharts:', e); }
  }, []);

  // ── Load candle data ─────────────────────────────────────────────
  const loadCandles = useCallback(async (timeframe, rebuild = true) => {
    if (rebuild) setLoading(true);
    try {
      const res  = await fetch(`/api/xauusd?tf=${timeframe}`);
      const data = await res.json();
      if (!data.ok) return;

      setSource(data.source);
      setIsLive(data.source !== 'simulated');
      setLastUpd(new Date(data.lastUpdated).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
      setPrice(data.currentPrice);
      setRsi(data.currentRSI);
      setMaRsi(data.currentMaRsi);
      const zone = getRSIZone(data.currentRSI);
      setRsiZone(zone);

      if (rebuild) {
        await buildCharts(data);
      } else if (built.current && rsl.current && mal.current && cs.current) {
        cs.current.setData(data.candles);
        const off = data.candles.length - data.rsi.length;
        rsl.current.setData(data.rsi.map((v,i)=>({ time: data.candles[off+i].time, value:v })));
        mal.current.setData(data.maRsi.filter(v=>v!=null).map((v,i)=>({ time: data.candles[off+i].time, value:v })));
      }
    } catch(e) { console.error('loadCandles:', e); }
    finally { if (rebuild) setLoading(false); }
  }, [buildCharts]);

  // ── Live price (5s) ──────────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const r = await fetch('/api/price');
      const d = await r.json();
      setPrice(d.price);
      setChange(d.change ?? null);
      setChangePct(d.changePct ?? null);

      // Nudge last candle
      if (built.current && cs.current) {
        const now    = Math.floor(Date.now() / 1000);
        const resMin = { M1:1,M5:5,M15:15,M30:30,H1:60,H4:240 }[tfRef.current] || 60;
        const barT   = Math.floor(now / (resMin*60)) * (resMin*60);
        try { cs.current.update({ time: barT, open: d.price, high: d.price, low: d.price, close: d.price }); } catch(e){}
      }
    } catch(e){}
  }, []);

  // ── Mount ────────────────────────────────────────────────────────
  useEffect(() => {
    tfRef.current = 'H1';
    loadCandles('H1', true);
    fetchReports();
  }, []);

  // ── TF change ────────────────────────────────────────────────────
  useEffect(() => {
    tfRef.current = tf;
    loadCandles(tf, true);
  }, [tf]);

  // ── Price interval ───────────────────────────────────────────────
  useEffect(() => {
    fetchPrice();
    const iv = setInterval(fetchPrice, 5000);
    return () => clearInterval(iv);
  }, [fetchPrice]);

  // ── Candle refresh 60s ───────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => loadCandles(tfRef.current, false), 60000);
    return () => clearInterval(iv);
  }, [loadCandles]);

  // ── Reports ──────────────────────────────────────────────────────
  const fetchReports = async () => {
    try {
      const r = await fetch('/api/reports');
      const d = await r.json();
      setReports(d.reports); setStats(d.stats);
    } catch(e){}
  };

  const saveReport = async e => {
    e.preventDefault();
    const method = editId ? 'PUT'  : 'POST';
    const url    = editId ? `/api/reports?id=${editId}` : '/api/reports';
    await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    await fetchReports();
    setShowForm(false); setEditId(null);
  };

  const deleteReport = async id => {
    if (!confirm('Hapus?')) return;
    await fetch(`/api/reports?id=${id}`, { method:'DELETE' });
    fetchReports();
  };

  // ── Notifications ────────────────────────────────────────────────
  const setupNotif = async () => {
    if (!('Notification' in window)) { setNotifMsg('❌ Tidak support'); return; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { setNotifMsg('❌ Izin ditolak'); return; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    setNotifOn(true); setNotifMsg('✅ Notifikasi HP aktif');
    new Notification('⚡ XAUUSD Alert Aktif', { body: 'Alert otomatis RSI zona Buy/Sell', icon:'/icon-192.png' });
  };

  const zc   = rsiZone.color;
  const isUp = (change ?? 0) >= 0;

  return (
    <>
      <Head>
        <title>⚡ XAUUSD Live</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <meta name="theme-color" content="#131722" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <div className="app">

        {/* ── HEADER (like TradingView top bar) ── */}
        <header className="hdr">
          <div className="hdr-symbol">
            <div className="sym-icon">Au</div>
            <div>
              <div className="sym-name">XAU/USD <span className="sym-broker">· XAUUSD</span></div>
              <div className="sym-sub">Emas · Spot Gold</div>
            </div>
          </div>

          <div className="hdr-price">
            {price ? (
              <>
                <span className="hp" style={{ color: isUp ? '#26a69a' : '#ef5350' }}>{price.toFixed(2)}</span>
                {change != null && (
                  <span className="hc" style={{ color: isUp ? '#26a69a' : '#ef5350' }}>
                    {isUp ? '+':''}{change.toFixed(2)} ({isUp?'+':''}{changePct}%)
                  </span>
                )}
              </>
            ) : <span className="hp-load">Loading...</span>}
          </div>

          <div className="hdr-right">
            <div className="live-ind">
              <span className={`ldot ${isLive?'on':'off'}`} />
              <span className="lbl">{isLive ? 'LIVE' : 'DEMO'}</span>
            </div>
            <button className={`nbtn ${notifOn?'on':''}`} onClick={setupNotif}>{notifOn?'🔔':'🔕'}</button>
          </div>
        </header>

        {notifMsg && <div className="nbar" onClick={()=>setNotifMsg('')}>{notifMsg} <span>✕</span></div>}

        {source === 'simulated' && (
          <div className="demo-bar">
            ⚠️ Demo mode — pasang <b>TWELVEDATA_API_KEY</b> di Vercel untuk data live.&nbsp;
            <a href="https://twelvedata.com/register" target="_blank" rel="noreferrer">Daftar gratis →</a>
          </div>
        )}

        {/* ── RSI badge + signal ── */}
        <div className="rsi-topbar">
          <div className="rsi-info">
            <span className="rsi-lbl">RSI 14</span>
            <span className="rsi-val" style={{color:'#9b59b6'}}>{rsi?.toFixed(2) ?? '—'}</span>
            <span className="rsi-ma-lbl">MA</span>
            <span className="rsi-ma-val" style={{color:'#f39c12'}}>{maRsi?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="rsi-zone-pill" style={{ background:`${zc}22`, border:`1px solid ${zc}`, color:zc }}>
            {rsiZone.label}
            {rsiZone.alert && <span className="alert-dot">●</span>}
          </div>
        </div>

        {/* ── TABS ── */}
        <nav className="tabs">
          {[['chart','📊 Chart'],['reports','📋 Laporan'],['stats','📈 Statistik']].map(([id,lbl])=>(
            <button key={id} className={`tab ${tab===id?'act':''}`} onClick={()=>setTab(id)}>{lbl}</button>
          ))}
        </nav>

        {/* ══════════════ CHART TAB ══════════════ */}
        {tab === 'chart' && (
          <div className="chart-page">
            {/* TF bar */}
            <div className="tf-bar">
              {TIMEFRAMES.map(t => (
                <button key={t} className={`tfbtn ${tf===t?'act':''}`} onClick={()=>{ if(tf!==t) setTf(t); }}>{t}</button>
              ))}
              <span className="tf-upd">{lastUpd}</span>
              <button className="tf-refresh" onClick={()=>loadCandles(tf,false)}>↻</button>
            </div>

            {/* Candle chart */}
            <div className="candle-wrap">
              {loading && <div className="chart-load">Memuat data XAUUSD...</div>}
              <div ref={candleBox} className="candle-chart" />
            </div>

            {/* Divider */}
            <div className="chart-sep">RSI (14) · MA (14)</div>

            {/* RSI chart */}
            <div className="rsi-wrap">
              <div ref={rsiBox} className="rsi-chart" />
            </div>

            {/* Signal row */}
            {rsi != null && (
              <div className="sig-row" style={{ borderColor: zc }}>
                <div className="sig-l">
                  <div className="sig-label">🎯 Sinyal · {tf}</div>
                  <div className="sig-zone" style={{color:zc}}>{rsiZone.label}</div>
                </div>
                <div className="sig-stats">
                  <div className="ss"><span>RSI</span><b style={{color:'#9b59b6'}}>{rsi.toFixed(2)}</b></div>
                  <div className="ss"><span>MA</span><b style={{color:'#f39c12'}}>{maRsi?.toFixed(2)??'—'}</b></div>
                  <div className="ss"><span>Harga</span><b>${price?.toFixed(2)}</b></div>
                </div>
                {!notifOn && rsiZone.alert && (
                  <button className="sig-notif" onClick={setupNotif}>🔔 Aktifkan Notif HP</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ LAPORAN TAB ══════════════ */}
        {tab === 'reports' && (
          <div className="rpt-page">
            <div className="rpt-hdr">
              <h2>Daily Profit Report</h2>
              <button className="add-btn" onClick={()=>{ setEditId(null); setForm({date:today(),profit:'',notes:''}); setShowForm(true); }}>＋ Tambah</button>
            </div>

            {showForm && (
              <form className="rpt-form" onSubmit={saveReport}>
                <div className="rf-title">{editId?'✏️ Edit':'📝 Tambah'} Laporan</div>
                <label>
                  <span>Tanggal</span>
                  <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required />
                </label>
                <label>
                  <span>Profit / Loss (USD)</span>
                  <input type="number" step="0.01" placeholder="cth: 150.00 atau -80.00"
                    value={form.profit} onChange={e=>setForm({...form,profit:e.target.value})} required />
                </label>
                <label>
                  <span>Catatan (opsional)</span>
                  <input type="text" placeholder="cth: scalping sesi London, RSI oversold"
                    value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
                </label>
                <div className="rf-btns">
                  <button type="submit" className="rf-save">✓ Simpan</button>
                  <button type="button" className="rf-cancel" onClick={()=>{setShowForm(false);setEditId(null);}}>Batal</button>
                </div>
              </form>
            )}

            {reports.length === 0 && !showForm ? (
              <div className="rpt-empty">
                <div>📋</div>
                <p>Belum ada laporan</p>
                <p style={{fontSize:'0.72rem',color:'#444',marginTop:4}}>Tap "＋ Tambah" untuk mulai</p>
              </div>
            ) : (
              <div className="rpt-list">
                {reports.map(r => (
                  <div key={r.id} className={`rpt-card ${r.profit>=0?'g':'r'}`}>
                    <div className="rc-top">
                      <span className="rc-date">{format(parseISO(r.date),'EEEE, dd MMM yyyy')}</span>
                      <span className={`rc-profit ${r.profit>=0?'up':'dn'}`}>{r.profit>=0?'+':''}{r.profit.toFixed(2)} USD</span>
                    </div>
                    {r.notes && <div className="rc-notes">📝 {r.notes}</div>}
                    <div className="rc-acts">
                      <button onClick={()=>{ setEditId(r.id); setForm({date:r.date,profit:String(r.profit),notes:r.notes}); setShowForm(true); }}>✏️ Edit</button>
                      <button onClick={()=>deleteReport(r.id)}>🗑 Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ STATISTIK TAB ══════════════ */}
        {tab === 'stats' && (
          <div className="stat-page">
            <h2>📊 Statistik Trading</h2>
            {!stats || stats.totalDays === 0 ? (
              <div className="rpt-empty" style={{marginTop:30}}>
                <p style={{color:'#444',fontSize:'0.78rem'}}>Tambah laporan dulu untuk lihat statistik</p>
              </div>
            ) : (
              <>
                <div className="stat-grid">
                  <div className="stat-card span2">
                    <div className="sc-lbl">Total Profit / Loss</div>
                    <div className={`sc-val xl ${stats.totalProfit>=0?'up':'dn'}`}>{stats.totalProfit>=0?'+':''}{stats.totalProfit.toFixed(2)} USD</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-lbl">Win Rate</div>
                    <div className="sc-val" style={{color:stats.winRate>=50?'#26a69a':'#ef5350'}}>{stats.winRate.toFixed(1)}%</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-lbl">Total Hari</div>
                    <div className="sc-val">{stats.totalDays}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-lbl">Avg / Hari</div>
                    <div className={`sc-val ${stats.avgProfit>=0?'up':'dn'}`}>{stats.avgProfit>=0?'+':''}{stats.avgProfit.toFixed(2)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-lbl">✅ Profit Days</div>
                    <div className="sc-val up">{stats.winDays}</div>
                  </div>
                  <div className="stat-card">
                    <div className="sc-lbl">❌ Loss Days</div>
                    <div className="sc-val dn">{stats.lossDays}</div>
                  </div>
                </div>

                {reports.length >= 2 && (() => {
                  const sorted = [...reports].sort((a,b)=>new Date(a.date)-new Date(b.date));
                  let cum=0; const pts=sorted.map(r=>{cum+=r.profit;return cum;});
                  const mn=Math.min(0,...pts), mx=Math.max(...pts), rng=mx-mn||1;
                  const w=100/Math.max(pts.length-1,1), lc=pts.at(-1)>=0?'#26a69a':'#ef5350';
                  return (
                    <div className="eq-card">
                      <div className="eq-title">📈 Equity Curve</div>
                      <div style={{height:120,marginTop:10}}>
                        <svg viewBox="0 0 100 60" style={{width:'100%',height:'100%'}} preserveAspectRatio="none">
                          <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={lc} stopOpacity="0.25"/>
                            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
                          </linearGradient></defs>
                          <polygon points={`0,60 ${pts.map((p,i)=>`${i*w},${60-((p-mn)/rng)*52}`).join(' ')} ${(pts.length-1)*w},60`} fill="url(#eg)"/>
                          <polyline points={pts.map((p,i)=>`${i*w},${60-((p-mn)/rng)*52}`).join(' ')} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round"/>
                          {pts.map((p,i)=><circle key={i} cx={i*w} cy={60-((p-mn)/rng)*52} r="1.4" fill={lc}/>)}
                        </svg>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        <footer className="ftr">
          <span>⚡ XAUUSD</span>
          <span>Price 5s · Chart 60s · {isLive?'🟢 LIVE':'🔴 DEMO'}</span>
          <span>{notifOn?'🔔 ON':'🔕 OFF'}</span>
        </footer>
      </div>

      <style jsx global>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#131722;color:#d1d4dc;font-family:'Trebuchet MS',Arial,sans-serif;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        .app{max-width:900px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}

        /* HEADER */
        .hdr{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1e222d;border-bottom:1px solid #2a2e39;position:sticky;top:0;z-index:100}
        .hdr-symbol{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .sym-icon{width:28px;height:28px;border-radius:50%;background:#f39c12;color:#131722;font-weight:700;font-size:0.65rem;display:flex;align-items:center;justify-content:center}
        .sym-name{font-size:0.82rem;font-weight:700;color:#d1d4dc;line-height:1.2}
        .sym-broker{font-size:0.65rem;color:#868ea3;font-weight:400}
        .sym-sub{font-size:0.6rem;color:#4a5568}
        .hdr-price{flex:1;text-align:center}
        .hp{font-size:1.2rem;font-weight:700;display:block;line-height:1.2}
        .hc{font-size:0.68rem;display:block;margin-top:1px}
        .hp-load{font-size:0.8rem;color:#555}
        .hdr-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .live-ind{display:flex;align-items:center;gap:4px}
        .ldot{width:7px;height:7px;border-radius:50%}
        .ldot.on{background:#26a69a;box-shadow:0 0 6px #26a69a88;animation:blink 2s infinite}
        .ldot.off{background:#ef5350}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
        .lbl{font-size:0.6rem;color:#868ea3;font-weight:700;letter-spacing:1px}
        .nbtn{background:#2a2e39;border:1px solid #363a45;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:0.9rem;transition:.2s}
        .nbtn.on{background:rgba(243,156,18,.12);border-color:#f39c12}
        .nbar{background:#1e1a0a;border-bottom:1px solid #3a2f0a;padding:6px 12px;font-size:0.72rem;display:flex;justify-content:space-between;cursor:pointer;color:#f39c12}
        .demo-bar{background:#1a0e0a;border-bottom:1px solid #3a1a0a;padding:6px 12px;font-size:0.7rem;color:#ef5350}
        .demo-bar a{color:#f39c12}

        /* RSI TOP BAR */
        .rsi-topbar{display:flex;align-items:center;justify-content:space-between;padding:5px 12px;background:#1e222d;border-bottom:1px solid #2a2e39;gap:10px}
        .rsi-info{display:flex;align-items:center;gap:8px;font-size:0.7rem;flex-wrap:wrap}
        .rsi-lbl{color:#868ea3;font-size:0.62rem}
        .rsi-val{font-weight:700;font-size:0.8rem}
        .rsi-ma-lbl{color:#868ea3;font-size:0.62rem;margin-left:4px}
        .rsi-ma-val{font-weight:700;font-size:0.8rem}
        .rsi-zone-pill{padding:3px 10px;border-radius:20px;font-size:0.65rem;font-weight:700;display:flex;align-items:center;gap:4px;white-space:nowrap}
        .alert-dot{color:currentColor;animation:blink 1s infinite;font-size:0.5rem}

        /* TABS */
        .tabs{display:flex;background:#1e222d;border-bottom:1px solid #2a2e39}
        .tab{flex:1;padding:9px 4px;background:none;border:none;color:#868ea3;cursor:pointer;font-size:0.73rem;border-bottom:2px solid transparent;transition:.2s;font-family:inherit}
        .tab.act{color:#2962ff;border-bottom-color:#2962ff;background:rgba(41,98,255,.05)}
        .tab:hover:not(.act){color:#d1d4dc}

        /* CHART PAGE */
        .chart-page{display:flex;flex-direction:column;flex:1}
        .tf-bar{display:flex;align-items:center;gap:4px;padding:6px 10px;background:#1e222d;border-bottom:1px solid #2a2e39;flex-wrap:wrap}
        .tfbtn{background:#131722;border:1px solid #2a2e39;color:#868ea3;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.72rem;font-family:inherit;transition:.15s}
        .tfbtn.act{background:#2962ff;border-color:#2962ff;color:#fff;font-weight:700}
        .tfbtn:hover:not(.act){border-color:#868ea3;color:#d1d4dc}
        .tf-upd{margin-left:auto;font-size:0.58rem;color:#363a45}
        .tf-refresh{background:none;border:1px solid #363a45;border-radius:4px;color:#868ea3;padding:3px 8px;cursor:pointer;font-size:0.72rem;font-family:inherit;transition:.15s}
        .tf-refresh:hover{color:#d1d4dc;border-color:#868ea3}
        .candle-wrap{position:relative;flex-shrink:0}
        .chart-load{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#363a45;font-size:0.72rem;z-index:5}
        .candle-chart{width:100%;height:350px}
        .chart-sep{background:#1e222d;border-top:1px solid #2a2e39;border-bottom:1px solid #2a2e39;padding:4px 12px;font-size:0.62rem;color:#4a5568;letter-spacing:1px}
        .rsi-wrap{flex-shrink:0}
        .rsi-chart{width:100%;height:200px}

        /* SIGNAL ROW */
        .sig-row{background:#1e222d;border-top:2px solid;padding:10px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .sig-l{flex:1;min-width:120px}
        .sig-label{font-size:0.6rem;color:#868ea3;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .sig-zone{font-size:0.9rem;font-weight:700}
        .sig-stats{display:flex;gap:16px;flex-wrap:wrap}
        .ss{display:flex;flex-direction:column;align-items:center;gap:2px}
        .ss span{font-size:0.56rem;color:#4a5568;text-transform:uppercase;letter-spacing:.5px}
        .ss b{font-size:0.82rem}
        .sig-notif{padding:7px 12px;background:rgba(243,156,18,.1);border:1px solid #f39c12;color:#f39c12;border-radius:6px;cursor:pointer;font-size:0.7rem;font-family:inherit;font-weight:600;white-space:nowrap}

        /* REPORTS */
        .rpt-page{padding:12px;flex:1}
        .rpt-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
        .rpt-hdr h2{font-size:0.88rem;color:#d1d4dc}
        .add-btn{background:rgba(41,98,255,.12);border:1px solid #2962ff;color:#2962ff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.76rem;font-family:inherit;transition:.2s}
        .add-btn:hover{background:rgba(41,98,255,.2)}
        .rpt-form{background:#1e222d;border:1px solid #2a2e39;border-radius:8px;padding:14px;margin-bottom:12px;display:flex;flex-direction:column;gap:10px;animation:sd .18s ease}
        @keyframes sd{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        .rf-title{font-size:0.78rem;color:#f39c12;font-weight:600}
        .rpt-form label{display:flex;flex-direction:column;gap:4px}
        .rpt-form label span{font-size:0.6rem;color:#4a5568;text-transform:uppercase;letter-spacing:.5px}
        .rpt-form input{background:#131722;border:1px solid #2a2e39;color:#d1d4dc;padding:9px 10px;border-radius:5px;font-size:0.78rem;outline:none;font-family:inherit;transition:border-color .2s}
        .rpt-form input:focus{border-color:#2962ff66}
        .rf-btns{display:flex;gap:8px}
        .rf-save{flex:1;padding:9px;background:#2962ff;border:none;color:#fff;font-weight:700;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.8rem}
        .rf-save:hover{background:#1e50cc}
        .rf-cancel{padding:9px 14px;background:#131722;border:1px solid #2a2e39;color:#868ea3;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.76rem}
        .rpt-empty{text-align:center;padding:40px 20px}
        .rpt-empty div{font-size:2rem;margin-bottom:8px}
        .rpt-empty p{color:#4a5568;font-size:0.82rem}
        .rpt-list{display:flex;flex-direction:column;gap:8px}
        .rpt-card{background:#1e222d;border:1px solid;border-radius:8px;padding:11px 13px}
        .rpt-card.g{border-color:rgba(38,166,154,.2)}
        .rpt-card.r{border-color:rgba(239,83,80,.2)}
        .rc-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
        .rc-date{font-size:0.74rem;color:#4a5568}
        .rc-profit{font-size:0.96rem;font-weight:700}
        .rc-notes{font-size:0.68rem;color:#4a5568;font-style:italic;margin-bottom:6px}
        .rc-acts{display:flex;gap:6px;border-top:1px solid #2a2e39;padding-top:7px;margin-top:5px}
        .rc-acts button{background:none;border:1px solid #2a2e39;border-radius:4px;color:#4a5568;padding:3px 9px;cursor:pointer;font-size:0.65rem;font-family:inherit;transition:.15s}
        .rc-acts button:hover{color:#d1d4dc;border-color:#868ea3}
        .up{color:#26a69a}.dn{color:#ef5350}

        /* STATS */
        .stat-page{padding:12px;flex:1}
        .stat-page h2{font-size:0.88rem;color:#d1d4dc;margin-bottom:12px}
        .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
        .stat-card{background:#1e222d;border:1px solid #2a2e39;border-radius:8px;padding:12px;text-align:center}
        .stat-card.span2{grid-column:1/-1;border-color:rgba(41,98,255,.2)}
        .sc-lbl{font-size:0.6rem;color:#4a5568;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px}
        .sc-val{font-size:1.2rem;font-weight:700;color:#d1d4dc}
        .sc-val.xl{font-size:1.55rem}
        .eq-card{background:#1e222d;border:1px solid #2a2e39;border-radius:8px;padding:12px}
        .eq-title{font-size:0.7rem;color:#4a5568;margin-bottom:2px}

        /* FOOTER */
        .ftr{display:flex;justify-content:space-between;padding:6px 12px;border-top:1px solid #2a2e39;font-size:0.58rem;color:#2a2e39;background:#1e222d}

        @media(max-width:480px){
          .hdr{gap:6px;padding:7px 10px}
          .hp{font-size:1rem}
          .candle-chart{height:280px}
          .rsi-chart{height:160px}
          .stat-grid{grid-template-columns:1fr 1fr}
          .hc{display:none}
        }
      `}</style>
    </>
  );
}
