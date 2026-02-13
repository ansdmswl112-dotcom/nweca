module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'NAVER_CLIENT_ID가 설정되지 않았습니다' });

  const redirectUri = `https://nweca.vercel.app/api/auth-naver-callback`;
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.redirect(authUrl);
};
