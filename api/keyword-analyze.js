const fetch = require('node-fetch');
// VERSION: 2026-03-13-FACT-ONLY (추정치 제거, 팩트만)

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
  var dateFrom = params.dateFrom || (function(){
    var d = new Date();
    if (months < 1) d.setDate(d.getDate() - Math.round(months * 30));
    else d.setMonth(d.getMonth() - Math.round(months));
    return d.toISOString().split('T')[0];
  })();

  var NID = process.env.NAVER_CLIENT_ID, NSC = process.env.NAVER_CLIENT_SECRET;
  var adKey = process.env.NAVER_AD_API_LICENSE, adSec = process.env.NAVER_AD_SECRET_KEY, adCust = process.env.NAVER_AD_CUSTOMER_ID;
  var serpKey = process.env.SERPAPI_KEY;

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
  var fp = dateFrom.split('-'), tp = dateTo.split('-');
  var tbs = '&tbs=cdr:1,cd_min:' + fp[1] + '/' + fp[2] + '/' + fp[0] + ',cd_max:' + tp[1] + '/' + tp[2] + '/' + tp[0];

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
    // [3b] 네이버 웹검색 "키워드 유튜브" (YouTube 백업 — SerpAPI 쿼터 안 씀)
    if (nH) tasks.push(fetch('https://openapi.naver.com/v1/search/webkr.json?query=' + encodeURIComponent(keyword + ' 유튜브') + '&display=20&sort=date', { headers: nH }).then(r => r.json()).catch(() => null));
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

    // [7] 인스타  [8] 페북  (구글 기간필터)
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:instagram.com&hl=ko&gl=kr&num=20' + tbs + '&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('Insta error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?q=' + encodeURIComponent(keyword) + '+site:facebook.com&hl=ko&gl=kr&num=20' + tbs + '&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('FB error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));

    // ★★★ [9] 유튜브 — YouTube 엔진 직접 (영상 제목 검색)
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query=' + encodeURIComponent(keyword) + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('YouTube error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));
    // ★★★ [9b] 유튜브 — 채널명 검색 (제목에 이름 없어도 채널에서 찾기)
    var kwFirst = keyword.split(/\s+/)[0];
    if (serpKey && kwFirst.length >= 2) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query=' + encodeURIComponent(kwFirst + ' 채널') + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('YouTube CH error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));

    // [10] 구글뉴스  [11] 구글트렌드
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_news&q=' + encodeURIComponent(keyword) + '+after:' + dateFrom + '+before:' + dateTo + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('GNews error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));
    if (serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_trends&q=' + encodeURIComponent(keyword) + '&data_type=TIMESERIES&date=' + dateFrom + ' ' + dateTo + '&hl=ko&gl=kr&api_key=' + serpKey).then(r => r.json()).catch(e => { console.error('GTrend error:', e.message); return null; }));
    else tasks.push(Promise.resolve(null));

    var results = await Promise.all(tasks);
    var blogD = results[0], newsD = results[1], cafeD = results[2], kinD = results[3], ytNaverD = results[4];
    var dl12D = results[5], dlDayD = results[6], adD = results[7];
    var instaD = results[8], fbD = results[9];
    var ytDirectD = results[10], ytChD = results[11];
    var gnD = results[12], gtD = results[13];

    // ════════════════════════════════════════
    // 블로그 — 팩트: 기간 내 확인된 건수만 (추정 안 함)
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
    // 뉴스 — 팩트: 기간 내 확인된 건수만
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
    // 카페 — 네이버 API (날짜 없어서 블로그/뉴스 비율로 추정)
    // ════════════════════════════════════════
    if (cafeD && cafeD.items) {
      R.summary.naverCafeAll = cafeD.total || 0;
      R.content.cafe = (cafeD.items || []).slice(0, 10).map(function(i) { return { title: sh(i.title), description: sh(i.description), link: i.link, source: i.cafename || '카페', date: '' }; });
      // 블로그+뉴스의 기간 내 비율 평균으로 추정
      var bAll = R.summary.naverBlogAll || 1, nAll = R.summary.naverNewsAll || 1;
      var bRatio = R.summary.naverBlogTotal / bAll;
      var nRatio = R.summary.naverNewsTotal / nAll;
      var avgRatio = (bRatio + nRatio) / 2;
      R.summary.naverCafeTotal = Math.round(R.summary.naverCafeAll * avgRatio);
      R.summary.dataSource.cafe = '네이버 카페 (전체 ' + R.summary.naverCafeAll.toLocaleString() + '건, 기간 내 추정 ' + R.summary.naverCafeTotal.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // 지식iN — 네이버 API
    // ════════════════════════════════════════
    if (kinD && kinD.items) {
      R.summary.naverKinTotal = kinD.total || 0;
      R.content.kin = (kinD.items || []).slice(0, 10).map(function(i) { return { title: sh(i.title), description: sh(i.description).substring(0, 60), link: i.link, date: '' }; });
      R.summary.dataSource.kin = '네이버 지식iN (전체 ' + R.summary.naverKinTotal.toLocaleString() + '건)';
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
      // 연관키워드
      var adMap = {}; kl.forEach(function(k) { adMap[k.relKeyword] = { vol: pa(k.monthlyPcQcCnt) + pa(k.monthlyMobileQcCnt), pc: pa(k.monthlyPcQcCnt), mobile: pa(k.monthlyMobileQcCnt), comp: k.compIdx || '' }; });
      var tw = {}, sw = ['있는', '하는', '위한', '대한', '통한', '관련', '에서', '으로', '했다', '밝혔', '이번', '지난'];
      var kp = keyword.split(/\s+/);
      R.content.blog.concat(R.content.news).concat(R.content.cafe).forEach(function(it) {
        var t = it.title || ''; kp.forEach(function(p) { if (p.length >= 2) t = t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''); });
        t.split(/[\s,·+\-\/|()[\]{}\"\'""'']+/).forEach(function(w) { var c = w.trim(); if (c.length >= 2 && c.length <= 15 && sw.indexOf(c) === -1 && !/^\d+$/.test(c)) tw[c] = (tw[c] || 0) + 1; });
      });
      var stw = Object.entries(tw).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15);
      if (stw.length > 0) {
        R.relatedKeywords = stw.map(function(p) { var ai = adMap[p[0]] || {}; return { kw: p[0], count: p[1], vol: ai.vol || 0, pc: ai.pc || 0, mobile: ai.mobile || 0, comp: ai.comp || '', source: 'content' }; });
      } else {
        R.relatedKeywords = kl.filter(function(k) { return k.relKeyword !== keyword; }).slice(0, 15).map(function(k) { return { kw: k.relKeyword, count: 0, vol: pa(k.monthlyPcQcCnt) + pa(k.monthlyMobileQcCnt), source: 'ad' }; });
      }
    }

    // ════════════════════════════════════════
    // 인스타그램 — 구글 기간필터
    // ════════════════════════════════════════
    if (instaD && instaD.organic_results && instaD.organic_results.length > 0) {
      var io = instaD.organic_results.map(function(i) { var u = ''; try { var m = i.link.match(/instagram\.com\/([^\/\?]+)/); if (m) u = '@' + m[1]; } catch(e) {} return { title: i.title || '', snippet: i.snippet || '', link: i.link, source: u || 'Instagram', date: i.date || '' }; });
      var it = (instaD.search_information && instaD.search_information.total_results) || 0;
      R.summary.instagramTotal = it > 0 ? it : io.length;
      R.content.instagram = io;
      R.summary.dataSource.instagram = '구글→인스타 (' + R.summary.instagramTotal.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // 페이스북 — 구글 기간필터
    // ════════════════════════════════════════
    if (fbD && fbD.organic_results && fbD.organic_results.length > 0) {
      var fo = fbD.organic_results.map(function(i) { var p = ''; try { var m = i.link.match(/facebook\.com\/([^\/\?]+)/); if (m) p = m[1]; } catch(e) {} return { title: i.title || '', snippet: i.snippet || '', link: i.link, source: p || 'Facebook', date: i.date || '' }; });
      var ft = (fbD.search_information && fbD.search_information.total_results) || 0;
      R.summary.facebookTotal = ft > 0 ? ft : fo.length;
      R.content.facebook = fo;
      R.summary.dataSource.facebook = '구글→페이스북 (' + R.summary.facebookTotal.toLocaleString() + '건)';
    }

    // ════════════════════════════════════════
    // ★★★ 유튜브 — 제목 검색 + 채널명 검색 병합
    // ════════════════════════════════════════
    var ytItems = [];
    var ytSeen = {};
    var ytViews = 0;
    // 두 검색 결과 병합 (제목 검색 + 채널명 검색)
    [ytDirectD, ytChD].forEach(function(src) {
      if (!src) return;
      (src.video_results || []).forEach(function(v) {
        var vw = 0;
        if (v.views) { var vs = String(v.views).replace(/[^0-9.만천억회]/g, ''); if (vs.includes('억')) vw = Math.round(parseFloat(vs) * 1e8); else if (vs.includes('만')) vw = Math.round(parseFloat(vs) * 1e4); else if (vs.includes('천')) vw = Math.round(parseFloat(vs) * 1e3); else vw = parseInt(vs.replace(/[^0-9]/g, '')) || 0; }
        var key = (v.link || '').replace(/[?&].*$/, '');
        if (!ytSeen[key]) {
          ytSeen[key] = true;
          ytViews += vw;
          var isShort = (v.link || '').includes('/shorts/');
          ytItems.push({ title: v.title || '', link: v.link || '', views: vw, channel: (v.channel && v.channel.name) || '', date: v.published_date || '', type: isShort ? 'shorts' : 'video' });
        }
      });
      (src.shorts_results || []).forEach(function(s) {
        var key = (s.link || '').replace(/[?&].*$/, '');
        if (!ytSeen[key]) { ytSeen[key] = true; ytItems.push({ title: (s.title || '') + ' [숏츠]', link: s.link || '', views: 0, channel: (s.channel && s.channel.name) || '', date: '', type: 'shorts' }); }
      });
      if (src.channel_results) {
        var chs = Array.isArray(src.channel_results) ? src.channel_results : [src.channel_results];
        chs.forEach(function(ch) { if (ch && ch.title) R.summary.youtubeChannel = { name: ch.title, link: ch.link || '', subscribers: ch.subscribers || '' }; });
      }
    });
    ytItems.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    if (ytItems.length > 0) {
      R.content.youtube = ytItems;
      R.summary.youtubeTotal = ytItems.length;
      R.summary.youtubeViewTotal = ytViews;
      R.summary.dataSource.youtube = 'YouTube 검색 (' + ytItems.length + '건, 조회 ' + ytViews.toLocaleString() + ')';
    }
    // YouTube 백업: 네이버 웹검색 (SerpAPI 실패해도 잡힘)
    if (ytNaverD && ytNaverD.items) {
      var ytNaver = (ytNaverD.items || []).filter(function(i) { return (i.link || '').includes('youtube.com'); });
      // 기존 YouTube 결과에 병합 (중복 제거)
      ytNaver.forEach(function(i) {
        var key = (i.link || '').replace(/[?&].*$/, '');
        if (!ytSeen[key]) {
          ytSeen[key] = true;
          var isShort = (i.link || '').includes('/shorts/');
          R.content.youtube.push({ title: sh(i.title), link: i.link, views: 0, channel: '', date: fd(i.date || ''), type: isShort ? 'shorts' : 'video' });
        }
      });
      if (R.content.youtube.length > 0) {
        R.summary.youtubeTotal = R.content.youtube.length;
        R.summary.dataSource.youtube = 'YouTube+네이버 (' + R.content.youtube.length + '건)';
      }
      // 네이버 검색 총량 참고
      R.summary.youtubeNaverTotal = ytNaverD.total || 0;
    }

    // ════════════════════════════════════════
    // 구글뉴스 + 구글트렌드
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
    // 총량 + 전체 콘텐츠 병합
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
