const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? req.body : req.query;
  const { query, engine = 'google', type = 'search', gl = 'kr', hl = 'ko', num = 10 } = params;

  if (!query) return res.status(400).json({ error: '검색어를 입력해주세요' });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SerpAPI 키가 설정되지 않았습니다' });

  try {
    let url;

    if (type === 'trends') {
      url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(query)}&geo=KR&date=today+12-m&api_key=${apiKey}`;
    } else if (engine === 'naver') {
      url = `https://serpapi.com/search.json?engine=naver&query=${encodeURIComponent(query)}&where=web&api_key=${apiKey}`;
    } else {
      url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&gl=${gl}&hl=${hl}&num=${num}&api_key=${apiKey}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'SerpAPI 오류', detail: errText });
    }

    const data = await response.json();

    let results;

    if (type === 'trends') {
      const timelineData = data.interest_over_time?.timeline_data || [];
      results = {
        type: 'trends',
        query,
        data: timelineData.map(t => ({
          date: t.date,
          value: t.values?.[0]?.extracted_value || 0
        })),
        relatedQueries: (data.related_queries?.rising || []).map(q => ({
          query: q.query,
          value: q.extracted_value || q.value
        })).slice(0, 10)
      };
    } else {
      const organic = data.organic_results || [];
      const searchInfo = data.search_information || {};

      results = {
        type: 'search',
        engine,
        query,
        totalResults: searchInfo.total_results || 0,
        items: organic.map((item, i) => ({
          position: item.position || i + 1,
          title: item.title || '',
          link: item.link || '',
          snippet: item.snippet || '',
          source: item.source || item.displayed_link || '',
          date: item.date || ''
        })).slice(0, parseInt(num)),
        relatedSearches: (data.related_searches || []).map(r => r.query).slice(0, 10),
        news: (data.news_results || data.top_stories || []).map(n => ({
          title: n.title,
          link: n.link,
          source: n.source?.name || n.source || '',
          date: n.date || ''
        })).slice(0, 5)
      };
    }

    res.json({ ok: true, ...results });

  } catch (err) {
    res.status(500).json({ error: 'SerpAPI 검색 실패', message: err.message });
  }
};
