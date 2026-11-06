const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/userController');

function createUserRoutes() {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(requireAuth, requireRole('admin'));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  return router;
}
module.exports = createUserRoutes;
