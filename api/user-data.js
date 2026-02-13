// User Data API - Supabase CRUD
const { getSupabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = getSupabase();
  if (!sb) return res.status(500).json({ error: 'DB 연결 실패' });

  const { action, table, data, userId, filters } = req.method === 'POST' 
    ? req.body 
    : req.query;

  if (!action) return res.status(400).json({ error: 'action 필요' });

  try {
    // ===== USER: 로그인/회원가입 =====
    if (action === 'upsert_user') {
      const { provider, provider_id, name, email, profile_image, naver_token, meta_token, meta_pages, instagram_id } = data;
      
      // 기존 유저 찾기
      const { data: existing } = await sb
        .from('users')
        .select('*')
        .eq('provider', provider)
        .eq('provider_id', provider_id)
        .single();

      if (existing) {
        // 업데이트
        const updateData = { last_login: new Date().toISOString() };
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (profile_image) updateData.profile_image = profile_image;
        if (naver_token) updateData.naver_token = naver_token;
        if (meta_token) updateData.meta_token = meta_token;
        if (meta_pages) updateData.meta_pages = meta_pages;
        if (instagram_id) updateData.instagram_id = instagram_id;

        const { data: updated, error } = await sb
          .from('users')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        return res.json({ ok: true, user: updated, isNew: false });
      } else {
        // 새 유저
        const { data: created, error } = await sb
          .from('users')
          .insert({ provider, provider_id, name, email, profile_image, naver_token, meta_token, meta_pages, instagram_id })
          .select()
          .single();
        
        if (error) throw error;
        return res.json({ ok: true, user: created, isNew: true });
      }
    }

    // ===== GET USER =====
    if (action === 'get_user') {
      const { data: user, error } = await sb
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return res.json({ ok: true, user });
    }

    // ===== CREDIT: 크레딧 기록 =====
    if (action === 'add_credit') {
      const { amount, description: desc, action: creditAction } = data;
      
      // 현재 잔액 조회
      const { data: lastCredit } = await sb
        .from('credits')
        .select('balance')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      const currentBalance = (lastCredit?.balance || 0) + amount;
      
      const { data: credit, error } = await sb
        .from('credits')
        .insert({
          user_id: userId,
          action: creditAction || 'usage',
          amount: amount,
          balance: currentBalance,
          description: desc
        })
        .select()
        .single();
      
      if (error) throw error;
      return res.json({ ok: true, credit, balance: currentBalance });
    }

    if (action === 'get_credits') {
      const { data: credits, error } = await sb
        .from('credits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      // 최신 잔액
      const balance = credits.length > 0 ? credits[0].balance : 0;
      return res.json({ ok: true, credits, balance });
    }

    // ===== GENERIC: 범용 CRUD =====
    const allowedTables = [
      'keyword_history', 'saved_keywords', 'content_history',
      'compare_history', 'platform_keywords', 'rank_tracking'
    ];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: '허용되지 않는 테이블: ' + table });
    }

    // INSERT
    if (action === 'insert') {
      const insertData = { ...data, user_id: userId };
      const { data: result, error } = await sb
        .from(table)
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return res.json({ ok: true, data: result });
    }

    // SELECT (list)
    if (action === 'list') {
      let query = sb.from(table).select('*').eq('user_id', userId);
      
      // 필터 적용
      if (filters) {
        const f = typeof filters === 'string' ? JSON.parse(filters) : filters;
        Object.entries(f).forEach(([key, val]) => {
          query = query.eq(key, val);
        });
      }
      
      query = query.order('created_at', { ascending: false }).limit(50);
      const { data: rows, error } = await query;
      if (error) throw error;
      return res.json({ ok: true, data: rows, count: rows.length });
    }

    // DELETE
    if (action === 'delete') {
      const { id } = data;
      const { error } = await sb
        .from(table)
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    // DELETE ALL (특정 유저의 특정 테이블 전체)
    if (action === 'delete_all') {
      const { error } = await sb
        .from(table)
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: '알 수 없는 action: ' + action });

  } catch (err) {
    console.error('user-data error:', err);
    return res.status(500).json({ error: err.message || 'DB 오류' });
  }
};
