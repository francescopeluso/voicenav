#!/bin/bash
set -e

echo "=== VoiceNav Setup ==="
echo ""

# Backend
echo "[1/4] Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -q
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  -> Created .env from template. Add your API keys!"
fi
deactivate
cd ..

# Extension
echo "[2/4] Installing extension dependencies..."
cd extension
npm install --silent
echo "[3/4] Building extension..."
npm run build
cd ..

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Add API keys to backend/.env"
echo "  2. Start backend:  cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "  3. Load extension:  Chrome -> chrome://extensions -> Load unpacked -> extension/dist"
echo "  4. Click the VoiceNav icon and start talking!"
echo ""
