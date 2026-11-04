const { assertDbReady } = require('../config/db');
const service = require('../services/requestService');
const {
  validateCreateInput,
  validateUpdateInput,
  parsePagination,
} = require('../services/requestValidation');

// All handlers run behind requireAuth, so req.user is always set.

const create = async (req, res) => {
  const data = validateCreateInput(req.body);
  assertDbReady();
  const { request, url } = await service.createRequest(req.user, data);
  // `url` contains the secret token and is shown once; it cannot be retrieved again.
  res.status(201).json({ success: true, request, url });
};

const list = async (req, res) => {
  const pagination = parsePagination(req.query);
  assertDbReady();
  const result = await service.listRequests(req.user, pagination);
  res.status(200).json({ success: true, ...result });
};

const summary = async (req, res) => {
  assertDbReady();
  const stats = await service.getSummary(req.user);
  res.status(200).json({ success: true, summary: stats });
};

const getOne = async (req, res) => {
  assertDbReady();
  const request = await service.getRequest(req.user, req.params.id);
  res.status(200).json({ success: true, request });
};

const update = async (req, res) => {
  const changes = validateUpdateInput(req.body);
  assertDbReady();
  const request = await service.updateRequest(req.user, req.params.id, changes);
  res.status(200).json({ success: true, request });
};

const regenerateLink = async (req, res) => {
  assertDbReady();
  const { request, url } = await service.regenerateLink(req.user, req.params.id);
  res.status(200).json({ success: true, request, url });
};

module.exports = { create, list, summary, getOne, update, regenerateLink };
