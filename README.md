# GHL Multi-Location Lead Routing System

A scalable lead routing and management system for multi-location businesses using GoHighLevel (GHL) webhooks.

## Features

- **Intelligent Lead Routing**: Automatically route leads to the closest available location
- **Capacity Management**: Track and manage location capacity in real-time
- **Performance Analytics**: Track conversion rates and performance across locations
- **Webhook Processing**: Handle GHL webhooks for real-time lead processing
- **Fallback Routing**: Graceful handling of capacity overflow and routing failures
- **Multi-source Support**: Handle leads from Facebook, Google, website, walk-ins, etc.

## Quick Start

1. **Setup Project**

   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

2. **Configure Environment**

   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

3. **Start Development**

   ```bash
   npm run dev
   ```

4. **Test Webhook**

   ```bash
   curl -X POST http://localhost:3000/api/webhooks/test \
     -H "Content-Type: application/json" \
     -d '{"type":"ContactCreate","location_id":"test","contact":{"firstName":"John","email":"test@example.com"}}'
   ```

## API Endpoints

- `POST /api/webhooks/ghl` - GHL webhook handler
- `GET /api/locations` - List all locations
- `GET /api/analytics/locations/:id/stats` - Location performance stats
- `POST /api/locations/:leadId/reassign` - Manually reassign lead
- `GET /health` - System health check

## Architecture

- **Webhook Controller**: Processes incoming GHL webhooks
- **Routing Service**: Intelligent lead assignment logic
- **Analytics Service**: Performance tracking and reporting
- **Database Models**: SQLite database with Objection.js ORM
- **GHL API Client**: OAuth2 integration with GoHighLevel

## Deployment

### Docker

```bash
docker build -t ghl-system .
docker run -p 3000:3000 --env-file .env ghl-system
```

### Docker Compose

```bash
docker-compose up -d
```

## Configuration

Key environment variables:

- `GHL_APP_CLIENT_ID` - Your GHL app client ID
- `GHL_APP_CLIENT_SECRET` - Your GHL app client secret
- `GHL_WEBHOOK_SECRET` - Webhook signature validation
- `GOOGLE_MAPS_API_KEY` - For geocoding zip codes
- `TWILIO_*` - For SMS notifications

## Testing

```bash
# Unit tests
npm test

# Manual webhook testing
npm run test-webhook

# Load testing
npm run load-test
```

## Scaling Considerations

- Use Redis for distributed rate limiting
- Implement horizontal scaling with load balancers
- Consider PostgreSQL for production database
- Add monitoring with Prometheus/Grafana
- Implement circuit breakers for external APIs

---
