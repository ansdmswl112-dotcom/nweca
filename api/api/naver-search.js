const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query, type = 'blog', display = 10, start = 1, sort = 'sim' } = req.method === 'POST' ? req.body : req.query;

  if (!query) return res.status(400).json({ error: '검색어를 입력해주세요' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: '네이버 API 키가 설정되지 않았습니다' });
  }

  const validTypes = ['blog', 'news', 'webkr', 'cafearticle', 'kin', 'image'];
  const searchType = validTypes.includes(type) ? type : 'blog';

  try {
    const url = `https://openapi.naver.com/v1/search/${searchType}?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;

    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: '네이버 API 오류', detail: errText });
    }

    const data = await response.json();

    const results = {
      total: data.total,
      start: data.start,
      display: data.display,
      items: data.items.map(item => ({
        title: item.title.replace(/<[^>]*>/g, ''),
        link: item.link,
        description: (item.description || '').replace(/<[^>]*>/g, ''),
        bloggername: item.bloggername || item.originallink || '',
        postdate: item.postdate || '',
        pubDate: item.pubDate || ''
      }))
    };

    res.json({ ok: true, type: searchType, query, ...results });

  } catch (err) {
    res.status(500).json({ error: '네이버 검색 실패', message: err.message });
  }
};
