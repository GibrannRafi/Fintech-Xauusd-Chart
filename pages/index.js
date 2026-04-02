import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

const RSI_LEVELS = [
  { level: 15, label: 'Entry Buy',  color: '#00ff88', zone: 'entry_buy',  alert: true  },
  { level: 20, label: 'Buy',        color: '#00e676', zone: 'buy',        alert: true  },
  { level: 30, label: 'Zona Buy',   color: '#69f0ae', zone: 'buy_weak',   alert: false },
  { level: 50, label: 'Sideways',   color: '#ffd740', zone: 'sideways',   alert: false },
  { level: 70, label: 'Zona Sell',  color: '#ff9800', zone: 'sell_weak',  alert: false },
  { level: 80, label: 'Sell',       color: '#ff1744', zone: 'sell',       alert: true  },
  { level: 85, label: 'Entry Sell', color: '#d50000', zone: 'entry_sell', alert: true  },
];

const TIMEFRAMES = ['M1','M5','M15','M30','H1','H4'];

function getRSIInfo(rsi) {
  if (rsi == null) return { label: '—', color: '#888', alert: false, zone: '' };
  if (rsi <= 15) return { label: '🟢 ENTRY BUY KUAT', color: '#00ff88', alert: true,  zone: 'entry_buy'  };
  if (rsi <= 20) return { label: '🟢 ZONA BUY',       color: '#00e676', alert: true,  zone: 'buy'        };
  if (rsi <= 30) return { label: '🟩 BUY LEMAH',      color: '#69f0ae', alert: false, zone: 'buy_weak'   };
  if (rsi <= 50) return { label: '🟡 SIDEWAYS',       color: '#ffd740', alert: false, zone: 'sideways'   };
  if (rsi <= 70) return { label: '🟠 MULAI SELL',     color: '#ff9800', alert: false, zone: 'sell_weak'  };
  if (rsi <= 80) return { label: '🔴 ZONA SELL',      color: '#ff1744', alert: true,  zone: 'sell'       };
  return                  { label: '🔴 ENTRY SELL',   color: '#d50000', alert: true,  zone: 'entry_sell' };
}

export default function Dashboard() {
  const candleRef      = useRef(null);
  const rsiRef         = useRef(null);
  const candleChart    = useRef(null);
  const rsiChart       = useRef(null);
  const candleSeries   = useRef(null);
  const rsiLineSeries  = useRef(null);
  const priceLines     = useRef([]);
  const chartsBuilt    = useRef(false);
  const priceInterval  = useRef(null);
  const candleInterval = useRef(null);

  const [tf, setTf]               = useState('H1');
  const [currentPrice, setPrice]  = useState(null);
  const [prevPrice, setPrevPrice] = useState(null);
  const [currentRSI, setRSI]      = useState(null);
  const [rsiInfo, setRsiInfo]     = useState(getRSIInfo(null));
  const [change, setChange]       = useState(null);
  const [changePct, setChangePct] = useState(null);
  const [dataSource, setDataSource] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifStatus, setNotifStatus]   = useState('');
  const [lastAlertZone, setLastAlertZone] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reports, setReports]     = useState([]);
  const [stats, setStats]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [form, setForm]           = useState({ date: today(), profit: '', notes: '' });
  const [loading, setLoading]     = useState(true);

  function today() { return new Date().toISOString().split('T')[0]; }

  // ── Fetch candle data (full) ─────────────────────────────────────
  const fetchCandles = useCallback(async (timeframe) => {
    try {
      const res  = await fetch(`/api/xauusd?tf=${timeframe}`);
      const data = await res.json();
      if (!data.ok) return;

      setDataSource(data.source);
      setLastUpdated(new Date(data.lastUpdated).toLocaleTimeString('id-ID'));

      const latestRSI = data.currentRSI;
      setRSI(latestRSI);
      const info = getRSIInfo(latestRSI);
      setRsiInfo(info);

      // Fire notification if zone changed
      if (info.alert && notifEnabled && lastAlertZone !== info.zone) {
        fireNotif(info, data.currentPrice, latestRSI);
        setLastAlertZone(info.zone);
      }

      // Update charts
      if (chartsBuilt.current) {
        // Replace candle data
        candleSeries.current?.setData(data.candles);

        // Replace RSI data — align to candles offset by 14
        const rsiData = data.candles.slice(14).map((c, i) => ({
          time: c.time,
          value: data.rsi[i] ?? 50,
        })).filter(d => d.value != null);
        rsiLineSeries.current?.setData(rsiData);

        candleChart.current?.timeScale().fitContent();
        rsiChart.current?.timeScale().fitContent();
      }
    } catch (e) { console.error('fetchCandles error', e); }
    finally { setLoading(false); }
  }, [notifEnabled, lastAlertZone]);

  // ── Fetch live price (fast polling) ──────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const res  = await fetch('/api/price');
      const data = await res.json();
      setPrevPrice(p => p ?? data.price);
      setPrevPrice(data.price);
      setPrice(data.price);
      setChange(data.change);
      setChangePct(data.changePct);

      // Update last candle close on chart in real time
      if (candleSeries.current && data.price) {
        // We just update the display price; candle refresh happens on interval
      }
    } catch (e) {}
  }, []);

  // ── Build charts once ─────────────────────────────────────────────
  const buildCharts = useCallback(async (data) => {
    if (chartsBuilt.current) return;
    if (!candleRef.current || !rsiRef.current) return;
    try {
      const { createChart, CrosshairMode } = await import('lightweight-charts');

      // --- Candle chart ---
      const cc = createChart(candleRef.current, {
        layout: { background: { color: '#0a0e1a' }, textColor: '#7a8899' },
        grid: { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1f2937' },
        timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
        width: candleRef.current.clientWidth,
        height: candleRef.current.clientHeight || 300,
      });
      candleChart.current = cc;

      const cs = cc.addCandlestickSeries({
        upColor: '#00e676', downColor: '#ef4444',
        borderUpColor: '#00e676', borderDownColor: '#ef4444',
        wickUpColor: '#00e676', wickDownColor: '#ef4444',
      });
      cs.setData(data.candles);
      candleSeries.current = cs;
      cc.timeScale().fitContent();

      // --- RSI chart ---
      const rc = createChart(rsiRef.current, {
        layout: { background: { color: '#0a0e1a' }, textColor: '#7a8899' },
        grid: { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1f2937', autoScale: false },
        timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
        width: rsiRef.current.clientWidth,
        height: rsiRef.current.clientHeight || 200,
      });
      rsiChart.current = rc;

      const rsiData = data.candles.slice(14).map((c, i) => ({
        time: c.time,
        value: data.rsi[i] ?? 50,
      })).filter(d => d.value != null);

      const rs = rc.addLineSeries({ color: '#7c3aed', lineWidth: 2, priceScaleId: 'right' });
      rs.setData(rsiData);
      rs.applyOptions({
        priceFormat: { type: 'custom', minMove: 0.01, formatter: v => v.toFixed(1) }
      });
      rsiLineSeries.current = rs;

      // Price lines for RSI levels
      RSI_LEVELS.forEach(({ level, label, color }) => {
        rs.createPriceLine({
          price: level, color, lineWidth: 1, lineStyle: 2,
          axisLabelVisible: true, title: label,
        });
      });

      // Sync crosshair between charts
      let isSyncing = false;
      cc.subscribeCrosshairMove(p => {
        if (isSyncing) return;
        isSyncing = true;
        rc.setCrosshairPosition(p.point?.x ?? 0, p.seriesData?.get(cs)?.close ?? 0, rs);
        isSyncing = false;
      });

      rc.timeScale().fitContent();
      chartsBuilt.current = true;

      // Handle resize
      const ro = new ResizeObserver(() => {
        cc.applyOptions({ width: candleRef.current?.clientWidth });
        rc.applyOptions({ width: rsiRef.current?.clientWidth });
      });
      ro.observe(candleRef.current);
    } catch (e) { console.error('buildCharts error', e); }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      chartsBuilt.current = false;
      try {
        const res  = await fetch(`/api/xauusd?tf=${tf}`);
        const data = await res.json();
        if (data.ok) {
          setPrice(data.currentPrice);
          setRSI(data.currentRSI);
          setRsiInfo(getRSIInfo(data.currentRSI));
          setDataSource(data.source);
          setLastUpdated(new Date(data.lastUpdated).toLocaleTimeString('id-ID'));
          await buildCharts(data);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Timeframe change ──────────────────────────────────────────────
  useEffect(() => {
    chartsBuilt.current = false;
    if (candleRef.current) candleRef.current.innerHTML = '';
    if (rsiRef.current)    rsiRef.current.innerHTML    = '';
    candleChart.current  = null;
    rsiChart.current     = null;
    candleSeries.current = null;
    rsiLineSeries.current= null;
    setLoading(true);
    (async () => {
      try {
        const res  = await fetch(`/api/xauusd?tf=${tf}`);
        const data = await res.json();
        if (data.ok) {
          setRSI(data.currentRSI);
          setRsiInfo(getRSIInfo(data.currentRSI));
          setDataSource(data.source);
          setLastUpdated(new Date(data.lastUpdated).toLocaleTimeString('id-ID'));
          await buildCharts(data);
        }
      } catch (e) {}
      finally { setLoading(false); }
    })();
  }, [tf]);

  // ── Price polling (every 5s) ──────────────────────────────────────
  useEffect(() => {
    fetchPrice();
    priceInterval.current = setInterval(fetchPrice, 5000);
    return () => clearInterval(priceInterval.current);
  }, []);

  // ── Candle refresh (every 60s) ────────────────────────────────────
  useEffect(() => {
    candleInterval.current = setInterval(() => fetchCandles(tf), 60000);
    return () => clearInterval(candleInterval.current);
  }, [tf, fetchCandles]);

  // ── Reports ───────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    const res  = await fetch('/api/reports');
    const data = await res.json();
    setReports(data.reports);
    setStats(data.stats);
  }, []);

  useEffect(() => { fetchReports(); }, []);

  // ── Notification ─────────────────────────────────────────────────
  const setupNotif = async () => {
    if (!('Notification' in window)) { setNotifStatus('❌ Browser tidak support'); return; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { setNotifStatus('❌ Izin ditolak'); return; }
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
    setNotifEnabled(true);
    setNotifStatus('✅ Notifikasi aktif');
    new Notification('⚡ XAUUSD Alert Aktif', {
      body: 'Notifikasi otomatis saat RSI masuk zona Buy/Sell',
      icon: '/icon-192.png',
    });
  };

  function fireNotif(info, price, rsi) {
    if (Notification.permission !== 'granted') return;
    const isBuy = info.zone.includes('buy');
    new Notification(`${isBuy ? '🟢' : '🔴'} ${info.label}`, {
      body: `XAUUSD $${price?.toFixed(2)} | RSI ${rsi?.toFixed(1)} | ${isBuy ? 'Pertimbangkan BUY' : 'Pertimbangkan SELL'}`,
      icon: '/icon-192.png', requireInteraction: true,
    });
  }

  // ── Form helpers ──────────────────────────────────────────────────
  const openAdd  = () => { setEditId(null); setForm({ date: today(), profit: '', notes: '' }); setShowForm(true); };
  const openEdit = (r)  => { setEditId(r.id); setForm({ date: r.date, profit: String(r.profit), notes: r.notes }); setShowForm(true); };

  const saveReport = async (e) => {
    e.preventDefault();
    const method = editId ? 'PUT' : 'POST';
    const url    = editId ? `/api/reports?id=${editId}` : '/api/reports';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    await fetchReports();
    setShowForm(false);
    setEditId(null);
  };

  const deleteReport = async (id) => {
    if (!confirm('Hapus laporan ini?')) return;
    await fetch(`/api/reports?id=${id}`, { method: 'DELETE' });
    fetchReports();
  };

  const zc  = rsiInfo.color;
  const dir  = change >= 0 ? 'up' : 'dn';

  return (
    <>
      <Head>
        <title>⚡ XAUUSD Live Dashboard</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#0a0e1a" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="app">
        {/* ── HEADER ── */}
        <header className="hdr">
          <div className="hdr-l">
            <span className="logo">⚡ XAUUSD</span>
            <div>
              <div className="price" style={{ color: change >= 0 ? '#00e676' : '#ef4444' }}>
                {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                {change != null && (
                  <span className="chg" style={{ color: change >= 0 ? '#00e676' : '#ef4444' }}>
                    {' '}{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(changePct)}%)
                  </span>
                )}
              </div>
              <div className="plbl">GOLD / USD · {dataSource ? `via ${dataSource}` : ''}</div>
            </div>
          </div>
          <div className="hdr-r">
            {currentRSI != null && (
              <div className="rbadge" style={{ background: `${zc}18`, border: `1px solid ${zc}`, color: zc }}>
                <span className="rval">RSI {currentRSI.toFixed(1)}</span>
                <span className="rlbl">{rsiInfo.label}</span>
              </div>
            )}
            <button className={`nbtn ${notifEnabled ? 'on' : ''}`} onClick={setupNotif} title="Notifikasi HP">
              {notifEnabled ? '🔔' : '🔕'}
            </button>
          </div>
        </header>

        {notifStatus && (
          <div className="nbar" onClick={() => setNotifStatus('')}>{notifStatus} <span>✕</span></div>
        )}

        {/* ── TABS ── */}
        <nav className="tabs">
          {[['dashboard','📊 Live Chart'],['reports','📋 Laporan'],['stats','📈 Statistik']].map(([id,lbl]) => (
            <button key={id} className={`tab ${activeTab===id?'act':''}`} onClick={() => setActiveTab(id)}>{lbl}</button>
          ))}
        </nav>

        <main className="main">

          {/* ════════════════ DASHBOARD ════════════════ */}
          {activeTab === 'dashboard' && (
            <>
              {/* Timeframe selector */}
              <div className="tfsec">
                {TIMEFRAMES.map(t => (
                  <button key={t} className={`tfbtn ${tf===t?'act':''}`} onClick={() => setTf(t)}>{t}</button>
                ))}
                <span className="upd">{lastUpdated ? `Update: ${lastUpdated}` : ''}</span>
              </div>

              {/* Zone reference strip */}
              <div className="zstrip">
                {RSI_LEVELS.map(z => {
                  const isA = currentRSI != null && Math.abs(currentRSI - z.level) < 8;
                  return (
                    <div key={z.level} className={`zchip ${isA ? 'za' : ''}`}
                      style={{ background: isA ? `${z.color}22` : 'rgba(255,255,255,0.03)', border: `1px solid ${isA ? z.color : z.color+'33'}`, color: z.color }}>
                      <b>{z.level}</b><span>{z.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Candle chart */}
              <div className="csec">
                <div className="chdr">
                  <span>Candlestick XAUUSD · {tf}</span>
                  <button className="rbtn" onClick={() => fetchCandles(tf)}>↻</button>
                </div>
                {loading && <div className="spinner">Loading chart...</div>}
                <div ref={candleRef} style={{ width:'100%', height:320 }} />
              </div>

              {/* RSI chart */}
              <div className="csec">
                <div className="chdr">
                  <span>RSI (14) · {tf}</span>
                  {currentRSI != null && (
                    <span style={{ color: zc, fontWeight: 700 }}>RSI {currentRSI.toFixed(2)}</span>
                  )}
                </div>
                <div ref={rsiRef} style={{ width:'100%', height:220 }} />
                <div className="rleg">
                  {RSI_LEVELS.map(z => (
                    <span key={z.level} style={{ color: z.color }} className="rli">— {z.level} {z.label}</span>
                  ))}
                </div>
              </div>

              {/* Signal card */}
              {currentRSI != null && (
                <div className="sigcard" style={{ borderColor: zc, boxShadow: `0 0 20px ${zc}18` }}>
                  <div className="sigtit">🎯 SINYAL AKTIF · {tf}</div>
                  <div className="sigzone" style={{ color: zc }}>{rsiInfo.label}</div>
                  <div className="sigdet">
                    <div className="si"><span>Harga</span><strong>${currentPrice?.toFixed(2)}</strong></div>
                    <div className="si"><span>RSI</span><strong style={{ color: zc }}>{currentRSI.toFixed(2)}</strong></div>
                    <div className="si"><span>Alert</span>
                      <strong style={{ color: rsiInfo.alert ? '#ef4444' : '#00e676' }}>
                        {rsiInfo.alert ? '⚡ ON' : '💤 WAIT'}
                      </strong>
                    </div>
                  </div>
                  {!notifEnabled && rsiInfo.alert && (
                    <button className="acta" onClick={setupNotif}>🔔 Aktifkan Notifikasi ke HP</button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ════════════════ LAPORAN ════════════════ */}
          {activeTab === 'reports' && (
            <>
              <div className="rhdr">
                <h2>Daily Profit Report</h2>
                <button className="abtn" onClick={openAdd}>＋ Tambah</button>
              </div>

              {showForm && (
                <form className="aform" onSubmit={saveReport}>
                  <div className="ftit">{editId ? '✏️ Edit Laporan' : '📝 Tambah Laporan'}</div>
                  <div className="fgrid">
                    <label>
                      <span>Tanggal</span>
                      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                    </label>
                    <label>
                      <span>Profit / Loss (USD)</span>
                      <input type="number" step="0.01" placeholder="250.00 atau -80.00"
                        value={form.profit} onChange={e => setForm({ ...form, profit: e.target.value })} required />
                    </label>
                    <label className="full">
                      <span>Catatan (opsional)</span>
                      <input type="text" placeholder="Contoh: scalping sesi London, RSI oversold"
                        value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                    </label>
                  </div>
                  <div className="frow">
                    <button type="submit" className="sbtn">✓ Simpan</button>
                    <button type="button" className="cbtn" onClick={() => setShowForm(false)}>✕ Batal</button>
                  </div>
                </form>
              )}

              {reports.length === 0 && !showForm && (
                <div className="empty">
                  <div className="empty-icon">📋</div>
                  <div>Belum ada laporan</div>
                  <div style={{ fontSize:'0.75rem', color:'#555', marginTop:4 }}>Tap "＋ Tambah" untuk mulai mencatat profit</div>
                </div>
              )}

              <div className="rlist">
                {reports.map(r => (
                  <div key={r.id} className={`rcard ${r.profit >= 0 ? 'rp' : 'rl'}`}>
                    <div className="rtop">
                      <div className="rdate">{format(parseISO(r.date), 'dd MMM yyyy')}</div>
                      <div className={`rprofit ${r.profit >= 0 ? 'up' : 'dn'}`}>
                        {r.profit >= 0 ? '+' : ''}{r.profit.toFixed(2)} USD
                      </div>
                    </div>
                    {r.notes && <div className="rnotes">📝 {r.notes}</div>}
                    <div className="ractions">
                      <button className="edbtn" onClick={() => openEdit(r)}>✏️</button>
                      <button className="delbtn" onClick={() => deleteReport(r.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ════════════════ STATISTIK ════════════════ */}
          {activeTab === 'stats' && stats && (
            <>
              <h2 style={{ color:'#ffd740', fontSize:'0.95rem', marginBottom:14 }}>📊 Statistik Trading</h2>
              <div className="sgrid">
                <div className="sc hl">
                  <div className="slbl">Total Profit</div>
                  <div className={`sval big ${stats.totalProfit >= 0 ? 'up' : 'dn'}`}>
                    {stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(2)} USD
                  </div>
                </div>
                <div className="sc">
                  <div className="slbl">Win Rate</div>
                  <div className="sval" style={{ color: stats.winRate >= 50 ? '#00e676' : '#ef4444' }}>
                    {stats.winRate.toFixed(1)}%
                  </div>
                </div>
                <div className="sc">
                  <div className="slbl">Total Hari</div>
                  <div className="sval">{stats.totalDays}</div>
                </div>
                <div className="sc">
                  <div className="slbl">Avg / Hari</div>
                  <div className={`sval ${stats.avgProfit >= 0 ? 'up' : 'dn'}`}>
                    {stats.avgProfit >= 0 ? '+' : ''}{stats.avgProfit.toFixed(2)}
                  </div>
                </div>
                <div className="sc"><div className="slbl">✅ Profit Days</div><div className="sval up">{stats.winDays}</div></div>
                <div className="sc"><div className="slbl">❌ Loss Days</div><div className="sval dn">{stats.lossDays}</div></div>
              </div>

              {reports.length >= 2 && (
                <div className="eqsec">
                  <div className="chdr">📈 Equity Curve</div>
                  <div style={{ height: 140, marginTop: 10 }}>
                    {(() => {
                      const sorted = [...reports].sort((a,b) => new Date(a.date)-new Date(b.date));
                      let cum = 0;
                      const pts = sorted.map(r => { cum += r.profit; return cum; });
                      const mn = Math.min(0, ...pts), mx = Math.max(...pts);
                      const rng = mx - mn || 1;
                      const w = 100 / Math.max(pts.length - 1, 1);
                      const lc = pts[pts.length-1] >= 0 ? '#00e676' : '#ef4444';
                      return (
                        <svg viewBox="0 0 100 60" style={{width:'100%',height:'100%'}} preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={lc} stopOpacity="0.3"/>
                              <stop offset="100%" stopColor={lc} stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          <polygon points={`0,60 ${pts.map((p,i) => `${i*w},${60-((p-mn)/rng)*52}`).join(' ')} ${(pts.length-1)*w},60`} fill="url(#eg)" />
                          <polyline points={pts.map((p,i) => `${i*w},${60-((p-mn)/rng)*52}`).join(' ')} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" />
                          {pts.map((p,i) => <circle key={i} cx={i*w} cy={60-((p-mn)/rng)*52} r="1.5" fill={lc} />)}
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {reports.length < 2 && (
                <div className="empty" style={{marginTop:16}}>
                  <div style={{fontSize:'0.8rem',color:'#555'}}>Tambah minimal 2 laporan untuk melihat equity curve</div>
                </div>
              )}
            </>
          )}
        </main>

        <footer className="ftr">
          <span>⚡ XAUUSD</span>
          <span>Price: 5s · Chart: 60s</span>
          <span>{notifEnabled ? '🔔 ON' : '🔕 OFF'}</span>
        </footer>
      </div>

      <style jsx global>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#0a0e1a;color:#c9d1d9;font-family:'JetBrains Mono','Fira Code',Consolas,monospace;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        .app{max-width:860px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}

        /* HEADER */
        .hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#080d18;border-bottom:1px solid #1a2035;position:sticky;top:0;z-index:100}
        .hdr-l{display:flex;align-items:center;gap:12px}
        .logo{font-size:0.9rem;font-weight:800;color:#ffd740;letter-spacing:2px;white-space:nowrap}
        .price{font-size:1.15rem;font-weight:700;line-height:1.2}
        .chg{font-size:0.72rem;font-weight:400;margin-left:4px}
        .plbl{font-size:0.55rem;color:#444;letter-spacing:1px;margin-top:2px}
        .hdr-r{display:flex;align-items:center;gap:7px}
        .rbadge{padding:4px 9px;border-radius:7px;display:flex;flex-direction:column;align-items:center;line-height:1.5}
        .rval{font-weight:800;font-size:0.78rem}
        .rlbl{font-size:0.52rem;opacity:.9;white-space:nowrap}
        .nbtn{background:#111827;border:1px solid #1f2937;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:1rem;transition:.2s}
        .nbtn.on{background:rgba(255,215,64,.1);border-color:#ffd740}
        .nbtn:hover{transform:scale(1.07)}
        .nbar{background:#111827;border-bottom:1px solid #1f2937;padding:7px 14px;font-size:0.75rem;display:flex;justify-content:space-between;cursor:pointer;color:#ffd740}

        /* TABS */
        .tabs{display:flex;background:#080d18;border-bottom:1px solid #1a2035}
        .tab{flex:1;padding:10px 4px;background:none;border:none;color:#444;cursor:pointer;font-family:inherit;font-size:0.75rem;border-bottom:2px solid transparent;transition:.2s}
        .tab.act{color:#ffd740;border-bottom-color:#ffd740;background:rgba(255,215,64,.03)}
        .tab:hover:not(.act){color:#c9d1d9}

        .main{flex:1;padding:12px;overflow-y:auto}

        /* TIMEFRAME */
        .tfsec{display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap}
        .tfbtn{background:#111827;border:1px solid #1f2937;color:#555;padding:5px 11px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.75rem;transition:.15s}
        .tfbtn.act{background:rgba(255,215,64,.12);border-color:#ffd740;color:#ffd740;font-weight:700}
        .tfbtn:hover:not(.act){border-color:#555;color:#c9d1d9}
        .upd{margin-left:auto;font-size:0.6rem;color:#333}

        /* ZONE STRIP */
        .zstrip{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;padding:10px;background:#080d18;border:1px solid #1a2035;border-radius:9px}
        .zchip{padding:3px 9px;border-radius:20px;font-size:0.62rem;display:flex;align-items:center;gap:4px;transition:.25s}
        .zchip.za{transform:scale(1.1);font-weight:700}

        /* CHARTS */
        .csec{background:#080d18;border:1px solid #1a2035;border-radius:10px;padding:10px;margin-bottom:12px}
        .chdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:0.72rem;color:#555}
        .rbtn{background:#111827;border:1px solid #1f2937;color:#555;padding:3px 9px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:0.72rem;transition:.15s}
        .rbtn:hover{color:#ffd740;border-color:#ffd74055}
        .rleg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .rli{font-size:0.6rem;opacity:.75}
        .spinner{color:#444;font-size:0.75rem;padding:12px 0;text-align:center}

        /* SIGNAL */
        .sigcard{background:#080d18;border:1px solid;border-radius:11px;padding:14px;margin-bottom:12px}
        .sigtit{font-size:0.6rem;color:#444;margin-bottom:6px;letter-spacing:2px;text-transform:uppercase}
        .sigzone{font-size:1.05rem;font-weight:700;margin-bottom:10px}
        .sigdet{display:flex;gap:20px;flex-wrap:wrap}
        .si span{font-size:0.6rem;color:#444;text-transform:uppercase;letter-spacing:1px;display:block}
        .si strong{font-size:0.9rem}
        .acta{margin-top:12px;width:100%;padding:10px;background:rgba(255,215,64,.07);border:1px solid #ffd740;color:#ffd740;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.8rem;font-weight:600;transition:.2s}
        .acta:hover{background:rgba(255,215,64,.14)}

        /* REPORTS */
        .rhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
        .rhdr h2{font-size:0.9rem;color:#ffd740}
        .abtn{background:rgba(255,215,64,.08);border:1px solid #ffd740;color:#ffd740;padding:6px 14px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.78rem;transition:.2s}
        .abtn:hover{background:rgba(255,215,64,.15)}
        .aform{background:#080d18;border:1px solid #1f2937;border-radius:11px;padding:14px;margin-bottom:12px;animation:sd .2s ease}
        @keyframes sd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .ftit{color:#ffd740;font-size:0.8rem;margin-bottom:10px;font-weight:600}
        .fgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .fgrid label{display:flex;flex-direction:column;gap:4px}
        .fgrid label.full{grid-column:1/-1}
        .fgrid label span{font-size:0.63rem;color:#666;text-transform:uppercase;letter-spacing:.5px}
        .fgrid input{background:#111827;border:1px solid #1f2937;color:#c9d1d9;padding:9px 10px;border-radius:6px;font-family:inherit;font-size:0.8rem;outline:none;transition:border-color .2s;width:100%}
        .fgrid input:focus{border-color:#ffd74077}
        .frow{display:flex;gap:8px;margin-top:12px}
        .sbtn{flex:1;padding:10px;background:#ffd740;border:none;color:#0a0e1a;font-weight:800;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.85rem;transition:.2s}
        .sbtn:hover{background:#ffca28}
        .cbtn{padding:10px 16px;background:#111827;border:1px solid #1f2937;color:#666;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.8rem}
        .cbtn:hover{color:#c9d1d9}
        .empty{text-align:center;padding:40px 20px;color:#444;font-size:0.82rem}
        .empty-icon{font-size:2rem;margin-bottom:8px}
        .rlist{display:flex;flex-direction:column;gap:9px}
        .rcard{background:#080d18;border:1px solid;border-radius:9px;padding:12px 14px;position:relative;transition:transform .2s}
        .rcard.rp{border-color:rgba(0,230,118,.2)}
        .rcard.rl{border-color:rgba(239,68,68,.2)}
        .rcard:hover{transform:translateY(-1px)}
        .rtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;padding-right:50px}
        .rdate{font-size:0.78rem;color:#777}
        .rprofit{font-size:1rem;font-weight:700}
        .rnotes{font-size:0.7rem;color:#666;font-style:italic;padding-right:50px}
        .ractions{position:absolute;top:10px;right:10px;display:flex;gap:5px}
        .edbtn,.delbtn{background:none;border:none;cursor:pointer;font-size:0.8rem;opacity:.35;transition:opacity .2s;padding:1px 3px}
        .edbtn:hover,.delbtn:hover{opacity:1}
        .up{color:#00e676}.dn{color:#ef4444}

        /* STATS */
        .sgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:16px}
        .sc{background:#080d18;border:1px solid #1a2035;border-radius:9px;padding:13px;text-align:center}
        .sc.hl{grid-column:1/-1;border-color:rgba(255,215,64,.15)}
        .slbl{font-size:0.63rem;color:#555;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px}
        .sval{font-size:1.2rem;font-weight:700;color:#c9d1d9}
        .sval.big{font-size:1.6rem}
        .eqsec{background:#080d18;border:1px solid #1a2035;border-radius:9px;padding:12px}

        /* FOOTER */
        .ftr{display:flex;justify-content:space-between;padding:7px 14px;border-top:1px solid #1a2035;font-size:0.6rem;color:#2d3748;background:#080d18;letter-spacing:.5px}

        @media(max-width:480px){
          .fgrid{grid-template-columns:1fr}
          .sigdet{gap:14px}
          .zstrip{gap:4px}
          .zchip{font-size:0.58rem;padding:2px 7px}
          .logo{font-size:0.8rem}
          .price{font-size:1rem}
        }
      `}</style>
    </>
  );
}
