#!/bin/bash
set -e

# 1. Check if virtual environment exists, if not, create it
if [ ! -f "venv/bin/activate" ]; then
    echo "Creating Python virtual environment..."
    rm -rf venv
    if ! python3 -m venv venv; then
        echo "==================================================="
        echo "[ERROR] Failed to create virtual environment."
        echo "This is often because 'python3-venv' is not installed."
        echo "On Ubuntu/Debian, please run:"
        echo "  sudo apt-get update"
        echo "  sudo apt-get install -y python3-venv python3-pip"
        echo "==================================================="
        exit 1
    fi
fi

# 2. Activate virtual environment
source venv/bin/activate

# 3. Install/upgrade dependencies
echo "Installing/updating Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 4. Start the FastAPI server
echo "Starting FastAPI server..."
uvicorn main:app --host 0.0.0.0 --port 8000
