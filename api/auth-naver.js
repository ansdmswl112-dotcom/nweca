module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const clientId = process.env.NAVER_CLIENT_ID;
  const redirectUri = `https://${req.headers.host}/api/auth-naver-callback`;
  const state = Math.random().toString(36).substring(7);
  const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.redirect(302, url);
};
