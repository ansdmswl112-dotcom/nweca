const fetch = require('node-fetch');
const { getSupabase } = require('./supabase-client');

module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('로그인 실패: code가 없습니다');
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = `https://${req.headers.host}/api/auth-meta-callback`;

  try {
    // 토큰 교환
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).send('토큰 발급 실패: ' + tokenData.error.message);
    }

    const accessToken = tokenData.access_token;

    // 사용자 프로필
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${accessToken}`);
    const profile = await profileRes.json();

    // 페이지 목록 가져오기
    let pages = { data: [] };
    try {
      const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category&access_token=${accessToken}`);
      pages = await pagesRes.json();
    } catch (e) {
      console.error('Pages fetch error:', e.message);
    }

    // 페이지별 최근 게시물 가져오기
    let fbPosts = [];
    if (pages.data && pages.data.length > 0) {
      try {
        const pageToken = pages.data[0].access_token || accessToken;
        const pageId = pages.data[0].id;
        const postsRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true),shares&limit=5&access_token=${pageToken}`);
        const postsData = await postsRes.json();
        fbPosts = (postsData.data || []).map(p => ({
          id: p.id,
          message: (p.message || '').substring(0, 100),
          created: p.created_time,
          likes: p.likes?.summary?.total_count || 0,
          comments: p.comments?.summary?.total_count || 0,
          shares: p.shares?.count || 0
        }));
      } catch (e) {
        console.error('FB posts fetch error:', e.message);
      }
    }

    // Supabase에 유저 저장/업데이트
    let dbUserId = null;
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: existing } = await sb
          .from('users')
          .select('id')
          .eq('provider', 'meta')
          .eq('provider_id', profile.id || '')
          .single();

        if (existing) {
          await sb.from('users').update({
            name: profile.name || '',
            profile_image: profile.picture?.data?.url || '',
            meta_token: accessToken,
            meta_pages: pages.data || [],
            last_login: new Date().toISOString()
          }).eq('id', existing.id);
          dbUserId = existing.id;
        } else {
          const { data: created } = await sb.from('users').insert({
            provider: 'meta',
            provider_id: profile.id || '',
            name: profile.name || '',
            profile_image: profile.picture?.data?.url || '',
            meta_token: accessToken,
            meta_pages: pages.data || []
          }).select('id').single();
          dbUserId = created?.id || null;
        }
      } catch (dbErr) {
        console.error('Supabase user save error:', dbErr.message);
      }
    }

    const userData = {
      token: accessToken,
      id: profile.id || '',
      name: profile.name || '',
      profileImage: profile.picture?.data?.url || '',
      pages: pages.data || [],
      fbPosts: fbPosts,
      dbUserId: dbUserId
    };

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><body><script>
      window.opener.postMessage({type:'meta-auth',data:${JSON.stringify(userData)}},'*');
      window.close();
    </script><p>로그인 완료! 이 창은 자동으로 닫힙니다.</p></body></html>`);

  } catch (err) {
    res.status(500).send('로그인 처리 실패: ' + err.message);
  }
};
