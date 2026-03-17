#!/bin/bash
# setup.sh - Automated setup script for Delivery Label Generator
# Run this script to set up everything automatically

echo "
╔════════════════════════════════════════════════════════════╗
║      Delivery Label Generator - Automated Setup           ║
╚════════════════════════════════════════════════════════════╝
"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo ""
    echo "Please install Node.js first:"
    echo "  → Download from: https://nodejs.org/"
    echo "  → Choose LTS version (18.x or higher)"
    echo ""
    exit 1
fi

echo "✓ Node.js detected: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✓ npm detected: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Installation failed"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env configuration file..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file with your Zoho credentials"
    echo ""
    echo "Required values:"
    echo "  - ZOHO_ORGANIZATION_ID (from Zoho Books settings)"
    echo "  - ZOHO_ACCESS_TOKEN (from https://api-console.zoho.com/)"
    echo ""
else
    echo "✓ .env file already exists"
    echo ""
fi

# Create output directory
if [ ! -d output ]; then
    mkdir output
    echo "✓ Created output directory"
else
    echo "✓ Output directory exists"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Edit .env file with your Zoho credentials:"
echo "   → nano .env   (or any text editor)"
echo ""
echo "2. Test Zoho connection:"
echo "   → npm run verify"
echo ""
echo "3. Generate test labels:"
echo "   → npm run test-labels"
echo ""
echo "4. Start the server:"
echo "   → npm start"
echo ""
echo "5. Open browser:"
echo "   → http://localhost:3000"
echo ""
echo "📚 Need help? See QUICK-START.md"
echo ""
