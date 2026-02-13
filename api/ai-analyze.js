const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { prompt, data, mode } = params;
  if (!prompt) return res.status(400).json({ error: 'prompt가 필요합니다' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API 키가 설정되지 않았습니다' });

  try {
    let fullPrompt = prompt;
    if (data) {
      fullPrompt += '\n\n[데이터]\n' + (typeof data === 'string' ? data : JSON.stringify(data));
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
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

    const result = await r.json();
    
    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Claude API 오류' });
    }

    const analysis = result.content?.[0]?.text || '';
    res.json({ ok: true, analysis, usage: result.usage });

  } catch (err) {
    res.status(500).json({ error: 'AI 분석 실패: ' + err.message });
  }
};
