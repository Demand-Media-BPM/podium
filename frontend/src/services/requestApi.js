import api from './api.js';

// Employee endpoints (cookie authentication).
export const createRequest = async (payload) => (await api.post('/requests', payload)).data;

export const listRequests = async ({ page = 1, limit = 10 } = {}) =>
  (await api.get('/requests', { params: { page, limit } })).data;

export const getRequestSummary = async () => (await api.get('/requests/summary')).data.summary;

export const getRequest = async (id) => (await api.get(`/requests/${encodeURIComponent(id)}`)).data.request;

export const updateRequest = async (id, payload) =>
  (await api.patch(`/requests/${encodeURIComponent(id)}`, payload)).data.request;

// Returns { request, url }. The url holds the new secret token and is only available in this response.
export const regenerateRequestLink = async (id) =>
  (await api.post(`/requests/${encodeURIComponent(id)}/regenerate-link`)).data;

// Public endpoint for clients (no login required).
export const getPublicRequest = async (token) =>
  (await api.get(`/public/${encodeURIComponent(token)}`)).data.request;
