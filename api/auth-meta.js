module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const appId = process.env.META_APP_ID;
  if (!appId) return res.status(500).json({ error: 'META_APP_ID가 설정되지 않았습니다' });
  const redirectUri = `https://nweca.vercel.app/api/auth-meta-callback`;
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_profile&response_type=code`;
  res.redirect(authUrl);
};
