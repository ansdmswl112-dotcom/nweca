const fetch = require('node-fetch');
// VERSION: 2026-04-16-REFERENCE-COLLECT
// 네이버 통합 검색 + Claude Sonnet 4.6 패턴 추출 + KV REST 캐싱

// Vercel KV REST API 래퍼 (라이브러리 없이 fetch만 사용)
async function kvGet(key) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    var r = await fetch(url + '/get/' + encodeURIComponent(key), {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;
    var data = await r.json();
    if (!data.result) return null;
    try {
      return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (e) {
      return data.result;
    }
  } catch (e) {
    return null;
  }
}

async function kvSet(key, value, ttlSeconds) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    var endpoint = ttlSeconds
      ? url + '/set/' + encodeURIComponent(key) + '?EX=' + ttlSeconds
      : url + '/set/' + encodeURIComponent(key);
    var r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(value)
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// 네이버 검색 API
async function searchNaver(type, query, display) {
  display = display || 10;
  var clientId = process.env.NAVER_CLIENT_ID;
  var clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
  }

  var url = 'https://openapi.naver.com/v1/search/' + type + '?query=' + encodeURIComponent(query) + '&display=' + display + '&sort=sim';
  var r = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });

  if (!r.ok) {
    var errText = '';
    try { errText = await r.text(); } catch (e) {}
    if (r.status === 401 || r.status === 403) {
      throw new Error('네이버 API 인증 실패 (' + r.status + '). Client ID/Secret 확인 필요.');
    }
    if (r.status === 429) {
      throw new Error('네이버 API 일일 쿼터(25,000회) 초과.');
    }
    return { items: [], _error: type + ' 검색 실패 (' + r.status + ')' };
  }
  return await r.json();
}

function stripTags(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Claude Sonnet 4.6 패턴 추출
async function extractPatterns(query, blogs, news) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  var top5 = blogs.slice(0, 5).map(function (b, i) {
    return '[' + (i + 1) + '] 제목: ' + b.title + '\n블로그: ' + b.bloggername + '\n요약: ' + b.description + '\n';
  }).join('\n');
  var newsText = news.slice(0, 3).map(function (n) { return '- ' + n.title; }).join('\n');

  var prompt = '당신은 네이버 블로그 SEO 전문 분석가입니다.\n"' + query + '" 검색 결과 상위 인기 블로그 5개의 공통 패턴을 정밀하게 분석해 JSON으로만 답해주세요.\n\n[분석 자료 — 네이버 검색 상위 블로그]\n' + top5 + '\n\n[관련 뉴스]\n' + newsText + '\n\n[출력 형식 — 반드시 아래 JSON 구조 준수]\n{\n  "topicSummary": "이 주제가 다루는 핵심 2~3문장 요약",\n  "titlePatterns": ["실제 상위 블로그들의 제목 공식 3~5개"],\n  "commonStructure": ["공통 본문 구조의 섹션 순서 4~6개"],\n  "mustIncludeKeywords": ["이 주제 글에 반드시 포함되는 키워드 5~8개"],\n  "mustIncludeHashtags": ["필수 해시태그 7~10개 (# 포함)"],\n  "commonPhrases": ["자주 등장하는 표현/문장 패턴 5~8개"],\n  "toneNotes": "상위 블로그들의 평균 톤과 어미 스타일",\n  "detailLevel": "구체성 수준",\n  "avoidPatterns": ["저품질로 보이는 피해야 할 패턴 2~3개"]\n}\n\n반드시 JSON 객체만 출력. 마크다운 코드블록, 설명, 주석 전부 금지.';

  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) {
    var errBody = '';
    try { errBody = await r.text(); } catch (e) {}
    var parsedErr = errBody;
    try {
      var json = JSON.parse(errBody);
      if (json.error && json.error.message) parsedErr = json.error.message;
    } catch (e) {}

    if (r.status === 401) throw new Error('Anthropic API 키 유효하지 않음. ' + parsedErr.substring(0, 150));
    if (r.status === 404) throw new Error('모델 claude-sonnet-4-6 접근 권한 없음. ' + parsedErr.substring(0, 150));
    if (r.status === 429) throw new Error('Anthropic API 한도 초과.');
    throw new Error('Anthropic API (' + r.status + '): ' + parsedErr.substring(0, 250));
  }

  var data = await r.json();
  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('Anthropic 응답이 비어있음');
  }

  var text = data.content[0].text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    var match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) {
        throw new Error('AI 응답 JSON 파싱 실패: ' + text.substring(0, 300));
      }
    }
    throw new Error('AI 응답에서 JSON 추출 불가: ' + text.substring(0, 300));
  }
}

// 메인 핸들러 (module.exports 방식 — 기존 파일들과 동일)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 디버그 엔드포인트 — 환경 상태 진단
  if (req.query.debug === '1') {
    var kvStatus = '없음 (캐싱 비활성, 동작은 가능)';
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      try {
        var testKey = '_test_' + Date.now();
        var setOk = await kvSet(testKey, { test: true }, 10);
        var getResult = await kvGet(testKey);
        kvStatus = setOk && getResult && getResult.test === true
          ? '✅ 연결 정상 (캐싱 활성)'
          : '⚠️ 설정됨 but 연결 실패';
      } catch (e) {
        kvStatus = '⚠️ 연결 에러: ' + e.message;
      }
    }

    return res.status(200).json({
      status: 'ok',
      model: 'claude-sonnet-4-6',
      env: {
        NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID
          ? '✅ 설정됨 (' + process.env.NAVER_CLIENT_ID.substring(0, 4) + '...)'
          : '❌ 없음 — 필수!',
        NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음 — 필수!',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
          ? '✅ 설정됨 (' + process.env.ANTHROPIC_API_KEY.substring(0, 12) + '...)'
          : '❌ 없음 — 필수!',
        KV_REST_API_URL: process.env.KV_REST_API_URL ? '설정됨' : '없음 (선택사항)',
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? '설정됨' : '없음 (선택사항)'
      },
      kvConnection: kvStatus,
      nodeVersion: process.version,
      runtime: 'Vercel Serverless (CommonJS)'
    });
  }

  var query = ((req.method === 'POST' ? (req.body && req.body.query) : req.query.query) || '').trim();
  var forceRefresh = req.query.refresh === '1' || (req.body && req.body.refresh === true);

  if (!query) {
    return res.status(400).json({ error: 'query 파라미터가 필요합니다' });
  }

  var cacheKey = 'ref:' + query.toLowerCase().replace(/\s+/g, '_').substring(0, 100);

  // 캐시 조회
  if (!forceRefresh) {
    var cached = await kvGet(cacheKey);
    if (cached && cached.patterns) {
      cached.cached = true;
      return res.status(200).json(cached);
    }
  }

  try {
    // 네이버 병렬 검색
    var blogData, newsData, cafeData;
    var results = await Promise.all([
      searchNaver('blog', query, 10),
      searchNaver('news', query, 5).catch(function (e) { return { items: [], _error: e.message }; }),
      searchNaver('cafearticle', query, 5).catch(function (e) { return { items: [], _error: e.message }; })
    ]);
    blogData = results[0];
    newsData = results[1];
    cafeData = results[2];

    var blogs = (blogData.items || []).map(function (b) {
      return {
        title: stripTags(b.title),
        bloggername: b.bloggername || '',
        link: b.link,
        description: stripTags(b.description),
        postdate: b.postdate
      };
    });
    var news = (newsData.items || []).map(function (n) {
      return {
        title: stripTags(n.title),
        description: stripTags(n.description),
        link: n.link,
        pubDate: n.pubDate
      };
    });
    var cafes = (cafeData.items || []).map(function (c) {
      return {
        title: stripTags(c.title),
        description: stripTags(c.description),
        cafename: c.cafename || ''
      };
    });

    if (blogs.length === 0) {
      return res.status(200).json({
        query: query,
        patterns: null,
        rawReferences: { blogs: [], news: news, cafes: cafes },
        error: '네이버에서 검색 결과가 없습니다. 더 일반적이거나 다른 키워드를 시도해주세요.'
      });
    }

    // Claude Sonnet 4.6으로 패턴 추출
    var patterns = await extractPatterns(query, blogs, news);

    var result = {
      query: query,
      patterns: patterns,
      rawReferences: {
        blogs: blogs.slice(0, 5),
        news: news.slice(0, 3),
        cafes: cafes.slice(0, 3)
      },
      collectedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      sourceCount: {
        blogs: blogs.length,
        news: news.length,
        cafes: cafes.length
      },
      cached: false
    };

    // 캐시 저장 (24시간) — 비동기로 실행, 실패해도 무시
    kvSet(cacheKey, result, 86400).catch(function () {});

    return res.status(200).json(result);

  } catch (e) {
    console.error('[reference-collect] Error:', e);
    var msg = e.message || '알 수 없는 오류';
    var hint = '/api/reference-collect?debug=1 에서 상세 진단 가능';
    if (msg.indexOf('NAVER') !== -1) hint = 'Vercel Settings에서 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 확인';
    else if (msg.indexOf('ANTHROPIC') !== -1) hint = 'Vercel Settings에서 ANTHROPIC_API_KEY 확인';
    else if (msg.indexOf('모델') !== -1 || msg.indexOf('접근 권한') !== -1) hint = 'Anthropic 계정에서 claude-sonnet-4-6 사용 권한 확인';
    else if (msg.indexOf('JSON') !== -1) hint = 'AI 응답 파싱 실패 — 다시 시도 또는 키워드 변경';

    return res.status(500).json({
      error: msg,
      type: e.name || 'Error',
      hint: hint
    });
  }
};
