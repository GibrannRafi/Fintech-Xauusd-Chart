// pages/api/subscribe.js
// Manages push notification subscriptions stored in-memory (use DB in production)

const subscriptions = new Map();

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { subscription, id } = req.body;
    if (!subscription) return res.status(400).json({ error: 'No subscription' });
    
    subscriptions.set(id || 'default', subscription);
    console.log('Subscription saved:', id);
    return res.status(200).json({ success: true, message: 'Subscribed!' });
  }
  
  if (req.method === 'DELETE') {
    const { id } = req.body;
    subscriptions.delete(id || 'default');
    return res.status(200).json({ success: true });
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({ count: subscriptions.size });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export { subscriptions };
