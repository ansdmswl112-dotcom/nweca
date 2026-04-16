const fetch = require('node-fetch');
// VERSION: 2026-04-16-SONNET-4.6

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { prompt, data, mode, system, systemPrompt, max_tokens } = params;

  if (!prompt) return res.status(400).json({ error: 'prompt가 필요합니다' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API 키가 설정되지 않았습니다' });

  try {
    let fullPrompt = prompt;
    if (data) {
      fullPrompt += '\n\n[데이터]\n' + (typeof data === 'string' ? data : JSON.stringify(data));
    }

    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: max_tokens || 2000,
      messages: [{ role: 'user', content: fullPrompt }]
    };

    // system prompt 지원 (프론트엔드의 SYSTEM_PROMPTS 전달용)
    const sysText = system || systemPrompt;
    if (sysText) body.system = sysText;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const result = await r.json();

    if (!r.ok || result.error) {
      const errMsg = (result.error && result.error.message) || ('Claude API 오류 (' + r.status + ')');
      const errType = (result.error && result.error.type) || 'api_error';
      let hint = '';
      if (r.status === 401) hint = 'ANTHROPIC_API_KEY가 유효하지 않습니다';
      else if (r.status === 404) hint = '모델 claude-sonnet-4-6 접근 권한을 확인하세요';
      else if (r.status === 429) hint = 'Anthropic API 한도 초과';
      return res.status(r.status || 400).json({ error: errMsg, type: errType, hint: hint });
    }

    const analysis = (result.content && result.content[0] && result.content[0].text) || '';
    res.json({ ok: true, analysis, content: analysis, usage: result.usage, model: 'claude-sonnet-4-6' });
  } catch (err) {
    res.status(500).json({ error: 'AI 분석 실패: ' + err.message });
  }
};
