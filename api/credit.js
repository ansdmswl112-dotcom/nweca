module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { action, userId, amount, description } = params;

  if (!global.creditStore) global.creditStore = {};

  if (action === 'use') {
    if (!userId) return res.status(400).json({ error: 'userId 필요' });
    if (!global.creditStore[userId]) global.creditStore[userId] = { total: 0, history: [] };
    const store = global.creditStore[userId];
    store.total += parseFloat(amount) || 0;
    store.history.push({ amount: parseFloat(amount) || 0, desc: description || '', time: new Date().toISOString() });
    if (store.history.length > 100) store.history = store.history.slice(-100);
    return res.json({ ok: true, total: store.total, history: store.history });
  }

  if (action === 'get') {
    if (!userId) return res.status(400).json({ error: 'userId 필요' });
    const store = global.creditStore[userId] || { total: 0, history: [] };
    return res.json({ ok: true, total: store.total, history: store.history });
  }

  if (action === 'reset') {
    if (userId) { delete global.creditStore[userId]; }
    return res.json({ ok: true, message: '초기화 완료' });
  }

  res.json({ ok: true, message: 'Credit API', actions: ['use', 'get', 'reset'] });
};
