#!/bin/bash

# Deploy to Vercel Production Script
echo "🚀 Deploying Educational Platform to Vercel"
echo "=========================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Check if user is logged in
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "Please login to Vercel:"
    vercel login
fi

echo ""
echo "🏗️  Pre-deployment checks..."

# Check if build works
echo "Testing build..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Please fix build errors before deploying."
    exit 1
fi

echo ""
echo "🚀 Deploying to Vercel..."

# Deploy to Vercel
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Configure your production Supabase project"
echo "2. Set environment variables in Vercel dashboard"
echo "3. Update Supabase Auth settings with your Vercel URL"
echo "4. Test your production deployment"
echo ""
echo "🔧 To set environment variables:"
echo "   vercel env add NEXT_PUBLIC_SUPABASE_URL"
echo "   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   vercel env add SUPABASE_SERVICE_ROLE_KEY"
echo "   vercel env add NEXT_PUBLIC_APP_URL"
echo ""
echo "🌐 Your app will be available at: https://your-app-name.vercel.app"