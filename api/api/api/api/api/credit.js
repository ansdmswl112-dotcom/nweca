const credits = {};
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const params = req.method === 'POST' ? req.body : req.query;
  const { action, userId, amount, description } = params;
  if (!userId) return res.status(400).json({ error: 'userId 필요' });
  if (!credits[userId]) credits[userId] = { total: 0, history: [] };
  if (action === 'use') {
    const cost = parseFloat(amount) || 0.01;
    credits[userId].total += cost;
    credits[userId].history.push({ date: new Date().toISOString(), amount: cost, description: description || 'AI 생성', total: credits[userId].total });
    if (credits[userId].history.length > 100) credits[userId].history = credits[userId].history.slice(-100);
    res.json({ ok: true, total: credits[userId].total, cost });
  } else if (action === 'get') {
    res.json({ ok: true, userId, total: credits[userId].total, history: credits[userId].history.slice(-20) });
  } else { res.json({ ok: true, userId, total: credits[userId].total }); }
};
