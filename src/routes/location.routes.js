const express = require('express');
const { Location, Lead } = require('../database/models');
const routingService = require('../services/routing.service');

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

router.post('/assign_lead', async (req, res) => {
  try {
    const leadData = req.body;
    
    if (!leadData.zip_code) {
      return res.status(400).json({
        success: false,
        error: 'zip_code is required'
      });
    }
    
    const requiredFields = ['zip_code', 'source', 'ghl_contact_id'];
    const missingFields = requiredFields.filter(field => !leadData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    const result = await routingService.assignLead(leadData);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/assign_leads', async (req, res) => {
  try {
    const leads = req.body.leads;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Leads array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const [index, lead] of leads.entries()) {
      try {
        const requiredFields = ['zip_code', 'source', 'ghl_contact_id'];
        const missingFields = requiredFields.filter(field => !lead[field]);
        
        if (missingFields.length > 0) {
          errors.push({
            index,
            lead: `${lead.first_name || 'Unknown'} ${lead.last_name || 'Lead'}`,
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          continue;
        }

        const leadData = {
          zip_code: lead.zip_code,
          source: lead.source,
          ghlContactId: lead.ghl_contact_id,
          
          leadScore: lead.lead_score || 50,
          firstName: lead.first_name || '',
          lastName: lead.last_name || '',
          email: lead.email || '',
          phone: lead.phone || '',
          
          utmSource: lead.utm_source || lead.source,
          utmCampaign: lead.utm_campaign || '',
          utmMedium: lead.utm_medium || '',
          
          metadata: lead.metadata || {}
        };

        const result = await routingService.assignLead(leadData);

        results.push({
          index,
          lead: `${lead.first_name || 'Unknown'} ${lead.last_name || 'Lead'}`,
          leadId: result.assignment?.leadId,
          status: 'assigned',
          locationId: result.locationId,
          locationName: result.locationName,
          reason: result.reason,
          distance: result.distance,
          result
        });

      } catch (err) {
        errors.push({
          index,
          lead: `${lead.first_name || 'Unknown'} ${lead.last_name || 'Lead'}`,
          status: 'failed',
          error: err.message
        });
      }
    }

    const totalLeads = leads.length;
    const successfulAssignments = results.length;
    const failedAssignments = errors.length;

    const response = {
      success: true,
      summary: {
        total: totalLeads,
        successful: successfulAssignments,
        failed: failedAssignments,
        successRate: totalLeads > 0 ? ((successfulAssignments / totalLeads) * 100).toFixed(2) + '%' : '0%'
      },
      assignments: results
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.success = failedAssignments === 0;
    }

    console.log(`Lead assignment batch completed: ${successfulAssignments}/${totalLeads} successful`);

    res.json(response);

  } catch (error) {
    console.error('Batch lead assignment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'batch_processing_error'
    });
  }
});


module.exports = router;
