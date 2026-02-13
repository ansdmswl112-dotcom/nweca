const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, state } = req.query;
  if (!code) return res.status(400).send('인증 코드가 없습니다');

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = `https://nweca.vercel.app/api/auth-naver-callback`;

  try {
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}&state=${state}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    const token = tokenData.access_token;
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const profileData = await profileRes.json();
    const profile = profileData.response || {};

    res.send(`<html><body><script>
      window.opener.postMessage({type:'naver-auth',token:'${token}',name:'${profile.name||profile.nickname||''}',email:'${profile.email||''}',id:'${profile.id||''}',profileImage:'${profile.profile_image||''}'},'*');
      window.close();
    </script><p>로그인 완료! 이 창은 자동으로 닫힙니다.</p></body></html>`);
  } catch (err) {
    res.status(500).send('네이버 로그인 실패: ' + err.message);
  }
};
