const express = require('express');
const analyticsService = require('../services/analytics.service');

const router = express.Router();

router.get('/locations/:locationId/stats', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { startDate, endDate } = req.query;
    
    const stats = await analyticsService.getLocationStats(locationId, {
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate || new Date()
    });
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
