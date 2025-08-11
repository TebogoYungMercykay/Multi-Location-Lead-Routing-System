const express = require('express');
const routingService = require('../services/routing.service');
const path = require('path');

const router = express.Router();

router.get('/routing-stats', async (req, res) => {
  try {
    const stats = await routingService.getRoutingStats(req.query);
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve dashboard HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/dashboard/index.html'));
});

module.exports = router;
