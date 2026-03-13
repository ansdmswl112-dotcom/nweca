const fetch = require('node-fetch');
// VERSION: 2026-03-13-FINAL-v4 (parallel + shorts + all platforms)

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
    var d=new Date();
    if(months<1){d.setDate(d.getDate()-Math.round(months*30));}
    else{d.setMonth(d.getMonth()-Math.round(months));}
    return d.toISOString().split('T')[0];
  })();

  var NID = process.env.NAVER_CLIENT_ID;
  var NSC = process.env.NAVER_CLIENT_SECRET;
  var adKey = process.env.NAVER_AD_API_LICENSE;
  var adSec = process.env.NAVER_AD_SECRET_KEY;
  var adCust = process.env.NAVER_AD_CUSTOMER_ID;
  var serpKey = process.env.SERPAPI_KEY;
  var metaTk = process.env.META_ACCESS_TOKEN;
  var metaIg = process.env.META_IG_USER_ID;

  var R = {
    ok: true, keyword: keyword,
    summary: {
      naverBlogAll:0, naverNewsAll:0, naverCafeAll:0,
      naverBlogTotal:0, naverNewsTotal:0, naverCafeTotal:0,
      instagramTotal:0, facebookTotal:0, youtubeTotal:0, youtubeViewTotal:0,
      googleNewsTotal:0, naverKinTotal:0, totalContent:0,
      trendDirection:'유지', googleTrendDirection:'',
      monthlySearchPC:0, monthlySearchMobile:0, monthlySearchTotal:0,
      competitionIndex:'', monthlyAvgPcCtr:0, monthlyAvgMobileCtr:0,
      plAvgDepth:0, dailyMomentum:null, dailyPeak:null, dailyLow:null,
      period:{from:dateFrom,to:dateTo,months:months},
      dataSource:{}
    },
    trend:{naver:[],daily:[],google:[]},
    content:{blog:[],news:[],cafe:[],instagram:[],facebook:[],youtube:[],googleNews:[],kin:[]},
    relatedKeywords:[], contentKeywords:[], contents:[]
  };

  var nH = NID ? {'X-Naver-Client-Id':NID,'X-Naver-Client-Secret':NSC} : null;
  var tbs = '&tbs=cdr:1,cd_min:'+dateFrom.split('-').slice(1).concat(dateFrom.split('-')[0]).join('/')+',cd_max:'+dateTo.split('-').slice(1).concat(dateTo.split('-')[0]).join('/');

  try {
    // ★ 모든 API를 병렬 호출 (Vercel 10초 타임아웃 방지)
    var tasks = [];

    // [0] 블로그
    if(nH) tasks.push(fetch('https://openapi.naver.com/v1/search/blog.json?query='+encodeURIComponent(keyword)+'&display=100&sort=date',{headers:nH}).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [1] 뉴스
    if(nH) tasks.push(fetch('https://openapi.naver.com/v1/search/news.json?query='+encodeURIComponent(keyword)+'&display=100&sort=date',{headers:nH}).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [2] 카페
    if(nH) tasks.push(fetch('https://openapi.naver.com/v1/search/cafearticle.json?query='+encodeURIComponent(keyword)+'&display=100&sort=date',{headers:nH}).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [3] 지식iN
    if(nH) tasks.push(fetch('https://openapi.naver.com/v1/search/kin.json?query='+encodeURIComponent(keyword)+'&display=10&sort=date',{headers:nH}).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [4] DataLab 12개월
    if(nH){
      var tf12=new Date(new Date(dateTo).getTime()-365*86400000).toISOString().split('T')[0];
      tasks.push(fetch('https://openapi.naver.com/v1/datalab/search',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},nH),body:JSON.stringify({startDate:tf12,endDate:dateTo,timeUnit:'month',keywordGroups:[{groupName:keyword,keywords:[keyword]}]})}).then(r=>r.json()).catch(()=>null));
    } else tasks.push(Promise.resolve(null));
    // [5] DataLab 일별
    if(nH){
      var dd=Math.round((new Date(dateTo)-new Date(dateFrom))/86400000);
      var dlF=dd<31?new Date(new Date(dateTo).getTime()-31*86400000).toISOString().split('T')[0]:dateFrom;
      tasks.push(fetch('https://openapi.naver.com/v1/datalab/search',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},nH),body:JSON.stringify({startDate:dlF,endDate:dateTo,timeUnit:'date',keywordGroups:[{groupName:keyword,keywords:[keyword]}]})}).then(r=>r.json()).catch(()=>null));
    } else tasks.push(Promise.resolve(null));
    // [6] 광고 API
    if(adKey&&adSec&&adCust){
      var crypto=require('crypto');var ts=Date.now().toString();var hm=crypto.createHmac('sha256',adSec);hm.update(ts+'.GET./keywordstool');var sig=hm.digest('base64');
      tasks.push(fetch('https://api.searchad.naver.com/keywordstool?hintKeywords='+encodeURIComponent(keyword)+'&showDetail=1',{headers:{'X-Timestamp':ts,'X-API-KEY':adKey,'X-Customer':adCust,'X-Signature':sig}}).then(r=>r.json()).catch(()=>null));
    } else tasks.push(Promise.resolve(null));
    // [7] SerpAPI 인스타 (기간 필터)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?q='+encodeURIComponent(keyword)+'+site:instagram.com&hl=ko&gl=kr&num=20'+tbs+'&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [8] SerpAPI 페북 (기간 필터)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?q='+encodeURIComponent(keyword)+'+site:facebook.com&hl=ko&gl=kr&num=20'+tbs+'&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [9] SerpAPI 유튜브 — 최신순 (sp=CAI%253D = sort by upload date)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query='+encodeURIComponent(keyword)+'&sp=CAI%253D&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [10] SerpAPI 유튜브 관련도순 (조회수 높은 것)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query='+encodeURIComponent(keyword)+'&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [10b] SerpAPI 유튜브 — 키워드 첫 단어만 (채널명 검색용)
    var kwParts=keyword.split(/\s+/);
    var kwShort=kwParts.length>1?kwParts[0]:null;
    if(serpKey&&kwShort) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query='+encodeURIComponent(kwShort)+'&sp=CAI%253D&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [11] SerpAPI 구글뉴스
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_news&q='+encodeURIComponent(keyword)+'+after:'+dateFrom+'+before:'+dateTo+'&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [12] SerpAPI 구글트렌드
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_trends&q='+encodeURIComponent(keyword)+'&data_type=TIMESERIES&date='+dateFrom+' '+dateTo+'&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [13] SerpAPI 카페 기간필터 (네이버 카페는 날짜 없어서)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?q='+encodeURIComponent(keyword)+'+site:cafe.naver.com&hl=ko&gl=kr&num=10'+tbs+'&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [14] SerpAPI 지식iN 기간필터
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?q='+encodeURIComponent(keyword)+'+site:kin.naver.com&hl=ko&gl=kr&num=10'+tbs+'&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));

    var results = await Promise.all(tasks);
    var blogD=results[0], newsD=results[1], cafeD=results[2], kinD=results[3];
    var dl12D=results[4], dlDayD=results[5], adD=results[6];
    var instaD=results[7], fbD=results[8], ytDateD=results[9], ytRelD=results[10], ytShortD=results[11];
    var gnD=results[12], gtD=results[13], cafeSerpD=results[14], kinSerpD=results[15];

    // ── 블로그 처리 ──
    if(blogD&&blogD.items){
      R.summary.naverBlogAll=blogD.total||0;
      var bi=(blogD.items||[]).map(function(i){return{title:sh(i.title),description:sh(i.description),link:i.link,source:i.bloggername||'블로그',date:fd(i.postdate||'')};});
      var bf=bi.filter(function(i){return i.date&&i.date>=dateFrom&&i.date<=dateTo;});
      R.content.blog=bf.slice(0,20);
      // 안정적 추정: 비율이 극단적일 때 보정
      var bRatio=bi.length>0?bf.length/bi.length:0;
      if(bRatio>=0.8) R.summary.naverBlogTotal=R.summary.naverBlogAll; // 대부분 기간 내 → 전체 사용
      else if(bRatio>=0.1&&bi.length>=10) R.summary.naverBlogTotal=Math.round(R.summary.naverBlogAll*bRatio);
      else R.summary.naverBlogTotal=bf.length; // 소량이면 실제 건수
      R.summary.dataSource.blog='네이버 블로그 API (기간 '+dateFrom+'~'+dateTo+', '+R.summary.naverBlogTotal.toLocaleString()+'건)';
    }
    // ── 뉴스 처리 ──
    if(newsD&&newsD.items){
      R.summary.naverNewsAll=newsD.total||0;
      var ni=(newsD.items||[]).map(function(i){var s='뉴스';try{s=new URL(i.originallink).hostname.replace('www.','');}catch(e){}return{title:sh(i.title),description:sh(i.description),link:i.link,source:s,date:fd(i.pubDate||'')};});
      var nf=ni.filter(function(i){return i.date&&i.date>=dateFrom&&i.date<=dateTo;});
      R.content.news=nf.slice(0,20);
      var nRatio=ni.length>0?nf.length/ni.length:0;
      if(nRatio>=0.8) R.summary.naverNewsTotal=R.summary.naverNewsAll;
      else if(nRatio>=0.1&&ni.length>=10) R.summary.naverNewsTotal=Math.round(R.summary.naverNewsAll*nRatio);
      else R.summary.naverNewsTotal=nf.length;
      R.summary.dataSource.news='네이버 뉴스 API (기간 '+dateFrom+'~'+dateTo+', '+R.summary.naverNewsTotal.toLocaleString()+'건)';
    }
    // ── 카페 처리 (기간 필터 — 이중 검증) ──
    if(cafeSerpD&&cafeSerpD.organic_results&&cafeSerpD.organic_results.length>0){
      var coAll=cafeSerpD.organic_results.map(function(i){
        // 구글 결과의 date 필드 또는 snippet에서 날짜 추출
        var rawDate=i.date||'';
        var parsedDate=fd(rawDate);
        // snippet에서 날짜 추출 시도 (예: "2026. 3. 11.")
        if(!parsedDate&&i.snippet){
          var dm=i.snippet.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
          if(dm)parsedDate=dm[1]+'-'+dm[2].padStart(2,'0')+'-'+dm[3].padStart(2,'0');
        }
        return{title:sh(i.title||''),description:sh(i.snippet||''),link:i.link,source:'카페',date:parsedDate};
      });
      // 날짜 있는 것 중 기간 외 제거
      var co=coAll.filter(function(c){
        if(!c.date)return true; // 날짜 파싱 못하면 포함 (tbs 필터 신뢰)
        return c.date>=dateFrom&&c.date<=dateTo;
      });
      var ct=(cafeSerpD.search_information&&cafeSerpD.search_information.total_results)||co.length;
      R.content.cafe=co;
      R.summary.naverCafeTotal=ct;
      R.summary.naverCafeAll=cafeD?(cafeD.total||0):ct;
      R.summary.dataSource.cafe='구글 검색 cafe.naver.com ('+dateFrom+'~'+dateTo+', '+ct.toLocaleString()+'건, 검증 '+co.length+'건)';
    }else if(cafeD&&cafeD.items){
      R.summary.naverCafeAll=cafeD.total||0;
      R.content.cafe=(cafeD.items||[]).slice(0,10).map(function(i){return{title:sh(i.title),description:sh(i.description),link:i.link,source:i.cafename||'카페',date:''};});
      var br=R.summary.naverBlogAll>0?R.summary.naverBlogTotal/R.summary.naverBlogAll:1;
      var nr=R.summary.naverNewsAll>0?R.summary.naverNewsTotal/R.summary.naverNewsAll:1;
      R.summary.naverCafeTotal=Math.round((cafeD.total||0)*(br+nr)/2);
      R.summary.dataSource.cafe='네이버 카페 API (비율 추정, '+R.summary.naverCafeTotal.toLocaleString()+'건)';
    }
    // ── 지식iN (기간 필터) ──
    if(kinSerpD&&kinSerpD.organic_results){
      var ko2=(kinSerpD.organic_results||[]).map(function(i){return{title:sh(i.title||''),description:sh(i.snippet||'').substring(0,60),link:i.link,date:i.date||''};});
      var kt=(kinSerpD.search_information&&kinSerpD.search_information.total_results)||ko2.length;
      R.content.kin=ko2;
      R.summary.naverKinTotal=kt;
      R.summary.dataSource.kin='구글 검색 기간 내 kin.naver.com ('+dateFrom+'~'+dateTo+', '+kt.toLocaleString()+'건)';
    }else if(kinD&&kinD.items){
      R.summary.naverKinTotal=kinD.total||0;
      R.content.kin=(kinD.items||[]).slice(0,5).map(function(i){return{title:sh(i.title),description:sh(i.description).substring(0,60),link:i.link,date:''};});
      R.summary.dataSource.kin='네이버 지식iN API (전체, '+R.summary.naverKinTotal.toLocaleString()+'건)';
    }
    // ── DataLab 12개월 ──
    if(dl12D&&dl12D.results&&dl12D.results[0]){
      var td=dl12D.results[0].data||[];
      R.trend.naver=td.map(function(d){return{date:d.period,value:Math.round(d.ratio)};});
      if(td.length>=4){
        var rc=td.slice(-3).reduce(function(s,d){return s+d.ratio;},0)/3;
        var ol=td.slice(-6,-3);var ov=ol.length>0?ol.reduce(function(s,d){return s+d.ratio;},0)/ol.length:rc;
        R.summary.trendDirection=rc>ov*1.1?'상승':rc<ov*0.9?'하락':'유지';
      }
    }
    // ── DataLab 일별 ──
    if(dlDayD&&dlDayD.results&&dlDayD.results[0]){
      var dd2=dlDayD.results[0].data||[];
      R.trend.daily=dd2.map(function(d){return{date:d.period,value:Math.round(d.ratio)};});
      if(dd2.length>=14){
        var r7=dd2.slice(-7).reduce(function(s,d){return s+d.ratio;},0)/7;
        var p7=dd2.slice(-14,-7).reduce(function(s,d){return s+d.ratio;},0)/7;
        R.summary.dailyMomentum=p7>0?Math.round((r7-p7)/p7*100):0;
      }else if(dd2.length>=4){
        var hl=Math.ceil(dd2.length/2);
        var rh=dd2.slice(-hl).reduce(function(s,d){return s+d.ratio;},0)/hl;
        var ph=dd2.slice(0,hl).reduce(function(s,d){return s+d.ratio;},0)/hl;
        R.summary.dailyMomentum=ph>0?Math.round((rh-ph)/ph*100):0;
      }
      if(dd2.length>0){
        var pk=dd2.reduce(function(m,d){return d.ratio>m.ratio?d:m;},dd2[0]);
        var lw=dd2.reduce(function(m,d){return d.ratio<m.ratio?d:m;},dd2[0]);
        R.summary.dailyPeak={date:pk.period,value:Math.round(pk.ratio)};
        R.summary.dailyLow={date:lw.period,value:Math.round(lw.ratio)};
      }
    }
    // ── 광고 API ──
    if(adD&&adD.keywordList){
      var kl=adD.keywordList;
      var ex=kl.find(function(k){return k.relKeyword===keyword||k.relKeyword===keyword.replace(/\s/g,'');});
      if(ex){
        R.summary.monthlySearchPC=pa(ex.monthlyPcQcCnt);
        R.summary.monthlySearchMobile=pa(ex.monthlyMobileQcCnt);
        R.summary.monthlySearchTotal=R.summary.monthlySearchPC+R.summary.monthlySearchMobile;
        R.summary.competitionIndex=ex.compIdx||'';
        R.summary.monthlyAvgPcCtr=parseFloat(ex.monthlyAvePcCtr)||0;
        R.summary.monthlyAvgMobileCtr=parseFloat(ex.monthlyAveMobileCtr)||0;
        R.summary.plAvgDepth=parseFloat(ex.plAvgDepth)||0;
      }
      // 연관키워드 (콘텐츠 제목 기반 + 검색량 병합)
      var adMap={};kl.forEach(function(k){adMap[k.relKeyword]={vol:pa(k.monthlyPcQcCnt)+pa(k.monthlyMobileQcCnt),pc:pa(k.monthlyPcQcCnt),mobile:pa(k.monthlyMobileQcCnt),comp:k.compIdx||''};});
      // 콘텐츠 제목에서 키워드 추출
      var tw={};var sw=['있는','하는','위한','대한','통한','관련','에서','으로','했다','밝혔','이번','지난'];
      var kp=keyword.split(/\s+/);
      R.content.blog.concat(R.content.news).concat(R.content.cafe).forEach(function(it){
        var t=it.title||'';kp.forEach(function(p){if(p.length>=2)t=t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'');});
        t.split(/[\s,·+\-\/|()[\]{}\"\'""'']+/).forEach(function(w){
          var c=w.trim();if(c.length>=2&&c.length<=15&&sw.indexOf(c)===-1&&!/^\d+$/.test(c))tw[c]=(tw[c]||0)+1;
        });
      });
      var stw=Object.entries(tw).sort(function(a,b){return b[1]-a[1];}).slice(0,15);
      if(stw.length>0){
        R.relatedKeywords=stw.map(function(p){var ai=adMap[p[0]]||{};return{kw:p[0],count:p[1],vol:ai.vol||0,pc:ai.pc||0,mobile:ai.mobile||0,comp:ai.comp||'',source:'content'};});
      }else{
        R.relatedKeywords=kl.filter(function(k){return k.relKeyword!==keyword;}).slice(0,15).map(function(k){return{kw:k.relKeyword,count:0,vol:pa(k.monthlyPcQcCnt)+pa(k.monthlyMobileQcCnt),pc:pa(k.monthlyPcQcCnt),mobile:pa(k.monthlyMobileQcCnt),comp:k.compIdx||'',source:'ad'};});
      }
    }
    // ── 인스타그램 (기간 필터 적용) ──
    if(instaD&&instaD.organic_results&&instaD.organic_results.length>0){
      var io=instaD.organic_results.map(function(i,idx){var u='';try{var m=i.link.match(/instagram\.com\/([^\/\?]+)/);if(m)u='@'+m[1];}catch(e){}return{title:i.title||'',snippet:i.snippet||'',link:i.link,source:u||'Instagram',date:i.date||''};});
      var it=(instaD.search_information&&instaD.search_information.total_results)||0;
      R.summary.instagramTotal=it>0?it:io.length;
      R.content.instagram=io;
      R.summary.dataSource.instagram='구글 검색 기간 내 ('+dateFrom+'~'+dateTo+', '+(it>0?'약 '+it.toLocaleString()+'건':'확인된 '+io.length+'건')+')';
    }
    // ── 페이스북 (기간 필터 적용) ──
    if(fbD&&fbD.organic_results&&fbD.organic_results.length>0){
      var fo=fbD.organic_results.map(function(i){var p='';try{var m=i.link.match(/facebook\.com\/([^\/\?]+)/);if(m)p=m[1];}catch(e){}return{title:i.title||'',snippet:i.snippet||'',link:i.link,source:p||'Facebook',date:i.date||''};});
      var ft=(fbD.search_information&&fbD.search_information.total_results)||0;
      R.summary.facebookTotal=ft>0?ft:fo.length;
      R.content.facebook=fo;
      R.summary.dataSource.facebook='구글 검색 기간 내 ('+dateFrom+'~'+dateTo+', '+(ft>0?'약 '+ft.toLocaleString()+'건':'확인된 '+fo.length+'건')+')';
    }
    // ── 유튜브 (YouTube 직접 검색 메인 — 날짜 파싱 후 기간 필터) ──
    var ytAllItems=[];
    var ytTotalViews=0;
    var ytSeen={};
    function addYt(item){
      var key=(item.link||'').replace(/[?&].*$/,'').replace(/\/$/,'');
      if(!key||ytSeen[key])return null;
      ytSeen[key]=true;ytAllItems.push(item);return item;
    }
    // published_date 파싱 ("3 days ago","1 week ago","2 months ago","11 hours ago","Mar 11, 2026")
    function parseYtDate(str){
      if(!str)return'';
      // 절대 날짜 (Mar 11, 2026 등)
      try{var d=new Date(str);if(!isNaN(d.getTime()))return d.toISOString().slice(0,10);}catch(e){}
      // 상대 날짜
      var now=new Date();
      var m=str.match(/(\d+)\s*(hour|day|week|month|year|시간|일|주|개월|년)/i);
      if(m){
        var n=parseInt(m[1]);var u=m[2].toLowerCase();
        if(u.includes('hour')||u.includes('시간'))now.setHours(now.getHours()-n);
        else if(u.includes('day')||u==='일')now.setDate(now.getDate()-n);
        else if(u.includes('week')||u.includes('주'))now.setDate(now.getDate()-n*7);
        else if(u.includes('month')||u.includes('개월'))now.setMonth(now.getMonth()-n);
        else if(u.includes('year')||u.includes('년'))now.setFullYear(now.getFullYear()-n);
        return now.toISOString().slice(0,10);
      }
      // "Streamed X ago" 패턴
      if(str.toLowerCase().includes('stream')){var m2=str.match(/(\d+)\s*(hour|day|week|month)/i);if(m2)return parseYtDate(m2[1]+' '+m2[2]+' ago');}
      return'';
    }
    function parseViews(v){
      if(!v)return 0;
      var vs=String(v).replace(/[^0-9.만천억회,]/g,'');
      if(vs.includes('억'))return Math.round(parseFloat(vs)*1e8);
      if(vs.includes('만'))return Math.round(parseFloat(vs)*1e4);
      if(vs.includes('천'))return Math.round(parseFloat(vs)*1e3);
      return parseInt(vs.replace(/[^0-9]/g,''))||0;
    }
    // A) 3개 소스 병합 (최신순 + 관련도순 + 키워드 첫단어)
    [ytDateD,ytRelD,ytShortD].forEach(function(src){
      if(!src)return;
      (src.video_results||[]).forEach(function(v){
        var vw=parseViews(v.views);
        var pd=parseYtDate(v.published_date||'');
        var chName=(v.channel&&v.channel.name)||'';
        var chLink=(v.channel&&v.channel.link)||'';
        var isShort=(v.link||'').includes('/shorts/');
        var existing=addYt({title:v.title||'',link:v.link||'',views:vw,channel:chName,channelLink:chLink,date:pd,type:isShort?'shorts':'video',snippet:(v.description||'').substring(0,80),inPeriod:pd>=dateFrom&&pd<=dateTo});
        if(!existing){
          // 중복이면 조회수만 업데이트
          var key=(v.link||'').replace(/[?&].*$/,'').replace(/\/$/,'');
          ytAllItems.forEach(function(e){
            var ek=(e.link||'').replace(/[?&].*$/,'').replace(/\/$/,'');
            if(ek===key){if(vw>e.views)e.views=vw;if(chName&&!e.channel)e.channel=chName;if(pd&&!e.date)e.date=pd;}
          });
        }
        ytTotalViews+=vw;
      });
      // 숏츠
      (src.shorts_results||[]).forEach(function(s){
        addYt({title:(s.title||'')+' [숏츠]',link:s.link||'',views:parseViews(s.views),channel:(s.channel&&s.channel.name)||'',date:'',type:'shorts',inPeriod:true});
      });
      // 채널 정보
      if(src.channel_results){
        var chs=Array.isArray(src.channel_results)?src.channel_results:[src.channel_results];
        chs.forEach(function(ch){if(ch&&ch.title)R.summary.youtubeChannel={name:ch.title,link:ch.link||'',subscribers:ch.subscribers||'',videos:ch.video_count||''};});
      }
    });
    // B) 기간 내 콘텐츠만 필터 (날짜 파싱 성공한 것)
    var ytInPeriod=ytAllItems.filter(function(v){return v.inPeriod||v.type==='shorts';});
    var ytOutPeriod=ytAllItems.filter(function(v){return !v.inPeriod&&v.type!=='shorts'&&v.date;});
    // 조회수순 정렬
    ytInPeriod.sort(function(a,b){if(a.type==='shorts'&&b.type!=='shorts')return 1;if(a.type!=='shorts'&&b.type==='shorts')return -1;return(b.views||0)-(a.views||0);});
    R.content.youtube=ytInPeriod;
    R.summary.youtubeTotal=ytInPeriod.length;
    R.summary.youtubeViewTotal=ytInPeriod.reduce(function(s,v){return s+v.views;},0);
    R.summary.dataSource.youtube='YouTube 직접 검색 (기간 '+dateFrom+'~'+dateTo+', 기간 내 '+ytInPeriod.length+'건'+(ytOutPeriod.length>0?', 기간 외 '+ytOutPeriod.length+'건 제외':'')+')';
    // ── 구글뉴스 ──
    if(gnD){
      var gn=(gnD.news_results||[]).slice(0,10);
      R.content.googleNews=gn.map(function(n){return{title:n.title||'',link:n.link||'',source:(n.source&&n.source.name)||'',date:n.date||'',snippet:n.snippet||''};});
      R.summary.googleNewsTotal=gn.length;
      R.summary.dataSource.googleNews='구글 뉴스 (기간 '+dateFrom+'~'+dateTo+', '+gn.length+'건)';
    }
    // ── 구글트렌드 ──
    if(gtD&&gtD.interest_over_time&&gtD.interest_over_time.timeline_data){
      R.trend.google=gtD.interest_over_time.timeline_data.map(function(d){return{date:d.date||'',value:(d.values&&d.values[0]&&d.values[0].extracted_value)||0};});
      var gd=R.trend.google;
      if(gd.length>=4){
        var gr=gd.slice(-3).reduce(function(s,d){return s+d.value;},0)/3;
        var go=gd.slice(-6,-3).reduce(function(s,d){return s+d.value;},0)/Math.max(gd.slice(-6,-3).length,1);
        R.summary.googleTrendDirection=gr>go*1.1?'상승':gr<go*0.9?'하락':'유지';
      }
    }

    // ── 총량 ──
    R.summary.totalContent=R.summary.naverBlogTotal+R.summary.naverNewsTotal+R.summary.naverCafeTotal;
    // 전체 콘텐츠 리스트 (모든 플랫폼 포함)
    R.contents=[].concat(
      R.content.blog.map(function(i){return Object.assign({},i,{type:'blog'});}),
      R.content.news.map(function(i){return Object.assign({},i,{type:'news'});}),
      R.content.cafe.map(function(i){return Object.assign({},i,{type:'cafe'});}),
      R.content.instagram.map(function(i){return Object.assign({},i,{type:'instagram'});}),
      R.content.facebook.map(function(i){return Object.assign({},i,{type:'facebook'});}),
      R.content.youtube.map(function(i){return Object.assign({},i,{type:'youtube'});}),
      R.content.googleNews.map(function(i){return Object.assign({},i,{type:'googleNews'});}),
      R.content.kin.map(function(i){return Object.assign({},i,{type:'kin'});})
    ).slice(0,100);

    res.json(R);
  } catch(err) {
    console.error('keyword-analyze error:',err);
    res.status(500).json({error:'분석 실패: '+err.message});
  }
};

function sh(s){return(s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function fd(d){if(!d)return'';if(/^\d{8}$/.test(d))return d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);try{var p=new Date(d);if(isNaN(p.getTime()))return'';return p.toISOString().slice(0,10);}catch(e){return'';}}
function pa(v){if(typeof v==='number')return v;if(typeof v==='string'){var n=parseInt(v.replace(/[^0-9]/g,''));return isNaN(n)?0:n;}return 0;}
