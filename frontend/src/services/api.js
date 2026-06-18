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
    const error = new Error(message);
    error.code = err.response?.data?.code;
    error.status = err.response?.status;
    return Promise.reject(error);
  }
);

export const MeetingAPI = {
  extract: (notes) => api.post('/meetings/extract', { notes }),
  validate: (meeting, answers) => api.post('/meetings/validate', { meeting, answers }),
  getSlots: (date, duration) => api.get('/meetings/slots', { params: { date, duration } }),
  smartSuggest: (date, time, duration) =>
    api.get('/meetings/suggest', { params: { date, time, duration } }),
  getSummary: (meetings) => api.post('/meetings/summary', { meetings }),
  schedule: (meeting, slot) => api.post('/meetings/schedule', {
    meeting: { ...meeting, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    slot,
  }),
  list: () => api.get('/meetings'),
  getRecent: (days = 7) => api.get('/meetings/recent', { params: { days } }),
  cancel: (eventId) => api.delete(`/meetings/${encodeURIComponent(eventId)}`),
  reschedule: (eventId, date, startTime, endTime) =>
    api.patch(`/meetings/${encodeURIComponent(eventId)}/reschedule`, { date, startTime, endTime }),
};

export const AgendaAPI = {
  getToday: () => api.get('/agenda/today'),
  getForDate: (date) => api.get('/agenda/today', { params: { date } }),
};

export const AuthAPI = {
  getGoogleAuthUrl: () => api.get('/auth/google'),
  getMicrosoftAuthUrl: () => api.get('/auth/microsoft'),
  getProviders: () => api.get('/auth/providers'),
  getStatus: () => api.get('/auth/status'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const ZoomAuthAPI = {
  getAuthUrl: () => api.get('/auth/zoom'),
  getStatus: () => api.get('/auth/zoom/status'),
  disconnect: () => api.post('/auth/zoom/disconnect'),
};

export const TeamsAuthAPI = {
  getAuthUrl: () => api.get('/auth/teams'),
  getStatus: () => api.get('/auth/teams/status'),
  disconnect: () => api.post('/auth/teams/disconnect'),
};

export const OutlookCalAuthAPI = {
  getAuthUrl: () => api.get('/auth/outlook'),
  getStatus: () => api.get('/auth/outlook/status'),
  disconnect: () => api.post('/auth/outlook/disconnect'),
};

export const ContactAPI = {
  getContacts:     () => api.get('/contacts'),
  saveContacts:    (contacts) => api.post('/contacts', { contacts }),
  deleteContact:   (email) => api.delete(`/contacts/${encodeURIComponent(email)}`),
  searchGoogle:    (name) => api.get('/contacts/google-search',   { params: { name } }),
  searchCalendar:  (name) => api.get('/contacts/calendar-search', { params: { name } }),
};

export const IntegrationAPI = {
  getConnected: () => api.get('/integrations'),
  updatePreferences: (prefs) => api.patch('/user/preferences', prefs),
};

export const AdminAPI = {
  getProviders: () => api.get('/admin/providers'),
  updateProvider: (name, is_enabled) => api.patch(`/admin/providers/${encodeURIComponent(name)}`, { is_enabled }),
  updateConfig: (config) => api.patch('/admin/config', config),
};

export const HealthAPI = {
  check: () => api.get('/health'),
};

export default api;
