// pages/api/reports.js
let reports = [];

export default function handler(req, res) {
  if (req.method === 'GET') {
    const sorted = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalProfit = reports.reduce((s, r) => s + r.profit, 0);
    const winDays = reports.filter(r => r.profit > 0).length;
    return res.status(200).json({
      reports: sorted,
      stats: {
        totalProfit,
        winDays,
        lossDays: reports.length - winDays,
        winRate: reports.length > 0 ? (winDays / reports.length * 100) : 0,
        avgProfit: reports.length > 0 ? totalProfit / reports.length : 0,
        totalDays: reports.length,
      }
    });
  }
  if (req.method === 'POST') {
    const { date, profit, notes } = req.body;
    const report = {
      id: Date.now().toString(),
      date,
      profit: parseFloat(profit),
      notes: notes || '',
      type: parseFloat(profit) >= 0 ? 'profit' : 'loss',
      createdAt: new Date().toISOString(),
    };
    reports.unshift(report);
    return res.status(201).json(report);
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    reports = reports.filter(r => r.id !== id);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'PUT') {
    const { id } = req.query;
    const idx = reports.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    reports[idx] = { ...reports[idx], ...req.body, id };
    return res.status(200).json(reports[idx]);
  }
  res.status(405).end();
}
