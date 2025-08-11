#!/bin/bash

echo " > Setting up GHL Multi-Location System..."

# Create directory structure
mkdir -p logs
mkdir -p database

# Install dependencies
echo " > Installing dependencies..."
npm install

# Setup environment
if [ ! -f .env ]; then
    echo " > Creating .env file..."
    cp .env.example .env || touch .env
    echo " > Please update .env file with your actual credentials"
fi

# Initialize database
echo " > Setting up database..."
npm run migrate 2>/dev/null || echo " > Migration not needed"
npm run db:init
npm run db:verify

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your .env file with real credentials"
echo "2. Run 'npm run dev' to start development server"
echo "3. Test webhook endpoint at http://localhost:3000/api/webhooks/test"
