const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? req.body : req.query;
  const { action = 'profile', period = '30' } = params;

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'Meta API 토큰이 설정되지 않았습니다' });

  const graphUrl = 'https://graph.facebook.com/v19.0';

  try {
    if (action === 'profile') {
      const r = await fetch(`${graphUrl}/me?fields=id,name&access_token=${token}`);
      const me = await r.json();
      if (me.error) return res.status(400).json({ error: me.error.message });

      const pagesR = await fetch(`${graphUrl}/me/accounts?fields=id,name,instagram_business_account{id,username,followers_count,media_count,profile_picture_url}&access_token=${token}`);
      const pages = await pagesR.json();

      const igAccounts = (pages.data || [])
        .filter(p => p.instagram_business_account)
        .map(p => ({
          pageId: p.id,
          pageName: p.name,
          igId: p.instagram_business_account.id,
          igUsername: p.instagram_business_account.username,
          followers: p.instagram_business_account.followers_count,
          mediaCount: p.instagram_business_account.media_count
        }));

      res.json({ ok: true, action: 'profile', user: me, instagramAccounts: igAccounts });

    } else if (action === 'insights') {
      const { igId } = params;
      if (!igId) return res.status(400).json({ error: 'igId가 필요합니다.' });

      const mediaR = await fetch(`${graphUrl}/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=12&access_token=${token}`);
      const media = await mediaR.json();

      const posts = (media.data || []).map(p => ({
        id: p.id,
        caption: (p.caption || '').substring(0, 100),
        type: p.media_type,
        date: p.timestamp,
        likes: p.like_count || 0,
        comments: p.comments_count || 0
      }));

      res.json({ ok: true, action: 'insights', igId, posts });

    } else if (action === 'fb-page') {
      const { pageId } = params;
      if (!pageId) return res.status(400).json({ error: 'pageId가 필요합니다.' });

      const metrics = 'page_impressions,page_engaged_users,page_post_engagements,page_fans';
      const r = await fetch(`${graphUrl}/${pageId}/insights?metric=${metrics}&period=day&since=${Math.floor(Date.now()/1000) - parseInt(period)*86400}&until=${Math.floor(Date.now()/1000)}&access_token=${token}`);
      const data = await r.json();

      const pageInsights = {};
      (data.data || []).forEach(metric => {
        pageInsights[metric.name] = (metric.values || []).map(v => ({
          date: v.end_time?.split('T')[0],
          value: v.value
        }));
      });

      res.json({ ok: true, action: 'fb-page', pageId, insights: pageInsights });

    } else {
      res.status(400).json({ error: '지원하지 않는 action입니다.' });
    }

  } catch (err) {
    res.status(500).json({ error: 'Meta API 실패', message: err.message });
  }
};
