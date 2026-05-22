import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
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
  delete: (id) => api.delete(`/trips/${id}`)
};

// Days
export const daysApi = {
  getByTrip: (tripId) => api.get(`/trips/${tripId}/days`),
  create: (tripId, data) => api.post(`/trips/${tripId}/days`, data),
  delete: (id) => api.delete(`/days/${id}`)
};

// Slots
export const slotsApi = {
  getByDay: (dayId) => api.get(`/days/${dayId}/slots`),
  getById: (id) => api.get(`/slots/${id}`),
  create: (dayId, data) => api.post(`/days/${dayId}/slots`, data),
  update: (id, data) => api.put(`/slots/${id}`, data),
  delete: (id) => api.delete(`/slots/${id}`),
  reorder: (dayId, slotIds) => api.put(`/days/${dayId}/slots/reorder`, { slotIds }),
  move: (slotId, targetDayId, position) => api.put(`/slots/${slotId}/move`, { targetDayId, position })
};

// AI
export const aiApi = {
  suggestMeal: (data) => api.post('/ai/suggest-meal', data).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
  suggestActivity: (data) => api.post('/ai/suggest-activity', data).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
  searchHotel: (data) => api.post('/ai/search-hotel', data).then(r => { window.dispatchEvent(new CustomEvent('cost-updated')); return r; }),
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
  reorderIdeas: (tripId, ids) => api.put(`/research/${tripId}/ideas/reorder`, { ideaIds: ids }),
  getSummary: (tripId) => api.get(`/research/${tripId}/summary`),
  saveSummary: (tripId, summary) => api.put(`/research/${tripId}/summary`, { summary }),
};

export const costsApi = {
  getByTrip: (tripId) => api.get(`/costs/${tripId}/costs`),
};

export async function* streamResearch(tripId, body) {
  const response = await fetch(`/api/research/${tripId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: body.signal,
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
