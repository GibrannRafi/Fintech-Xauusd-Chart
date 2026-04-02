import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

const RSI_ZONES = [
  { level: 15, label: 'Entry Buy', color: '#00ff88', bg: 'rgba(0,255,136,0.15)', zone: 'buy' },
  { level: 20, label: 'Buy', color: '#00e676', bg: 'rgba(0,230,118,0.12)', zone: 'buy' },
  { level: 30, label: 'Zona Buy', color: '#69f0ae', bg: 'rgba(105,240,174,0.08)', zone: 'buy' },
  { level: 50, label: 'Sideways', color: '#ffd740', bg: 'rgba(255,215,64,0.08)', zone: 'sideways' },
  { level: 70, label: 'Zona Sell', color: '#ff6d6d', bg: 'rgba(255,109,109,0.08)', zone: 'sell' },
  { level: 80, label: 'Sell', color: '#ff1744', bg: 'rgba(255,23,68,0.12)', zone: 'sell' },
  { level: 85, label: 'Entry Sell', color: '#d50000', bg: 'rgba(213,0,0,0.15)', zone: 'sell' },
];

function getRSIZone(rsi) {
  if (rsi <= 15) return { zone: 'entry_buy', label: '🟢 ENTRY BUY KUAT', color: '#00ff88', alert: true };
  if (rsi <= 20) return { zone: 'buy', label: '🟢 ZONA BUY', color: '#00e676', alert: true };
  if (rsi <= 30) return { zone: 'buy_weak', label: '🟩 BUY LEMAH', color: '#69f0ae', alert: false };
  if (rsi <= 50) return { zone: 'sideways', label: '🟡 SIDEWAYS', color: '#ffd740', alert: false };
  if (rsi <= 70) return { zone: 'sell_weak', label: '🟧 MULAI SELL', color: '#ff6d6d', alert: false };
  if (rsi <= 80) return { zone: 'sell', label: '🔴 ZONA SELL', color: '#ff1744', alert: true };
  return { zone: 'entry_sell', label: '🔴 ENTRY SELL KUAT', color: '#d50000', alert: true };
}

export default function Dashboard() {
  const chartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const chartBuilt = useRef(false);
  const [chartData, setChartData] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [currentRSI, setCurrentRSI] = useState(null);
  const [rsiZone, setRsiZone] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifStatus, setNotifStatus] = useState('');
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddForm, setShowAddForm] = useState(false);
  const [lastAlertZone, setLastAlertZone] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    profit: '', trades: '', winRate: '', notes: '', pairs: 'XAUUSD'
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/xauusd');
      const data = await res.json();
      setChartData(data);
      setCurrentPrice(data.currentPrice);
      const latestRSI = data.rsi[data.rsi.length - 1];
      setCurrentRSI(latestRSI);
      const zone = getRSIZone(latestRSI);
      setRsiZone(zone);
      if (zone.alert && notifEnabled && lastAlertZone !== zone.zone) {
        const isBuy = zone.zone.includes('buy');
        if (Notification.permission === 'granted') {
          new Notification(`${isBuy ? '🟢' : '🔴'} ${zone.label}`, {
            body: `XAUUSD: $${data.currentPrice?.toFixed(2)} | RSI: ${latestRSI?.toFixed(1)} — Saatnya ${isBuy ? 'BELI' : 'JUAL'}!`,
            icon: '/icon-192.png', requireInteraction: true,
          });
        }
        setLastAlertZone(zone.zone);
      }
    } catch (e) { console.error(e); }
  }, [notifEnabled, lastAlertZone]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setReports(data.reports);
      setStats(data.stats);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchData();
    fetchReports();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!chartData || chartBuilt.current || typeof window === 'undefined') return;
    chartBuilt.current = true;
    (async () => {
      try {
        const { createChart } = await import('lightweight-charts');
        if (chartRef.current) {
          const c = createChart(chartRef.current, {
            layout: { background: { color: '#0a0e1a' }, textColor: '#c9d1d9' },
            grid: { vertLines: { color: '#1a2035' }, horzLines: { color: '#1a2035' } },
            rightPriceScale: { borderColor: '#1a2035' },
            timeScale: { borderColor: '#1a2035', timeVisible: true },
            width: chartRef.current.clientWidth, height: 300,
          });
          const s = c.addCandlestickSeries({ upColor: '#00e676', downColor: '#ff1744', borderVisible: false, wickUpColor: '#00e676', wickDownColor: '#ff1744' });
          s.setData(chartData.candles);
          c.timeScale().fitContent();
        }
        if (rsiChartRef.current) {
          const rc = createChart(rsiChartRef.current, {
            layout: { background: { color: '#0a0e1a' }, textColor: '#c9d1d9' },
            grid: { vertLines: { color: '#1a2035' }, horzLines: { color: '#1a2035' } },
            rightPriceScale: { borderColor: '#1a2035' },
            timeScale: { borderColor: '#1a2035', timeVisible: true },
            width: rsiChartRef.current.clientWidth, height: 220,
          });
          const rs = rc.addLineSeries({ color: '#7c4dff', lineWidth: 2 });
          const rsiData = chartData.candles.slice(14).map((c, i) => ({ time: c.time, value: chartData.rsi[i] ?? 50 })).filter(d => d.value !== undefined);
          rs.setData(rsiData);
          RSI_ZONES.forEach(({ level, label, color }) => {
            rs.createPriceLine({ price: level, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: label });
          });
          rc.timeScale().fitContent();
        }
      } catch (e) { console.error('chart err', e); }
    })();
  }, [chartData]);

  const setupNotifications = async () => {
    if (!('Notification' in window)) { setNotifStatus('❌ Browser tidak support notifikasi'); return; }
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { setNotifStatus('❌ Izin ditolak. Cek setting browser/HP.'); return; }
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
      setNotifEnabled(true);
      setNotifStatus('✅ Notifikasi aktif! Alert otomatis saat masuk zona Buy/Sell');
      new Notification('⚡ XAUUSD Alert Aktif', { body: 'Monitoring RSI — notifikasi otomatis saat masuk zona trading', icon: '/icon-192.png' });
    } catch (e) { setNotifStatus('❌ ' + e.message); }
  };

  const handleAddReport = async (e) => {
    e.preventDefault();
    await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    await fetchReports();
    setShowAddForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], profit: '', trades: '', winRate: '', notes: '', pairs: 'XAUUSD' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus laporan ini?')) return;
    await fetch(`/api/reports?id=${id}`, { method: 'DELETE' });
    fetchReports();
  };

  const zc = rsiZone?.color || '#ffd740';

  return (
    <>
      <Head>
        <title>⚡ XAUUSD Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0e1a" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>
      <div className="app">
        <header className="hdr">
          <div className="hdr-l">
            <div className="logo">⚡ XAUUSD</div>
            <div>
              <div className="price">{currentPrice ? `$${currentPrice.toFixed(2)}` : '...'}</div>
              <div className="plabel">GOLD / USD</div>
            </div>
          </div>
          <div className="hdr-r">
            {rsiZone && (
              <div className="rbadge" style={{ background: `${zc}22`, border: `1px solid ${zc}`, color: zc }}>
                <span className="rval">RSI {currentRSI?.toFixed(1)}</span>
                <span className="rlbl">{rsiZone.label}</span>
              </div>
            )}
            <button className={`nbtn ${notifEnabled ? 'on' : ''}`} onClick={setupNotifications} title="Toggle notifikasi">
              {notifEnabled ? '🔔' : '🔕'}
            </button>
          </div>
        </header>

        {notifStatus && (
          <div className="nbar" onClick={() => setNotifStatus('')}>{notifStatus} <span>✕</span></div>
        )}

        <nav className="tabs">
          {[['dashboard','📊 Dashboard'],['reports','📋 Laporan'],['stats','📈 Statistik']].map(([id,lbl]) => (
            <button key={id} className={`tab ${activeTab===id?'act':''}`} onClick={() => setActiveTab(id)}>{lbl}</button>
          ))}
        </nav>

        <main className="main">
          {activeTab === 'dashboard' && (
            <div>
              <div className="zguide">
                <div className="ztitle">📍 RSI Zone Reference</div>
                <div className="zones">
                  {RSI_ZONES.map(z => {
                    const isA = currentRSI && Math.abs(currentRSI - z.level) < 7;
                    return (
                      <div key={z.level} className={`zchip ${isA?'za':''}`}
                        style={{ background: isA ? z.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${isA?z.color:z.color+'44'}`, color: z.color }}>
                        <b>{z.level}</b><span>{z.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="csec">
                <div className="chdr"><span>Candlestick XAUUSD (1H)</span>
                  <button onClick={fetchData} className="rbtn">↻ Refresh</button>
                </div>
                <div ref={chartRef} style={{ width:'100%', minHeight:300 }} />
              </div>

              <div className="csec">
                <div className="chdr">
                  <span>RSI (14) — Zona Levels</span>
                  {currentRSI && <span style={{color:'#7c4dff'}}>RSI: {currentRSI.toFixed(2)}</span>}
                </div>
                <div ref={rsiChartRef} style={{ width:'100%', minHeight:220 }} />
                <div className="rleg">
                  {RSI_ZONES.map(z => <span key={z.level} style={{color:z.color}} className="rli">— {z.level} {z.label}</span>)}
                </div>
              </div>

              {rsiZone && (
                <div className="sigcard" style={{ borderColor: zc, boxShadow: `0 0 24px ${zc}22` }}>
                  <div className="sigtitle">🎯 SINYAL AKTIF</div>
                  <div className="sigzone" style={{color:zc}}>{rsiZone.label}</div>
                  <div className="sigdet">
                    <div className="si"><span>Harga</span><strong>${currentPrice?.toFixed(2)}</strong></div>
                    <div className="si"><span>RSI</span><strong style={{color:zc}}>{currentRSI?.toFixed(2)}</strong></div>
                    <div className="si"><span>Alert</span><strong style={{color:rsiZone.alert?'#ff6d6d':'#69f0ae'}}>{rsiZone.alert?'⚡ AKTIF':'💤 WAIT'}</strong></div>
                  </div>
                  {!notifEnabled && rsiZone.alert && (
                    <button className="acta" onClick={setupNotifications}>🔔 Aktifkan Notifikasi ke HP</button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reports' && (
            <div>
              <div className="rhdr">
                <h2>Daily Profit Report</h2>
                <button className="abtn" onClick={() => setShowAddForm(v => !v)}>{showAddForm ? '✕ Batal' : '＋ Tambah'}</button>
              </div>
              {showAddForm && (
                <form className="aform" onSubmit={handleAddReport}>
                  <div className="ftitle">📝 Input Laporan Harian</div>
                  <div className="fgrid">
                    <label><span>Tanggal</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required /></label>
                    <label><span>Profit/Loss (USD)</span><input type="number" step="0.01" placeholder="250.00 atau -80" value={form.profit} onChange={e=>setForm({...form,profit:e.target.value})} required /></label>
                    <label><span>Jumlah Trade</span><input type="number" min="1" placeholder="3" value={form.trades} onChange={e=>setForm({...form,trades:e.target.value})} required /></label>
                    <label><span>Win Rate (%)</span><input type="number" min="0" max="100" step="0.1" placeholder="66.7" value={form.winRate} onChange={e=>setForm({...form,winRate:e.target.value})} required /></label>
                    <label className="full"><span>Catatan</span><input type="text" placeholder="Catatan trading hari ini..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label>
                  </div>
                  <button type="submit" className="sbtn">✓ Simpan Laporan</button>
                </form>
              )}
              <div className="rlist">
                {reports.map(r => (
                  <div key={r.id} className={`rcard ${r.profit>=0?'rp':'rl'}`}>
                    <div className="rtop">
                      <div className="rdate">{format(parseISO(r.date), 'dd MMM yyyy')}</div>
                      <div className={`rprofit ${r.profit>=0?'up':'dn'}`}>{r.profit>=0?'+':''}{r.profit.toFixed(2)} USD</div>
                    </div>
                    <div className="rmid"><span>🔢 {r.trades} trades</span><span>🎯 {r.winRate}% WR</span><span>💱 {r.pairs}</span></div>
                    {r.notes && <div className="rnotes">📝 {r.notes}</div>}
                    <button className="dbtn" onClick={() => handleDelete(r.id)}>🗑</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stats' && stats && (
            <div>
              <h2 style={{color:'#ffd740',fontSize:'0.95rem',marginBottom:14}}>📊 Statistik Trading</h2>
              <div className="sgrid">
                <div className="sc hl">
                  <div className="slbl">Total Profit</div>
                  <div className={`sval big ${stats.totalProfit>=0?'up':'dn'}`}>{stats.totalProfit>=0?'+':''}{stats.totalProfit.toFixed(2)} USD</div>
                </div>
                <div className="sc"><div className="slbl">Win Rate</div><div className="sval" style={{color:stats.winRate>=50?'#00e676':'#ff1744'}}>{stats.winRate.toFixed(1)}%</div></div>
                <div className="sc"><div className="slbl">Total Hari</div><div className="sval">{stats.totalDays}</div></div>
                <div className="sc"><div className="slbl">Avg/Hari</div><div className={`sval ${stats.avgProfit>=0?'up':'dn'}`}>{stats.avgProfit>=0?'+':''}{stats.avgProfit.toFixed(2)}</div></div>
                <div className="sc"><div className="slbl">✅ Profit Days</div><div className="sval up">{stats.winDays}</div></div>
                <div className="sc"><div className="slbl">❌ Loss Days</div><div className="sval dn">{stats.lossDays}</div></div>
                <div className="sc"><div className="slbl">Total Trade</div><div className="sval">{stats.totalTrades}</div></div>
              </div>

              <div className="eqsec">
                <div className="chdr">📈 Equity Curve</div>
                <div style={{height:130,marginTop:12}}>
                  {(() => {
                    const sorted = [...reports].sort((a,b) => new Date(a.date)-new Date(b.date));
                    let cum = 0;
                    const pts = sorted.map(r => { cum += r.profit; return cum; });
                    if (pts.length < 2) return <div style={{color:'#555',textAlign:'center',paddingTop:40}}>Belum cukup data</div>;
                    const mn = Math.min(0,...pts), mx = Math.max(...pts);
                    const rng = mx - mn || 1;
                    const w = 100 / (pts.length - 1);
                    const lc = pts[pts.length-1] >= 0 ? '#00e676' : '#ff1744';
                    return (
                      <svg viewBox="0 0 100 60" style={{width:'100%',height:'100%'}} preserveAspectRatio="none">
                        <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={lc} stopOpacity="0.35"/>
                          <stop offset="100%" stopColor={lc} stopOpacity="0"/>
                        </linearGradient></defs>
                        <polygon points={`0,60 ${pts.map((p,i) => `${i*w},${60-((p-mn)/rng)*52}`).join(' ')} ${(pts.length-1)*w},60`} fill="url(#eg)" />
                        <polyline points={pts.map((p,i) => `${i*w},${60-((p-mn)/rng)*52}`).join(' ')} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" />
                        {pts.map((p,i) => <circle key={i} cx={i*w} cy={60-((p-mn)/rng)*52} r="1.3" fill={lc} />)}
                      </svg>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="ftr">
          <span>⚡ XAUUSD Dashboard</span>
          <span>Auto-refresh 30s</span>
          <span>{notifEnabled ? '🔔 Alert ON' : '🔕 Alert OFF'}</span>
        </footer>
      </div>

      <style jsx global>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#0a0e1a;color:#c9d1d9;font-family:'JetBrains Mono','Fira Code','SF Mono',Consolas,monospace;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        .app{max-width:820px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
        .hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0d1120;border-bottom:1px solid #1a2035;position:sticky;top:0;z-index:100}
        .hdr-l{display:flex;align-items:center;gap:14px}
        .logo{font-size:1rem;font-weight:800;color:#ffd740;letter-spacing:2px;text-shadow:0 0 20px #ffd74055}
        .price{font-size:1.2rem;font-weight:700;color:#00e676}
        .plabel{font-size:0.58rem;color:#555;letter-spacing:1px}
        .hdr-r{display:flex;align-items:center;gap:8px}
        .rbadge{padding:5px 10px;border-radius:8px;font-size:0.68rem;display:flex;flex-direction:column;align-items:center;line-height:1.5}
        .rval{font-weight:800;font-size:0.8rem}
        .rlbl{font-size:0.56rem;opacity:0.85}
        .nbtn{background:#1a2035;border:1px solid #2a3050;border-radius:8px;padding:7px 11px;cursor:pointer;font-size:1.1rem;transition:all .2s}
        .nbtn.on{background:rgba(255,215,64,.1);border-color:#ffd740;box-shadow:0 0 12px #ffd74033}
        .nbtn:hover{transform:scale(1.08)}
        .nbar{background:#1a2035;border-bottom:1px solid #2a3050;padding:8px 16px;font-size:0.75rem;display:flex;justify-content:space-between;cursor:pointer;color:#ffd740}
        .tabs{display:flex;background:#0d1120;border-bottom:1px solid #1a2035}
        .tab{flex:1;padding:11px 6px;background:none;border:none;color:#555;cursor:pointer;font-family:inherit;font-size:0.78rem;border-bottom:2px solid transparent;transition:all .2s}
        .tab.act{color:#ffd740;border-bottom-color:#ffd740;background:rgba(255,215,64,.04)}
        .tab:hover:not(.act){color:#c9d1d9}
        .main{flex:1;padding:14px;overflow-y:auto}
        .zguide{background:#0d1120;border:1px solid #1a2035;border-radius:10px;padding:12px;margin-bottom:14px}
        .ztitle{font-size:0.68rem;color:#555;margin-bottom:10px;letter-spacing:1px;text-transform:uppercase}
        .zones{display:flex;flex-wrap:wrap;gap:6px}
        .zchip{padding:4px 10px;border-radius:20px;font-size:0.68rem;display:flex;align-items:center;gap:5px;transition:all .3s}
        .zchip.za{transform:scale(1.08);font-weight:700}
        .csec{background:#0d1120;border:1px solid #1a2035;border-radius:10px;padding:12px;margin-bottom:14px}
        .chdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:0.76rem;color:#666}
        .rbtn{background:#1a2035;border:1px solid #2a3050;color:#777;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:0.72rem;font-family:inherit;transition:all .2s}
        .rbtn:hover{color:#ffd740;border-color:#ffd74066}
        .rleg{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
        .rli{font-size:0.63rem;opacity:0.75}
        .sigcard{background:#0d1120;border:1px solid;border-radius:12px;padding:16px;margin-bottom:14px}
        .sigtitle{font-size:0.65rem;color:#555;margin-bottom:8px;letter-spacing:2px;text-transform:uppercase}
        .sigzone{font-size:1.15rem;font-weight:700;margin-bottom:12px}
        .sigdet{display:flex;gap:22px;flex-wrap:wrap}
        .si{display:flex;flex-direction:column;gap:3px}
        .si span{font-size:0.62rem;color:#555;text-transform:uppercase;letter-spacing:1px}
        .si strong{font-size:0.92rem}
        .acta{margin-top:14px;width:100%;padding:11px;background:rgba(255,215,64,.08);border:1px solid #ffd740;color:#ffd740;border-radius:8px;cursor:pointer;font-family:inherit;font-size:0.83rem;transition:all .2s;font-weight:600}
        .acta:hover{background:rgba(255,215,64,.15)}
        .rhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
        .rhdr h2{font-size:0.92rem;color:#ffd740}
        .abtn{background:rgba(255,215,64,.08);border:1px solid #ffd740;color:#ffd740;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:0.78rem;transition:all .2s}
        .abtn:hover{background:rgba(255,215,64,.15)}
        .aform{background:#0d1120;border:1px solid #2a3050;border-radius:12px;padding:16px;margin-bottom:14px;animation:sd .2s ease}
        @keyframes sd{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .ftitle{color:#ffd740;font-size:0.8rem;margin-bottom:12px;font-weight:600}
        .fgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .fgrid label{display:flex;flex-direction:column;gap:5px}
        .fgrid label.full{grid-column:1/-1}
        .fgrid label span{font-size:0.65rem;color:#777;text-transform:uppercase;letter-spacing:0.5px}
        .fgrid input{background:#1a2035;border:1px solid #2a3050;color:#c9d1d9;padding:9px 10px;border-radius:6px;font-family:inherit;font-size:0.8rem;outline:none;transition:border-color .2s}
        .fgrid input:focus{border-color:#ffd74088}
        .sbtn{margin-top:12px;width:100%;padding:11px;background:#ffd740;border:none;color:#0a0e1a;font-weight:800;border-radius:8px;cursor:pointer;font-family:inherit;font-size:0.86rem;transition:all .2s}
        .sbtn:hover{background:#ffca28;transform:translateY(-1px)}
        .rlist{display:flex;flex-direction:column;gap:10px}
        .rcard{background:#0d1120;border:1px solid;border-radius:10px;padding:12px 14px;position:relative;transition:transform .2s}
        .rcard.rp{border-color:rgba(0,230,118,.25)}
        .rcard.rl{border-color:rgba(255,23,68,.25)}
        .rcard:hover{transform:translateY(-1px)}
        .rtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
        .rdate{font-size:0.8rem;color:#888}
        .rprofit{font-size:1rem;font-weight:700}
        .rmid{display:flex;gap:12px;font-size:0.7rem;color:#666;margin-bottom:6px}
        .rnotes{font-size:0.7rem;color:#777;font-style:italic;padding-right:22px}
        .dbtn{position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;font-size:0.83rem;opacity:.3;transition:opacity .2s;padding:2px}
        .dbtn:hover{opacity:1}
        .up{color:#00e676}.dn{color:#ff1744}
        .sgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
        .sc{background:#0d1120;border:1px solid #1a2035;border-radius:10px;padding:14px;text-align:center}
        .sc.hl{grid-column:1/-1;border-color:rgba(255,215,64,.2);background:linear-gradient(135deg,#0d1120 0%,#121828 100%)}
        .slbl{font-size:0.65rem;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
        .sval{font-size:1.25rem;font-weight:700;color:#c9d1d9}
        .sval.big{font-size:1.65rem}
        .eqsec{background:#0d1120;border:1px solid #1a2035;border-radius:10px;padding:14px}
        .ftr{display:flex;justify-content:space-between;padding:8px 16px;border-top:1px solid #1a2035;font-size:0.62rem;color:#3a4060;background:#0d1120;letter-spacing:.5px}
        @media(max-width:480px){.fgrid{grid-template-columns:1fr}.sigdet{gap:14px}.zones{gap:4px}.zchip{font-size:0.6rem;padding:3px 7px}.logo{font-size:0.85rem}}
      `}</style>
    </>
  );
}
