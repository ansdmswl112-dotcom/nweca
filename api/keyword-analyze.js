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
  var serpApiKey = process.env.SERPAPI_KEY;

  var results = {
    ok: true,
    keyword: keyword,
    summary: {
      // 전체 누적 (네이버 API total)
      naverBlogAll: 0,
      naverNewsAll: 0,
      naverCafeAll: 0,
      // ★ 기간 내 건수 (날짜 필터링)
      naverBlogTotal: 0,
      naverNewsTotal: 0,
      naverCafeTotal: 0,
      instagramTotal: 0,
      facebookTotal: 0,
      totalContent: 0,
      trendDirection: '유지',
      // 검색량
      monthlySearchPC: 0,
      monthlySearchMobile: 0,
      monthlySearchTotal: 0,
      competitionIndex: '',
      // 광고 효율
      monthlyAvgPcCtr: 0,
      monthlyAvgMobileCtr: 0,
      plAvgDepth: 0,
      monthlyPcClkCnt: 0,
      monthlyMobileClkCnt: 0,
      // 메타
      period: { from: dateFrom, to: dateTo, months: months },
      dataSource: {
        blog: '네이버 검색 API (기간 필터 적용)',
        news: '네이버 검색 API (기간 필터 적용)',
        cafe: '네이버 검색 API',
        searchVolume: '네이버 검색광고 API',
        trend: '네이버 DataLab API'
      }
    },
    trend: { naver: [] },
    content: { blog: [], news: [], cafe: [], instagram: [], facebook: [] },
    relatedKeywords: [],
    contents: []
  };

  try {
    if (naverClientId && naverClientSecret) {
      // ═══════════════════════════════════════
      // ① 네이버 블로그 (100건 가져와서 날짜 필터링)
      // ═══════════════════════════════════════
      try {
        var blogRes = await fetch('https://openapi.naver.com/v1/search/blog.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var blogData = await blogRes.json();
        results.summary.naverBlogAll = blogData.total || 0;

        var blogItems = (blogData.items || []).map(function(item) {
          return {
            title: stripHtml(item.title),
            description: stripHtml(item.description),
            link: item.link,
            source: item.bloggername || '네이버 블로그',
            date: formatDate(item.postdate || '')
          };
        });

        // ★ 기간 필터링 — postdate가 dateFrom~dateTo 범위 내인 것만
        var blogFiltered = blogItems.filter(function(item) {
          if (!item.date) return true; // 날짜 없으면 포함
          return item.date >= dateFrom && item.date <= dateTo;
        });

        results.summary.naverBlogTotal = blogFiltered.length;
        results.content.blog = blogFiltered.slice(0, 20);

        // 전체 100건 중 기간 내 비율로 추정 총량 계산
        if (blogItems.length > 0 && blogFiltered.length > 0) {
          var filterRatio = blogFiltered.length / blogItems.length;
          results.summary.naverBlogTotal = Math.round(results.summary.naverBlogAll * filterRatio);
        }
      } catch (e) { console.error('Blog error:', e.message); }

      // ═══════════════════════════════════════
      // ② 네이버 뉴스 (100건 가져와서 날짜 필터링)
      // ═══════════════════════════════════════
      try {
        var newsRes = await fetch('https://openapi.naver.com/v1/search/news.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var newsData = await newsRes.json();
        results.summary.naverNewsAll = newsData.total || 0;

        var newsItems = (newsData.items || []).map(function(item) {
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

        var newsFiltered = newsItems.filter(function(item) {
          if (!item.date) return true;
          return item.date >= dateFrom && item.date <= dateTo;
        });

        results.summary.naverNewsTotal = newsFiltered.length;
        results.content.news = newsFiltered.slice(0, 20);

        if (newsItems.length > 0 && newsFiltered.length > 0) {
          var filterRatio = newsFiltered.length / newsItems.length;
          results.summary.naverNewsTotal = Math.round(results.summary.naverNewsAll * filterRatio);
        }
      } catch (e) { console.error('News error:', e.message); }

      // ═══════════════════════════════════════
      // ③ 네이버 카페 (날짜 정보 제한적)
      // ═══════════════════════════════════════
      try {
        var cafeRes = await fetch('https://openapi.naver.com/v1/search/cafearticle.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var cafeData = await cafeRes.json();
        results.summary.naverCafeAll = cafeData.total || 0;

        var cafeItems = (cafeData.items || []).map(function(item) {
          return {
            title: stripHtml(item.title),
            description: stripHtml(item.description),
            link: item.link,
            source: item.cafename || '카페',
            date: ''
          };
        });

        // 카페는 날짜가 없어서 비율 추정 (블로그+뉴스 평균 비율 사용)
        var blogRatio = results.summary.naverBlogAll > 0 ? results.summary.naverBlogTotal / results.summary.naverBlogAll : 1;
        var newsRatio = results.summary.naverNewsAll > 0 ? results.summary.naverNewsTotal / results.summary.naverNewsAll : 1;
        var avgRatio = (blogRatio + newsRatio) / 2;
        results.summary.naverCafeTotal = Math.round((cafeData.total || 0) * avgRatio);
        results.content.cafe = cafeItems.slice(0, 10);
      } catch (e) { console.error('Cafe error:', e.message); }

      // ═══════════════════════════════════════
      // ④ 네이버 DataLab 트렌드
      // ═══════════════════════════════════════
      try {
        // 기간에 따라 timeUnit 자동 결정
        var daysDiff = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000);
        var timeUnit = daysDiff <= 31 ? 'date' : 'month';
        // DataLab은 최소 31일이 필요하므로 짧은 기간은 startDate를 늘림
        var dlFrom = dateFrom;
        if (daysDiff < 31) {
          dlFrom = new Date(new Date(dateTo).getTime() - 31 * 86400000).toISOString().split('T')[0];
        }
        var datalabRes = await fetch('https://openapi.naver.com/v1/datalab/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          },
          body: JSON.stringify({
            startDate: dlFrom,
            endDate: dateTo,
            timeUnit: timeUnit,
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

      // 연관 키워드 (블로그+뉴스 제목에서 추출)
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

    // ═══════════════════════════════════════
    // ⑤ 네이버 검색광고 API (실제 검색량)
    // ═══════════════════════════════════════
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

        var exact = keywordList.find(function(k) {
          return k.relKeyword === keyword || k.relKeyword === keyword.replace(/\s/g, '');
        });

        if (exact) {
          results.summary.monthlySearchPC = parseAdCount(exact.monthlyPcQcCnt);
          results.summary.monthlySearchMobile = parseAdCount(exact.monthlyMobileQcCnt);
          results.summary.monthlySearchTotal = results.summary.monthlySearchPC + results.summary.monthlySearchMobile;
          results.summary.competitionIndex = exact.compIdx || '';
          results.summary.monthlyAvgPcCtr = parseFloat(exact.monthlyAvePcCtr) || 0;
          results.summary.monthlyAvgMobileCtr = parseFloat(exact.monthlyAveMobileCtr) || 0;
          results.summary.plAvgDepth = parseFloat(exact.plAvgDepth) || 0;
          results.summary.monthlyPcClkCnt = parseAdCount(exact.monthlyPcClkCnt);
          results.summary.monthlyMobileClkCnt = parseAdCount(exact.monthlyMobileClkCnt);
        }

        // 연관 키워드 (광고 API 기반)
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

    // ═══════════════════════════════════════
    // ⑥ 인스타그램 (Meta API → SerpAPI 폴백)
    // ═══════════════════════════════════════
    if (metaToken && metaIgUserId) {
      try {
        var tag = keyword.replace(/\s/g, '');
        var searchUrl = 'https://graph.facebook.com/v19.0/ig_hashtag_search?q=' + encodeURIComponent(tag) + '&user_id=' + metaIgUserId + '&access_token=' + metaToken;
        var searchRes = await fetch(searchUrl);
        var searchData = await searchRes.json();
        var hashtagId = searchData.data && searchData.data[0] ? searchData.data[0].id : null;

        if (hashtagId) {
          var infoUrl = 'https://graph.facebook.com/v19.0/' + hashtagId + '?fields=media_count&user_id=' + metaIgUserId + '&access_token=' + metaToken;
          var infoRes = await fetch(infoUrl);
          var infoData = await infoRes.json();
          results.summary.instagramTotal = infoData.media_count || 0;
          results.summary.dataSource.instagram = 'Instagram Graph API (팩트)';

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
      } catch (e) { console.error('Instagram Meta error:', e.message); }
    }

    // SerpAPI 폴백 (Meta 안 될 때)
    if (serpApiKey && results.summary.instagramTotal === 0) {
      try {
        var instaRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=10&api_key=' + serpApiKey);
        var instaData = await instaRes.json();
        results.content.instagram = (instaData.organic_results || []).slice(0, 10).map(function(item, i) {
          var username = '';
          try { var match = item.link.match(/instagram\.com\/([^\/\?]+)/); if (match) username = '@' + match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: username || 'Instagram', position: i + 1 };
        });
        results.summary.instagramTotal = results.content.instagram.length;
        results.summary.dataSource.instagram = 'SerpAPI (구글 검색 기반, ' + results.content.instagram.length + '건 수집)';
      } catch (e) { console.error('SerpAPI Instagram error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑦ 페이스북 (Meta API → SerpAPI 폴백)
    // ═══════════════════════════════════════
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
        if (fbItems.length > 0) results.summary.dataSource.facebook = 'Facebook Graph API (팩트)';
      } catch (e) { console.error('Facebook error:', e.message); }
    }

    if (serpApiKey && results.summary.facebookTotal === 0) {
      try {
        var fbSerpRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=10&api_key=' + serpApiKey);
        var fbSerpData = await fbSerpRes.json();
        results.content.facebook = (fbSerpData.organic_results || []).slice(0, 10).map(function(item, i) {
          var pageName = '';
          try { var match = item.link.match(/facebook\.com\/([^\/\?]+)/); if (match) pageName = match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: pageName || 'Facebook', position: i + 1 };
        });
        results.summary.facebookTotal = results.content.facebook.length;
        results.summary.dataSource.facebook = 'SerpAPI (구글 검색 기반, ' + results.content.facebook.length + '건 수집)';
      } catch (e) { console.error('SerpAPI Facebook error:', e.message); }
    }

    // ═══════════════════════════════════════
    // 총량 계산 (네이버 기간 필터 기준)
    // ═══════════════════════════════════════
    results.summary.totalContent =
      results.summary.naverBlogTotal +
      results.summary.naverNewsTotal +
      results.summary.naverCafeTotal;

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

// ════════ 유틸리티 ════════
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
