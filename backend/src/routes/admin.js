const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/access');

// GET /api/admin/users - list all app users (pending first)
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.appUser.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // 'approved' > 'pending' alphabetically, so pending first
    });
    res.json(users.map((u) => ({
      userId: u.userId,
      email: u.email,
      status: u.status,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:userId/approve
router.post('/users/:userId/approve', async (req, res, next) => {
  try {
    const user = await prisma.appUser.findUnique({ where: { userId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.appUser.update({
      where: { userId: req.params.userId },
      data: { status: 'approved' },
    });
    res.json({ userId: updated.userId, status: updated.status });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:userId/revoke
router.post('/users/:userId/revoke', async (req, res, next) => {
  try {
    const user = await prisma.appUser.findUnique({ where: { userId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isAdmin) return res.status(400).json({ error: 'Cannot revoke an admin' });
    if (user.userId === req.user.id) return res.status(400).json({ error: 'You cannot revoke yourself' });
    const updated = await prisma.appUser.update({
      where: { userId: req.params.userId },
      data: { status: 'pending' },
    });
    res.json({ userId: updated.userId, status: updated.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
