// Slot/Idea `data` columns hold JSON serialized as text. A single corrupt row
// must degrade to an empty object rather than 500 every endpoint that touches
// the trip, so all reads go through this instead of bare JSON.parse.
function safeParseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { safeParseJson };
