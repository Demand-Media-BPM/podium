import api from './api.js';

export const loginRequest = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data.user;
};

export const getCurrentUser = async () => {
  const { data } = await api.get('/auth/me');
  return data.user;
};

export const logoutRequest = async () => {
  await api.post('/auth/logout');
};
