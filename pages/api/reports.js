// pages/api/reports.js
// Profit report storage - uses localStorage on client, this is the API layer

// In production: replace with Vercel KV, Supabase, or MongoDB
// For demo: in-memory store (resets on restart)
let reports = [
  {
    id: '1',
    date: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    profit: 245.50,
    trades: 3,
    winRate: 66.7,
    notes: 'Scalping sesi London',
    pairs: 'XAUUSD',
    type: 'profit'
  },
  {
    id: '2',
    date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    profit: -85.00,
    trades: 2,
    winRate: 50,
    notes: 'News NFP',
    pairs: 'XAUUSD',
    type: 'loss'
  },
  {
    id: '3',
    date: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
    profit: 380.00,
    trades: 4,
    winRate: 75,
    notes: 'Trend kuat bullish',
    pairs: 'XAUUSD',
    type: 'profit'
  },
  {
    id: '4',
    date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    profit: 120.00,
    trades: 2,
    winRate: 100,
    notes: 'RSI oversold entry',
    pairs: 'XAUUSD',
    type: 'profit'
  },
  {
    id: '5',
    date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    profit: -150.00,
    trades: 3,
    winRate: 33.3,
    notes: 'Sideways, stop loss kena',
    pairs: 'XAUUSD',
    type: 'loss'
  },
  {
    id: '6',
    date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
    profit: 520.00,
    trades: 5,
    winRate: 80,
    notes: 'Breakout resistance',
    pairs: 'XAUUSD',
    type: 'profit'
  },
];

export default function handler(req, res) {
  if (req.method === 'GET') {
    const sorted = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const totalProfit = reports.reduce((sum, r) => sum + r.profit, 0);
    const totalTrades = reports.reduce((sum, r) => sum + r.trades, 0);
    const winDays = reports.filter(r => r.profit > 0).length;
    const avgProfit = reports.length > 0 ? totalProfit / reports.length : 0;
    
    return res.status(200).json({
      reports: sorted,
      stats: {
        totalProfit,
        totalTrades,
        winDays,
        lossDays: reports.length - winDays,
        winRate: reports.length > 0 ? (winDays / reports.length) * 100 : 0,
        avgProfit,
        totalDays: reports.length,
      }
    });
  }
  
  if (req.method === 'POST') {
    const { date, profit, trades, winRate, notes, pairs } = req.body;
    const id = Date.now().toString();
    const report = {
      id,
      date,
      profit: parseFloat(profit),
      trades: parseInt(trades),
      winRate: parseFloat(winRate),
      notes: notes || '',
      pairs: pairs || 'XAUUSD',
      type: parseFloat(profit) >= 0 ? 'profit' : 'loss',
      createdAt: new Date().toISOString()
    };
    reports.unshift(report);
    return res.status(201).json(report);
  }
  
  if (req.method === 'DELETE') {
    const { id } = req.query;
    const before = reports.length;
    reports = reports.filter(r => r.id !== id);
    return res.status(200).json({ deleted: before !== reports.length });
  }
  
  if (req.method === 'PUT') {
    const { id } = req.query;
    const idx = reports.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    reports[idx] = { ...reports[idx], ...req.body, id };
    return res.status(200).json(reports[idx]);
  }
  
  res.status(405).json({ error: 'Method not allowed' });
}
