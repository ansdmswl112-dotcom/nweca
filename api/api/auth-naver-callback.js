const fetch = require('node-fetch');
module.exports = async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('로그인 실패');
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host}/api/auth-naver-callback`;
  try {
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(400).send('토큰 발급 실패: ' + tokenData.error_description);
    const accessToken = tokenData.access_token;
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const profileData = await profileRes.json();
    const profile = profileData.response || {};
    const userData = { token: accessToken, id: profile.id || '', name: profile.name || profile.nickname || '', email: profile.email || '', profileImage: profile.profile_image || '' };
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><body><script>window.opener.postMessage({type:'naver-auth',data:${JSON.stringify(userData)}},'*');window.close();</script><p>로그인 완료!</p></body></html>`);
  } catch (err) { res.status(500).send('로그인 실패: ' + err.message); }
};
