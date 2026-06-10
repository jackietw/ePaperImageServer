#!/bin/bash

set -e

if [ "$1" = "clean" ]; then
    echo "Cleaning build cache..."
    rm -rf XNNPACK/build
    rm -rf OnnxStream/src/build
    rm -f sd
    echo "Clean finished."
    exit 0
fi


# Check dependencies
dependencies=("git" "cmake" "make" "git-lfs")
missing_deps=()

for dep in "${dependencies[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
        missing_deps+=("$dep")
    fi
done

if [ ${#missing_deps[@]} -ne 0 ]; then
    echo "==================================================="
    echo "[ERROR] Missing required dependencies:"
    for dep in "${missing_deps[@]}"; do
        echo "  - $dep"
    done
    echo "==================================================="
    echo "Please install them before running this script."
    echo "On Ubuntu/Debian, you can install them with:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y build-essential cmake git git-lfs"
    echo "==================================================="
    exit 1
fi

echo "==================================================="
echo "[1/6] Initializing Submodules..."
echo "==================================================="

git submodule update --init --recursive

echo "==================================================="
echo "[2/6] Compiling Linux Version XNNPACK..."
echo "==================================================="

cd XNNPACK
git checkout 5671db0572e2d5240f2f08f9085174014742ac2d
mkdir -p build
cd build

# Setting and compiling XNNPACK
cmake -DXNNPACK_BUILD_TESTS=OFF -DXNNPACK_BUILD_BENCHMARKS=OFF -DXNNPACK_LIBRARY_TYPE=static -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)

cd ../..

echo "==================================================="
echo "[3/6] Compiling Linux Version OnnxStream..."
echo "==================================================="

cd OnnxStream/src
mkdir -p build
cd build

# Setting and compiling OnnxStream, linking to XNNPACK
cmake -DMAX_SPEED=ON -DOS_LLM=OFF -DOS_CUDA=OFF -DXNNPACK_DIR=../../../XNNPACK ..
make -j$(nproc)

cd ../../..

echo "==================================================="
echo "[4/6] Copying compiled executable to project root..."
echo "==================================================="

cp OnnxStream/src/build/sd .

echo ""
echo "==================================================="
echo "[5/6] Checking and Downloading SDXL Turbo Model..."
echo "==================================================="

mkdir -p models
cd models
if [ ! -d "stable-diffusion-xl-turbo-1.0-anyshape-onnxstream" ]; then
    echo "Model not found. Cloning Stable Diffusion XL Turbo model (~8GB)..."
    echo "(Note: This requires Git LFS installed on your system)"
    git lfs install
    git clone --depth=1 https://huggingface.co/vitoplantamura/stable-diffusion-xl-turbo-1.0-anyshape-onnxstream
else
    echo "Stable Diffusion XL Turbo model already exists."
fi
cd ..

echo ""
echo "==================================================="
echo "[6/6] Setting up Python Environment & PyTorch Models..."
echo "==================================================="

# 1. Create Python virtual environment if not exists
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

# 2. Activate virtual environment and install dependencies
source venv/bin/activate
echo "Installing/updating Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 3. Pre-download SD 1.5 and ControlNet Scribble models
echo "Pre-downloading PyTorch models (SD 1.5 & ControlNet Scribble)..."
python3 -c "
try:
    from diffusers import StableDiffusionPipeline, ControlNetModel
    print('Downloading SD 1.5 base model...')
    StableDiffusionPipeline.from_pretrained('runwayml/stable-diffusion-v1-5', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading ControlNet Scribble model...')
    ControlNetModel.from_pretrained('lllyasviel/sd-controlnet-scribble', cache_dir='models')
    print('All PyTorch models downloaded successfully!')
except Exception as e:
    print('[ERROR] Model download failed:', e)
    exit(1)
"
deactivate

echo ""
echo "==================================================="
echo "Build Success! All C++ and PyTorch models are ready."
echo "==================================================="
