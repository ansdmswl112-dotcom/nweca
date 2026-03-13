const fetch = require('node-fetch');
// VERSION: 2026-03-13-FINAL-v3-shorts (dual-trend + multi-sns + sentiment-neg)

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
      // ★ 추가 플랫폼
      naverKinTotal: 0,
      youtubeTotal: 0,
      youtubeViewTotal: 0,
      googleNewsTotal: 0,
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
    trend: { naver: [], daily: [], google: [] },
    content: { blog: [], news: [], cafe: [], instagram: [], facebook: [], youtube: [], googleNews: [], kin: [] },
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
          if (!item.date) return false; // 날짜 없으면 제외 (정확도 우선)
          return item.date >= dateFrom && item.date <= dateTo;
        });

        results.summary.naverBlogTotal = blogFiltered.length;
        results.content.blog = blogFiltered.slice(0, 20);

        // 기간 내 비율로 추정 (최소 10건 이상일 때만 추정)
        if (blogItems.length >= 10 && blogFiltered.length > 0) {
          var filterRatio = blogFiltered.length / blogItems.length;
          results.summary.naverBlogTotal = Math.round(results.summary.naverBlogAll * filterRatio);
        } else if (blogFiltered.length > 0) {
          results.summary.naverBlogTotal = blogFiltered.length; // 소량이면 실제 건수 사용
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
          if (!item.date) return false;
          return item.date >= dateFrom && item.date <= dateTo;
        });

        results.summary.naverNewsTotal = newsFiltered.length;
        results.content.news = newsFiltered.slice(0, 20);

        if (newsItems.length >= 10 && newsFiltered.length > 0) {
          var filterRatio = newsFiltered.length / newsItems.length;
          results.summary.naverNewsTotal = Math.round(results.summary.naverNewsAll * filterRatio);
        } else if (newsFiltered.length > 0) {
          results.summary.naverNewsTotal = newsFiltered.length;
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
      // ④ 네이버 DataLab 트렌드 (2중 수집)
      // ═══════════════════════════════════════
      try {
        // ★ A) 12개월 월별 (계절성 분석용)
        var trendFrom12 = new Date(new Date(dateTo).getTime() - 365 * 86400000).toISOString().split('T')[0];
        var dlRes12 = await fetch('https://openapi.naver.com/v1/datalab/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          },
          body: JSON.stringify({
            startDate: trendFrom12,
            endDate: dateTo,
            timeUnit: 'month',
            keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
          })
        });
        var dlData12 = await dlRes12.json();
        if (dlData12.results && dlData12.results[0]) {
          var td12 = dlData12.results[0].data || [];
          results.trend.naver = td12.map(function(d) {
            return { date: d.period, value: Math.round(d.ratio) };
          });
          // 12개월 기반 트렌드 방향
          if (td12.length >= 4) {
            var recent = td12.slice(-3).reduce(function(s, d) { return s + d.ratio; }, 0) / 3;
            var olderSlice = td12.slice(-6, -3);
            var older = olderSlice.length > 0 ? olderSlice.reduce(function(s, d) { return s + d.ratio; }, 0) / olderSlice.length : recent;
            if (recent > older * 1.1) results.summary.trendDirection = '상승';
            else if (recent < older * 0.9) results.summary.trendDirection = '하락';
            else results.summary.trendDirection = '유지';
          }
        }

        // ★ B) 선택 기간 일별 (모멘텀/트렌딩 분석용)
        var daysDiff = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000);
        var dlFromDaily = dateFrom;
        if (daysDiff < 31) {
          dlFromDaily = new Date(new Date(dateTo).getTime() - 31 * 86400000).toISOString().split('T')[0];
        }
        var dlResDaily = await fetch('https://openapi.naver.com/v1/datalab/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret
          },
          body: JSON.stringify({
            startDate: dlFromDaily,
            endDate: dateTo,
            timeUnit: 'date',
            keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
          })
        });
        var dlDataDaily = await dlResDaily.json();
        if (dlDataDaily.results && dlDataDaily.results[0]) {
          var tdDaily = dlDataDaily.results[0].data || [];
          results.trend.daily = tdDaily.map(function(d) {
            return { date: d.period, value: Math.round(d.ratio) };
          });
          // 일별 모멘텀 (최근 7일 vs 이전 7일)
          if (tdDaily.length >= 14) {
            var r7 = tdDaily.slice(-7).reduce(function(s, d) { return s + d.ratio; }, 0) / 7;
            var p7 = tdDaily.slice(-14, -7).reduce(function(s, d) { return s + d.ratio; }, 0) / 7;
            results.summary.dailyMomentum = p7 > 0 ? Math.round((r7 - p7) / p7 * 100) : 0;
          } else if (tdDaily.length >= 4) {
            var half = Math.ceil(tdDaily.length / 2);
            var rH = tdDaily.slice(-half).reduce(function(s, d) { return s + d.ratio; }, 0) / half;
            var pH = tdDaily.slice(0, half).reduce(function(s, d) { return s + d.ratio; }, 0) / half;
            results.summary.dailyMomentum = pH > 0 ? Math.round((rH - pH) / pH * 100) : 0;
          }
          // 일별 피크/저점
          if (tdDaily.length > 0) {
            var peak = tdDaily.reduce(function(m, d) { return d.ratio > m.ratio ? d : m; }, tdDaily[0]);
            var low = tdDaily.reduce(function(m, d) { return d.ratio < m.ratio ? d : m; }, tdDaily[0]);
            results.summary.dailyPeak = { date: peak.period, value: Math.round(peak.ratio) };
            results.summary.dailyLow = { date: low.period, value: Math.round(low.ratio) };
          }
        }
      } catch (e) { console.error('DataLab error:', e.message); }

      // 연관 키워드 (블로그+뉴스 제목에서 실제 등장 키워드 추출)
      try {
        var titleWords = {};
        var stopwords = ['있는', '하는', '위한', '대한', '통한', '관련', '에서', '으로', '이상', '이하', '것으로', '라며', '했다', '밝혔', '이번', '오는', '지난', '대해', '등을', '했습니다'];
        var kwParts = keyword.split(/\s+/);
        results.content.blog.concat(results.content.news).concat(results.content.cafe || []).forEach(function(item) {
          var title = (item.title || '');
          // 검색 키워드 자체와 그 부분 제거
          kwParts.forEach(function(p) { if (p.length >= 2) title = title.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''); });
          title.split(/[\s,·+\-\/|()[\]{}\"\'""''「」…]+/).forEach(function(w) {
            var clean = w.trim().replace(/^[을를이가의에서도은는만과로]{0,1}/, '');
            if (clean.length >= 2 && clean.length <= 15 && stopwords.indexOf(clean) === -1 && !/^\d+$/.test(clean)) {
              titleWords[clean] = (titleWords[clean] || 0) + 1;
            }
          });
        });
        var sortedTitleKws = Object.entries(titleWords).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
        results.contentKeywords = sortedTitleKws.map(function(pair) { return { kw: pair[0], count: pair[1], source: 'content' }; });
        results.relatedKeywords = sortedTitleKws.map(function(pair) { return pair[0]; });
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

        // 연관 키워드 — 콘텐츠 키워드에 실제 검색량 병합
        var adKeywordMap = {};
        keywordList.forEach(function(k) {
          var pc = parseAdCount(k.monthlyPcQcCnt);
          var mobile = parseAdCount(k.monthlyMobileQcCnt);
          adKeywordMap[k.relKeyword] = { vol: pc + mobile, pc: pc, mobile: mobile, comp: k.compIdx || '' };
        });

        // 콘텐츠에서 추출한 키워드에 검색량 추가
        if (results.contentKeywords && results.contentKeywords.length > 0) {
          results.relatedKeywords = results.contentKeywords.map(function(ck) {
            var adInfo = adKeywordMap[ck.kw] || {};
            return {
              kw: ck.kw,
              count: ck.count,
              vol: adInfo.vol || 0,
              pc: adInfo.pc || 0,
              mobile: adInfo.mobile || 0,
              comp: adInfo.comp || '',
              source: 'content'
            };
          });
        } else {
          // 콘텐츠 키워드 없으면 광고 API 키워드 사용
          results.relatedKeywords = keywordList
            .filter(function(k) { return k.relKeyword !== keyword && k.relKeyword !== keyword.replace(/\s/g, ''); })
            .map(function(k) {
              var pc = parseAdCount(k.monthlyPcQcCnt);
              var mobile = parseAdCount(k.monthlyMobileQcCnt);
              return { kw: k.relKeyword, count: 0, vol: pc + mobile, pc: pc, mobile: mobile, comp: k.compIdx || '', source: 'ad' };
            })
            .sort(function(a, b) { return b.vol - a.vol; })
            .slice(0, 15);
        }
      } catch (e) { console.error('Ad API error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑥ 인스타그램 — 구글 검색 기반 (기간 필터 적용)
    // ═══════════════════════════════════════
    // 구글 tbs 기간 필터: cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY
    var fromParts = dateFrom.split('-');
    var toParts = dateTo.split('-');
    var tbsParam = '&tbs=cdr:1,cd_min:' + fromParts[1] + '/' + fromParts[2] + '/' + fromParts[0] + ',cd_max:' + toParts[1] + '/' + toParts[2] + '/' + toParts[0];

    if (serpApiKey) {
      try {
        var instaRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=10' + tbsParam + '&api_key=' + serpApiKey);
        var instaData = await instaRes.json();
        var instaResults = (instaData.organic_results || []).slice(0, 10).map(function(item, i) {
          var username = '';
          try { var match = item.link.match(/instagram\.com\/([^\/\?]+)/); if (match) username = '@' + match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: username || 'Instagram', position: i + 1, date: item.date || '' };
        });
        var instaTotal = (instaData.search_information && instaData.search_information.total_results) || 0;
        if (instaTotal > 0 || instaResults.length > 0) {
          results.summary.instagramTotal = instaTotal;
          results.content.instagram = instaResults;
          results.summary.dataSource.instagram = '구글 검색 기간 내 (' + dateFrom + '~' + dateTo + ', ' + instaTotal.toLocaleString() + '건)';
        }
      } catch (e) { console.error('SerpAPI Instagram error:', e.message); }
    }

    // 방법2: Meta Graph API (심사 통과 후 — 더 정확한 데이터로 덮어씀)
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
          if (infoData.media_count > 0) {
            results.summary.instagramTotal = infoData.media_count;
            results.summary.dataSource.instagram = 'Instagram Graph API (팩트, ' + infoData.media_count.toLocaleString() + '건)';
          }

          var topUrl = 'https://graph.facebook.com/v19.0/' + hashtagId + '/top_media?user_id=' + metaIgUserId + '&fields=id,caption,like_count,comments_count,timestamp,permalink&access_token=' + metaToken + '&limit=10';
          var topRes = await fetch(topUrl);
          var topData = await topRes.json();
          if (topData.data && topData.data.length > 0) {
            results.content.instagram = (topData.data).map(function(p) {
              return { title: (p.caption || '').substring(0, 80), link: p.permalink || '', snippet: (p.caption || '').substring(0, 40), source: 'Instagram', likes: p.like_count || 0, comments: p.comments_count || 0, date: p.timestamp || '' };
            });
          }
        }
      } catch (e) { console.error('Instagram Meta error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑦ 페이스북 — 구글 검색 기반 (실제 게시물 수)
    // ═══════════════════════════════════════
    // 방법1: SerpAPI — "유정근 site:facebook.com" → 구글이 인덱싱한 실제 페북 게시물 수
    if (serpApiKey) {
      try {
        var fbSerpRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=10' + tbsParam + '&api_key=' + serpApiKey);
        var fbSerpData = await fbSerpRes.json();
        var fbResults = (fbSerpData.organic_results || []).slice(0, 10).map(function(item, i) {
          var pageName = '';
          try { var match = item.link.match(/facebook\.com\/([^\/\?]+)/); if (match) pageName = match[1]; } catch(e) {}
          return { title: item.title || '', snippet: item.snippet || '', link: item.link, source: pageName || 'Facebook', position: i + 1 };
        });
        var fbTotal = (fbSerpData.search_information && fbSerpData.search_information.total_results) || 0;
        if (fbTotal > 0 || fbResults.length > 0) {
          results.summary.facebookTotal = fbTotal;
          results.content.facebook = fbResults;
          results.summary.dataSource.facebook = '구글 검색 기간 내 (' + dateFrom + '~' + dateTo + ', ' + fbTotal.toLocaleString() + '건)';
        }
      } catch (e) { console.error('SerpAPI Facebook error:', e.message); }
    }

    // 방법2: Meta Graph API (페이지 정보)
    if (metaToken && results.summary.facebookTotal === 0) {
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

    // ═══════════════════════════════════════
    // ⑧ 네이버 지식iN (보유 API — 추가비용 0원)
    // ═══════════════════════════════════════
    if (naverClientId && naverClientSecret) {
      try {
        var kinRes = await fetch('https://openapi.naver.com/v1/search/kin.json?query=' + encodeURIComponent(keyword) + '&display=10&sort=date', {
          headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret }
        });
        var kinData = await kinRes.json();
        results.summary.naverKinTotal = kinData.total || 0;
        results.content.kin = (kinData.items || []).slice(0, 5).map(function(item) {
          return { title: stripHtml(item.title), description: stripHtml(item.description).substring(0, 60), link: item.link, date: '' };
        });
        results.summary.dataSource.kin = '네이버 지식iN API (' + (kinData.total || 0).toLocaleString() + '건)';
      } catch (e) { console.error('Naver KIN error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑨ 유튜브 (YouTube 엔진 직접 + 구글 기간필터 병합)
    // ═══════════════════════════════════════
    if (serpApiKey) {
      try {
        // A) YouTube 엔진 직접 검색 (숏츠 포함, 최신 영상 잘 잡음)
        var ytDirectRes = await fetch('https://serpapi.com/search.json?engine=youtube&search_query=' + encodeURIComponent(keyword) + '&hl=ko&gl=kr&api_key=' + serpApiKey);
        var ytDirectData = await ytDirectRes.json();
        var ytVideos = (ytDirectData.video_results || []).slice(0, 15);
        // 숏츠도 별도 수집
        var ytShorts = (ytDirectData.shorts_results || []).slice(0, 5);
        
        // B) 기간 내 영상만 필터 (날짜 파싱)
        var allYtItems = [];
        ytVideos.forEach(function(v) {
          var pubDate = v.published_date || '';
          var views = 0;
          if (v.views) {
            var vStr = String(v.views).replace(/[^0-9.만천억]/g, '');
            if (vStr.includes('억')) views = Math.round(parseFloat(vStr) * 100000000);
            else if (vStr.includes('만')) views = Math.round(parseFloat(vStr) * 10000);
            else if (vStr.includes('천')) views = Math.round(parseFloat(vStr) * 1000);
            else views = parseInt(vStr) || 0;
          }
          allYtItems.push({
            title: v.title || '',
            link: v.link || '',
            views: views,
            channel: (v.channel && v.channel.name) || '',
            date: pubDate,
            type: 'video',
            thumbnail: (v.thumbnail && v.thumbnail.static) || ''
          });
        });
        // 숏츠 추가
        ytShorts.forEach(function(s) {
          allYtItems.push({
            title: (s.title || '') + ' [숏츠]',
            link: s.link || '',
            views: 0,
            channel: (s.channel && s.channel.name) || '',
            date: '',
            type: 'shorts',
            thumbnail: (s.thumbnail || '')
          });
        });

        // C) 구글 검색으로 기간 내 총 건수 확인
        var ytGoogleRes = await fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:youtube.com&hl=ko&gl=kr&num=5' + tbsParam + '&api_key=' + serpApiKey);
        var ytGoogleData = await ytGoogleRes.json();
        var ytPeriodTotal = (ytGoogleData.search_information && ytGoogleData.search_information.total_results) || 0;

        // 결과 병합
        var totalViews = allYtItems.reduce(function(s, v) { return s + v.views; }, 0);
        results.content.youtube = allYtItems.slice(0, 10);
        results.summary.youtubeTotal = ytPeriodTotal > 0 ? ytPeriodTotal : allYtItems.length;
        results.summary.youtubeViewTotal = totalViews;
        results.summary.dataSource.youtube = 'YouTube 검색 (영상' + ytVideos.length + '+숏츠' + ytShorts.length + '건, 기간 내 ' + (ytPeriodTotal > 0 ? ytPeriodTotal.toLocaleString() + '건' : '확인중') + ', 총 조회수 ' + totalViews.toLocaleString() + ')';
      } catch (e) { console.error('YouTube error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑩ 구글 뉴스 (기간 필터 적용)
    // ═══════════════════════════════════════
    if (serpApiKey) {
      try {
        var gnRes = await fetch('https://serpapi.com/search.json?engine=google_news&q=' + encodeURIComponent(keyword) + '+after:' + dateFrom + '+before:' + dateTo + '&hl=ko&gl=kr&api_key=' + serpApiKey);
        var gnData = await gnRes.json();
        var gnResults = (gnData.news_results || []).slice(0, 10);
        results.content.googleNews = gnResults.map(function(n) {
          return { title: n.title || '', link: n.link || '', source: (n.source && n.source.name) || '', date: n.date || '', snippet: n.snippet || '' };
        });
        results.summary.googleNewsTotal = gnResults.length;
        results.summary.dataSource.googleNews = '구글 뉴스 (최신 ' + gnResults.length + '건)';
      } catch (e) { console.error('Google News error:', e.message); }
    }

    // ═══════════════════════════════════════
    // ⑪ 구글 트렌드 (SerpAPI Google Trends — 추가비용 0원)
    // ═══════════════════════════════════════
    if (serpApiKey) {
      try {
        var gtRes = await fetch('https://serpapi.com/search.json?engine=google_trends&q=' + encodeURIComponent(keyword) + '&data_type=TIMESERIES&date=' + dateFrom.replace(/-/g, '-') + ' ' + dateTo.replace(/-/g, '-') + '&hl=ko&gl=kr&api_key=' + serpApiKey);
        var gtData = await gtRes.json();
        if (gtData.interest_over_time && gtData.interest_over_time.timeline_data) {
          results.trend.google = gtData.interest_over_time.timeline_data.map(function(d) {
            return { date: d.date || '', value: (d.values && d.values[0] && d.values[0].extracted_value) || 0 };
          });
          // 구글 트렌드 방향 계산
          var gtd = results.trend.google;
          if (gtd.length >= 4) {
            var gRecent = gtd.slice(-3).reduce(function(s, d) { return s + d.value; }, 0) / 3;
            var gOlder = gtd.slice(-6, -3).reduce(function(s, d) { return s + d.value; }, 0) / Math.max(gtd.slice(-6, -3).length, 1);
            results.summary.googleTrendDirection = gRecent > gOlder * 1.1 ? '상승' : gRecent < gOlder * 0.9 ? '하락' : '유지';
          }
        }
        results.summary.dataSource.googleTrend = '구글 트렌드 (Google Trends)';
      } catch (e) { console.error('Google Trends error:', e.message); }
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
