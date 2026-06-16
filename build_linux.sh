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

echo "Downloading DreamShaper 8 and ControlNet models..."
python3 -c "
import os
try:
    from diffusers import StableDiffusionPipeline, ControlNetModel
    
    def download_pipe(model_id, is_controlnet=False):
        model_dir_name = 'models--' + model_id.replace('/', '--')
        model_path = os.path.join('models', model_dir_name)
        if os.path.exists(model_path):
            print(f'Skipping {model_id} (already locally cached in {model_path})...')
            return
            
        print(f'Downloading {model_id}...')
        if is_controlnet:
            ControlNetModel.from_pretrained(model_id, cache_dir='models')
        else:
            StableDiffusionPipeline.from_pretrained(model_id, safety_checker=None, requires_safety_checker=False, cache_dir='models')

    download_pipe('Lykon/dreamshaper-8')
    download_pipe('lllyasviel/sd-controlnet-scribble', True)
    download_pipe('lllyasviel/sd-controlnet-canny', True)
    download_pipe('lllyasviel/control_v11p_sd15_lineart', True)
    download_pipe('lllyasviel/control_v11p_sd15_softedge', True)
    download_pipe('SG161222/Realistic_Vision_V5.1_noVAE')
    download_pipe('stablediffusionapi/disney-pixar-cartoon')
    download_pipe('prompthero/openjourney')
    
    print('Downloading Annotator neural networks...')
    try:
        from controlnet_aux import LineartDetector, HEDdetector
        LineartDetector.from_pretrained('lllyasviel/Annotators')
        HEDdetector.from_pretrained('lllyasviel/Annotators')
    except ImportError:
        print('controlnet_aux not installed yet, skipping annotator pre-download.')
    
    print('All local models downloaded and verified successfully!')
except Exception as e:
    print('[ERROR] Model download failed:', e)
    exit(1)
"

deactivate
echo
echo "==================================================="
echo "Setup Success! Environment, Config and Models are ready."
echo "==================================================="
