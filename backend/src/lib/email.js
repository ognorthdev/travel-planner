// Transactional email via the Resend REST API. Entirely optional: when
// RESEND_API_KEY isn't configured every send resolves { sent: false } and the
// calling feature degrades gracefully (invites still work, just silently).
//
// Env:
//   RESEND_API_KEY  — Resend API key (free tier is plenty here)
//   RESEND_FROM     — verified sender, e.g. "Travel Planner <invites@yourdomain.com>"
//                     (defaults to Resend's onboarding sender for testing)
//   APP_URL         — public frontend origin used in email links

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Travel Planner <onboarding@resend.dev>';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

function emailConfigured() {
  return !!RESEND_API_KEY;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendEmail({ to, subject, html }) {
  if (!emailConfigured()) return { sent: false, reason: 'not-configured' };
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error('Resend error:', resp.status, body.slice(0, 300));
      return { sent: false, reason: 'send-failed' };
    }
    return { sent: true };
  } catch (err) {
    console.error('Resend request failed:', err.message);
    return { sent: false, reason: 'send-failed' };
  }
}

// Invite email for a trip collaborator. Content is plain and link-forward —
// the recipient may not have an account yet, in which case the invite is
// claimed automatically on their first sign-in with this email.
function sendTripInvite({ to, inviterEmail, tripName, role }) {
  const link = APP_URL || 'the Travel Planner app';
  const roleLabel = role === 'VIEWER' ? 'view' : 'view and edit';
  const safeTrip = escapeHtml(tripName);
  const safeInviter = escapeHtml(inviterEmail);
  const button = APP_URL
    ? `<p style="margin:24px 0"><a href="${APP_URL}" style="background:#0e7490;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open Travel Planner</a></p>`
    : '';
  return sendEmail({
    to,
    subject: `${inviterEmail} invited you to plan "${tripName}"`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="color:#0e7490">You're invited to a trip ✈️</h2>
        <p><strong>${safeInviter}</strong> invited you to ${roleLabel} the trip
        <strong>"${safeTrip}"</strong> on Travel Planner.</p>
        ${button}
        <p style="color:#475569;font-size:14px">Sign in${APP_URL ? ` at ${escapeHtml(link)}` : ''} with this
        email address (${escapeHtml(to)}) and the trip will appear automatically.
        If you don't have an account yet, sign up with this email and your invite
        will be waiting after approval.</p>
      </div>`,
  });
}

module.exports = { sendTripInvite, emailConfigured };
