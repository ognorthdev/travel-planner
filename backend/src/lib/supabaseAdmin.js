const { createClient } = require('@supabase/supabase-js');

// Admin client (service role key) — used ONLY server-side to resolve a
// collaborator's email to a user id and to show member emails. The service
// role key bypasses Row Level Security, so it must never reach the frontend.
let admin = null;
function getSupabaseAdmin() {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to manage collaborators');
    }
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

const PER_PAGE = 200;
const MAX_PAGES = 50; // safety bound (~10k users) — fine for a friends-test scale

// Find a user by email → { id, email } or null. The admin API has no direct
// get-by-email, so we page through listUsers. Fine at small scale; revisit if
// the user base grows large.
async function findUserByEmail(email) {
  const supabase = getSupabaseAdmin();
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (match) return { id: match.id, email: match.email };
    if (data.users.length < PER_PAGE) break;
  }
  return null;
}

// Map a set of user ids → emails for display.
async function getEmailsByIds(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const wanted = new Set(userIds);
  const result = {};
  for (let page = 1; page <= MAX_PAGES && wanted.size > 0; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    for (const u of data.users) {
      if (wanted.has(u.id)) {
        result[u.id] = u.email;
        wanted.delete(u.id);
      }
    }
    if (data.users.length < PER_PAGE) break;
  }
  return result;
}

module.exports = { getSupabaseAdmin, findUserByEmail, getEmailsByIds };
