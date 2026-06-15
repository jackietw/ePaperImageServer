import os
import time
import shutil
import asyncio
import io
import base64
import uuid
import json
import psutil
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from huggingface_hub import InferenceClient
from generator import ai_generator

app = FastAPI()
generation_lock = asyncio.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files for frontend
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, 'processed')
GENERATED_DIR = os.path.join(BASE_DIR, 'generated')
TEMP_DIR = os.path.join(BASE_DIR, 'temp_uploads')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# Serve processed and generated images
app.mount("/processed", StaticFiles(directory="processed"), name="processed")
app.mount("/generated", StaticFiles(directory="generated"), name="generated")

# Task Queue Management
class TaskQueue:
    def __init__(self):
        self.queue = []
        self.current_task = None
        self.is_processing = False
        self.history = [] # Keep last 10 completed/failed/cancelled tasks

task_queue = TaskQueue()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(process_queue())

async def process_queue():
    while True:
        if len(task_queue.queue) > 0 and not task_queue.is_processing:
            task_queue.is_processing = True
            task_queue.current_task = task_queue.queue.pop(0)
            task_queue.current_task['status'] = 'processing'
            
            task_id = task_queue.current_task['id']
            print(f"Starting generation task: {task_id}")
            
            try:
                async with generation_lock:
                    ai_generator.is_cancelled = False
                    
                    input_image = None
                    temp_img_path = task_queue.current_task.get('temp_image_path')
                    if temp_img_path and os.path.exists(temp_img_path):
                        input_image = Image.open(temp_img_path)
                        
                    params = task_queue.current_task['params']
                    output_image = await asyncio.to_thread(
                        ai_generator.generate,
                        prompt=params['prompt'],
                        negative_prompt=params.get('negative_prompt', ''),
                        mode=params.get('mode', 'text'),
                        steps=params.get('steps', 20),
                        seed=params.get('seed', -1),
                        strength=params.get('strength', 0.75),
                        input_image=input_image,
                        engine=params.get('engine', 'cloud'),
                        hf_token=params.get('hf_token', ''),
                        cloud_model=params.get('cloud_model', ''),
                        local_model=params.get('local_model', ''),
                        filter_model=params.get('filter_model', 'sketch')
                    )
                    
                    if ai_generator.is_cancelled:
                        task_queue.current_task['status'] = 'cancelled'
                    else:
                        now = datetime.now()
                        timestamp_str = now.strftime("%y%m%d_%H%M_%S")
                        filename = f"{timestamp_str}.png"
                        filepath = os.path.join(GENERATED_DIR, filename)
                        output_image.save(filepath, format="PNG")
                        
                        log_filename = f"{timestamp_str}.json"
                        log_filepath = os.path.join(GENERATED_DIR, log_filename)
                        with open(log_filepath, "w", encoding="utf-8") as f:
                            json.dump({
                                "id": task_id,
                                "timestamp": now.isoformat(),
                                "params": params,
                                "filename": filename
                            }, f, ensure_ascii=False, indent=2)
                            
                        task_queue.current_task['status'] = 'completed'
                        task_queue.current_task['result_path'] = f"generated/{filename}"
                        
            except InterruptedError:
                task_queue.current_task['status'] = 'cancelled'
                task_queue.current_task['error'] = 'Cancelled by user'
            except Exception as e:
                import traceback
                traceback.print_exc()
                task_queue.current_task['status'] = 'failed'
                task_queue.current_task['error'] = str(e)
            finally:
                temp_img_path = task_queue.current_task.get('temp_image_path')
                if temp_img_path and os.path.exists(temp_img_path):
                    try:
                        os.remove(temp_img_path)
                    except:
                        pass
                
                # Add to history and cleanup
                task_queue.history.insert(0, task_queue.current_task.copy())
                if len(task_queue.history) > 20:
                    task_queue.history.pop()
                    
                task_queue.is_processing = False
                task_queue.current_task = None
                ai_generator.is_cancelled = False
                ai_generator.current_status = "idle"
                ai_generator.current_message = ""
                ai_generator.current_progress = 0
                
        await asyncio.sleep(1)


def generate_pending_bmp(source_path, dest_path):
    try:
        with Image.open(source_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(dest_path, format='BMP')
    except Exception as e:
        shutil.copy2(source_path, dest_path)

def generate_thumbnail(source_path, dest_path):
    try:
        with Image.open(source_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            orig_width, orig_height = img.size
            if orig_width > 0:
                thumb_width = 400
                thumb_height = int(orig_height * (thumb_width / orig_width))
                
                img_thumb = img.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
                img_thumb.save(dest_path, format='JPEG', quality=75)
            else:
                shutil.copy2(source_path, dest_path)
    except Exception as e:
        shutil.copy2(source_path, dest_path)

@app.post("/api/upload")
async def upload_image(image: UploadFile = File(...)):
    timestamp = int(time.time())
    history_filename = f"epaper_{timestamp}.png"
    latest_filename = "latest.png"
    pending_filename = "pending.bmp"
    
    history_dest = os.path.join(UPLOAD_DIR, history_filename)
    latest_dest = os.path.join(UPLOAD_DIR, latest_filename)
    pending_dest = os.path.join(UPLOAD_DIR, pending_filename)
    
    with open(history_dest, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
        
    shutil.copy2(history_dest, latest_dest)
    generate_pending_bmp(history_dest, pending_dest)
    
    thumb_name = f"thumb_epaper_{timestamp}.jpg"
    thumb_dest = os.path.join(UPLOAD_DIR, thumb_name)
    generate_thumbnail(history_dest, thumb_dest)
    
    return JSONResponse(content={
        "success": True,
        "message": "File uploaded successfully",
        "path": f"processed/{latest_filename}"
    })

@app.post("/api/queue_generate")
async def queue_generate(
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    mode: str = Form("text"),
    steps: int = Form(20),
    seed: int = Form(-1),
    strength: float = Form(0.75),
    engine: str = Form("cloud"),
    hf_token: str = Form(""),
    cloud_model: str = Form("black-forest-labs/FLUX.1-schnell"),
    local_model: str = Form("Lykon/dreamshaper-8"),
    image: UploadFile = File(None)
):
    try:
        task_id = str(uuid.uuid4())
        
        temp_image_path = None
        if image is not None:
            temp_image_path = os.path.join(TEMP_DIR, f"temp_{task_id}.png")
            with open(temp_image_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
                
        task = {
            "id": task_id,
            "status": "pending",
            "timestamp": time.time(),
            "temp_image_path": temp_image_path,
            "params": {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "mode": mode,
                "steps": steps,
                "seed": seed,
                "strength": strength,
                "engine": engine,
                "hf_token": hf_token,
                "cloud_model": cloud_model,
                "local_model": local_model
            }
        }
        
        task_queue.queue.append(task)
        
        return JSONResponse(content={
            "success": True,
            "message": "Task added to queue",
            "task_id": task_id
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={
            "success": False,
            "message": f"Failed to enqueue task: {str(e)}"
        }, status_code=500)

@app.get("/api/queue_status")
def get_queue_status():
    current = None
    if task_queue.current_task:
        current = task_queue.current_task.copy()
        if 'temp_image_path' in current:
            del current['temp_image_path']
        current['progress'] = ai_generator.current_progress
        current['generator_status'] = ai_generator.current_status
        current['generator_message'] = ai_generator.current_message
        
    pending = []
    for t in task_queue.queue:
        t_copy = t.copy()
        if 'temp_image_path' in t_copy:
            del t_copy['temp_image_path']
        pending.append(t_copy)
        
    history = []
    for t in task_queue.history:
        t_copy = t.copy()
        if 'temp_image_path' in t_copy:
            del t_copy['temp_image_path']
        history.append(t_copy)
        
    return {
        "success": True,
        "current_task": current,
        "pending_tasks": pending,
        "history": history
    }

@app.post("/api/cancel_task")
async def cancel_task(request: Request):
    data = await request.json()
    task_id = data.get("task_id")
    
    if not task_id:
        return JSONResponse(content={"success": False, "message": "Task ID not provided"})
        
    # Check if it's the current processing task
    if task_queue.current_task and task_queue.current_task['id'] == task_id:
        ai_generator.is_cancelled = True
        return {"success": True, "message": "Cancellation signal sent to running task."}
        
    # Check if it's in the pending queue
    for i, t in enumerate(task_queue.queue):
        if t['id'] == task_id:
            cancelled_task = task_queue.queue.pop(i)
            cancelled_task['status'] = 'cancelled'
            if cancelled_task.get('temp_image_path') and os.path.exists(cancelled_task['temp_image_path']):
                try:
                    os.remove(cancelled_task['temp_image_path'])
                except:
                    pass
            task_queue.history.insert(0, cancelled_task)
            return {"success": True, "message": "Pending task removed from queue."}
            
    return {"success": False, "message": "Task not found in active queue."}

@app.get("/api/list_generated")
def list_generated():
    images = []
    if os.path.isdir(GENERATED_DIR):
        for file in os.listdir(GENERATED_DIR):
            if file.endswith('.png'):
                file_path = os.path.join(GENERATED_DIR, file)
                base_name = file.rsplit('.', 1)[0]
                log_path = os.path.join(GENERATED_DIR, f"{base_name}.json")
                
                log_data = None
                if os.path.exists(log_path):
                    try:
                        with open(log_path, 'r', encoding='utf-8') as f:
                            log_data = json.load(f)
                    except:
                        pass
                        
                images.append({
                    "name": file,
                    "path": f"generated/{file}",
                    "time": os.path.getmtime(file_path),
                    "size": os.path.getsize(file_path),
                    "log": log_data
                })
                
    images.sort(key=lambda x: x['time'], reverse=True)
    return {"success": True, "data": images}

@app.post("/api/delete_generated")
async def delete_generated(request: Request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        return JSONResponse(content={"success": False, "message": "Filename not provided"})
        
    filename = os.path.basename(filename)
    file_path = os.path.join(GENERATED_DIR, filename)
    base_name = filename.rsplit('.', 1)[0]
    log_path = os.path.join(GENERATED_DIR, f"{base_name}.json")
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        os.remove(file_path)
        if os.path.exists(log_path) and os.path.isfile(log_path):
            os.remove(log_path)
        return {"success": True, "message": "Generated file and log deleted successfully"}
    else:
        return JSONResponse(content={"success": False, "message": "File does not exist"})

@app.post("/api/enhance_prompt")
async def enhance_prompt(request: Request):
    data = await request.json()
    prompt = data.get("prompt", "")
    hf_token = data.get("hf_token", "").strip() or ai_generator.hf_token
    
    if not prompt:
        return JSONResponse(content={"success": False, "message": "Prompt is empty"}, status_code=400)
    
    if not hf_token:
        return JSONResponse(content={"success": False, "message": "Hugging Face API Token is required to use the AI Semantic Analyzer"}, status_code=400)
        
    try:
        client = InferenceClient(token=hf_token)
        system_prompt = """You are an expert prompt engineer for Stable Diffusion.
Your task is to take the user's natural language input and convert it into high-quality, comma-separated Danbooru-style tags and descriptive keywords.
You MUST output EXACTLY a valid JSON object with NO markdown formatting, NO backticks, and NO additional text.
The JSON must have two keys: "positive" and "negative".
"positive": The enhanced positive prompt (e.g. masterpiece, best quality, ultra-detailed, 1girl, ...).
"negative": The suggested negative prompt (e.g. ugly, bad anatomy, deformed, watermark, ...)."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        response = await asyncio.to_thread(
            client.chat_completion,
            messages=messages,
            model="Qwen/Qwen2.5-72B-Instruct",
            max_tokens=300,
            temperature=0.7
        )
        
        content = response.choices[0].message.content.strip()
        # Clean up potential markdown formatting
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        result = json.loads(content.strip())
        
        return {
            "success": True,
            "positive": result.get("positive", ""),
            "negative": result.get("negative", "")
        }
    except json.JSONDecodeError:
        return JSONResponse(content={"success": False, "message": "AI failed to return valid JSON formatting. Please try again."}, status_code=500)
    except Exception as e:
        return JSONResponse(content={"success": False, "message": str(e)}, status_code=500)

@app.get("/api/server_status")
async def server_status():
    try:
        cpu_percent = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        mem_percent = mem.percent
        mem_used_gb = round(mem.used / (1024**3), 1)
        mem_total_gb = round(mem.total / (1024**3), 1)
        return {
            "success": True,
            "cpu_percent": cpu_percent,
            "mem_percent": mem_percent,
            "mem_used_gb": mem_used_gb,
            "mem_total_gb": mem_total_gb
        }
    except Exception as e:
        return {"success": False, "message": str(e)}

# Below are legacy/unchanged endpoints for Dithering/E-paper logic

@app.get("/api/get_config")
def get_config():
    ai_generator.load_config()
    return {
        "hf_token": ai_generator.hf_token
    }

@app.get("/api/list_images")
def list_images():
    images = []
    if os.path.isdir(UPLOAD_DIR):
        for file in os.listdir(UPLOAD_DIR):
            if file in ['.', '..', 'latest.bmp', 'latest.png', 'pending.bmp'] or file.startswith('thumb_'):
                continue
                
            file_path = os.path.join(UPLOAD_DIR, file)
            if os.path.isfile(file_path):
                ext = file.lower().split('.')[-1]
                if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']:
                    base_name = file.rsplit('.', 1)[0]
                    thumb_name = f"thumb_{base_name}.jpg"
                    thumb_path_full = os.path.join(UPLOAD_DIR, thumb_name)
                    
                    if os.path.exists(thumb_path_full):
                        thumb_path = f"processed/{thumb_name}"
                    else:
                        thumb_path = f"processed/{file}"
                        
                    images.append({
                        "name": file,
                        "path": f"processed/{file}",
                        "thumb_path": thumb_path,
                        "time": os.path.getmtime(file_path),
                        "size": os.path.getsize(file_path)
                    })
                    
    images.sort(key=lambda x: x['time'], reverse=True)
    return {"success": True, "data": images}

@app.post("/api/set_latest")
async def set_latest(request: Request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        return JSONResponse(content={"success": False, "message": "Filename not provided"})
        
    # Check if the filename comes from generated/ or processed/
    if filename.startswith('generated/'):
        base_filename = os.path.basename(filename)
        file_path = os.path.join(GENERATED_DIR, base_filename)
    else:
        base_filename = os.path.basename(filename)
        file_path = os.path.join(UPLOAD_DIR, base_filename)
        
    latest_path = os.path.join(UPLOAD_DIR, "latest.png")
    pending_path = os.path.join(UPLOAD_DIR, "pending.bmp")
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        shutil.copy2(file_path, latest_path)
        generate_pending_bmp(file_path, pending_path)
        return {"success": True, "message": "Set as default E-Paper image"}
    else:
        return JSONResponse(content={"success": False, "message": "Original file does not exist"})

@app.post("/api/delete_image")
async def delete_image(request: Request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        return JSONResponse(content={"success": False, "message": "Filename not provided"})
        
    filename = os.path.basename(filename)
    if filename in ['latest.bmp', 'latest.png', 'pending.bmp']:
        return JSONResponse(content={"success": False, "message": "Cannot delete system reserved files."})
        
    file_path = os.path.join(UPLOAD_DIR, filename)
    base_name = filename.rsplit('.', 1)[0]
    thumb_path = os.path.join(UPLOAD_DIR, f"thumb_{base_name}.jpg")
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        os.remove(file_path)
        if os.path.exists(thumb_path) and os.path.isfile(thumb_path):
            os.remove(thumb_path)
        return {"success": True, "message": "File and thumbnail deleted successfully"}
    else:
        return JSONResponse(content={"success": False, "message": "File does not exist"})

@app.get("/api/check_latest")
def check_latest():
    latest_path = os.path.join(UPLOAD_DIR, "latest.png")
    if os.path.exists(latest_path) and os.path.isfile(latest_path):
        return {
            "exists": True,
            "timestamp": os.path.getmtime(latest_path),
            "size": os.path.getsize(latest_path)
        }
    return {"exists": False}

@app.get("/api/check_pending")
def check_pending():
    pending_path = os.path.join(UPLOAD_DIR, "pending.bmp")
    if os.path.exists(pending_path) and os.path.isfile(pending_path):
        return {
            "exists": True,
            "timestamp": os.path.getmtime(pending_path),
            "size": os.path.getsize(pending_path)
        }
    return {"exists": False}

@app.post("/api/consume_pending")
def consume_pending():
    pending_path = os.path.join(UPLOAD_DIR, "pending.bmp")
    if os.path.exists(pending_path) and os.path.isfile(pending_path):
        try:
            os.remove(pending_path)
            return {"success": True, "message": "Pending image consumed and deleted."}
        except:
            return JSONResponse(content={"success": False, "message": "Failed to delete pending image."})
    return {"success": True, "message": "No pending image to consume."}

# Serve HTML files
@app.get("/")
@app.get("/index.html")
def read_index():
    return FileResponse("index.html")

@app.get("/admin.html")
def read_admin():
    return FileResponse("admin.html")

@app.get("/queue.html")
def read_queue():
    return FileResponse("queue.html")

@app.get("/generated_admin.html")
def read_generated_admin():
    return FileResponse("generated_admin.html")
