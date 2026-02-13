// Supabase Client Helper for Vercel Backend
const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
      return null;
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

module.exports = { getSupabase };
