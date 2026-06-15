@echo off
echo ===================================================
echo [1/3] Setting up Python Virtual Environment ^& Dependencies...
echo ===================================================

rem Check Python installation
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

rem Create Python virtual environment if not exists
if not exist venv\Scripts\activate (
    echo Creating Python virtual environment...
    if exist venv rmdir /s /q venv
    python -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
)

rem Activate virtual environment and install dependencies
call venv\Scripts\activate
echo Installing/updating Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies!
    call deactivate
    pause
    exit /b 1
)

echo.
echo ===================================================
echo [2/3] Configuring Hugging Face API Token...
echo ===================================================

set /p HF_TOKEN="Enter your Hugging Face API Token (free at huggingface.co, press Enter to skip): "
if not "%HF_TOKEN%"=="" (
    echo Writing config.json...
    (
        echo {
        echo   "hf_token": "%HF_TOKEN%"
        echo }
    ) > config.json
    echo Token saved successfully!
) else (
    if not exist config.json (
        echo Creating default config.json...
        (
            echo {
            echo   "hf_token": ""
            echo }
        ) > config.json
    ) else (
        echo Keeping existing config.json.
    )
)

echo.
echo ===================================================
echo [3/3] Pre-downloading Local PyTorch Models (for Scribble)...
echo ===================================================

echo Downloading DreamShaper 8 and ControlNet Scribble models...
python -c "
try:
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline, ControlNetModel
    print('Downloading DreamShaper 8 model...')
    StableDiffusionPipeline.from_pretrained('Lykon/dreamshaper-8', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading MeinaMix V11 (Anime) model...')
    StableDiffusionPipeline.from_pretrained('Meina/MeinaMix_V11', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading Anything V5 (Anime) model...')
    StableDiffusionPipeline.from_pretrained('stablediffusionapi/anything-v5', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading Studio Ghibli Style model...')
    StableDiffusionPipeline.from_pretrained('nitrosocke/Ghibli-Diffusion', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading ControlNet Scribble model...')
    ControlNetModel.from_pretrained('lllyasviel/sd-controlnet-scribble', cache_dir='models')
    print('Downloading ControlNet Canny model...')
    ControlNetModel.from_pretrained('lllyasviel/sd-controlnet-canny', cache_dir='models')
    print('Downloading Realistic Vision V5.1 model...')
    StableDiffusionPipeline.from_pretrained('SG161222/Realistic_Vision_V5.1_noVAE', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading Disney Pixar Cartoon model...')
    StableDiffusionPipeline.from_pretrained('stablediffusionapi/disney-pixar-cartoon', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading OpenJourney model...')
    StableDiffusionPipeline.from_pretrained('prompthero/openjourney', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('Downloading Stable Diffusion 1.5 base model...')
    StableDiffusionPipeline.from_pretrained('runwayml/stable-diffusion-v1-5', safety_checker=None, requires_safety_checker=False, cache_dir='models')
    print('All local models downloaded successfully!')
except Exception as e:
    print('[ERROR] Model download failed:', e)
    exit(1)
"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PyTorch models download failed!
    call deactivate
    pause
    exit /b %ERRORLEVEL%
)

call deactivate
echo.
echo ===================================================
echo Setup Success! Environment, Config and Models are ready.
echo ===================================================
pause
