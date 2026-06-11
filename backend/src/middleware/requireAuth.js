const { createClient } = require('@supabase/supabase-js');
const { prisma } = require('../lib/access');

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

// Emails that are auto-approved and granted admin (comma-separated env var).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Ensure an AppUser row exists for this Supabase user. On first sight we create
// it (admins are auto-approved, everyone else starts `pending`) and claim any
// trip invites addressed to their email.
async function ensureAppUser(userId, email) {
  const lower = (email || '').toLowerCase();
  let appUser = await prisma.appUser.findUnique({ where: { userId } });
  if (!appUser) {
    const isAdmin = ADMIN_EMAILS.includes(lower);
    appUser = await prisma.appUser.create({
      data: { userId, email: lower, status: isAdmin ? 'approved' : 'pending', isAdmin },
    });
    // Claim any invites sent to this email before the account existed.
    if (lower) {
      await prisma.tripMember.updateMany({
        where: { email: lower, userId: null },
        data: { userId },
      });
    }
  }
  return appUser;
}

// Require a valid Supabase access token (Bearer). Attaches
// req.user = { id, email, status, isAdmin }.
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

    const appUser = await ensureAppUser(claims.sub, claims.email);
    req.user = {
      id: claims.sub,
      email: appUser.email,
      status: appUser.status,
      isAdmin: appUser.isAdmin,
      researchContext: appUser.researchContext,
    };
    req.accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

// Require the account to be approved (gate on API-consuming features).
function requireApproved(req, res, next) {
  if (req.user?.status !== 'approved') {
    return res.status(403).json({ error: 'Your account is awaiting approval', code: 'PENDING_APPROVAL' });
  }
  next();
}

// Require admin (manage users).
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireApproved, requireAdmin, getSupabase };
