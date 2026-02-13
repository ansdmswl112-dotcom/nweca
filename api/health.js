const { getSupabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let dbStatus = false;
  const sb = getSupabase();
  if (sb) {
    try {
      const { count, error } = await sb.from('users').select('*', { count: 'exact', head: true });
      dbStatus = !error;
    } catch (e) { dbStatus = false; }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apis: {
      naver: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
      meta: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      serp: !!process.env.SERPAPI_KEY,
      supabase: dbStatus
    }
  });
};
