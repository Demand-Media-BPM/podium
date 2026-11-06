import api from './api.js';
export const listUsers = async ({page = 1, limit = 10} = {}) => (await api.get('/users', {params: {page, limit}})).data;
export const createUser = async values => (await api.post('/users', values)).data.user;
export const updateUser = async (id, values) => (await api.patch('/users/' + encodeURIComponent(id), values)).data.user;
