const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.query.token || process.env.META_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'Meta 토큰이 없습니다' });

  const endpoint = req.query.endpoint || 'me';
  const fields = req.query.fields || 'id,name';

  try {
    const url = `https://graph.facebook.com/v18.0/${endpoint}?fields=${fields}&access_token=${token}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
