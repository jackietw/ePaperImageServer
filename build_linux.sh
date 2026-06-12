#!/bin/bash
set -e

echo "==================================================="
echo "[1/3] Setting up Python Virtual Environment & Dependencies..."
echo "==================================================="

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 is not installed or not in PATH!"
    exit 1
fi

# Create Python virtual environment if not exists
if [ ! -f "venv/bin/activate" ]; then
    echo "Creating Python virtual environment..."
    rm -rf venv
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
echo "Installing/updating Python dependencies..."
python3 -m pip install --upgrade pip
pip install -r requirements.txt

echo
echo "==================================================="
echo "[2/3] Configuring Hugging Face API Token..."
echo "==================================================="

read -p "Enter your Hugging Face API Token (free at huggingface.co, press Enter to skip): " HF_TOKEN
if [ ! -z "$HF_TOKEN" ]; then
    echo "Writing config.json..."
    cat << EOF > config.json
{
  "hf_token": "$HF_TOKEN"
}
EOF
    echo "Token saved successfully!"
else
    if [ ! -f "config.json" ]; then
        echo "Creating default config.json..."
        cat << EOF > config.json
{
  "hf_token": ""
}
EOF
    else
        echo "Keeping existing config.json."
    fi
fi

echo
echo "==================================================="
echo "[3/3] Pre-downloading Local PyTorch Models (for Scribble)..."
echo "==================================================="

echo "Downloading DreamShaper 8 and ControlNet Scribble models..."
python3 -c "
try:
    from diffusers import StableDiffusionPipeline, ControlNetModel
    print('Downloading DreamShaper 8 model...')
    StableDiffusionPipeline.from_pretrained('Lykon/dreamshaper-8', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading ControlNet Scribble model...')
    ControlNetModel.from_pretrained('lllyasviel/sd-controlnet-scribble', cache_dir='models')
    print('All local models downloaded successfully!')
except Exception as e:
    print('[ERROR] Model download failed:', e)
    exit(1)
"

deactivate
echo
echo "==================================================="
echo "Setup Success! Environment, Config and Models are ready."
echo "==================================================="
