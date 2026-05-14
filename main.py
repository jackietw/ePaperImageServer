import os
import time
import shutil
from typing import List
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI()

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
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve processed images
app.mount("/processed", StaticFiles(directory="processed"), name="processed")

def generate_pending_bmp(source_path, dest_path):
    try:
        with Image.open(source_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # Save as uncompressed 24-bit BMP
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
    
    # Save the uploaded file
    with open(history_dest, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
        
    # Copy to latest.png
    shutil.copy2(history_dest, latest_dest)
    
    # Generate pending.bmp
    generate_pending_bmp(history_dest, pending_dest)
    
    # Generate thumbnail
    thumb_name = f"thumb_epaper_{timestamp}.jpg"
    thumb_dest = os.path.join(UPLOAD_DIR, thumb_name)
    generate_thumbnail(history_dest, thumb_dest)
    
    return JSONResponse(content={
        "success": True,
        "message": "File uploaded successfully",
        "path": f"processed/{latest_filename}"
    })

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
                    # Thumb path logic
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
                    
    # Sort by time descending
    images.sort(key=lambda x: x['time'], reverse=True)
    return {"success": True, "data": images}

@app.post("/api/set_latest")
async def set_latest(request: Request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        return JSONResponse(content={"success": False, "message": "Filename not provided"})
        
    filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, filename)
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

# Serve root HTML files
@app.get("/")
def read_index():
    return FileResponse("index.html")

@app.get("/admin.html")
def read_admin():
    return FileResponse("admin.html")

