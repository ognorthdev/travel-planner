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
  reorder: (dayId, slotIds) => api.put(`/days/${dayId}/slots/reorder`, { slotIds })
};

// AI
export const aiApi = {
  suggestMeal: (data) => api.post('/ai/suggest-meal', data),
  suggestActivity: (data) => api.post('/ai/suggest-activity', data),
  searchHotel: (data) => api.post('/ai/search-hotel', data),
  discover: (data) => api.post('/ai/discover', data, { timeout: 120000 }),
};

export const placesApi = {
  autocomplete: (input, locationBias) => api.post('/places/autocomplete', { input, locationBias }),
  getPhotos: (name, address, placeId) => api.get('/places/photos', { params: { name, address, placeId } }),
};

export const locationsApi = {
  getByTrip: (tripId) => api.get(`/trips/${tripId}/locations`)
};

export default api;
