const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url || (req.body && req.body.url) || '';
  if (!url) return res.status(400).json({ error: 'URL을 입력하세요' });

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      redirect: 'follow',
      timeout: 10000
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();

    // 제목 추출
    var title = '';
    var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    // OG 제목
    var ogTitle = '';
    var ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) ogTitle = ogMatch[1].trim();

    // OG 설명
    var ogDesc = '';
    var descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (!descMatch) descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) ogDesc = descMatch[1].trim();

    // 본문 추출
    var text = html;

    // script, style, nav, header, footer, aside 제거
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // 네이버 블로그 특수 처리 - iframe 내부 콘텐츠
    var iframeSrc = '';
    if (url.includes('blog.naver.com')) {
      var iframeMatch = html.match(/src=["'](https?:\/\/blog\.naver\.com\/PostView[^"']+)["']/i);
      if (!iframeMatch) {
        // postView URL 생성 시도
        var blogIdMatch = url.match(/blog\.naver\.com\/([^\/\?]+)/);
        var logNoMatch = url.match(/\/(\d{10,})/);
        if (blogIdMatch && logNoMatch) {
          iframeSrc = 'https://blog.naver.com/PostView.naver?blogId=' + blogIdMatch[1] + '&logNo=' + logNoMatch[1] + '&redirect=Dlog';
        }
      } else {
        iframeSrc = iframeMatch[1];
      }

      if (iframeSrc) {
        try {
          const iframeRes = await fetch(iframeSrc, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': url
            }
          });
          if (iframeRes.ok) {
            var iframeHtml = await iframeRes.text();
            iframeHtml = iframeHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
            iframeHtml = iframeHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
            
            // se-main-container 또는 post-view 영역 추출
            var containerMatch = iframeHtml.match(/<div[^>]*class=["'][^"']*se-main-container[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
            if (!containerMatch) containerMatch = iframeHtml.match(/<div[^>]*id=["']post[_-]?view[^"']*["'][^>]*>([\s\S]*)/i);
            if (containerMatch) text = containerMatch[1];
            else text = iframeHtml;
          }
        } catch (e) {}
      }
    }

    // HTML 태그 제거 → 텍스트만
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<[^>]+>/g, '');

    // HTML 엔티티
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&[#\w]+;/g, ' ');

    // 공백 정리
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    // 너무 짧으면 실패
    if (text.length < 50) {
      return res.json({
        ok: true,
        url: url,
        title: ogTitle || title || '',
        description: ogDesc || '',
        text: text,
        length: text.length,
        warning: '콘텐츠가 너무 짧습니다. 이 사이트는 JavaScript로 로딩되어 직접 추출이 어려울 수 있습니다.'
      });
    }

    // 최대 5000자까지
    if (text.length > 5000) text = text.substring(0, 5000) + '\n\n...(이하 생략)';

    res.json({
      ok: true,
      url: url,
      title: ogTitle || title || '',
      description: ogDesc || '',
      text: text,
      length: text.length
    });

  } catch (err) {
    res.status(500).json({ error: 'URL 가져오기 실패: ' + err.message });
  }
};
