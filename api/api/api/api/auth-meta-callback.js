const fetch = require('node-fetch');
module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('로그인 실패');
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = `https://${req.headers.host}/api/auth-meta-callback`;
  try {
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(400).send('토큰 발급 실패');
    const accessToken = tokenData.access_token;
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email,picture&access_token=${accessToken}`);
    const profile = await profileRes.json();
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username,followers_count,media_count}&access_token=${accessToken}`);
    const pages = await pagesRes.json();
    const igAccounts = (pages.data || []).filter(p => p.instagram_business_account).map(p => ({ pageId: p.id, pageName: p.name, igId: p.instagram_business_account.id, igUsername: p.instagram_business_account.username, followers: p.instagram_business_account.followers_count, mediaCount: p.instagram_business_account.media_count }));
    const userData = { token: accessToken, id: profile.id || '', name: profile.name || '', email: profile.email || '', profileImage: profile.picture?.data?.url || '', pages: pages.data || [], instagram: igAccounts };
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><body><script>window.opener.postMessage({type:'meta-auth',data:${JSON.stringify(userData)}},'*');window.close();</script><p>로그인 완료!</p></body></html>`);
  } catch (err) { res.status(500).send('로그인 실패: ' + err.message); }
};
