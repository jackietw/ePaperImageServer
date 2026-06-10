@echo off
if "%1"=="clean" (
    echo Cleaning build cache...
    if exist XNNPACK\build rmdir /s /q XNNPACK\build
    if exist OnnxStream\src\build rmdir /s /q OnnxStream\src\build
    if exist sd.exe del /f /q sd.exe
    echo Clean finished.
    exit /b 0
)

where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] git is not installed or not in PATH!
    pause
    exit /b 1
)
where cmake >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] cmake is not installed or not in PATH!
    pause
    exit /b 1
)
where git-lfs >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] git-lfs is not installed or not in PATH!
    echo Please install Git LFS (https://git-lfs.github.com/) first.
    pause
    exit /b 1
)

echo ===================================================
echo [1/6] Initializing Submodules...
echo ===================================================

git submodule update --init --recursive

echo ===================================================
echo [2/6] Compiling XNNPACK... (Accelerator Library)...
echo ===================================================

cd XNNPACK
git checkout 5671db0572e2d5240f2f08f9085174014742ac2d
if not exist build mkdir build
cd build

rem Setting and compiling XNNPACK
cmake -DXNNPACK_BUILD_TESTS=OFF -DXNNPACK_BUILD_BENCHMARKS=OFF -DXNNPACK_LIBRARY_TYPE=static -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --config Release --parallel %NUMBER_OF_PROCESSORS%

if %ERRORLEVEL% neq 0 (
    echo [ERROR] XNNPACK Build Failed!
    exit /b %ERRORLEVEL%
)

cd ..\..

echo ===================================================
echo [3/6] Compiling OnnxStream... (Inference Engine)...
echo ===================================================

cd OnnxStream\src
if not exist build mkdir build
cd build

rem Setting and compiling OnnxStream, linking to XNNPACK
cmake -DMAX_SPEED=ON -DOS_LLM=OFF -DOS_CUDA=OFF -DXNNPACK_DIR=../../../XNNPACK ..
cmake --build . --config Release --parallel %NUMBER_OF_PROCESSORS%

if %ERRORLEVEL% neq 0 (
    echo [ERROR] OnnxStream Build Failed!
    exit /b %ERRORLEVEL%
)

cd ..\..\..

echo ===================================================
echo [4/6] Copying compiled executable to project root...
echo ===================================================

copy OnnxStream\src\build\Release\sd.exe .

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to copy sd.exe!
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo [5/6] Checking and Downloading SDXL Turbo Model...
echo ===================================================

if not exist models mkdir models
cd models
if not exist stable-diffusion-xl-turbo-1.0-anyshape-onnxstream (
    echo Model not found. Cloning Stable Diffusion XL Turbo model (~8GB)...
    echo (Note: This requires Git LFS installed on your system)
    git lfs install
    git clone --depth=1 https://huggingface.co/vitoplantamura/stable-diffusion-xl-turbo-1.0-anyshape-onnxstream
) else (
    echo Stable Diffusion XL Turbo model already exists.
)
cd ..

echo.
echo ===================================================
echo [6/6] Setting up Python Environment ^& PyTorch Models...
echo ===================================================

rem 1. Check Python installation
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Python is not installed or not in PATH!
    echo Skipping python virtual environment and PyTorch model download...
    goto build_success
)

rem 2. Create Python virtual environment if not exists
if not exist venv\Scripts\activate (
    echo Creating Python virtual environment...
    if exist venv rmdir /s /q venv
    python -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] Failed to create virtual environment!
        goto build_success
    )
)

rem 3. Activate virtual environment and install dependencies
call venv\Scripts\activate
echo Installing/updating Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

rem 4. Pre-download PyTorch models
echo Pre-downloading PyTorch models (SD 1.5 ^& ControlNet Scribble)...
python -c "
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
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PyTorch models download failed!
    call deactivate
    exit /b %ERRORLEVEL%
)

call deactivate

:build_success
echo.
echo ===================================================
echo Build Success! All C++ and PyTorch models are ready.
echo ===================================================
pause
