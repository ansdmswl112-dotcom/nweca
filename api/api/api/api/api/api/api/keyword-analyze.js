const fetch = require('node-fetch');

async function naverSearch(query, type, display) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId) return { total: 0, items: [] };
  try {
    const url = `https://openapi.naver.com/v1/search/${type}?query=${encodeURIComponent(query)}&display=${display || 10}&sort=date`;
    const r = await fetch(url, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }
    });
    return await r.json();
  } catch (e) { return { total: 0, items: [] }; }
}

async function naverDatalab(keyword) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId) return null;
  try {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const fmt = d => d.toISOString().split('T')[0];
    const r = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        timeUnit: 'month',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
      })
    });
    return await r.json();
  } catch (e) { return null; }
}

async function serpSearch(query) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&gl=kr&hl=ko&num=10&api_key=${apiKey}`;
    const r = await fetch(url);
    return await r.json();
  } catch (e) { return null; }
}

async function serpTrends(query) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(query)}&geo=KR&date=today+12-m&api_key=${apiKey}`;
    const r = await fetch(url);
    return await r.json();
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? req.body : req.query;
  const { keyword } = params;

  if (!keyword) return res.status(400).json({ error: '키워드를 입력해주세요' });

  try {
    const [blogData, newsData, cafeData, datalabData, googleData, trendData] = await Promise.all([
      naverSearch(keyword, 'blog', 10),
      naverSearch(keyword, 'news', 10),
      naverSearch(keyword, 'cafearticle', 5),
      naverDatalab(keyword),
      serpSearch(keyword),
      serpTrends(keyword)
    ]);

    const naverBlogTotal = blogData.total || 0;
    const naverNewsTotal = newsData.total || 0;
    const naverCafeTotal = cafeData.to
