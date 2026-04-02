import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

const RSI_LEVELS = [
  { level: 15, label: 'Entry Buy',  color: '#00ff88', alert: true  },
  { level: 20, label: 'Buy',        color: '#00e676', alert: true  },
  { level: 30, label: 'Zona Buy',   color: '#69f0ae', alert: false },
  { level: 50, label: 'Sideways',   color: '#ffd740', alert: false },
  { level: 70, label: 'Zona Sell',  color: '#ff9800', alert: false },
  { level: 80, label: 'Sell',       color: '#ff1744', alert: true  },
  { level: 85, label: 'Entry Sell', color: '#d50000', alert: true  },
];

const TIMEFRAMES = ['M1','M5','M15','M30','H1','H4'];

const SOURCE_LABEL = {
  twelvedata:       '🟢 LIVE',
  twelvedata_quote: '🟢 LIVE',
  finnhub:          '🟡 LIVE',
  simulated:        '🔴 DEMO',
};

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

function today() { return new Date().toISOString().split('T')[0]; }

export default function Dashboard() {
  // Chart refs
  const candleRef    = useRef(null);
  const rsiRef       = useRef(null);
  const ccRef        = useRef(null);   // createChart instance (candle)
  const rcRef        = useRef(null);   // createChart instance (rsi)
  const csRef        = useRef(null);   // candleSeries
  const rsRef        = useRef(null);   // rsiSeries
  const builtRef     = useRef(false);
  const tfRef        = useRef('H1');

  // Market state
  const [tf, setTf]               = useState('H1');
  const [price, setPrice]         = useState(null);
  const [change, setChange]       = useState(null);
  const [changePct, setChangePct] = useState(null);
  const [rsi, setRsi]             = useState(null);
  const [rsiInfo, setRsiInfo]     = useState(getRSIInfo(null));
  const [source, setSource]       = useState('');
  const [priceSrc, setPriceSrc]   = useState('');
  const [lastUpd, setLastUpd]     = useState('');
  const [isLive, setIsLive]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [lastAlertZone, setLastAlertZone] = useState('');

  // App state
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifStatus, setNotifStatus]   = useState('');
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [reports, setReports]           = useState([]);
  const [stats, setStats]               = useState(null);
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState(null);
  const [form, setForm]                 = useState({ date: today(), profit: '', notes: '' });

  // ── Build charts (called once per TF change) ─────────────────────
  const buildCharts = useCallback(async (data) => {
    if (!candleRef.current || !rsiRef.current) return;
    // Destroy old instances
    if (ccRef.current) { try { ccRef.current.remove(); } catch(e){} }
    if (rcRef.current) { try { rcRef.current.remove(); } catch(e){} }
    ccRef.current = null; rcRef.current = null;
    csRef.current = null; rsRef.current = null;
    candleRef.current.innerHTML = '';
    rsiRef.current.innerHTML    = '';
    builtRef.current = false;

    try {
      const { createChart, CrosshairMode } = await import('lightweight-charts');

      // ── Candlestick chart ──────────────────────────────────────────
      const cc = createChart(candleRef.current, {
        layout: { background: { color: '#070c17' }, textColor: '#6b7588' },
        grid:   { vertLines: { color: '#0f1623' }, horzLines: { color: '#0f1623' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2a3a' },
        timeScale: { borderColor: '#1e2a3a', timeVisible: true, secondsVisible: false },
        width:  candleRef.current.clientWidth,
        height: candleRef.current.clientHeight || 320,
      });

      const cs = cc.addCandlestickSeries({
        upColor:        '#00e676',
        downColor:      '#ef4444',
        borderUpColor:  '#00e676',
        borderDownColor:'#ef4444',
        wickUpColor:    '#00e676',
        wickDownColor:  '#ef4444',
      });
      cs.setData(data.candles);
      cc.timeScale().fitContent();
      ccRef.current = cc;
      csRef.current = cs;

      // ── RSI chart ──────────────────────────────────────────────────
      const rc = createChart(rsiRef.current, {
        layout: { background: { color: '#070c17' }, textColor: '#6b7588' },
        grid:   { vertLines: { color: '#0f1623' }, horzLines: { color: '#0f1623' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2a3a' },
        timeScale: { borderColor: '#1e2a3a', timeVisible: true, secondsVisible: false },
        width:  rsiRef.current.clientWidth,
        height: rsiRef.current.clientHeight || 220,
      });

      const rsiLineData = data.candles.slice(14).map((c, i) => ({
        time:  c.time,
        value: data.rsi[i] ?? 50,
      })).filter(d => d.value != null);

      const rsSeries = rc.addLineSeries({
        color:     '#7c3aed',
        lineWidth: 2,
      });
      rsSeries.setData(rsiLineData);
      rsSeries.applyOptions({
        priceFormat: { type: 'custom', minMove: 0.01, formatter: v => v.toFixed(1) },
      });

      // RSI level lines
      RSI_LEVELS.forEach(({ level, label, color }) => {
        rsSeries.createPriceLine({
          price: level, color, lineWidth: 1,
          lineStyle: 2, axisLabelVisible: true, title: label,
        });
      });

      // Sync crosshair
      let syncing = false;
      cc.subscribeCrosshairMove(p => {
        if (syncing || !p.point) return;
        syncing = true;
        rc.setCrosshairPosition(p.point.x, p.seriesData?.get(cs)?.close ?? 0, rsSeries);
        syncing = false;
      });
      rc.subscribeCrosshairMove(p => {
        if (syncing || !p.point) return;
        syncing = true;
        cc.setCrosshairPosition(p.point.x, p.seriesData?.get(rsSeries)?.value ?? 0, cs);
        syncing = false;
      });

      rc.timeScale().fitContent();
      rcRef.current = rc;
      rsRef.current = rsSeries;
      builtRef.current = true;

      // ResizeObserver
      const ro = new ResizeObserver(() => {
        if (candleRef.current) cc.applyOptions({ width: candleRef.current.clientWidth });
        if (rsiRef.current)    rc.applyOptions({ width: rsiRef.current.clientWidth });
      });
      if (candleRef.current) ro.observe(candleRef.current);
    } catch (e) { console.error('buildCharts error', e); }
  }, []);

  // ── Load candle data + (re)build charts ──────────────────────────
  const loadCandles = useCallback(async (timeframe, rebuild = true) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/xauusd?tf=${timeframe}`);
      const data = await res.json();
      if (!data.ok) return;

      setSource(data.source);
      setIsLive(data.source !== 'simulated');
      setLastUpd(new Date(data.lastUpdated).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));

      const latestRSI = data.currentRSI;
      setRsi(latestRSI);
      const info = getRSIInfo(latestRSI);
      setRsiInfo(info);

      if (rebuild) {
        await buildCharts(data);
      } else if (builtRef.current && csRef.current && rsRef.current) {
        // Just update data without rebuilding
        csRef.current.setData(data.candles);
        const rsiLineData = data.candles.slice(14).map((c, i) => ({
          time: c.time, value: data.rsi[i] ?? 50,
        })).filter(d => d.value != null);
        rsRef.current.setData(rsiLineData);
      }
    } catch (e) { console.error('loadCandles error', e); }
    finally { setLoading(false); }
  }, [buildCharts]);

  // ── Live price polling every 5s ──────────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const res  = await fetch('/api/price');
      const data = await res.json();
      setPrice(data.price);
      setChange(data.change ?? null);
      setChangePct(data.changePct ?? null);
      setPriceSrc(data.source);

      // Real-time: update last candle close on chart
      if (builtRef.current && csRef.current && data.price) {
        const now = Math.floor(Date.now() / 1000);
        const resMin = { M1:1,M5:5,M15:15,M30:30,H1:60,H4:240 }[tfRef.current] || 60;
        // Round down to current bar time
        const barTime = Math.floor(now / (resMin * 60)) * (resMin * 60);
        try {
          csRef.current.update({
            time:  barTime,
            open:  data.price,
            high:  data.price,
            low:   data.price,
            close: data.price,
          });
        } catch(e) { /* safe to ignore */ }
      }
    } catch (e) {}
  }, []);

  // ── Initial mount ─────────────────────────────────────────────────
  useEffect(() => {
    tfRef.current = 'H1';
    loadCandles('H1', true);
    fetchReports();
  }, []);

  // ── TF change ─────────────────────────────────────────────────────
  useEffect(() => {
    tfRef.current = tf;
    loadCandles(tf, true);
  }, [tf]);

  // ── Price interval 5s ─────────────────────────────────────────────
  useEffect(() => {
    fetchPrice();
    const iv = setInterval(fetchPrice, 5000);
    return () => clearInterval(iv);
  }, [fetchPrice]);

  // ── Candle refresh 60s ────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => loadCandles(tfRef.current, false), 60000);
    return () => clearInterval(iv);
  }, [loadCandles]);

  // ── Reports ───────────────────────────────────────────────────────
  const fetchReports = async () => {
    try {
      const res  = await fetch('/api/reports');
      const data = await res.json();
      setReports(data.reports);
      setStats(data.stats);
    } catch (e) {}
  };

  // ── Notifications ─────────────────────────────────────────────────
  const setupNotif = async () => {
    if (!('Notification' in window)) { setNotifStatus('❌ Browser tidak support'); return; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { setNotifStatus('❌ Izin ditolak'); return; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    setNotifEnabled(true);
    setNotifStatus('✅ Notifikasi HP aktif');
    new Notification('⚡ XAUUSD Alert Aktif', {
      body: 'Notifikasi otomatis saat RSI masuk zona Buy/Sell',
      icon: '/icon-192.png',
    });
  };

  // ── Form ──────────────────────────────────────────────────────────
  const openAdd  = () => { setEditId(null); setForm({ date: today(), profit: '', notes: '' }); setShowForm(true); };
  const openEdit = r  => { setEditId(r.id); setForm({ date: r.date, profit: String(r.profit), notes: r.notes }); setShowForm(true); };

  const saveReport = async e => {
    e.preventDefault();
    const method = editId ? 'PUT'  : 'POST';
    const url    = editId ? `/api/reports?id=${editId}` : '/api/reports';
    await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    await fetchReports();
    setShowForm(false); setEditId(null);
  };

  const deleteReport = async id => {
    if (!confirm('Hapus laporan ini?')) return;
    await fetch(`/api/reports?id=${id}`, { method:'DELETE' });
    fetchReports();
  };

  const zc = rsiInfo.color;

  return (
    <>
      <Head>
        <title>⚡ XAUUSD Live Dashboard</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#070c17" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>

      <div className="app">

        {/* ── HEADER ── */}
        <header className="hdr">
          <div className="hdr-l">
            <span className="logo">⚡ XAU/USD</span>
            <div>
              <div className="price-row">
                <span className="price" style={{ color: (change??0) >= 0 ? '#00e676':'#ef4444' }}>
                  {price ? `$${price.toFixed(2)}` : '—'}
                </span>
                {change != null && (
                  <span className="chg" style={{ color: change >= 0 ? '#00e676':'#ef4444' }}>
                    {change >= 0 ? '▲':'▼'} {Math.abs(change).toFixed(2)} ({Math.abs(changePct)}%)
                  </span>
                )}
              </div>
              <div className="plbl">
                <span className={`src-dot ${isLive ? 'live' : 'demo'}`} />
                {priceSrc === 'simulated' ? 'DEMO MODE — Pasang API key untuk live' : `Live via ${priceSrc}`}
              </div>
            </div>
          </div>
          <div className="hdr-r">
            {rsi != null && (
              <div className="rbadge" style={{ background:`${zc}18`, border:`1px solid ${zc}`, color:zc }}>
                <span className="rval">RSI {rsi.toFixed(1)}</span>
                <span className="rlbl">{rsiInfo.label}</span>
              </div>
            )}
            <button className={`nbtn ${notifEnabled?'on':''}`} onClick={setupNotif} title="Toggle notifikasi HP">
              {notifEnabled ? '🔔':'🔕'}
            </button>
          </div>
        </header>

        {notifStatus && (
          <div className="nbar" onClick={() => setNotifStatus('')}>{notifStatus} <span className="nx">✕</span></div>
        )}

        {/* Demo mode banner */}
        {source === 'simulated' && (
          <div className="demo-banner">
            ⚠️ <strong>DEMO MODE</strong> — Data simulasi. Pasang <code>TWELVEDATA_API_KEY</code> di Vercel untuk data live XAU/USD.
            &nbsp;<a href="https://twelvedata.com/register" target="_blank" rel="noreferrer">Daftar gratis →</a>
          </div>
        )}

        {/* ── TABS ── */}
        <nav className="tabs">
          {[['dashboard','📊 Live Chart'],['reports','📋 Laporan'],['stats','📈 Statistik']].map(([id,lbl]) => (
            <button key={id} className={`tab ${activeTab===id?'act':''}`} onClick={() => setActiveTab(id)}>{lbl}</button>
          ))}
        </nav>

        <main className="main">

          {/* ══════════════ DASHBOARD ══════════════ */}
          {activeTab === 'dashboard' && (
            <>
              {/* TF + status bar */}
              <div className="tfsec">
                {TIMEFRAMES.map(t => (
                  <button key={t} className={`tfbtn ${tf===t?'act':''}`} onClick={() => { if (tf!==t) setTf(t); }}>
                    {t}
                  </button>
                ))}
                <div className="tf-right">
                  <span className={`src-pill ${isLive?'live':'demo'}`}>{SOURCE_LABEL[source] || '—'}</span>
                  <span className="upd">{lastUpd}</span>
                </div>
              </div>

              {/* Zone strip */}
              <div className="zstrip">
                {RSI_LEVELS.map(z => {
                  const isA = rsi != null && Math.abs(rsi - z.level) < 8;
                  return (
                    <div key={z.level} className={`zchip ${isA?'za':''}`}
                      style={{ background: isA ? `${z.color}22`:'rgba(255,255,255,0.025)', border:`1px solid ${isA?z.color:z.color+'30'}`, color:z.color }}>
                      <b>{z.level}</b><span>{z.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Candle chart */}
              <div className="csec">
                <div className="chdr">
                  <span>Candlestick XAU/USD · {tf}</span>
                  <button className="rbtn" onClick={() => loadCandles(tf, false)}>↻ Refresh</button>
                </div>
                {loading && <div className="spin">Memuat data chart...</div>}
                <div ref={candleRef} style={{ width:'100%', height:320 }} />
              </div>

              {/* RSI chart */}
              <div className="csec">
                <div className="chdr">
                  <span>RSI (14) · {tf}</span>
                  {rsi != null && <span style={{ color:zc, fontWeight:700 }}>RSI {rsi.toFixed(2)}</span>}
                </div>
                <div ref={rsiRef} style={{ width:'100%', height:220 }} />
                <div className="rleg">
                  {RSI_LEVELS.map(z => (
                    <span key={z.level} style={{ color:z.color }} className="rli">— {z.level} {z.label}</span>
                  ))}
                </div>
              </div>

              {/* Signal card */}
              {rsi != null && (
                <div className="sigcard" style={{ borderColor:zc, boxShadow:`0 0 22px ${zc}15` }}>
                  <div className="sigtit">🎯 SINYAL AKTIF · {tf}</div>
                  <div className="sigzone" style={{ color:zc }}>{rsiInfo.label}</div>
                  <div className="sigdet">
                    <div className="si"><span>Harga</span><strong>${price?.toFixed(2)}</strong></div>
                    <div className="si"><span>RSI</span><strong style={{ color:zc }}>{rsi.toFixed(2)}</strong></div>
                    <div className="si"><span>Alert</span>
                      <strong style={{ color:rsiInfo.alert?'#ef4444':'#00e676' }}>
                        {rsiInfo.alert ? '⚡ ON':'💤 WAIT'}
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

          {/* ══════════════ LAPORAN ══════════════ */}
          {activeTab === 'reports' && (
            <>
              <div className="rhdr">
                <h2>Daily Profit Report</h2>
                <button className="abtn" onClick={openAdd}>＋ Tambah</button>
              </div>

              {showForm && (
                <form className="aform" onSubmit={saveReport}>
                  <div className="ftit">{editId ? '✏️ Edit Laporan':'📝 Tambah Laporan'}</div>
                  <div className="fgrid">
                    <label>
                      <span>Tanggal</span>
                      <input type="date" value={form.date} onChange={e => setForm({...form, date:e.target.value})} required />
                    </label>
                    <label>
                      <span>Profit / Loss (USD)</span>
                      <input type="number" step="0.01" placeholder="250.00 atau -80.00"
                        value={form.profit} onChange={e => setForm({...form, profit:e.target.value})} required />
                    </label>
                    <label className="full">
                      <span>Catatan (opsional)</span>
                      <input type="text" placeholder="cth: scalping sesi London, RSI oversold entry..."
                        value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} />
                    </label>
                  </div>
                  <div className="frow">
                    <button type="submit" className="sbtn">✓ Simpan</button>
                    <button type="button" className="cbtn" onClick={() => { setShowForm(false); setEditId(null); }}>✕ Batal</button>
                  </div>
                </form>
              )}

              {reports.length === 0 && !showForm ? (
                <div className="empty">
                  <div style={{ fontSize:'2.5rem', marginBottom:10 }}>📋</div>
                  <div style={{ color:'#555' }}>Belum ada laporan</div>
                  <div style={{ fontSize:'0.72rem', color:'#333', marginTop:4 }}>Tap "＋ Tambah" untuk mulai mencatat profit harian</div>
                </div>
              ) : (
                <div className="rlist">
                  {reports.map(r => (
                    <div key={r.id} className={`rcard ${r.profit>=0?'rp':'rl'}`}>
                      <div className="rtop">
                        <div className="rdate">{format(parseISO(r.date), 'EEEE, dd MMM yyyy')}</div>
                        <div className={`rprofit ${r.profit>=0?'up':'dn'}`}>
                          {r.profit>=0?'+':''}{r.profit.toFixed(2)} USD
                        </div>
                      </div>
                      {r.notes && <div className="rnotes">📝 {r.notes}</div>}
                      <div className="racts">
                        <button className="edbtn" onClick={() => openEdit(r)}>✏️ Edit</button>
                        <button className="delbtn" onClick={() => deleteReport(r.id)}>🗑 Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ══════════════ STATISTIK ══════════════ */}
          {activeTab === 'stats' && (
            <>
              <h2 style={{ color:'#ffd740', fontSize:'0.9rem', marginBottom:14 }}>📊 Statistik Trading</h2>

              {!stats || stats.totalDays === 0 ? (
                <div className="empty">
                  <div style={{ fontSize:'0.78rem', color:'#444' }}>Tambah laporan dulu untuk melihat statistik</div>
                </div>
              ) : (
                <>
                  <div className="sgrid">
                    <div className="sc hl">
                      <div className="slbl">Total Profit</div>
                      <div className={`sval big ${stats.totalProfit>=0?'up':'dn'}`}>
                        {stats.totalProfit>=0?'+':''}{stats.totalProfit.toFixed(2)} USD
                      </div>
                    </div>
                    <div className="sc">
                      <div className="slbl">Win Rate</div>
                      <div className="sval" style={{ color:stats.winRate>=50?'#00e676':'#ef4444' }}>
                        {stats.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="sc">
                      <div className="slbl">Total Hari</div>
                      <div className="sval">{stats.totalDays}</div>
                    </div>
                    <div className="sc">
                      <div className="slbl">Avg / Hari</div>
                      <div className={`sval ${stats.avgProfit>=0?'up':'dn'}`}>
                        {stats.avgProfit>=0?'+':''}{stats.avgProfit.toFixed(2)}
                      </div>
                    </div>
                    <div className="sc"><div className="slbl">✅ Profit Days</div><div className="sval up">{stats.winDays}</div></div>
                    <div className="sc"><div className="slbl">❌ Loss Days</div><div className="sval dn">{stats.lossDays}</div></div>
                  </div>

                  {reports.length >= 2 && (() => {
                    const sorted = [...reports].sort((a,b) => new Date(a.date)-new Date(b.date));
                    let cum = 0;
                    const pts = sorted.map(r => { cum += r.profit; return cum; });
                    const mn = Math.min(0,...pts), mx = Math.max(...pts);
                    const rng = mx-mn||1;
                    const w   = 100/Math.max(pts.length-1,1);
                    const lc  = pts[pts.length-1]>=0?'#00e676':'#ef4444';
                    return (
                      <div className="eqsec">
                        <div className="chdr">📈 Equity Curve</div>
                        <div style={{ height:130, marginTop:10 }}>
                          <svg viewBox="0 0 100 60" style={{width:'100%',height:'100%'}} preserveAspectRatio="none">
                            <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={lc} stopOpacity="0.28"/>
                              <stop offset="100%" stopColor={lc} stopOpacity="0"/>
                            </linearGradient></defs>
                            <polygon points={`0,60 ${pts.map((p,i)=>`${i*w},${60-((p-mn)/rng)*52}`).join(' ')} ${(pts.length-1)*w},60`} fill="url(#eg)"/>
                            <polyline points={pts.map((p,i)=>`${i*w},${60-((p-mn)/rng)*52}`).join(' ')} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round"/>
                            {pts.map((p,i)=><circle key={i} cx={i*w} cy={60-((p-mn)/rng)*52} r="1.5" fill={lc}/>)}
                          </svg>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </main>

        <footer className="ftr">
          <span>⚡ XAU/USD Dashboard</span>
          <span>Price 5s · Chart 60s</span>
          <span>{notifEnabled?'🔔 Alert ON':'🔕 Alert OFF'}</span>
        </footer>
      </div>

      <style jsx global>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#070c17;color:#c4cdd8;font-family:'JetBrains Mono','Fira Code',Consolas,monospace;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        .app{max-width:860px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}

        .hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#050a13;border-bottom:1px solid #131d2b;position:sticky;top:0;z-index:100;gap:10px}
        .hdr-l{display:flex;align-items:center;gap:10px;min-width:0}
        .logo{font-size:0.85rem;font-weight:800;color:#ffd740;letter-spacing:2px;white-space:nowrap;flex-shrink:0}
        .price-row{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
        .price{font-size:1.1rem;font-weight:700;line-height:1.2}
        .chg{font-size:0.68rem;font-weight:400}
        .plbl{font-size:0.54rem;color:#3a4a5c;margin-top:2px;display:flex;align-items:center;gap:5px}
        .src-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .src-dot.live{background:#00e676;box-shadow:0 0 6px #00e67688;animation:blink 2s infinite}
        .src-dot.demo{background:#ef4444}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
        .hdr-r{display:flex;align-items:center;gap:6px;flex-shrink:0}
        .rbadge{padding:4px 8px;border-radius:7px;display:flex;flex-direction:column;align-items:center;line-height:1.5}
        .rval{font-weight:800;font-size:0.75rem;white-space:nowrap}
        .rlbl{font-size:0.5rem;opacity:.9;white-space:nowrap}
        .nbtn{background:#0e1826;border:1px solid #1e2a3a;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:1rem;transition:.2s;flex-shrink:0}
        .nbtn.on{background:rgba(255,215,64,.1);border-color:#ffd740}
        .nbtn:hover{transform:scale(1.07)}
        .nbar{background:#0e1826;border-bottom:1px solid #1e2a3a;padding:7px 14px;font-size:0.72rem;display:flex;justify-content:space-between;cursor:pointer;color:#ffd740}
        .nx{color:#444}

        .demo-banner{background:#1a0e0a;border-bottom:1px solid #3a1a0a;padding:7px 14px;font-size:0.72rem;color:#ff9800}
        .demo-banner a{color:#ffd740;text-decoration:none}
        .demo-banner a:hover{text-decoration:underline}
        .demo-banner code{background:#2a1a0a;padding:1px 5px;border-radius:3px;font-size:0.68rem}

        .tabs{display:flex;background:#050a13;border-bottom:1px solid #131d2b}
        .tab{flex:1;padding:10px 4px;background:none;border:none;color:#3a4a5c;cursor:pointer;font-family:inherit;font-size:0.74rem;border-bottom:2px solid transparent;transition:.2s}
        .tab.act{color:#ffd740;border-bottom-color:#ffd740;background:rgba(255,215,64,.03)}
        .tab:hover:not(.act){color:#c4cdd8}
        .main{flex:1;padding:12px;overflow-y:auto}

        .tfsec{display:flex;align-items:center;gap:5px;margin-bottom:10px;flex-wrap:wrap}
        .tfbtn{background:#0e1826;border:1px solid #1e2a3a;color:#3a4a5c;padding:5px 11px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.73rem;transition:.15s}
        .tfbtn.act{background:rgba(255,215,64,.1);border-color:#ffd740;color:#ffd740;font-weight:700}
        .tfbtn:hover:not(.act){border-color:#3a4a5c;color:#c4cdd8}
        .tf-right{margin-left:auto;display:flex;align-items:center;gap:8px}
        .src-pill{font-size:0.6rem;padding:2px 7px;border-radius:10px;font-weight:700}
        .src-pill.live{background:#00e67618;color:#00e676;border:1px solid #00e67633}
        .src-pill.demo{background:#ef444418;color:#ef4444;border:1px solid #ef444433}
        .upd{font-size:0.58rem;color:#2a3a4a}

        .zstrip{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;padding:9px;background:#050a13;border:1px solid #131d2b;border-radius:9px}
        .zchip{padding:3px 8px;border-radius:20px;font-size:0.6rem;display:flex;align-items:center;gap:4px;transition:.25s}
        .zchip.za{transform:scale(1.1);font-weight:700}

        .csec{background:#050a13;border:1px solid #131d2b;border-radius:10px;padding:10px;margin-bottom:11px}
        .chdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:0.7rem;color:#3a4a5c}
        .rbtn{background:#0e1826;border:1px solid #1e2a3a;color:#3a4a5c;padding:3px 9px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:0.7rem;transition:.15s}
        .rbtn:hover{color:#ffd740;border-color:#ffd74044}
        .rleg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .rli{font-size:0.58rem;opacity:.7}
        .spin{color:#2a3a4a;font-size:0.72rem;padding:10px 0;text-align:center}

        .sigcard{background:#050a13;border:1px solid;border-radius:11px;padding:13px;margin-bottom:11px}
        .sigtit{font-size:0.58rem;color:#2a3a4a;margin-bottom:6px;letter-spacing:2px;text-transform:uppercase}
        .sigzone{font-size:1rem;font-weight:700;margin-bottom:10px}
        .sigdet{display:flex;gap:18px;flex-wrap:wrap}
        .si span{font-size:0.58rem;color:#2a3a4a;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px}
        .si strong{font-size:0.88rem}
        .acta{margin-top:11px;width:100%;padding:10px;background:rgba(255,215,64,.07);border:1px solid #ffd740;color:#ffd740;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.78rem;font-weight:600;transition:.2s}
        .acta:hover{background:rgba(255,215,64,.13)}

        .rhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
        .rhdr h2{font-size:0.88rem;color:#ffd740}
        .abtn{background:rgba(255,215,64,.07);border:1px solid #ffd740;color:#ffd740;padding:6px 13px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.76rem;transition:.2s}
        .abtn:hover{background:rgba(255,215,64,.13)}
        .aform{background:#050a13;border:1px solid #1e2a3a;border-radius:11px;padding:14px;margin-bottom:12px;animation:sd .18s ease}
        @keyframes sd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .ftit{color:#ffd740;font-size:0.78rem;margin-bottom:10px;font-weight:600}
        .fgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .fgrid label{display:flex;flex-direction:column;gap:4px}
        .fgrid label.full{grid-column:1/-1}
        .fgrid label span{font-size:0.6rem;color:#3a4a5c;text-transform:uppercase;letter-spacing:.5px}
        .fgrid input{background:#0e1826;border:1px solid #1e2a3a;color:#c4cdd8;padding:9px 10px;border-radius:6px;font-family:inherit;font-size:0.78rem;outline:none;transition:border-color .2s;width:100%}
        .fgrid input:focus{border-color:#ffd74066}
        .frow{display:flex;gap:8px;margin-top:11px}
        .sbtn{flex:1;padding:10px;background:#ffd740;border:none;color:#070c17;font-weight:800;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.83rem;transition:.2s}
        .sbtn:hover{background:#ffca28}
        .cbtn{padding:10px 14px;background:#0e1826;border:1px solid #1e2a3a;color:#3a4a5c;border-radius:7px;cursor:pointer;font-family:inherit;font-size:0.76rem}
        .cbtn:hover{color:#c4cdd8}
        .empty{text-align:center;padding:40px 20px}
        .rlist{display:flex;flex-direction:column;gap:9px}
        .rcard{background:#050a13;border:1px solid;border-radius:9px;padding:12px 13px;transition:transform .2s}
        .rcard.rp{border-color:rgba(0,230,118,.18)}
        .rcard.rl{border-color:rgba(239,68,68,.18)}
        .rcard:hover{transform:translateY(-1px)}
        .rtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
        .rdate{font-size:0.74rem;color:#3a4a5c}
        .rprofit{font-size:0.98rem;font-weight:700}
        .rnotes{font-size:0.68rem;color:#3a4a5c;font-style:italic;margin-bottom:7px}
        .racts{display:flex;gap:6px;margin-top:8px;border-top:1px solid #131d2b;padding-top:7px}
        .edbtn,.delbtn{background:none;border:1px solid #1e2a3a;border-radius:5px;cursor:pointer;font-size:0.68rem;color:#3a4a5c;padding:3px 9px;font-family:inherit;transition:.15s}
        .edbtn:hover{color:#ffd740;border-color:#ffd74044}
        .delbtn:hover{color:#ef4444;border-color:#ef444444}
        .up{color:#00e676}.dn{color:#ef4444}

        .sgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px}
        .sc{background:#050a13;border:1px solid #131d2b;border-radius:9px;padding:13px;text-align:center}
        .sc.hl{grid-column:1/-1;border-color:rgba(255,215,64,.12)}
        .slbl{font-size:0.6rem;color:#3a4a5c;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px}
        .sval{font-size:1.2rem;font-weight:700;color:#c4cdd8}
        .sval.big{font-size:1.55rem}
        .eqsec{background:#050a13;border:1px solid #131d2b;border-radius:9px;padding:12px}

        .ftr{display:flex;justify-content:space-between;padding:7px 14px;border-top:1px solid #131d2b;font-size:0.58rem;color:#1e2a3a;background:#050a13}

        @media(max-width:480px){
          .fgrid{grid-template-columns:1fr}
          .sigdet{gap:12px}
          .zstrip{gap:4px}
          .zchip{font-size:0.56rem;padding:2px 7px}
          .logo{font-size:0.78rem;letter-spacing:1px}
          .price{font-size:1rem}
          .chg{display:none}
        }
      `}</style>
    </>
  );
}
