const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: '네이버 API 키가 설정되지 않았습니다' });

  const body = req.body || {};

  try {
    const r = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// /api/naver-datalab.js
// 네이버 DataLab 검색어 트렌드 API
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { startDate, endDate, timeUnit, keywordGroups } = req.body;
    
    if (!keywordGroups || !keywordGroups.length) {
      return res.status(400).json({ error: 'keywordGroups required' });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Naver API credentials not configured' });
    }

    const body = {
      startDate: startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: endDate || new Date().toISOString().split('T')[0],
      timeUnit: timeUnit || 'month',
      keywordGroups: keywordGroups.map(g => ({
        groupName: g.groupName,
        keywords: g.keywords || [g.groupName]
      }))
    };

    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.errorMessage || 'DataLab API error',
        code: data.errorCode 
      });
    }

    // 결과 정규화
    const results = (data.results || []).map(r => ({
      title: r.title,
      keywords: r.keywords,
      data: (r.data || []).map(d => ({
        period: d.period,
        ratio: d.ratio
      }))
    }));

    return res.json({
      startDate: data.startDate,
      endDate: data.endDate,
      timeUnit: data.timeUnit,
      results
    });

  } catch (error) {
    console.error('DataLab error:', error);
    return res.status(500).json({ error: error.message });
  }
};
