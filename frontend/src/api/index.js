import axios from 'axios';
import { supabase } from '../lib/supabase';

// In dev this is '' (Vite proxies /api to the backend). In prod set
// VITE_API_URL to the deployed backend origin (e.g. https://...onrender.com).
export const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Request interceptor — attach the current Supabase access token.
api.interceptors.request.use(
  async (config) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// Trips
export const tripsApi = {
  getAll: () => api.get('/trips'),
  getById: (id) => api.get(`/trips/${id}`),
  create: (data) => api.post('/trips', data),
  update: (id, data) => api.put(`/trips/${id}`, data),
  delete: (id) => api.delete(`/trips/${id}`),
  enableShare: (id) => api.post(`/trips/${id}/share`),
  disableShare: (id) => api.delete(`/trips/${id}/share`),
};

// Public share-link view (no auth header needed)
export const publicApi = {
  getSharedTrip: async (token) => {
    const resp = await fetch(`${API_BASE}/api/public/trips/${encodeURIComponent(token)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'This link is no longer available');
    return data;
  },
};

// Trip collaborators (sharing)
export const membersApi = {
  list: (tripId) => api.get(`/trips/${tripId}/members`),
  invite: (tripId, email, role) => api.post(`/trips/${tripId}/members`, { email, role }),
  remove: (tripId, memberId) => api.delete(`/trips/${tripId}/members/${memberId}`),
};

// Current user's account status + preferences
export const meApi = {
  get: () => api.get('/me'),
  update: (data) => api.put('/me', data),
};

// Admin (approve users)
export const adminApi = {
  listUsers: () => api.get('/admin/users'),
  approve: (userId) => api.post(`/admin/users/${userId}/approve`),
  revoke: (userId) => api.post(`/admin/users/${userId}/revoke`),
};

// Days
export const daysApi = {
  getByTrip: (tripId) => api.get(`/trips/${tripId}/days`),
  create: (tripId, data) => api.post(`/trips/${tripId}/days`, data),
  delete: (id) => api.delete(`/days/${id}`),
  travelTimes: (dayId, force) => api.post(`/days/${dayId}/travel-times`, { force: !!force }, { timeout: 120000 }).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
};

// Slots
export const slotsApi = {
  getByDay: (dayId) => api.get(`/days/${dayId}/slots`),
  getById: (id) => api.get(`/slots/${id}`),
  create: (dayId, data) => api.post(`/days/${dayId}/slots`, data),
  update: (id, data) => api.put(`/slots/${id}`, data),
  delete: (id) => api.delete(`/slots/${id}`),
  reorder: (dayId, slotIds) => api.put(`/days/${dayId}/slots/reorder`, { slotIds }),
  move: (slotId, targetDayId, position) => api.put(`/slots/${slotId}/move`, { targetDayId, position }),
  enrich: (slotId, force) => api.post(`/slots/${slotId}/enrich`, { force: !!force }).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
};

// AI
export const aiApi = {
  discover: (data) => api.post('/ai/discover', data, { timeout: 120000 }).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
};

export const placesApi = {
  autocomplete: (input, locationBias, tripId) => api.post('/places/autocomplete', { input, locationBias, tripId }),
  getPhotos: (name, address, placeId, tripId) => api.get('/places/photos', { params: { name, address, placeId, tripId } }),
  getDetails: (placeId, tripId) => api.get(`/places/details/${placeId}`, { params: { tripId } }),
  enrich: (name, address, tripId) => api.post('/places/enrich', { name, address, tripId }),
};

export const locationsApi = {
  getByTrip: (tripId) => api.get(`/trips/${tripId}/locations`)
};

export const researchApi = {
  getIdeas: (tripId) => api.get(`/research/${tripId}/ideas`),
  saveIdea: (tripId, data) => api.post(`/research/${tripId}/ideas`, data),
  deleteIdea: (id) => api.delete(`/research/ideas/${id}`),
  enrichIdea: (id) => api.post(`/research/ideas/${id}/enrich`, {}).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
  reorderIdeas: (tripId, ids) => api.put(`/research/${tripId}/ideas/reorder`, { ideaIds: ids }),
  getSummary: (tripId) => api.get(`/research/${tripId}/summary`),
  saveSummary: (tripId, summary) => api.put(`/research/${tripId}/summary`, { summary }),
  getMessages: (tripId) => api.get(`/research/${tripId}/messages`),
  saveMessages: (tripId, messages) => api.post(`/research/${tripId}/messages`, { messages }),
  clearMessages: (tripId) => api.delete(`/research/${tripId}/messages`),
  extract: (tripId, text, destination) => api.post(`/research/${tripId}/extract`, { text, destination }, { timeout: 120000 }).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
};

export const costsApi = {
  getByTrip: (tripId) => api.get(`/costs/${tripId}/costs`),
};

export async function* streamResearch(tripId, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Keep the AbortSignal out of the JSON payload — it's fetch plumbing.
  const { signal, ...payload } = body;
  const response = await fetch(`${API_BASE}/api/research/${tripId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Stream request failed' }));
    throw new Error(err.error || 'Stream request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'done') {
            window.dispatchEvent(new CustomEvent('cost-updated'));
          }
          yield { event: currentEvent, data };
        } catch {}
        currentEvent = null;
      } else if (line === '') {
        currentEvent = null;
      }
    }
  }
}

export default api;
