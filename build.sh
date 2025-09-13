#!/bin/bash
# Build script for Render deployment

echo "Installing backend dependencies..."
npm install

echo "Installing frontend dependencies..."
cd client
npm install

echo "Building React app..."
npm run build

echo "Build completed successfully!"
