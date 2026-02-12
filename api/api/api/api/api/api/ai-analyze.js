const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다' });

  const { prompt, data } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt가 필요합니다' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API 키가 설정되지 않았습니다' });

  try {
    let fullPrompt = prompt;
    if (data) {
      fullPrompt = `아래는 실제 API에서 가져온 데이터입니다. 이 데이터를 기반으로 분석해주세요.

[실제 데이터]
${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}

[분석 요청]
${prompt}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: fullPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'AI 분석 실패', detail: errText });
    }

    const result = await response.json();
    const text = result.content?.map(c => c.text || '').join('') || '';

    res.json({ ok: true, analysis: text });

  } catch (err) {
    res.status(500).json({ error: 'AI 분석 실패', message: err.message });
  }
};
