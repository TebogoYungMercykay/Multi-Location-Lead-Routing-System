// src/routes/location.routes.js
const express = require('express');
const { Location, Lead } = require('../database/models');
const routingService = require('../routing/routing.service');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const locations = await Location.query().where('active', true);
    res.json({ success: true, locations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/leads', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await Lead.query()
      .where('assigned_location_id', id)
      .orderBy('created_at', 'desc')
      .limit(100);
    
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:leadId/reassign', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { newLocationId, reason } = req.body;
    
    const result = await routingService.reassignLead(leadId, newLocationId, reason);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
