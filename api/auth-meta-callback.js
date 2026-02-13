const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;
  if (!code) return res.status(400).send('인증 코드가 없습니다');

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = `https://nweca.vercel.app/api/auth-meta-callback`;

  try {
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    const token = tokenData.access_token;
    const profileRes = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,email&access_token=${token}`);
    const profile = await profileRes.json();

    let instagram = [];
    try {
      const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,instagram_business_account{id,username,followers_count,media_count}&access_token=${token}`);
      const pagesData = await pagesRes.json();
      if (pagesData.data) {
        instagram = pagesData.data.filter(p => p.instagram_business_account).map(p => ({
          pageId: p.id, pageName: p.name,
          igId: p.instagram_business_account.id,
          igUsername: p.instagram_business_account.username,
          igFollowers: p.instagram_business_account.followers_count,
          igMedia: p.instagram_business_account.media_count
        }));
      }
    } catch (e) {}

    res.send(`<html><body><script>
      window.opener.postMessage({type:'meta-auth',token:'${token}',name:'${profile.name||''}',email:'${profile.email||''}',id:'${profile.id}',instagram:${JSON.stringify(instagram)}},'*');
      window.close();
    </script><p>로그인 완료! 이 창은 자동으로 닫힙니다.</p></body></html>`);
  } catch (err) {
    res.status(500).send('Meta 로그인 실패: ' + err.message);
  }
};
