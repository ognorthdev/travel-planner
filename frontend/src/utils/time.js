// Time values are stored as 24h "HH:MM"; this renders them as 12h "H:MM AM/PM".
export function formatTime12(value) {
  if (!value || typeof value !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  if (Number.isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${match[2]} ${ampm}`;
}
