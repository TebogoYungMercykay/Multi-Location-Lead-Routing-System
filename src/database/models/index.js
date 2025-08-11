// src/database/models/index.js
const { Model } = require('objection');
const knex = require('../connection').knex;

// Bind all models to the knex instance
Model.knex(knex);

// Base Model with common functionality
class BaseModel extends Model {
  $beforeInsert() {
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
}

// Location Model
class Location extends BaseModel {
  static get tableName() {
    return 'locations';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'address', 'latitude', 'longitude'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        address: { type: 'string', minLength: 1 },
        city: { type: 'string' },
        state: { type: 'string' },
        zip_code: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        phone: { type: 'string' },
        email: { type: 'string', format: 'email' },
        active: { type: 'boolean', default: true },
        ghl_location_id: { type: 'string' },
        ghl_pipeline_id: { type: 'string' },
        ghl_initial_stage_id: { type: 'string' },
        ghl_automation_id: { type: 'string' },
        facebook_performance_score: { type: 'number', default: 0 },
        google_performance_score: { type: 'number', default: 0 },
        website_performance_score: { type: 'number', default: 0 },
        max_daily_capacity: { type: 'integer', default: 100 },
        timezone: { type: 'string', default: 'America/New_York' }
      }
    };
  }

  static get relationMappings() {
    return {
      leads: {
        relation: Model.HasManyRelation,
        modelClass: Lead,
        join: {
          from: 'locations.id',
          to: 'leads.assigned_location_id'
        }
      },
      capacity: {
        relation: Model.HasManyRelation,
        modelClass: LocationCapacity,
        join: {
          from: 'locations.id',
          to: 'location_capacity.location_id'
        }
      }
    };
  }
}

// Lead Model
class Lead extends BaseModel {
  static get tableName() {
    return 'leads';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['email', 'source'],
      properties: {
        id: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        zip_code: { type: 'string' },
        source: { type: 'string' },
        utm_source: { type: 'string' },
        utm_campaign: { type: 'string' },
        utm_medium: { type: 'string' },
        assigned_location_id: { type: 'string' },
        backup_location_id: { type: 'string' },
        ghl_contact_id: { type: 'string' },
        lead_score: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        status: { 
          type: 'string',
          enum: ['new', 'assigned', 'contacted', 'qualified', 'converted', 'lost'],
          default: 'new'
        },
        metadata: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    return {
      assignedLocation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Location,
        join: {
          from: 'leads.assigned_location_id',
          to: 'locations.id'
        }
      },
      routingLogs: {
        relation: Model.HasManyRelation,
        modelClass: LeadRoutingLog,
        join: {
          from: 'leads.id',
          to: 'lead_routing_logs.lead_id'
        }
      }
    };
  }
}

// Lead Routing Log Model
class LeadRoutingLog extends BaseModel {
  static get tableName() {
    return 'lead_routing_logs';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['lead_id', 'assigned_location_id', 'routing_reason'],
      properties: {
        id: { type: 'string' },
        lead_id: { type: 'string' },
        original_location_id: { type: 'string' },
        assigned_location_id: { type: 'string' },
        routing_reason: { 
          type: 'string',
          enum: ['optimal_match', 'no_capacity_overflow', 'fallback_routing', 'manual_reassignment']
        },
        routing_data: { type: 'object' }
      }
    };
  }

  static get relationMappings() {
    return {
      lead: {
        relation: Model.BelongsToOneRelation,
        modelClass: Lead,
        join: {
          from: 'lead_routing_logs.lead_id',
          to: 'leads.id'
        }
      },
      location: {
        relation: Model.BelongsToOneRelation,
        modelClass: Location,
        join: {
          from: 'lead_routing_logs.assigned_location_id',
          to: 'locations.id'
        }
      }
    };
  }
}

// Location Capacity Model
class LocationCapacity extends BaseModel {
  static get tableName() {
    return 'location_capacity';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['location_id', 'capacity_date'],
      properties: {
        id: { type: 'string' },
        location_id: { type: 'string' },
        capacity_date: { type: 'string', format: 'date' },
        current_leads: { type: 'integer', default: 0 },
        max_capacity: { type: 'integer', default: 100 },
        utilization_rate: { type: 'number', default: 0 }
      }
    };
  }

  static get relationMappings() {
    return {
      location: {
        relation: Model.BelongsToOneRelation,
        modelClass: Location,
        join: {
          from: 'location_capacity.location_id',
          to: 'locations.id'
        }
      }
    };
  }
}

// Analytics Event Model
class AnalyticsEvent extends BaseModel {
  static get tableName() {
    return 'analytics_events';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['event_type', 'location_id'],
      properties: {
        id: { type: 'string' },
        event_type: { 
          type: 'string',
          enum: ['lead_created', 'lead_routed', 'stage_progression', 'conversion', 'appointment']
        },
        contact_id: { type: 'string' },
        location_id: { type: 'string' },
        event_data: { type: 'object' },
        timestamp: { type: 'string', format: 'date-time' }
      }
    };
  }
}

// Webhook Event Log Model
class WebhookEventLog extends BaseModel {
  static get tableName() {
    return 'webhook_event_logs';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['webhook_id', 'event_type', 'status'],
      properties: {
        id: { type: 'string' },
        webhook_id: { type: 'string' },
        event_type: { type: 'string' },
        payload: { type: 'object' },
        result: { type: 'object' },
        processing_time: { type: 'integer' },
        status: { 
          type: 'string',
          enum: ['success', 'failed', 'pending']
        },
        error_message: { type: 'string' }
      }
    };
  }
}

module.exports = {
  BaseModel,
  Location,
  Lead,
  LeadRoutingLog,
  LocationCapacity,
  AnalyticsEvent,
  WebhookEventLog
};
