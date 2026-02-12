module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const status = {
    naver: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
    meta: !!process.env.META_ACCESS_TOKEN,
    serpapi: !!process.env.SERPAPI_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY
  };

  res.json({
    ok: true,
    message: 'SNS Content Backend API',
    apis: status,
    timestamp: new Date().toISOString()
  });
};
