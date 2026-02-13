const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SerpAPI 키가 설정되지 않았습니다' });

  const keyword = req.query.keyword || 'LED전광판';
  const type = req.query.type || 'search';

  try {
    let url;
    if (type === 'trends') {
      url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(keyword)}&api_key=${apiKey}`;
    } else {
      url = `https://serpapi.com/search.json?q=${encodeURIComponent(keyword)}&location=South+Korea&hl=ko&gl=kr&api_key=${apiKey}`;
    }
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
