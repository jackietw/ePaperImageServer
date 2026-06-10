@echo off
if exist venv\Scripts\activate (
    echo Activating virtual environment...
    call venv\Scripts\activate
)
echo Starting FastAPI server...
uvicorn main:app --reload --host 0.0.0.0 --port 8000
if exist venv\Scripts\activate (
    call deactivate
)
pause
