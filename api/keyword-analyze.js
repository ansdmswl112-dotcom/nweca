const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const keyword = req.query.keyword || req.query.query || '';
  if (!keyword) return res.status(400).json({ error: '키워드를 입력하세요' });

  const naverClientId = process.env.NAVER_CLIENT_ID;
  const naverClientSecret = process.env.NAVER_CLIENT_SECRET;
  const serpApiKey = process.env.SERPAPI_KEY;

  const results = {
    ok: true,
    keyword,
    summary: {
      naverBlogTotal: 0,
      naverNewsTotal: 0,
      naverCafeTotal: 0,
      googleTotal: 0,
      instagramTotal: 0,
      facebookTotal: 0,
      totalContent: 0,
      trendDirection: '유지'
    },
    trend: { naver: [], google: [] },
    content: { blog: [], news: [], cafe: [], google: [], instagram: [], facebook: [] },
    relatedKeywords: []
  };

  try {
    if (naverClientId && naverClientSecret) {
      // 1) 네이버 블로그
      try {
        const blogRes = await fetch('https://openapi.naver.com/v1/search/blog.json?query=' + encodeURIComponent(keyword) + '&display=10&sort=sim', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        const blogData = await blogRes.json();
        results.summary.naverBlogTotal = blogData.total || 0;
        results.content.blog = (blogData.items || []).map(function(item) {
          return {
            title: item.title.replace(/<[^>]+>/g, ''),
            description: item.description.replace(/<[^>]+>/g, ''),
            link: item.link,
            source: item.bloggername || '네이버 블로그',
            date: item.postdate || ''
          };
        });
      } catch (e) {}

      // 2) 네이버 뉴스
      try {
        const newsRes = await fetch('https://openapi.naver.com/v1/search/news.json?query=' + encodeURIComponent(keyword) + '&display=10&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        const newsData = await newsRes.json();
        results.summary.naverNewsTotal = newsData.total || 0;
        results.content.news = (newsData.items || []).map(function(item) {
          var source = '뉴스';
          try { source = new URL(item.originallink).hostname.replace('www.',''); } catch(e) {}
          return {
            title: item.title.replace(/<[^>]+>/g, ''),
            description: item.description.replace(/<[^>]+>/g, ''),
            link: item.link,
            source: source,
            date: item.pubDate || ''
          };
        });
      } catch (e) {}

      // 3) 네이버 카페
      try {
        const cafeRes = await fetch('https://openapi.naver.com/v1/search/cafearticle.json?query=' + encodeURIComponent(keyword) + '&display=5&sort=sim', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        const cafeData = await cafeRes.json();
        results.summary.naverCafeTotal = cafeData.total || 0;
        results.content.cafe = (cafeData.items || []).map(function(item) {
          return {
            title: item.title.replace(/<[^>]+>/g, ''),
            description: item.description.replace(/<[^>]+>/g, ''),
            link: item.link,
            source: item.cafename || '카페'
          };
        });
      } catch (e) {}

      // 4) 네이버 데이터랩 트렌드
      try {
        var endDate = new Date().toISOString().split('T')[0];
        var startDate = new Date(Date.now() - 365*24*60*60*1000).toISOString().split('T')[0];
        const datalabRes = await fetch('https://openapi.naver.com/v1/datalab/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          },
          body: JSON.stringify({
            startDate: startDate, endDate: endDate, timeUnit: 'month',
            keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
          })
        });
        const datalabData = await datalabRes.json();
        if (datalabData.results && datalabData.results[0]) {
          var data = datalabData.results[0].data || [];
          results.trend.naver = data.map(function(d) { return { date: d.period, value: Math.round(d.ratio) }; });
          if (data.length >= 3) {
            var recent = data.slice(-3).reduce(function(s,d){return s+d.ratio},0) / 3;
            var olderSlice = data.slice(-6,-3);
            var older = olderSlice.length > 0 ? olderSlice.reduce(function(s,d){return s+d.ratio},0) / olderSlice.length : recent;
            if (recent > older * 1.1) results.summary.trendDirection = '상승';
            else if (recent < older * 0.9) results.summary.trendDirection = '하락';
            else results.summary.trendDirection = '유지';
          }
        }
      } catch (e) {}

      // 5) 연관 키워드 추출
      try {
        var titleWords = {};
        results.content.blog.concat(results.content.news).forEach(function(item) {
          var title = item.title.replace(/[^가-힣a-zA-Z0-9\s]/g, '');
          title.split(/\s+/).forEach(function(w) {
            if (w.length >= 2 && w !== keyword && keyword.indexOf(w) === -1) {
              titleWords[w] = (titleWords[w] || 0) + 1;
            }
          });
        });
        var sortedWords = Object.entries(titleWords).sort(function(a,b){return b[1]-a[1]}).slice(0,8);
        results.relatedKeywords = sortedWords.map(function(pair){ return keyword + ' ' + pair[0]; });
        sortedWords.slice(0,4).forEach(function(pair){ results.relatedKeywords.push(pair[0]); });
        var unique = [];
        results.relatedKeywords.forEach(function(k){ if(unique.indexOf(k)===-1)unique.push(k); });
        results.relatedKeywords = unique.slice(0,10);
      } catch (e) {}
    }

    // 6) Google (SerpAPI)
    if (serpApiKey) {
      try {
        const serpRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '&location=South+Korea&hl=ko&gl=kr&num=10&api_key=' + serpApiKey);
        const serpData = await serpRes.json();
        results.summary.googleTotal = (serpData.search_information && serpData.search_information.total_results) || 0;
        results.content.google = (serpData.organic_results || []).slice(0,10).map(function(item,i) {
          return { title: item.title, snippet: item.snippet, link: item.link, source: item.displayed_link || '', position: i+1 };
        });
        if (serpData.related_searches) {
          var googleRelated = serpData.related_searches.map(function(r){return r.query}).slice(0,5);
          googleRelated.forEach(function(k){ if(results.relatedKeywords.indexOf(k)===-1)results.relatedKeywords.push(k); });
          results.relatedKeywords = results.relatedKeywords.slice(0,12);
        }
      } catch (e) {}

      // 7) 인스타그램 게시글 검색 (SerpAPI)
      try {
        const instaRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=5&api_key=' + serpApiKey);
        const instaData = await instaRes.json();
        results.content.instagram = (instaData.organic_results || []).slice(0,5).map(function(item,i) {
          var username = '';
          try { var match = item.link.match(/instagram\.com\/([^\/\?]+)/); if(match) username = '@'+match[1]; } catch(e) {}
          return { title: item.title, snippet: item.snippet || '', link: item.link, source: username || 'Instagram', position: i+1 };
        });
        results.summary.instagramTotal = (instaData.search_information && instaData.search_information.total_results) || 0;
      } catch (e) { results.content.instagram = []; results.summary.instagramTotal = 0; }

      // 8) 페이스북 게시글 검색 (SerpAPI)
      try {
        const fbRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=5&api_key=' + serpApiKey);
        const fbData = await fbRes.json();
        results.content.facebook = (fbData.organic_results || []).slice(0,5).map(function(item,i) {
          var pageName = '';
          try { var match = item.link.match(/facebook\.com\/([^\/\?]+)/); if(match) pageName = match[1]; } catch(e) {}
          return { title: item.title, snippet: item.snippet || '', link: item.link, source: pageName || 'Facebook', position: i+1 };
        });
        results.summary.facebookTotal = (fbData.search_information && fbData.search_information.total_results) || 0;
      } catch (e) { results.content.facebook = []; results.summary.facebookTotal = 0; }
    }

    results.summary.totalContent = results.summary.naverBlogTotal + results.summary.naverNewsTotal + results.summary.naverCafeTotal + results.summary.googleTotal + (results.summary.instagramTotal || 0) + (results.summary.facebookTotal || 0);
    res.json(results);

  } catch (err) {
    res.status(500).json({ error: '키워드 분석 실패: ' + err.message });
  }
};
