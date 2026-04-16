// /api/reference-library.js
// 수집한 레퍼런스 목록 조회/관리
// GET  /api/reference-library?userId=xxx      → 사용자별 레퍼런스 리스트
// POST /api/reference-library { action, ...} → save/delete/pin

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.query.userId || req.body?.userId || 'guest';
  const userKey = `userlib:${userId}`;

  try {
    // 목록 조회
    if (req.method === 'GET') {
      const list = (await kv.get(userKey)) || [];
      // 각 레퍼런스의 실제 데이터는 별도 키에 저장 — 요약만 반환
      return res.status(200).json({ userId, items: list });
    }

    const body = req.body || {};
    const action = body.action;

    // 레퍼런스 저장 (수집 직후 호출)
    if (action === 'save') {
      const { query, patterns, sourceCount } = body;
      if (!query) return res.status(400).json({ error: 'query required' });

      const list = (await kv.get(userKey)) || [];
      const existing = list.findIndex(x => x.query === query);

      const entry = {
        query,
        summary: patterns?.topicSummary || '',
        blogCount: sourceCount?.blogs || 0,
        savedAt: new Date().toISOString(),
        pinned: existing >= 0 ? list[existing].pinned : false
      };

      if (existing >= 0) {
        list[existing] = { ...list[existing], ...entry };
      } else {
        list.unshift(entry);
      }

      // 최대 100개 유지
      if (list.length > 100) list.length = 100;

      await kv.set(userKey, list);
      return res.status(200).json({ ok: true, totalItems: list.length });
    }

    // 삭제
    if (action === 'delete') {
      const { query } = body;
      const list = (await kv.get(userKey)) || [];
      const filtered = list.filter(x => x.query !== query);
      await kv.set(userKey, filtered);
      return res.status(200).json({ ok: true, totalItems: filtered.length });
    }

    // 핀 고정 토글
    if (action === 'pin') {
      const { query } = body;
      const list = (await kv.get(userKey)) || [];
      const item = list.find(x => x.query === query);
      if (item) item.pinned = !item.pinned;
      // 핀된 항목 위로
      list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      await kv.set(userKey, list);
      return res.status(200).json({ ok: true, pinned: item?.pinned });
    }

    return res.status(400).json({ error: 'unknown action' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
