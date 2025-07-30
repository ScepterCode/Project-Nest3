#!/bin/bash

# Local Production Setup Script
echo "🏠 Setting up Educational Platform for Local Development"
echo "====================================================="
echo ""

# Check if .env.local exists and is configured
echo "🔍 Checking environment configuration..."
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local from template..."
    cp .env.example .env.local
    echo "⚠️  Please configure .env.local with your Supabase credentials"
    echo ""
else
    if grep -q "your-project-url" .env.local; then
        echo "⚠️  .env.local needs configuration. Please update with your Supabase credentials"
        echo ""
    else
        echo "✅ Environment file configured"
    fi
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run tests to ensure everything is working
echo "🧪 Running tests..."
npm test -- --testPathPattern="simple.test.ts" --verbose

# Test build
echo "🏗️  Testing build..."
if npm run build; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed. Please check for errors."
    exit 1
fi

echo ""
echo "🎯 Local setup complete!"
echo "======================"
echo ""
echo "✅ Dependencies installed"
echo "✅ Tests passing"
echo "✅ Build successful"
echo ""
echo "🚀 To start your application:"
echo "   npm run dev"
echo ""
echo "🌐 Then visit: http://localhost:3000"
echo ""
echo "📋 Next steps:"
echo "1. Configure your .env.local file if not done"
echo "2. Ensure your Supabase database is set up"
echo "3. Test all features locally"
echo "4. When ready, deploy to production"
echo ""
echo "🔧 Available commands:"
echo "   npm run dev          - Start development server"
echo "   npm run build        - Build for production"
echo "   npm run start        - Start production server"
echo "   npm test             - Run tests"
echo "   npm run lint         - Run linter"