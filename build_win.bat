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
echo [1/3] Compiling XNNPACK... (Accelerator Library)...
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
echo [2/3] Compiling OnnxStream... (Inference Engine)...
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
echo [3/3] Copying compiled executable to project root...
echo ===================================================

copy OnnxStream\src\build\Release\sd.exe .

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to copy sd.exe!
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo [4/4] Checking and Downloading AI Models...
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
echo Build Success! sd.exe and models are ready.
echo ===================================================
pause
