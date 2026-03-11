const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var params = req.method === 'POST' ? req.body : req.query;
  var keyword = params.keyword || params.query || '';
  if (!keyword) return res.status(400).json({ error: '키워드를 입력하세요' });

  var months = parseInt(params.months) || 12;
  var dateTo = params.dateTo || new Date().toISOString().split('T')[0];
  var dateFrom = params.dateFrom || new Date(Date.now() - months * 30 * 86400000).toISOString().split('T')[0];

  var naverClientId = process.env.NAVER_CLIENT_ID;
  var naverClientSecret = process.env.NAVER_CLIENT_SECRET;
  var adApiKey = process.env.NAVER_AD_API_LICENSE;
  var adSecretKey = process.env.NAVER_AD_SECRET_KEY;
  var adCustomerId = process.env.NAVER_AD_CUSTOMER_ID;
  var metaToken = process.env.META_ACCESS_TOKEN;
  var metaIgUserId = process.env.META_IG_USER_ID;

  var results = {
    ok: true,
    keyword: keyword,
    summary: {
      naverBlogTotal: 0,
      naverNewsTotal: 0,
      naverCafeTotal: 0,
      instagramTotal: 0,
      facebookTotal: 0,
      totalContent: 0,
      trendDirection: '유지',
      monthlySearchPC: 0,
      monthlySearchMobile: 0,
      monthlySearchTotal: 0,
      competitionIndex: '',
      period: { from: dateFrom, to: dateTo, months: months }
    },
    trend: { naver: [] },
    content: { blog: [], news: [], cafe: [], instagram: [], facebook: [] },
    relatedKeywords: [],
    contents: []
  };

  try {
    // ========== ① 네이버 검색 API ==========
    if (naverClientId && naverClientSecret) {
      // 블로그
      try {
        var blogRes = await fetch('https://openapi.naver.com/v1/search/blog.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var blogData = await blogRes.json();
        results.summary.naverBlogTotal = blogData.total || 0;
        results.content.blog = (blogData.items || []).map(function(item) {
          return {
            title: stripHtml(item.title),
            description: stripHtml(item.description),
            link: item.link,
            source: item.bloggername || '네이버 블로그',
            date: formatDate(item.postdate || '')
          };
        });
      } catch (e) { console.error('Blog error:', e.message); }

      // 뉴스
      try {
        var newsRes = await fetch('https://openapi.naver.com/v1/search/news.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var newsData = await newsRes.json();
        results.summary.naverNewsTotal = newsData.total || 0;
        results.content.news = (newsData.items || []).map(function(item) {
          var source = '뉴스';
          try { source = new URL(item.originallink).hostname.replace('www.', ''); } catch(e) {}
          return {
            title: stripHtml(item.title),
            description: stripHtml(item.description),
            link: item.link,
            source: source,
            date: formatDate(item.pubDate || '')
          };
        });
      } catch (e) { console.error('News error:', e.message); }

      // 카페
      try {
        var cafeRes = await fetch('https://openapi.naver.com/v1/search/cafearticle.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var cafeData = await cafeRes.json();
        results.summary.naverCafeTotal = cafeData.total || 0;
        results.content.cafe = (cafeData.items || []).map(function(item) {
          return {
            title: stripHtml(item.title),
            description: stripHtml(item.description),
            link: item.link,
            source: item.cafename || '카페',
            date: ''
          };
        });
      } catch (e) { console.error('Cafe error:', e.message); }

      // ========== ② 네이버 DataLab 트렌드 ==========
      try {
        var datalabRes = await fetch('https://openapi.naver.com/v1/datalab/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          },
          body: JSON.stringify({
            startDate: dateFrom,
            endDate: dateTo,
            timeUnit: 'month',
            keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
          })
        });
        var datalabData = await datalabRes.json();
        if (datalabData.results && datalabData.results[0]) {
          var trendData = datalabData.results[0].data || [];
          results.trend.naver = trendData.map(function(d) {
            return { date: d.period, value: Math.round(d.ratio) };
          });
          if (trendData.length >= 4) {
            var recent = trendData.slice(-3).reduce(function(s, d) { return s + d.ratio; }, 0) / 3;
            var olderSlice = trendData.slice(-6, -3);
            var older = olderSlice.length > 0 ? olderSlice.reduce(function(s, d) { return s + d.ratio; }, 0) / olderSlice.length : recent;
            if (recent > older * 1.1) results.summary.trendDirection = '상승';
            else if (recent < older * 0.9) results.summary.trendDirection = '하락';
            else results.summary.trendDirection = '유지';
          }
        }
      } catch (e) { console.error('DataLab error:', e.message); }

      // 연관 키워드 (블로그+뉴스 제목에서 추출, 광고 API 없을 때 폴백)
      try {
        var titleWords = {};
        var stopwords = ['있는', '하는', '위한', '대한', '통한', '관련', '에서', '으로', '이상', '이하'];
        results.content.blog.concat(results.content.news).forEach(function(item) {
          var title = (item.title || '').replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
          title.split(/[\s,·+\-\/|()[\]{}]+/).forEach(function(w) {
            var clean = w.trim();
            if (clean.length >= 2 && clean.length <= 12 && stopwords.indexOf(clean) === -1) {
              titleWords[clean] = (titleWords[clean] || 0) + 1;
            }
          });
        });
        var sortedWords = Object.entries(titleWords).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15);
        results.relatedKeywords = sortedWords.map(function(pair) { return pair[0]; });
      } catch (e) {}
    }

    // ========== ③ 네이버 검색광고 API (실제 검색량) ==========
    if (adApiKey && adSecretKey && adCustomerId) {
      try {
        var crypto = require('crypto');
        var timestamp = Date.now().toString();
        var method = 'GET';
        var path = '/keywordstool';
        var hmac = crypto.createHmac('sha256', adSecretKey);
        hmac.update(timestamp + '.' + method + '.' + path);
        var signature = hmac.digest('base64');

        var adUrl = 'https://api.searchad.naver.com' + path + '?hintKeywords=' + encodeURIComponent(keyword) + '&showDetail=1';
        var adRes = await fetch(adUrl, {
          headers: {
            'X-Timestamp': timestamp,
            'X-API-KEY': adApiKey,
            'X-Customer': adCustomerId,
            'X-Signature': signature
          }
        });
        var adData = await adRes.json();
        var keywordList = adData.keywordList || [];

        // 입력 키워드 정확 매칭
        var exact = keywordList.find(function(k) {
          return k.relKeyword === keyword || k.relKeyword === keyword.replace(/\s/g, '');
        });

        if (exact) {
          results.summary.monthlySearchPC = parseAdCount(exact.monthlyPcQcCnt);
          results.summary.monthlySearchMobile = parseAdCount(exact.monthlyMobileQcCnt);
          results.summary.monthlySearchTotal = results.summary.monthlySearchPC + results.summary.monthlySearchMobile;
          results.summary.competitionIndex = exact.compIdx || '';
          results.summary.monthlyAvgPcCtr = exact.monthlyAvePcCtr || 0;
          results.summary.monthlyAvgMobileCtr = exact.monthlyAveMobileCtr || 0;
          results.summary.plAvgDepth = exact.plAvgDepth || 0;
          results.summary.monthlyPcClkCnt = parseAdCount(exact.monthlyPcClkCnt);
          results.summary.monthlyMobileClkCnt = parseAdCount(exact.monthlyMobileClkCnt);
        }

        // 연관 키워드 (광고 API 기반 - 더 정확함)
        var adRelated = keywordList
          .filter(function(k) { return k.relKeyword !== keyword; })
          .sort(function(a, b) {
            var aVol = parseAdCount(a.monthlyPcQcCnt) + parseAdCount(a.monthlyMobileQcCnt);
            var bVol = parseAdCount(b.monthlyPcQcCnt) + parseAdCount(b.monthlyMobileQcCnt);
            return bVol - aVol;
          })
          .slice(0, 15)
          .map(function(k) { return k.relKeyword; });

        if (adRelated.length > 0) {
          results.relatedKeywords = adRelated;
        }
      } catch (e) { console.error('Ad API error:', e.message); }
    }

    // ========== ④ 인스타그램 해시태그 API ==========
    if (metaToken && metaIgUserId) {
      try {
        var tag = keyword.replace(/\s/g, '');
        var searchUrl = 'https://graph.facebook.com/v19.0/ig_hashtag_search?q=' + encodeURIComponent(tag) + '&user_id=' + metaIgUserId + '&access_token=' + metaToken;
        var searchRes = await fetch(searchUrl);
        var searchData = await searchRes.json();
        var hashtagId = searchData.data && searchData.data[0] ? searchData.data[0].id : null;

        if (hashtagId) {
          // 게시물 수
          var infoUrl = 'https://graph.facebook.com/v19.0/' + hashtagId + '?fields=media_count&user_id=' + metaIgUserId + '&access_token=' + metaToken;
          var infoRes = await fetch(infoUrl);
          var infoData = await infoRes.json();
          results.summary.instagramTotal = infoData.media_count || 0;

          // 상위 게시물
          var topUrl = 'https://graph.facebook.com/v19.0/' + hashtagId + '/top_media?user_id=' + metaIgUserId + '&fields=id,caption,like_count,comments_count,timestamp,permalink&access_token=' + metaToken + '&limit=10';
          var topRes = await fetch(topUrl);
          var topData = await topRes.json();
          results.content.instagram = (topData.data || []).map(function(p) {
            return {
              title: (p.caption || '').substring(0, 80),
              link: p.permalink || '',
              snippet: (p.caption || '').substring(0, 40),
              source: 'Instagram',
              likes: p.like_count || 0,
              comments: p.comments_count || 0,
              date: p.timestamp || ''
            };
          });
        }
      } catch (e) { console.error('Instagram error:', e.message); }
    }

    // ========== ⑤ 페이스북 페이지 검색 ==========
    if (metaToken) {
      try {
        var fbUrl = 'https://graph.facebook.com/v19.0/search?q=' + encodeURIComponent(keyword) + '&type=page&fields=name,fan_count,link,category,about&access_token=' + metaToken + '&limit=10';
        var fbRes = await fetch(fbUrl);
        var fbData = await fbRes.json();
        var fbItems = (fbData.data || []).map(function(p) {
          return {
            title: p.name || '',
            source: p.category || 'Facebook',
            link: p.link || ('https://facebook.com/' + p.id),
            snippet: (p.about || '').substring(0, 40),
            fans: p.fan_count || 0
          };
        });
        results.content.facebook = fbItems;
        results.summary.facebookTotal = fbItems.length;
      } catch (e) { console.error('Facebook error:', e.message); }
    }

    // ========== ⑥ SerpAPI 폴백 (Meta API 미작동시) ==========
    var serpApiKey = process.env.SERPAPI_KEY;
    if (serpApiKey && results.summary.instagramTotal === 0) {
      try {
        var instaRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=5&api_key=' + serpApiKey);
        var instaData = await instaRes.json();
        results.content.instagram = (instaData.organic_results || []).slice(0, 5).map(function(item, i) {
          var username = '';
          try { var match = item.link.match(/instagram\.com\/([^\/\?]+)/); if (match) username = '@' + match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: username || 'Instagram', position: i + 1 };
        });
        results.summary.instagramTotal = (instaData.search_information && instaData.search_information.total_results) || results.content.instagram.length;
      } catch (e) { console.error('SerpAPI Instagram error:', e.message); }
    }
    if (serpApiKey && results.summary.facebookTotal === 0) {
      try {
        var fbSerpRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=5&api_key=' + serpApiKey);
        var fbSerpData = await fbSerpRes.json();
        results.content.facebook = (fbSerpData.organic_results || []).slice(0, 5).map(function(item, i) {
          var pageName = '';
          try { var match = item.link.match(/facebook\.com\/([^\/\?]+)/); if (match) pageName = match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: pageName || 'Facebook', position: i + 1 };
        });
        results.summary.facebookTotal = (fbSerpData.search_information && fbSerpData.search_information.total_results) || results.content.facebook.length;
      } catch (e) { console.error('SerpAPI Facebook error:', e.message); }
    }

    // ========== 총량 계산 ==========
    results.summary.totalContent =
      results.summary.naverBlogTotal +
      results.summary.naverNewsTotal +
      results.summary.naverCafeTotal +
      results.summary.instagramTotal +
      results.summary.facebookTotal;

    // contents 배열 (감성분석/경쟁자 분석용)
    results.contents = []
      .concat(results.content.blog.map(function(i) { return Object.assign({}, i, {type:'blog'}); }))
      .concat(results.content.news.map(function(i) { return Object.assign({}, i, {type:'news'}); }))
      .concat(results.content.cafe.map(function(i) { return Object.assign({}, i, {type:'cafe'}); }))
      .slice(0, 50);

    res.json(results);

  } catch (err) {
    console.error('keyword-analyze error:', err);
    res.status(500).json({ error: '키워드 분석 실패: ' + err.message });
  }
};

// ========== 유틸리티 ==========
function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6) + '-' + dateStr.slice(6, 8);
  }
  try { return new Date(dateStr).toISOString().slice(0, 10); } catch (e) { return dateStr; }
}

function parseAdCount(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    var num = parseInt(val.replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
}
