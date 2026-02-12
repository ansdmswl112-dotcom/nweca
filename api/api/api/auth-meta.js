module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const appId = process.env.META_APP_ID;
  const redirectUri = `https://${req.headers.host}/api/auth-meta-callback`;
  const scope = 'public_profile,email,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights';
  const state = Math.random().toString(36).substring(7);
  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&response_type=code`;
  res.redirect(302, url);
};
