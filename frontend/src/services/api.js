import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
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
  schedule: (meeting, slot) => api.post('/meetings/schedule', { meeting, slot }),
  list: () => api.get('/meetings'),
};

export const AuthAPI = {
  getGoogleAuthUrl: () => api.get('/auth/google'),
  getStatus: () => api.get('/auth/status'),
};

export const HealthAPI = {
  check: () => api.get('/health'),
};

export default api;
