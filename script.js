// DOM Elements
const uploadSection = document.getElementById('upload-section');
const imageUpload = document.getElementById('image-upload');
const uploadText = document.getElementById('upload-text');
const editorSection = document.getElementById('editor-section');
const imageWorkspace = document.getElementById('image-workspace');
const radioRatios = document.getElementsByName('ratio');
const saturationSlider = document.getElementById('saturation');
const satValDisplay = document.getElementById('sat-val');
const contrastSlider = document.getElementById('contrast');
const conValDisplay = document.getElementById('con-val');
const processBtn = document.getElementById('process-btn');
const rotateBtn = document.getElementById('rotate-btn');
const resetBtn = document.getElementById('reset-btn');
const restartBtn = document.getElementById('restart-btn');
const resultSection = document.getElementById('result-section');
const resultCanvas = document.getElementById('result-canvas');
const backBtn = document.getElementById('back-btn');
const uploadServerBtn = document.getElementById('upload-server-btn');
const uploadStatus = document.getElementById('upload-status');
const canvasContainer = document.querySelector('.canvas-container');

// Mobile Menu Toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNav = document.querySelector('.main-nav');
if (mobileMenuBtn && mainNav) {
    mobileMenuBtn.addEventListener('click', () => {
        mainNav.classList.toggle('show');
    });
}

// E-Paper Palette (Black, White, Green, Blue, Red, Yellow)
const PALETTE = [
    [0, 0, 0],       // Black (#000000)
    [255, 255, 255], // White (#FFFFFF)
    [58, 139, 90],   // Green (#3A8B5A)
    [43, 108, 176],  // Blue (#2B6CB0)
    [176, 48, 42],   // Red (#B0302A)
    [212, 175, 55]   // Yellow (#D4AF37)
];

let cropper = null;
let currentWidth = 800;
let currentHeight = 480;

// Handle Drag and Drop
uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
});

uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadImage(e.dataTransfer.files[0]);
    }
});

// Handle Click Upload
imageUpload.addEventListener('change', function(e) {
    if (this.files && this.files[0]) {
        loadImage(this.files[0]);
    }
});

function loadImage(file) {
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
    
    // 處理 HEIC 格式
    if (isHeic) {
        if (typeof heic2any === 'undefined') {
            alert("HEIC 轉換模組尚未載入，請確認網路連線後再試。");
            return;
        }
        
        const originalText = uploadText.textContent;
        uploadText.textContent = "正在處理 HEIC 格式轉換，請稍候...";
        uploadSection.style.pointerEvents = 'none'; // 轉換期間防止重複點擊
        
        heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.8
        }).then(conversionResult => {
            // 恢復 UI 狀態
            uploadText.textContent = originalText;
            uploadSection.style.pointerEvents = 'auto';
            
            // heic2any 在遇到連拍照片時可能會回傳陣列，我們取第一張
            const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            
            // 將轉換後的 Blob 給 Cropper.js 讀取
            const reader = new FileReader();
            reader.onload = function(e) {
                imageWorkspace.src = e.target.result;
                uploadSection.classList.add('hidden');
                editorSection.classList.remove('hidden');
                initCropper();
            }
            reader.readAsDataURL(blob);
            
        }).catch(e => {
            console.error(e);
            alert("HEIC 轉換失敗，請確認檔案是否損毀！");
            uploadText.textContent = originalText;
            uploadSection.style.pointerEvents = 'auto';
        });
        
        return; // 中斷後續的常規圖片處理流程
    }

    // 處理常規圖片 (JPEG, PNG, etc.)
    if (!file.type.match('image.*')) {
        alert("請上傳圖片檔案！");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        imageWorkspace.src = e.target.result;
        uploadSection.classList.add('hidden');
        editorSection.classList.remove('hidden');
        initCropper();
    }
    reader.readAsDataURL(file);
}

function initCropper() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    
    // Determine aspect ratio from radio
    let ratio = currentWidth / currentHeight;
    radioRatios.forEach(radio => {
        if (radio.checked) {
            currentWidth = (radio.value === 'landscape') ? 800 : 480;
            currentHeight = (radio.value === 'landscape') ? 480 : 800;
            ratio = currentWidth / currentHeight;
            let maxAvailableHeight = window.innerHeight - 400;
            let maxW = window.innerWidth - 120; // 預留手機上的 Padding 與 Border 空間
            
            // Calculate a scaling factor
            let scale = Math.min(1, maxW / currentWidth, maxAvailableHeight / currentHeight);
            
            // Magic formula to guarantee perfect integers matching 5:3 or 3:5 ratio
            // currentWidth/160 and currentHeight/160 will always be 5 and 3
            let K = Math.floor(160 * scale);
            
            let finalW = (radio.value === 'landscape') ? 5 * K : 3 * K;
            let finalH = (radio.value === 'landscape') ? 3 * K : 5 * K;
            
            canvasContainer.style.maxWidth = "none";
            canvasContainer.style.width = finalW + "px";
            canvasContainer.style.height = finalH + "px";
            canvasContainer.style.aspectRatio = "auto";
        }
    });

    // Wait for CSS DOM layout to apply before initializing Cropper
    setTimeout(() => {
        cropper = new Cropper(imageWorkspace, {
            viewMode: 0,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
            ready: function () {
                const containerData = this.cropper.getContainerData();
                
                // Force crop box to exactly match the entire container
                // We removed aspectRatio so Cropper won't reject or micro-adjust these numbers
                this.cropper.setCropBoxData({
                    left: 0,
                    top: 0,
                    width: containerData.width,
                    height: containerData.height
                });
                
                // Zoom image to cover the container (avoids transparent checkers initially)
                // Add a tiny 0.5% over-zoom to absolutely guarantee no floating-point edge gaps
                const imageData = this.cropper.getImageData();
                const zoomRatio = Math.max(
                    containerData.width / imageData.naturalWidth,
                    containerData.height / imageData.naturalHeight
                ) * 1.005; 
                this.cropper.zoomTo(zoomRatio);
                
                // Wait for zoomTo to finish its asynchronous DOM update, then explicitly center it
                setTimeout(() => {
                    const newImageData = this.cropper.getImageData();
                    this.cropper.moveTo(
                        (containerData.width - newImageData.width) / 2,
                        (containerData.height - newImageData.height) / 2
                    );
                }, 0);
            }
        });
    }, 50);
}

// Update aspect ratio when radio changes
radioRatios.forEach(radio => {
    radio.addEventListener('change', initCropper);
});

// Real-time Preview via CSS Filters
function updatePreviewFilters() {
    const sat = parseInt(saturationSlider.value);
    const con = parseInt(contrastSlider.value);
    
    // Map -100~100 to 0%~200%
    const cssSat = sat + 100;
    const cssCon = con + 100;
    
    // Apply to the image inside cropper
    const cropperImg = document.querySelector('.cropper-view-box img');
    const cropperCanvasImg = document.querySelector('.cropper-canvas img');
    if (cropperImg) cropperImg.style.filter = `saturate(${cssSat}%) contrast(${cssCon}%)`;
    if (cropperCanvasImg) cropperCanvasImg.style.filter = `saturate(${cssSat}%) contrast(${cssCon}%)`;
}

// Update saturation and contrast values and apply preview
saturationSlider.addEventListener('input', (e) => {
    satValDisplay.textContent = e.target.value;
    updatePreviewFilters();
});

contrastSlider.addEventListener('input', (e) => {
    conValDisplay.textContent = e.target.value;
    updatePreviewFilters();
});

// Toolbar Listeners
rotateBtn.addEventListener('click', () => {
    if (cropper) {
        cropper.rotate(90);
    }
});

resetBtn.addEventListener('click', () => {
    // Reset Sliders
    saturationSlider.value = 0;
    contrastSlider.value = 0;
    satValDisplay.textContent = '0';
    conValDisplay.textContent = '0';
    updatePreviewFilters();

    // Reset Cropper
    if (cropper) {
        cropper.reset();
    }
});

restartBtn.addEventListener('click', () => {
    // Hide editor, show upload
    editorSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    
    // Clear file input
    imageUpload.value = '';
    
    // Reset slider values
    saturationSlider.value = 0;
    contrastSlider.value = 0;
    satValDisplay.textContent = '0';
    conValDisplay.textContent = '0';
    
    // Destroy cropper
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
});

// Process Image (Cropping -> Saturation -> Dithering)
processBtn.addEventListener('click', () => {
    if (!cropper) return;

    // 1. Get Cropped Canvas
    const croppedCanvas = cropper.getCroppedCanvas({
        width: currentWidth,
        height: currentHeight,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    const ctx = croppedCanvas.getContext('2d', { willReadFrequently: true });
    let imageData = ctx.getImageData(0, 0, currentWidth, currentHeight);
    
    // 2. Adjust Saturation and Contrast
    const satValue = parseInt(saturationSlider.value); // -100 to 100
    if (satValue !== 0) {
        adjustSaturation(imageData.data, satValue);
    }

    const conValue = parseInt(contrastSlider.value); // -100 to 100
    if (conValue !== 0) {
        adjustContrast(imageData.data, conValue);
    }

    // 3. Apply 6-Color Floyd-Steinberg Dithering
    applyFloydSteinberg(imageData, currentWidth, currentHeight);

    // 4. Render to Result Canvas
    resultCanvas.width = currentWidth;
    resultCanvas.height = currentHeight;
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.putImageData(imageData, 0, 0);

    // Switch UI
    editorSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
    uploadStatus.textContent = "";
});

// Back to editor
backBtn.addEventListener('click', () => {
    resultSection.classList.add('hidden');
    editorSection.classList.remove('hidden');
});

// Upload to Server
uploadServerBtn.addEventListener('click', () => {
    uploadServerBtn.disabled = true;
    uploadServerBtn.textContent = "上傳中...";
    uploadStatus.textContent = "";

    resultCanvas.toBlob((blob) => {
        const formData = new FormData();
        // Send as PNG to preserve exact colors (no JPG compression artifacts)
        formData.append('image', blob, 'epaper_image.png');

        fetch('upload.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            uploadServerBtn.disabled = false;
            uploadServerBtn.textContent = "儲存至 VPS";
            if (data.success) {
                uploadStatus.style.color = "#4ade80";
                uploadStatus.textContent = "上傳成功！檔案位置: " + data.path;
            } else {
                uploadStatus.style.color = "#ef4444";
                uploadStatus.textContent = "上傳失敗: " + data.message;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            uploadServerBtn.disabled = false;
            uploadServerBtn.textContent = "儲存至 VPS";
            uploadStatus.style.color = "#ef4444";
            uploadStatus.textContent = "上傳失敗，請檢查網路連線或伺服器設定。";
        });
    }, 'image/png');
});

// Helper: Adjust Saturation
function adjustSaturation(data, saturation) {
    // Saturation range mapping: -100 to 100 -> 0 to 2 multiplier approx
    const factor = 1 + (saturation / 100);
    
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Convert to grayscale using luminance
        let gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;

        data[i] = Math.max(0, Math.min(255, gray + factor * (r - gray)));
        data[i+1] = Math.max(0, Math.min(255, gray + factor * (g - gray)));
        data[i+2] = Math.max(0, Math.min(255, gray + factor * (b - gray)));
    }
}

// Helper: Adjust Contrast
function adjustContrast(data, contrast) {
    // scale contrast from [-100, 100] to [-255, 255]
    let scaledContrast = contrast * 2.55;
    let factor = (259 * (scaledContrast + 255)) / (255 * (259 - scaledContrast));

    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
        data[i+1] = Math.max(0, Math.min(255, factor * (data[i+1] - 128) + 128));
        data[i+2] = Math.max(0, Math.min(255, factor * (data[i+2] - 128) + 128));
    }
}

// Helper: Find closest palette color
function findClosestPaletteColor(r, g, b) {
    let minDistanceSq = Infinity;
    let closestColor = PALETTE[0];

    for (let i = 0; i < PALETTE.length; i++) {
        const pr = PALETTE[i][0];
        const pg = PALETTE[i][1];
        const pb = PALETTE[i][2];
        
        // Simple Euclidean distance
        const distSq = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestColor = PALETTE[i];
        }
    }
    return closestColor;
}

// Helper: Floyd-Steinberg Dithering
function applyFloydSteinberg(imageData, width, height) {
    const data = imageData.data;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            
            const oldR = data[index];
            const oldG = data[index + 1];
            const oldB = data[index + 2];
            
            const newColor = findClosestPaletteColor(oldR, oldG, oldB);
            
            data[index] = newColor[0];
            data[index + 1] = newColor[1];
            data[index + 2] = newColor[2];
            
            const errR = oldR - newColor[0];
            const errG = oldG - newColor[1];
            const errB = oldB - newColor[2];
            
            // Distribute error
            // x + 1, y (7/16)
            if (x + 1 < width) {
                const i = (y * width + (x + 1)) * 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * 7 / 16));
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + errG * 7 / 16));
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + errB * 7 / 16));
            }
            // x - 1, y + 1 (3/16)
            if (x - 1 >= 0 && y + 1 < height) {
                const i = ((y + 1) * width + (x - 1)) * 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * 3 / 16));
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + errG * 3 / 16));
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + errB * 3 / 16));
            }
            // x, y + 1 (5/16)
            if (y + 1 < height) {
                const i = ((y + 1) * width + x) * 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * 5 / 16));
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + errG * 5 / 16));
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + errB * 5 / 16));
            }
            // x + 1, y + 1 (1/16)
            if (x + 1 < width && y + 1 < height) {
                const i = ((y + 1) * width + (x + 1)) * 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * 1 / 16));
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + errG * 1 / 16));
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + errB * 1 / 16));
            }
        }
    }
}
