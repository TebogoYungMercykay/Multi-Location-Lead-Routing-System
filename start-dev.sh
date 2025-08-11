#!/bin/bash

echo " > Starting GHL system in development mode..."

# Check if .env exists
if [ ! -f .env ]; then
    echo " > .env file not found. Run setup.sh first."
    exit 1
fi

# Ensure logs directory exists
mkdir -p logs

# Start development server with nodemon
echo " > Starting server on port ${PORT:-3000}..."
npm run dev
