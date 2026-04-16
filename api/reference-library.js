const fetch = require('node-fetch');
// VERSION: 2026-04-16-REFERENCE-LIBRARY
// 사용자별 레퍼런스 라이브러리 관리 (KV REST API 직접 호출)

async function kvGet(key) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    var r = await fetch(url + '/get/' + encodeURIComponent(key), {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;
    var data = await r.json();
    if (!data.result) return null;
    try {
      return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (e) {
      return data.result;
    }
  } catch (e) {
    return null;
  }
}

async function kvSet(key, value) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    var r = await fetch(url + '/set/' + encodeURIComponent(key), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(value)
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var kvAvailable = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  // KV 없으면 라이브러리 비활성 — 에러 대신 빈 결과
  if (!kvAvailable) {
    if (req.method === 'GET') {
      return res.status(200).json({ items: [], _info: 'KV 캐시 미설정 — 라이브러리 비활성' });
    }
    return res.status(200).json({ ok: true, _info: 'KV 캐시 미설정 — 저장 스킵됨' });
  }

  var userId = (req.query.userId || (req.body && req.body.userId)) || 'guest';
  var userKey = 'userlib:' + userId;

  try {
    if (req.method === 'GET') {
      var list = (await kvGet(userKey)) || [];
      return res.status(200).json({ userId: userId, items: list });
    }

    var body = req.body || {};
    var action = body.action;

    if (action === 'save') {
      var query = body.query;
      var patterns = body.patterns;
      var sourceCount = body.sourceCount;
      if (!query) return res.status(400).json({ error: 'query required' });

      var list2 = (await kvGet(userKey)) || [];
      var existing = -1;
      for (var i = 0; i < list2.length; i++) {
        if (list2[i].query === query) { existing = i; break; }
      }

      var entry = {
        query: query,
        summary: (patterns && patterns.topicSummary) || '',
        blogCount: (sourceCount && sourceCount.blogs) || 0,
        savedAt: new Date().toISOString(),
        pinned: existing >= 0 ? list2[existing].pinned : false
      };

      if (existing >= 0) {
        list2[existing] = Object.assign({}, list2[existing], entry);
      } else {
        list2.unshift(entry);
      }

      if (list2.length > 100) list2.length = 100;

      await kvSet(userKey, list2);
      return res.status(200).json({ ok: true, totalItems: list2.length });
    }

    if (action === 'delete') {
      var delQuery = body.query;
      var list3 = (await kvGet(userKey)) || [];
      var filtered = list3.filter(function (x) { return x.query !== delQuery; });
      await kvSet(userKey, filtered);
      return res.status(200).json({ ok: true, totalItems: filtered.length });
    }

    if (action === 'pin') {
      var pinQuery = body.query;
      var list4 = (await kvGet(userKey)) || [];
      var pinned = false;
      for (var j = 0; j < list4.length; j++) {
        if (list4[j].query === pinQuery) {
          list4[j].pinned = !list4[j].pinned;
          pinned = list4[j].pinned;
          break;
        }
      }
      list4.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
      await kvSet(userKey, list4);
      return res.status(200).json({ ok: true, pinned: pinned });
    }

    return res.status(400).json({ error: 'unknown action' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
