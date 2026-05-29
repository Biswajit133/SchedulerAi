import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export const MeetingAPI = {
  extract: (notes) => api.post('/meetings/extract', { notes }),
  validate: (meeting, answers) => api.post('/meetings/validate', { meeting, answers }),
  getSlots: (date, duration) => api.get('/meetings/slots', { params: { date, duration } }),
  smartSuggest: (date, time, duration) =>
    api.get('/meetings/suggest', { params: { date, time, duration } }),
  getSummary: (meetings) => api.post('/meetings/summary', { meetings }),
  schedule: (meeting, slot) => api.post('/meetings/schedule', { meeting, slot }),
  list: () => api.get('/meetings'),
};

export const AgendaAPI = {
  getToday: () => api.get('/agenda/today'),
  getForDate: (date) => api.get('/agenda/today', { params: { date } }),
};

export const AuthAPI = {
  getGoogleAuthUrl: () => api.get('/auth/google'),
  getStatus: () => api.get('/auth/status'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const ZoomAuthAPI = {
  getAuthUrl: () => api.get('/auth/zoom'),
  getStatus: () => api.get('/auth/zoom/status'),
  disconnect: () => api.post('/auth/zoom/disconnect'),
};

export const ContactAPI = {
  getContacts:   () => api.get('/contacts'),
  saveContacts:  (contacts) => api.post('/contacts', { contacts }),
  deleteContact: (email) => api.delete(`/contacts/${encodeURIComponent(email)}`),
};

export const HealthAPI = {
  check: () => api.get('/health'),
};

export default api;
