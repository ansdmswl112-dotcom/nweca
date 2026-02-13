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
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email,picture&access_token=${accessToken}`);
    const profile = await profileRes.json();

    // 인스타그램 비즈니스 계정 찾기
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username,followers_count,media_count}&access_token=${accessToken}`);
    const pages = await pagesRes.json();

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

    // Supabase에 유저 저장/업데이트
    let dbUserId = null;
    const sb = getSupabase();
    if (sb) {
      try {
        const igId = igAccounts.length > 0 ? igAccounts[0].igId : null;
        const { data: existing } = await sb
          .from('users')
          .select('id')
          .eq('provider', 'meta')
          .eq('provider_id', profile.id || '')
          .single();

        if (existing) {
          await sb.from('users').update({
            name: profile.name || '',
            email: profile.email || '',
            profile_image: profile.picture?.data?.url || '',
            meta_token: accessToken,
            meta_pages: pages.data || [],
            instagram_id: igId,
            last_login: new Date().toISOString()
          }).eq('id', existing.id);
          dbUserId = existing.id;
        } else {
          const { data: created } = await sb.from('users').insert({
            provider: 'meta',
            provider_id: profile.id || '',
            name: profile.name || '',
            email: profile.email || '',
            profile_image: profile.picture?.data?.url || '',
            meta_token: accessToken,
            meta_pages: pages.data || [],
            instagram_id: igId
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
      email: profile.email || '',
      profileImage: profile.picture?.data?.url || '',
      pages: pages.data || [],
      instagram: igAccounts,
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
