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
    const naverCafeTotal = cafeData.total || 0;

    const naverTrend = (datalabData?.results?.[0]?.data || []).map(d => ({
      date: d.period,
      value: Math.round(d.ratio)
    }));

    const googleTotal = googleData?.search_information?.total_results || 0;
    const googleResults = (googleData?.organic_results || []).map((item, i) => ({
      position: item.position || i + 1,
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      source: item.source || ''
    })).slice(0, 10);

    const googleTrend = (trendData?.interest_over_time?.timeline_data || []).map(t => ({
      date: t.date,
      value: t.values?.[0]?.extracted_value || 0
    }));

    const relatedNaver = (googleData?.related_searches || []).map(r => r.query).slice(0, 10);
    const relatedTrend = (trendData?.related_queries?.rising || []).map(q => q.query).slice(0, 10);
    const relatedKeywords = [...new Set([...relatedNaver, ...relatedTrend])].slice(0, 15);

    const blogItems = (blogData.items || []).map(item => ({
      type: 'blog',
      title: item.title?.replace(/<[^>]*>/g, '') || '',
      link: item.link || '',
      description: (item.description || '').replace(/<[^>]*>/g, ''),
      source: item.bloggername || '',
      date: item.postdate || ''
    }));

    const newsItems = (newsData.items || []).map(item => ({
      type: 'news',
      title: item.title?.replace(/<[^>]*>/g, '') || '',
      link: item.link || item.originallink || '',
      description: (item.description || '').replace(/<[^>]*>/g, ''),
      source: item.originallink ? new URL(item.originallink).hostname : '',
      date: item.pubDate || ''
    }));

    const cafeItems = (cafeData.items || []).map(item => ({
      type: 'cafe',
      title: item.title?.replace(/<[^>]*>/g, '') || '',
      link: item.link || '',
      description: (item.description || '').replace(/<[^>]*>/g, ''),
      source: item.cafename || '',
      date: ''
    }));

    let trendDirection = '유지';
    if (naverTrend.length >= 3) {
      const recent = naverTrend.slice(-3).reduce((a, b) => a + b.value, 0) / 3;
      const older = naverTrend.slice(-6, -3).reduce((a, b) => a + b.value, 0) / 3;
      if (recent > older * 1.1) trendDirection = '상승';
      else if (recent < older * 0.9) trendDirection = '하락';
    }

    res.json({
      ok: true,
      keyword,
      summary: {
        naverBlogTotal,
        naverNewsTotal,
        naverCafeTotal,
        googleTotal,
        totalContent: naverBlogTotal + naverNewsTotal + naverCafeTotal,
        trendDirection
      },
      trend: {
        naver: naverTrend,
        google: googleTrend
      },
      content: {
        blog: blogItems,
        news: newsItems,
        cafe: cafeItems,
        google: googleResults
      },
      relatedKeywords
    });

  } catch (err) {
    res.status(500).json({ error: '키워드 분석 실패', message: err.message });
  }
};
