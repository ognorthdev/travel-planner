const { createClient } = require('@supabase/supabase-js');

// Backend Supabase client used only to verify access tokens. With asymmetric
// JWT signing keys (default on new projects) getClaims verifies locally against
// the project's cached JWKS — no per-request round-trip to the Auth server.
let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment');
    }
    supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

// Express middleware: require a valid Supabase access token (Bearer).
// On success attaches req.user = { id, email }.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await getSupabase().auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = { id: claims.sub, email: claims.email };
    req.accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, getSupabase };
