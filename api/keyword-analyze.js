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
  var dateFrom = params.dateFrom || new Date(Date.now() - months * 30 * 86400000).toISOString().split('T')[0];

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
    // [9] SerpAPI 유튜브 직접 (최신순 정렬 + 숏츠)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=youtube&search_query='+encodeURIComponent(keyword)+'&sp=CAI%253D&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [10] SerpAPI 유튜브 기간 건수 (구글 검색 기간필터)
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?q='+encodeURIComponent(keyword)+'+site:youtube.com&hl=ko&gl=kr&num=20'+tbs+'&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [11] SerpAPI 구글뉴스
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_news&q='+encodeURIComponent(keyword)+'+after:'+dateFrom+'+before:'+dateTo+'&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));
    // [12] SerpAPI 구글트렌드
    if(serpKey) tasks.push(fetch('https://serpapi.com/search.json?engine=google_trends&q='+encodeURIComponent(keyword)+'&data_type=TIMESERIES&date='+dateFrom+' '+dateTo+'&hl=ko&gl=kr&api_key='+serpKey).then(r=>r.json()).catch(()=>null));
    else tasks.push(Promise.resolve(null));

    var results = await Promise.all(tasks);
    var blogD=results[0], newsD=results[1], cafeD=results[2], kinD=results[3];
    var dl12D=results[4], dlDayD=results[5], adD=results[6];
    var instaD=results[7], fbD=results[8], ytD=results[9], ytGD=results[10], gnD=results[11], gtD=results[12];

    // ── 블로그 처리 ──
    if(blogD&&blogD.items){
      R.summary.naverBlogAll=blogD.total||0;
      var bi=(blogD.items||[]).map(function(i){return{title:sh(i.title),description:sh(i.description),link:i.link,source:i.bloggername||'블로그',date:fd(i.postdate||'')};});
      var bf=bi.filter(function(i){return i.date&&i.date>=dateFrom&&i.date<=dateTo;});
      R.content.blog=bf.slice(0,20);
      R.summary.naverBlogTotal=bi.length>=10&&bf.length>0?Math.round(R.summary.naverBlogAll*(bf.length/bi.length)):bf.length;
    }
    // ── 뉴스 처리 ──
    if(newsD&&newsD.items){
      R.summary.naverNewsAll=newsD.total||0;
      var ni=(newsD.items||[]).map(function(i){var s='뉴스';try{s=new URL(i.originallink).hostname.replace('www.','');}catch(e){}return{title:sh(i.title),description:sh(i.description),link:i.link,source:s,date:fd(i.pubDate||'')};});
      var nf=ni.filter(function(i){return i.date&&i.date>=dateFrom&&i.date<=dateTo;});
      R.content.news=nf.slice(0,20);
      R.summary.naverNewsTotal=ni.length>=10&&nf.length>0?Math.round(R.summary.naverNewsAll*(nf.length/ni.length)):nf.length;
    }
    // ── 카페 처리 ──
    if(cafeD&&cafeD.items){
      R.summary.naverCafeAll=cafeD.total||0;
      R.content.cafe=(cafeD.items||[]).slice(0,10).map(function(i){return{title:sh(i.title),description:sh(i.description),link:i.link,source:i.cafename||'카페',date:''};});
      var br=R.summary.naverBlogAll>0?R.summary.naverBlogTotal/R.summary.naverBlogAll:1;
      var nr=R.summary.naverNewsAll>0?R.summary.naverNewsTotal/R.summary.naverNewsAll:1;
      R.summary.naverCafeTotal=Math.round((cafeD.total||0)*(br+nr)/2);
    }
    // ── 지식iN ──
    if(kinD&&kinD.items){
      R.summary.naverKinTotal=kinD.total||0;
      R.content.kin=(kinD.items||[]).slice(0,5).map(function(i){return{title:sh(i.title),description:sh(i.description).substring(0,60),link:i.link,date:''};});
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
    if(instaD){
      var io=(instaD.organic_results||[]).map(function(i,idx){var u='';try{var m=i.link.match(/instagram\.com\/([^\/\?]+)/);if(m)u='@'+m[1];}catch(e){}return{title:i.title||'',snippet:i.snippet||'',link:i.link,source:u||'Instagram',date:i.date||''};});
      var it=(instaD.search_information&&instaD.search_information.total_results)||io.length;
      if(it>0||io.length>0){R.summary.instagramTotal=it;R.content.instagram=io;R.summary.dataSource.instagram='구글 검색 기간 내 ('+dateFrom+'~'+dateTo+', '+it.toLocaleString()+'건)';}
    }
    // ── 페이스북 (기간 필터 적용) ──
    if(fbD){
      var fo=(fbD.organic_results||[]).map(function(i){var p='';try{var m=i.link.match(/facebook\.com\/([^\/\?]+)/);if(m)p=m[1];}catch(e){}return{title:i.title||'',snippet:i.snippet||'',link:i.link,source:p||'Facebook',date:i.date||''};});
      var ft=(fbD.search_information&&fbD.search_information.total_results)||fo.length;
      if(ft>0||fo.length>0){R.summary.facebookTotal=ft;R.content.facebook=fo;R.summary.dataSource.facebook='구글 검색 기간 내 ('+dateFrom+'~'+dateTo+', '+ft.toLocaleString()+'건)';}
    }
    // ── 유튜브 (구글 기간필터 + YouTube 직접 병합) ──
    var ytAllItems=[];
    var ytTotalViews=0;
    // A) 구글 검색 기간 필터 결과 (기간 내 콘텐츠 — 메인)
    if(ytGD&&ytGD.organic_results){
      ytGD.organic_results.forEach(function(v){
        ytAllItems.push({title:v.title||'',link:v.link||'',views:0,channel:v.source||'',date:v.date||'',type:'video',snippet:v.snippet||''});
      });
    }
    // B) YouTube 직접 검색 (조회수 + 숏츠)
    if(ytD){
      var yv=(ytD.video_results||[]).slice(0,15);
      var ys=(ytD.shorts_results||[]).slice(0,5);
      yv.forEach(function(v){
        var vw=0;if(v.views){var vs=String(v.views).replace(/[^0-9.만천억]/g,'');if(vs.includes('억'))vw=Math.round(parseFloat(vs)*1e8);else if(vs.includes('만'))vw=Math.round(parseFloat(vs)*1e4);else if(vs.includes('천'))vw=Math.round(parseFloat(vs)*1e3);else vw=parseInt(vs)||0;}
        ytTotalViews+=vw;
        // 중복 제거: 같은 링크 없을 때만 추가
        var exists=ytAllItems.some(function(e){return e.link===v.link;});
        if(!exists){
          ytAllItems.push({title:v.title||'',link:v.link||'',views:vw,channel:(v.channel&&v.channel.name)||'',date:v.published_date||'',type:'video'});
        }else{
          // 기존 항목에 조회수 병합
          ytAllItems.forEach(function(e){if(e.link===v.link)e.views=vw;});
        }
      });
      ys.forEach(function(s){
        ytAllItems.push({title:(s.title||'')+' [숏츠]',link:s.link||'',views:0,channel:(s.channel&&s.channel.name)||'',date:'',type:'shorts'});
      });
    }
    // 조회수순 정렬
    ytAllItems.sort(function(a,b){return(b.views||0)-(a.views||0);});
    var ytPeriodTotal=(ytGD&&ytGD.search_information&&ytGD.search_information.total_results)||ytAllItems.length;
    R.content.youtube=ytAllItems;
    R.summary.youtubeTotal=ytPeriodTotal;
    R.summary.youtubeViewTotal=ytTotalViews;
    R.summary.dataSource.youtube='YouTube 기간 내 ('+dateFrom+'~'+dateTo+', '+ytPeriodTotal+'건, 조회 '+ytTotalViews.toLocaleString()+')';
    // ── 구글뉴스 ──
    if(gnD){
      var gn=(gnD.news_results||[]).slice(0,10);
      R.content.googleNews=gn.map(function(n){return{title:n.title||'',link:n.link||'',source:(n.source&&n.source.name)||'',date:n.date||'',snippet:n.snippet||''};});
      R.summary.googleNewsTotal=gn.length;
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
    R.contents=[].concat(R.content.blog.map(function(i){return Object.assign({},i,{type:'blog'});})).concat(R.content.news.map(function(i){return Object.assign({},i,{type:'news'});})).concat(R.content.cafe.map(function(i){return Object.assign({},i,{type:'cafe'});})).slice(0,50);

    res.json(R);
  } catch(err) {
    console.error('keyword-analyze error:',err);
    res.status(500).json({error:'분석 실패: '+err.message});
  }
};

function sh(s){return(s||'').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function fd(d){if(!d)return'';if(/^\d{8}$/.test(d))return d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);try{return new Date(d).toISOString().slice(0,10);}catch(e){return d;}}
function pa(v){if(typeof v==='number')return v;if(typeof v==='string'){var n=parseInt(v.replace(/[^0-9]/g,''));return isNaN(n)?0:n;}return 0;}
