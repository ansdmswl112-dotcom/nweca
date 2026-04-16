// /api/reference-collect.js
// 사용자 키워드 → 네이버 통합 검색 → AI 패턴 추출 → 캐싱
// Vercel Serverless Function

import { kv } from '@vercel/kv';

// 네이버 검색 API 래퍼
async function searchNaver(type, query, display = 10) {
  const url = `https://openapi.naver.com/v1/search/${type}?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;
  const r = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
    }
  });
  if (!r.ok) return { items: [] };
  return await r.json();
}

// HTML 태그 제거
function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

// Anthropic API로 패턴 추출
async function extractPatterns(query, blogs, news) {
  const top5 = blogs.slice(0, 5).map((b, i) =>
    `[${i + 1}] 제목: ${b.title}\n블로그: ${b.bloggername}\n요약: ${b.description}\n`
  ).join('\n');
  const newsText = news.slice(0, 3).map(n => `- ${n.title}`).join('\n');

  const prompt = `당신은 네이버 블로그 SEO 분석가입니다.
"${query}"로 검색된 인기 블로그 상위 5개의 패턴을 분석해 JSON으로만 답해주세요.

[분석 자료]
${top5}

[관련 뉴스]
${newsText}

[출력 JSON 형식]
{
  "topicSummary": "이 주제의 핵심 요약 2~3문장",
  "titlePatterns": ["실제 쓰이는 제목 공식 3~5개. 예: '○○행사 후기 | 실제 다녀온 솔직 리뷰'"],
  "commonStructure": ["공통 본문 구조 (섹션 순서). 예: '도입 인사 → 행사 개요 → 현장 분위기 → 핵심 장면 → 개인 의견 → 마무리 CTA'"],
  "mustIncludeKeywords": ["이 주제 글에 반드시 들어가는 키워드 5~8개"],
  "mustIncludeHashtags": ["필수 해시태그 7~10개 # 포함"],
  "commonPhrases": ["자주 등장하는 표현 5~8개. 예: '현장감이 생생했다', '장비가 돋보였다'"],
  "toneNotes": "이 주제 블로그들의 평균 톤 (예: '경험담 + 정보 가이드 혼합, 약간 격식체')",
  "detailLevel": "구체성 수준 (예: '날짜/장소/숫자가 풍부함' 또는 '개괄적')",
  "avoidPatterns": ["피해야 할 패턴 2~3개. 예: '너무 광고같은 톤, 과한 수식어'"]
}

반드시 JSON만 출력. 다른 설명 금지. 마크다운 코드블록 금지.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Anthropic API error: ${err}`);
  }
  const data = await r.json();
  const text = data.content[0].text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('AI 응답 JSON 파싱 실패: ' + text.substring(0, 200));
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const query = (req.query.query || req.body?.query || '').trim();
  const forceRefresh = req.query.refresh === '1' || req.body?.refresh === true;
  if (!query) return res.status(400).json({ error: 'query is required' });

  // 정규화된 캐시 키
  const cacheKey = `ref:${query.toLowerCase().replace(/\s+/g, '_')}`;

  // 캐시 확인 (24시간 유효)
  if (!forceRefresh) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return res.status(200).json({ ...cached, cached: true });
      }
    } catch (e) { /* KV 없으면 무시 */ }
  }

  try {
    // 병렬 검색: 블로그 + 뉴스 + 카페
    const [blogData, newsData, cafeData] = await Promise.all([
      searchNaver('blog', query, 10),
      searchNaver('news', query, 5),
      searchNaver('cafearticle', query, 5)
    ]);

    const blogs = (blogData.items || []).map(b => ({
      title: stripTags(b.title),
      bloggername: b.bloggername || '',
      link: b.link,
      description: stripTags(b.description),
      postdate: b.postdate
    }));
    const news = (newsData.items || []).map(n => ({
      title: stripTags(n.title),
      description: stripTags(n.description),
      link: n.link,
      pubDate: n.pubDate
    }));
    const cafes = (cafeData.items || []).map(c => ({
      title: stripTags(c.title),
      description: stripTags(c.description),
      cafename: c.cafename || ''
    }));

    if (blogs.length === 0) {
      return res.status(200).json({
        query,
        patterns: null,
        rawReferences: { blogs: [], news, cafes },
        error: '검색 결과가 없습니다. 더 일반적인 키워드를 시도해보세요.'
      });
    }

    // AI 패턴 추출
    const patterns = await extractPatterns(query, blogs, news);

    const result = {
      query,
      patterns,
      rawReferences: {
        blogs: blogs.slice(0, 5),
        news: news.slice(0, 3),
        cafes: cafes.slice(0, 3)
      },
      collectedAt: new Date().toISOString(),
      sourceCount: {
        blogs: blogs.length,
        news: news.length,
        cafes: cafes.length
      }
    };

    // KV 캐시 저장 (24시간)
    try {
      await kv.set(cacheKey, result, { ex: 86400 });
    } catch (e) { /* KV 실패해도 응답은 반환 */ }

    return res.status(200).json({ ...result, cached: false });

  } catch (e) {
    return res.status(500).json({
      error: e.message,
      query
    });
  }

