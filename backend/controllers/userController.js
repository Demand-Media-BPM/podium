const service = require('../services/adminUserService');
const { parsePagination } = require('../services/requestValidation');
const { assertDbReady } = require('../config/db');

const list = async (req, res) => {
  assertDbReady();
  const result = await service.listUsers(parsePagination(req.query));
  res.json({success: true, ...result});
};
const create = async (req, res) => {
  assertDbReady();
  const user = await service.addUser(req.body);
  res.status(201).json({success: true, user});
};
const update = async (req, res) => {
  assertDbReady();
  const user = await service.updateUser(req.user, req.params.id, req.body);
  res.json({success: true, user});
};
module.exports = {list, create, update};
