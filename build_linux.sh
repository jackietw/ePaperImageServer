#!/bin/bash

set -e

echo "==================================================="
echo "[1/3] Compiling Linux Version XNNPACK..."
echo "==================================================="

cd XNNPACK
mkdir -p build
cd build

# Setting and compiling XNNPACK
cmake -DXNNPACK_BUILD_TESTS=OFF -DXNNPACK_BUILD_BENCHMARKS=OFF -DXNNPACK_LIBRARY_TYPE=static -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)

cd ../..

echo "==================================================="
echo "[2/3] Compiling Linux Version OnnxStream..."
echo "==================================================="

cd OnnxStream/src
mkdir -p build
cd build

# Setting and compiling OnnxStream, linking to XNNPACK
cmake -DMAX_SPEED=ON -DOS_LLM=OFF -DOS_CUDA=OFF -DXNNPACK_DIR=../../XNNPACK ..
make -j$(nproc)

cd ../../..

echo "==================================================="
echo "[3/3] Copying compiled executable to project root..."
echo "==================================================="

cp OnnxStream/src/build/sd .

echo ""
echo "==================================================="
echo "[4/4] Checking and Downloading AI Models..."
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
echo "Build Success! sd and models are ready."
echo "==================================================="
