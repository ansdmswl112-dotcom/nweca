const fetch = require('node-fetch');
// VERSION: 2026-03-13-YOUTUBE-API (YouTube Data API v3 + Google CSE)

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
  var dateFrom = params.dateFrom || (function() {
    var d = new Date();
    if (months < 1) d.setDate(d.getDate() - Math.round(months * 30));
    else d.setMonth(d.getMonth() - Math.round(months));
    return d.toISOString().split('T')[0];
  })();

  var NID = process.env.NAVER_CLIENT_ID, NSC = process.env.NAVER_CLIENT_SECRET;
  var adKey = process.env.NAVER_AD_API_LICENSE, adSec = process.env.NAVER_AD_SECRET_KEY, adCust = process.env.NAVER_AD_CUSTOMER_ID;
  var serpKey = process.env.SERPAPI_KEY;
  var ytKey = process.env.YOUTUBE_API_KEY;
  var gKey = process.env.GOOGLE_API_KEY || ytKey;
  var gCx = process.env.GOOGLE_CSE_ID;

  var R = {
    ok: true, keyword: keyword,
    summary: {
      naverBlogAll: 0, naverNewsAll: 0, naverCafeAll: 0,
      naverBlogTotal: 0, naverNewsTotal: 0, naverCafeTotal: 0,
      instagramTotal: 0, facebookTotal: 0, youtubeTotal: 0, youtubeViewTotal: 0,
      googleNewsTotal: 0, naverKinTotal: 0, totalContent: 0,
      trendDirection: '유지', googleTrendDirection: '',
      monthlySearchPC: 0, monthlySearchMobile: 0, monthlySearchTotal: 0,
      competitionIndex: '', monthlyAvgPcCtr: 0, monthlyAvgMobileCtr: 0,
      plAvgDepth: 0, dailyMomentum: null, dailyPeak: null, dailyLow: null,
      period: { from: dateFrom, to: dateTo, months: months },
      dataSource: {}
    },
    trend: { naver: [], daily: [], google: [] },
    content: { blog: [], news: [], cafe: [], instagram: [], facebook: [], youtube: [], googleNews: [], kin: [] },
    relatedKeywords: [], contentKeywords: [], contents: []
  };

  var nH = NID ? { 'X-Naver-Client-Id': NID, 'X-Naver-Client-Secret': NSC } : null;

  try {
    var tasks = [];

    // [0] 블로그  [1] 뉴스  [2] 카페  [3] 지식iN
    if (nH) tasks.push(fetch('https://openapi.naver.com/v1/search/blog.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', { headers: nH }).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));
    if (nH) tasks.push(fetch('https://openapi.naver.com/v1/search/news.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', { headers: nH }).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));
    if (nH) tasks.push(fetch('https://openapi.naver.com/v1/search/cafearticle.json?query=' + encodeURIComponent(keyword) + '&display=100&sort=date', { headers: nH }).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));
    if (nH) tasks.push(fetch('https://openapi.naver.com/v1/search/kin.json?query=' + encodeURIComponent(keyword) + '&display=10&sort=date', { headers: nH }).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));

    // [4] DataLab 12개월  [5] DataLab 일별
    if (nH) {
      var tf12 = new Date(new Date(dateTo).getTime() - 365 * 86400000).toISOString().split('T')[0];
      tasks.push(fetch('https://openapi.naver.com/v1/datalab/search', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, nH), body: JSON.stringify({ startDate: tf12, endDate: dateTo, timeUnit: 'month', keywordGroups: [{ groupName: keyword, keywords: [keyword] }] }) }).then(r => r.json()).catch(() => null));
    } else tasks.push(Promise.resolve(null));
    if (nH) {
      var dd = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000);
      var dlF = dd < 31 ? new Date(new Date(dateTo).getTime() - 31 * 86400000).toISOString().split('T')[0] : dateFrom;
      tasks.push(fetch('https://openapi.naver.com/v1/datalab/search', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, nH), body: JSON.stringify({ startDate: dlF, endDate: dateTo, timeUnit: 'date', keywordGroups: [{ groupName: keyword, keywords: [keyword] }] }) }).then(r => r.json()).catch(() => null));
    } else tasks.push(Promise.resolve(null));

    // [6] 광고 API
    if (adKey && adSec && adCust) {
      var crypto = require('crypto'), ts = Date.now().toString();
      var hm = crypto.createHmac('sha256', adSec); hm.update(ts + '.GET./keywordstool');
      tasks.push(fetch('https://api.searchad.naver.com/keywordstool?hintKeywords=' + encodeURIComponent(keyword) + '&showDetail=1', { headers: { 'X-Timestamp': ts, 'X-API-KEY': adKey, 'X-Customer': adCust, 'X-Signature': hm.digest('base64') } }).then(r => r.json()).catch(() => null));
    } else tasks.push(Promise.resolve(null));

    // ★★★ [7] YouTube Data API — 채널 검색 (채널 ID 찾기)
    if (ytKey) tasks.push(fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&q=' + encodeURIComponent(keyword) + '&type=channel&maxResults=3&key=' + ytKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));

    // ★★★ [8] YouTube Data API — 영상 검색 (키워드 관련 영상)
    var ytAfter = dateFrom + 'T00:00:00Z';
    var ytBefore = dateTo + 'T23:59:59Z';
    if (ytKey) tasks.push(fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&q=' + encodeURIComponent(keyword) + '&type=video&order=date&maxResults=20&publishedAfter=' + ytAfter + '&publishedBefore=' + ytBefore + '&key=' + ytKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));

    // [9] 인스타  [10] 페북 (SerpAPI 구글 검색 — 기간필터)
    var fp = dateFrom.split('-'), tp = dateTo.split('-');
    var tbs = '&tbs=cdr:1,cd_min:' + fp[1] + '/' + fp[2] + '/' + fp[0] + ',cd_max:' + tp[1] + '/' + tp[2] + '/' + tp[0];
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=10' + tbs + '&api_key=' + serpKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=10' + tbs + '&api_key=' + serpKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));

    // [11] SerpAPI 구글뉴스  [12] SerpAPI 구글트렌드 (이것만 SerpAPI)
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_news&q=' + encodeURIComponent(keyword) + '+after:' + dateFrom + '+before:' + dateTo + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_trends&q=' + encodeURIComponent(keyword) + '&data_type=TIMESERIES&date=' + dateFrom + ' ' + dateTo + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(() => null));
    else tasks.push(Promise.resolve(null));

    var results = await Promise.all(tasks);
    var blogD = results[0], newsD = results[1], cafeD = results[2], kinD = results[3];
    var dl12D = results[4], dlDayD = results[5], adD = results[6];
    var ytChD = results[7], ytVidD = results[8];
    var instaD = results[9], fbD = results[10];
    var gnD = results[11], gtD = results[12];

    // ════════════════════════════════════════
    // 블로그 — 기간 내 확인 건수
    // ════════════════════════════════════════
    if (blogD && blogD.items) {
      R.summary.naverBlogAll = blogD.total || 0;
      var bi = (blogD.items || []).map(function(i) { return { title: sh(i.title), description: sh(i.description), link: i.link, source: i.bloggername || '블로그', date: fd(i.postdate || '') }; });
      var bf = bi.filter(function(i) { return i.date && i.date >= dateFrom && i.date <= dateTo; });
      R.content.blog = bf;
      R.summary.naverBlogTotal = bf.length;
      R.summary.dataSource.blog = '네이버 블로그 (확인 ' + bf.length + '건 / 전체 ' + R.summary.naverBlogAll.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // 뉴스 — 기간 내 확인 건수
    // ════════════════════════════════════════
    if (newsD && newsD.items) {
      R.summary.naverNewsAll = newsD.total || 0;
      var ni = (newsD.items || []).map(function(i) { var s = '뉴스'; try { s = new URL(i.originallink).hostname.replace('www.', ''); } catch(e) {} return { title: sh(i.title), description: sh(i.description), link: i.link, source: s, date: fd(i.pubDate || '') }; });
      var nf = ni.filter(function(i) { return i.date && i.date >= dateFrom && i.date <= dateTo; });
      R.content.news = nf;
      R.summary.naverNewsTotal = nf.length;
      R.summary.dataSource.news = '네이버 뉴스 (확인 ' + nf.length + '건 / 전체 ' + R.summary.naverNewsAll.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // 카페 — 네이버 API (날짜 없어서 비율 추정)
    // ════════════════════════════════════════
    if (cafeD && cafeD.items) {
      R.summary.naverCafeAll = cafeD.total || 0;
      R.content.cafe = (cafeD.items || []).slice(0, 10).map(function(i) { return { title: sh(i.title), description: sh(i.description), link: i.link, source: i.cafename || '카페', date: '' }; });
      var bAll = R.summary.naverBlogAll || 1, nAll = R.summary.naverNewsAll || 1;
      R.summary.naverCafeTotal = Math.round(R.summary.naverCafeAll * ((R.summary.naverBlogTotal / bAll + R.summary.naverNewsTotal / nAll) / 2));
      R.summary.dataSource.cafe = '네이버 카페 (전체 ' + R.summary.naverCafeAll.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // 지식iN
    // ════════════════════════════════════════
    if (kinD && kinD.items) {
      R.summary.naverKinTotal = kinD.total || 0;
      R.content.kin = (kinD.items || []).slice(0, 10).map(function(i) { return { title: sh(i.title), description: sh(i.description).substring(0, 60), link: i.link, date: '' }; });
      R.summary.dataSource.kin = '네이버 지식iN (' + R.summary.naverKinTotal.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // DataLab 12개월 + 일별
    // ════════════════════════════════════════
    if (dl12D && dl12D.results && dl12D.results[0]) {
      var td = dl12D.results[0].data || [];
      R.trend.naver = td.map(function(d) { return { date: d.period, value: Math.round(d.ratio) }; });
      if (td.length >= 4) {
        var rc = td.slice(-3).reduce(function(s, d) { return s + d.ratio; }, 0) / 3;
        var ol = td.slice(-6, -3); var ov = ol.length > 0 ? ol.reduce(function(s, d) { return s + d.ratio; }, 0) / ol.length : rc;
        R.summary.trendDirection = rc > ov * 1.1 ? '상승' : rc < ov * 0.9 ? '하락' : '유지';
      }
    }
    if (dlDayD && dlDayD.results && dlDayD.results[0]) {
      var dd2 = dlDayD.results[0].data || [];
      R.trend.daily = dd2.map(function(d) { return { date: d.period, value: Math.round(d.ratio) }; });
      if (dd2.length >= 14) {
        var r7 = dd2.slice(-7).reduce(function(s, d) { return s + d.ratio; }, 0) / 7;
        var p7 = dd2.slice(-14, -7).reduce(function(s, d) { return s + d.ratio; }, 0) / 7;
        R.summary.dailyMomentum = p7 > 0 ? Math.round((r7 - p7) / p7 * 100) : 0;
      }
      if (dd2.length > 0) {
        var pk = dd2.reduce(function(m, d) { return d.ratio > m.ratio ? d : m; }, dd2[0]);
        var lw = dd2.reduce(function(m, d) { return d.ratio < m.ratio ? d : m; }, dd2[0]);
        R.summary.dailyPeak = { date: pk.period, value: Math.round(pk.ratio) };
        R.summary.dailyLow = { date: lw.period, value: Math.round(lw.ratio) };
      }
    }

    // ════════════════════════════════════════
    // 광고 API — 100% 팩트
    // ════════════════════════════════════════
    if (adD && adD.keywordList) {
      var kl = adD.keywordList;
      var ex = kl.find(function(k) { return k.relKeyword === keyword || k.relKeyword === keyword.replace(/\s/g, ''); });
      if (ex) {
        R.summary.monthlySearchPC = pa(ex.monthlyPcQcCnt);
        R.summary.monthlySearchMobile = pa(ex.monthlyMobileQcCnt);
        R.summary.monthlySearchTotal = R.summary.monthlySearchPC + R.summary.monthlySearchMobile;
        R.summary.competitionIndex = ex.compIdx || '';
        R.summary.monthlyAvgPcCtr = parseFloat(ex.monthlyAvePcCtr) || 0;
        R.summary.monthlyAvgMobileCtr = parseFloat(ex.monthlyAveMobileCtr) || 0;
        R.summary.plAvgDepth = parseFloat(ex.plAvgDepth) || 0;
      }
      var adMap = {}; kl.forEach(function(k) { adMap[k.relKeyword] = { vol: pa(k.monthlyPcQcCnt) + pa(k.monthlyMobileQcCnt), pc: pa(k.monthlyPcQcCnt), mobile: pa(k.monthlyMobileQcCnt), comp: k.compIdx || '' }; });
      var tw = {}, sw = ['있는', '하는', '위한', '대한', '통한', '관련', '에서', '으로', '했다', '밝혔', '이번', '지난'];
      var kp = keyword.split(/\s+/);
      R.content.blog.concat(R.content.news).concat(R.content.cafe).forEach(function(it) {
        var t = it.title || ''; kp.forEach(function(p) { if (p.length >= 2) t = t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''); });
        t.split(/[\s,·+\-\/|()[\]{}\"\'""'']+/).forEach(function(w) { var c = w.trim(); if (c.length >= 2 && c.length <= 15 && sw.indexOf(c) === -1 && !/^\d+$/.test(c)) tw[c] = (tw[c] || 0) + 1; });
      });
      var stw = Object.entries(tw).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15);
      if (stw.length > 0) R.relatedKeywords = stw.map(function(p) { var ai = adMap[p[0]] || {}; return { kw: p[0], count: p[1], vol: ai.vol || 0, pc: ai.pc || 0, mobile: ai.mobile || 0, comp: ai.comp || '', source: 'content' }; });
      else R.relatedKeywords = kl.filter(function(k) { return k.relKeyword !== keyword; }).slice(0, 15).map(function(k) { return { kw: k.relKeyword, count: 0, vol: pa(k.monthlyPcQcCnt) + pa(k.monthlyMobileQcCnt), source: 'ad' }; });
    }

    // ════════════════════════════════════════
    // ★★★ YouTube Data API — 채널 찾기 + 영상 목록
    // ════════════════════════════════════════
    var ytItems = [];
    var ytSeen = {};
    var ytViews = 0;
    var ytVideoIds = [];

    // A) 키워드 영상 검색 결과 (기간 내 — publishedAfter/Before 적용됨!)
    if (ytVidD && ytVidD.items) {
      ytVidD.items.forEach(function(v) {
        var vid = (v.id && v.id.videoId) || '';
        if (vid && !ytSeen[vid]) {
          ytSeen[vid] = true;
          ytVideoIds.push(vid);
          ytItems.push({
            title: (v.snippet && v.snippet.title) || '',
            link: 'https://www.youtube.com/watch?v=' + vid,
            views: 0,
            channel: (v.snippet && v.snippet.channelTitle) || '',
            date: (v.snippet && v.snippet.publishedAt) ? v.snippet.publishedAt.substring(0, 10) : '',
            type: 'video'
          });
        }
      });
    }

    // B) 채널 찾기 → 채널 영상 목록
    if (ytChD && ytChD.items && ytChD.items.length > 0 && ytKey) {
      for (var ci = 0; ci < Math.min(ytChD.items.length, 2); ci++) {
        var chId = ytChD.items[ci].id && ytChD.items[ci].id.channelId;
        var chTitle = (ytChD.items[ci].snippet && ytChD.items[ci].snippet.title) || '';
        if (chId) {
          R.summary.youtubeChannel = { name: chTitle, id: chId, link: 'https://www.youtube.com/channel/' + chId };
          try {
            var chVidRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=' + chId + '&type=video&order=date&maxResults=15&publishedAfter=' + ytAfter + '&publishedBefore=' + ytBefore + '&key=' + ytKey);
            var chVidData = await chVidRes.json();
            if (chVidData.items) {
              chVidData.items.forEach(function(v) {
                var vid = (v.id && v.id.videoId) || '';
                if (vid && !ytSeen[vid]) {
                  ytSeen[vid] = true;
                  ytVideoIds.push(vid);
                  ytItems.push({
                    title: (v.snippet && v.snippet.title) || '',
                    link: 'https://www.youtube.com/watch?v=' + vid,
                    views: 0,
                    channel: chTitle,
                    date: (v.snippet && v.snippet.publishedAt) ? v.snippet.publishedAt.substring(0, 10) : '',
                    type: 'video'
                  });
                }
              });
            }
          } catch(e) { console.error('YT channel videos error:', e.message); }
        }
      }
    }

    // C) 조회수 가져오기 (영상 ID로 statistics 요청)
    if (ytVideoIds.length > 0 && ytKey) {
      try {
        var statsRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + ytVideoIds.join(',') + '&key=' + ytKey);
        var statsData = await statsRes.json();
        if (statsData.items) {
          var viewMap = {};
          statsData.items.forEach(function(v) { viewMap[v.id] = parseInt(v.statistics && v.statistics.viewCount) || 0; });
          ytItems.forEach(function(item) {
            var vid = item.link.replace('https://www.youtube.com/watch?v=', '');
            if (viewMap[vid]) { item.views = viewMap[vid]; ytViews += viewMap[vid]; }
          });
        }
      } catch(e) { console.error('YT stats error:', e.message); }
    }

    // 조회수순 정렬
    ytItems.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    R.content.youtube = ytItems;
    R.summary.youtubeTotal = ytItems.length;
    R.summary.youtubeViewTotal = ytViews;
    R.summary.dataSource.youtube = 'YouTube Data API (기간 ' + dateFrom + '~' + dateTo + ', ' + ytItems.length + '건, 조회 ' + ytViews.toLocaleString() + ')';

    // ════════════════════════════════════════
    // 인스타그램 — SerpAPI 구글 검색
    // ════════════════════════════════════════
    if (instaD && instaD.organic_results && instaD.organic_results.length > 0) {
      R.content.instagram = instaD.organic_results.map(function(i) { var u = ''; try { var m = i.link.match(/instagram\.com\/([^\/\?]+)/); if (m) u = '@' + m[1]; } catch(e) {} return { title: i.title || '', snippet: i.snippet || '', link: i.link, source: u || 'Instagram', date: i.date || '' }; });
      R.summary.instagramTotal = (instaD.search_information && instaD.search_information.total_results) || instaD.organic_results.length;
      R.summary.dataSource.instagram = '구글→인스타 (' + R.summary.instagramTotal.toLocaleString() + '건, 총게시물수 공유포함)';
    }

    // ════════════════════════════════════════
    // 페이스북 — SerpAPI 구글 검색
    // ════════════════════════════════════════
    if (fbD && fbD.organic_results && fbD.organic_results.length > 0) {
      R.content.facebook = fbD.organic_results.map(function(i) { var p = ''; try { var m = i.link.match(/facebook\.com\/([^\/\?]+)/); if (m) p = m[1]; } catch(e) {} return { title: i.title || '', snippet: i.snippet || '', link: i.link, source: p || 'Facebook', date: i.date || '' }; });
      R.summary.facebookTotal = (fbD.search_information && fbD.search_information.total_results) || fbD.organic_results.length;
      R.summary.dataSource.facebook = '구글→페이스북 (' + R.summary.facebookTotal.toLocaleString() + '건, 총게시물수 공유포함)';
    }

    // ════════════════════════════════════════
    // 구글뉴스 + 구글트렌드 (SerpAPI)
    // ════════════════════════════════════════
    if (gnD) {
      var gn = (gnD.news_results || []).slice(0, 10);
      R.content.googleNews = gn.map(function(n) { return { title: n.title || '', link: n.link || '', source: (n.source && n.source.name) || '', date: n.date || '', snippet: n.snippet || '' }; });
      R.summary.googleNewsTotal = gn.length;
      R.summary.dataSource.googleNews = '구글 뉴스 (' + gn.length + '건)';
    }
    if (gtD && gtD.interest_over_time && gtD.interest_over_time.timeline_data) {
      R.trend.google = gtD.interest_over_time.timeline_data.map(function(d) { return { date: d.date || '', value: (d.values && d.values[0] && d.values[0].extracted_value) || 0 }; });
      var gd = R.trend.google;
      if (gd.length >= 4) {
        var gr = gd.slice(-3).reduce(function(s, d) { return s + d.value; }, 0) / 3;
        var go = gd.slice(-6, -3).reduce(function(s, d) { return s + d.value; }, 0) / Math.max(gd.slice(-6, -3).length, 1);
        R.summary.googleTrendDirection = gr > go * 1.1 ? '상승' : gr < go * 0.9 ? '하락' : '유지';
      }
    }

    // ════════════════════════════════════════
    // 총량 + 전체 콘텐츠
    // ════════════════════════════════════════
    R.summary.totalContent = R.summary.naverBlogTotal + R.summary.naverNewsTotal + R.summary.naverCafeTotal;
    R.contents = [].concat(
      R.content.blog.map(function(i) { return Object.assign({}, i, { type: 'blog' }); }),
      R.content.news.map(function(i) { return Object.assign({}, i, { type: 'news' }); }),
      R.content.cafe.map(function(i) { return Object.assign({}, i, { type: 'cafe' }); }),
      R.content.instagram.map(function(i) { return Object.assign({}, i, { type: 'instagram' }); }),
      R.content.facebook.map(function(i) { return Object.assign({}, i, { type: 'facebook' }); }),
      R.content.youtube.map(function(i) { return Object.assign({}, i, { type: 'youtube' }); }),
      R.content.googleNews.map(function(i) { return Object.assign({}, i, { type: 'googleNews' }); }),
      R.content.kin.map(function(i) { return Object.assign({}, i, { type: 'kin' }); })
    ).slice(0, 100);

    res.json(R);
  } catch(err) {
    console.error('keyword-analyze error:', err);
    res.status(500).json({ error: '분석 실패: ' + err.message });
  }
};

function sh(s) { return (s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function fd(d) { if (!d) return ''; if (/^\d{8}$/.test(d)) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8); try { var p = new Date(d); if (isNaN(p.getTime())) return ''; return p.toISOString().slice(0, 10); } catch(e) { return ''; } }
function pa(v) { if (typeof v === 'number') return v; if (typeof v === 'string') { var n = parseInt(v.replace(/[^0-9]/g, '')); return isNaN(n) ? 0 : n; } return 0; }
