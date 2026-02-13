const fetch = require('node-fetch');
const { getSupabase } = require('./supabase-client');

module.exports = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('로그인 실패: code가 없습니다');
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host}/api/auth-naver-callback`;

  try {
    // 토큰 교환
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).send('토큰 발급 실패: ' + tokenData.error_description);
    }

    const accessToken = tokenData.access_token;

    // 사용자 프로필 가져오기
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const profileData = await profileRes.json();
    const profile = profileData.response || {};

    // Supabase에 유저 저장/업데이트
    let dbUserId = null;
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: existing } = await sb
          .from('users')
          .select('id')
          .eq('provider', 'naver')
          .eq('provider_id', profile.id || '')
          .single();

        if (existing) {
          await sb.from('users').update({
            name: profile.name || profile.nickname || '',
            email: profile.email || '',
            profile_image: profile.profile_image || '',
            naver_token: accessToken,
            last_login: new Date().toISOString()
          }).eq('id', existing.id);
          dbUserId = existing.id;
        } else {
          const { data: created } = await sb.from('users').insert({
            provider: 'naver',
            provider_id: profile.id || '',
            name: profile.name || profile.nickname || '',
            email: profile.email || '',
            profile_image: profile.profile_image || '',
            naver_token: accessToken
          }).select('id').single();
          dbUserId = created?.id || null;
        }
      } catch (dbErr) {
        console.error('Supabase user save error:', dbErr.message);
      }
    }

    // 프론트엔드로 토큰과 프로필 전달
    const userData = {
      token: accessToken,
      id: profile.id || '',
      name: profile.name || profile.nickname || '',
      email: profile.email || '',
      profileImage: profile.profile_image || '',
      dbUserId: dbUserId
    };

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><body><script>
      window.opener.postMessage({type:'naver-auth',data:${JSON.stringify(userData)}},'*');
      window.close();
    </script><p>로그인 완료! 이 창은 자동으로 닫힙니다.</p></body></html>`);

  } catch (err) {
    res.status(500).send('로그인 처리 실패: ' + err.message);
  }
};
