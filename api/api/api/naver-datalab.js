const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' ? req.body : req.query;
  const { keyword, timeUnit = 'month', period = 12 } = body;

  if (!keyword) return res.status(400).json({ error: '키워드를 입력해주세요' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: '네이버 API 키가 설정되지 않았습니다' });
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(period));

    const formatDate = (d) => d.toISOString().split('T')[0];

    const keywords = keyword.split(',').map(k => k.trim()).filter(Boolean);
    const keywordGroups = keywords.map(kw => ({
      groupName: kw,
      keywords: [kw]
    }));

    const requestBody = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      timeUnit: timeUnit,
      keywordGroups: keywordGroups.slice(0, 5)
    };

    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: '네이버 DataLab 오류', detail: errText });
    }

    const data = await response.json();

    const results = (data.results || []).map(group => ({
      keyword: group.title,
      data: (group.data || []).map(d => ({
        date: d.period,
        value: d.ratio
      }))
    }));

    res.json({
      ok: true,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      timeUnit,
      keywords: keywords,
      results
    });

  } catch (err) {
    res.status(500).json({ error: '네이버 DataLab 실패', message: err.message });
  }
};
