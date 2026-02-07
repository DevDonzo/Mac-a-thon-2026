#!/bin/bash

# CodeSensei Setup Script
# Run with: ./setup.sh

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║               CodeSensei Setup Script                     ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Found: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check gcloud
echo ""
echo "☁️  Checking Google Cloud CLI..."
if ! command -v gcloud &> /dev/null; then
    echo "⚠️  gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    echo "   You can still proceed, but will need to set up credentials manually."
else
    echo "✅ gcloud CLI found"
    
    # Check if logged in
    if gcloud auth list 2>&1 | grep -q "No credentialed accounts"; then
        echo "⚠️  Not logged in to gcloud. Run: gcloud auth login"
    else
        ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
        echo "   Active account: $ACTIVE_ACCOUNT"
    fi
fi

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Install extension dependencies
echo ""
echo "📦 Installing extension dependencies..."
cd vscode-extension
npm install
cd ..

# Check for .env file
echo ""
echo "🔧 Checking configuration..."
if [ ! -f backend/.env ]; then
    echo "Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env and set your GCP_PROJECT_ID"
else
    echo "✅ backend/.env exists"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure Google Cloud:"
echo "   gcloud auth application-default login"
echo "   gcloud services enable aiplatform.googleapis.com"
echo ""
echo "2. Edit backend/.env with your GCP_PROJECT_ID"
echo ""
echo "3. Start the backend:"
echo "   cd backend && npm start"
echo ""
echo "4. Load the VS Code extension:"
echo "   - Open vscode-extension/ in VS Code"
echo "   - Press F5 to launch"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
