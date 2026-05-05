// Create By Jackie
// Date: 2026/4/30
// Copyright 2026 Jackie All Rights Reserved.

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
imageUpload.addEventListener('change', function (e) {
    if (this.files && this.files[0]) {
        loadImage(this.files[0]);
    }
});

function loadImage(file) {
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';

    // Handle HEIC Format
    if (isHeic) {
        if (typeof heic2any === 'undefined') {
            alert("HEIC converter not loaded. Please check your network connection and try again.");
            return;
        }

        const originalText = uploadText.textContent;
        uploadText.textContent = "Processing HEIC conversion, please wait...";
        uploadSection.style.pointerEvents = 'none'; // Prevent duplicate clicks during conversion

        heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.8
        }).then(conversionResult => {
            // Restore UI Status
            uploadText.textContent = originalText;
            uploadSection.style.pointerEvents = 'auto';

            // heic2any may return an array when encountering burst photos, take the first one
            const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;

            // Pass the converted Blob to Cropper.js for reading
            const reader = new FileReader();
            reader.onload = function (e) {
                imageWorkspace.src = e.target.result;
                uploadSection.classList.add('hidden');
                editorSection.classList.remove('hidden');
                initCropper();
            }
            reader.readAsDataURL(blob);

        }).catch(e => {
            console.error(e);
            alert("HEIC conversion failed. Please check if the file is corrupted!");
            uploadText.textContent = originalText;
            uploadSection.style.pointerEvents = 'auto';
        });

        return; // Skip subsequent normal image processing
    }

    // Handle normal images (JPEG, PNG, etc.)
    if (!file.type.match('image.*')) {
        alert("Please upload an image file!");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
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
            let maxW = window.innerWidth - 120; // Reserve Padding and Border space for mobile

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
            viewMode: 3, // Force image to fill container, no white edges allowed
            aspectRatio: currentWidth / currentHeight, // Force crop box ratio, let Cropper.js handle internal calculations perfectly
            dragMode: 'move',
            autoCropArea: 1, // Let crop box default to fill 100% of container space
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
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

    // Get Cropped Canvas
    const croppedCanvas = cropper.getCroppedCanvas({
        width: currentWidth,
        height: currentHeight,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    // Draw it onto a new canvas and enlarge it by 2px on all sides to push the white edges out of the screen!
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentWidth;
    tempCanvas.height = currentHeight;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(croppedCanvas, 0, 0, currentWidth, currentHeight, -2, -2, currentWidth + 4, currentHeight + 4);

    let imageData = ctx.getImageData(0, 0, currentWidth, currentHeight);

    // Flatten Alpha
    for (let i = 0; i < imageData.data.length; i += 4) {
        const alpha = imageData.data[i + 3] / 255;
        if (alpha < 1) {
            imageData.data[i] = imageData.data[i] * alpha + 255 * (1 - alpha);     // R
            imageData.data[i + 1] = imageData.data[i + 1] * alpha + 255 * (1 - alpha); // G
            imageData.data[i + 2] = imageData.data[i + 2] * alpha + 255 * (1 - alpha); // B
            imageData.data[i + 3] = 255; // Force opaque
        }
    }

    // Adjust Saturation and Contrast (Optimized to single pass)
    const satValue = parseInt(saturationSlider.value); // -100 to 100
    const conValue = parseInt(contrastSlider.value); // -100 to 100
    applyAdjustments(imageData.data, satValue, conValue);

    // Apply Dithering
    let ditherAlgo = 'floyd';
    const radioDither = document.getElementsByName('dithering_algo');
    if (radioDither) {
        radioDither.forEach(radio => {
            if (radio.checked) ditherAlgo = radio.value;
        });
    }

    if (ditherAlgo === 'stucki') {
        applyStuckiDithering(imageData, currentWidth, currentHeight);
    } else if (ditherAlgo === 'atkinson') {
        applyAtkinsonDithering(imageData, currentWidth, currentHeight);
    } else if (ditherAlgo === 'yliluoma') {
        applyYliluomaDithering(imageData, currentWidth, currentHeight);
    } else if (ditherAlgo === 'bluenoise') {
        applyBlueNoiseDithering(imageData, currentWidth, currentHeight);
    } else {
        applyFloydSteinberg(imageData, currentWidth, currentHeight);
    }

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
    uploadServerBtn.textContent = "Uploading...";
    uploadStatus.textContent = "";

    // Export as PNG first to minimize upload payload size (avoids 1MB server limits)
    resultCanvas.toBlob((blob) => {
        const formData = new FormData();
        formData.append('image', blob, 'epaper_image.png');

        fetch('assets/api/api_upload.php', {
            method: 'POST',
            body: formData
        })
            .then(async response => {
                const text = await response.text();
                try {
                    return JSON.parse(text);
                } catch (err) {
                    console.error("Server returned non-JSON:", text);
                    throw new Error("Invalid JSON response from server");
                }
            })
            .then(data => {
                uploadServerBtn.disabled = false;
                uploadServerBtn.textContent = "Save";
                if (data.success) {
                    uploadStatus.style.color = "#4ade80";
                    uploadStatus.textContent = "Uploading Success!";
                } else {
                    uploadStatus.style.color = "#ef4444";
                    uploadStatus.textContent = "Uploading Failed: " + data.message;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                uploadServerBtn.disabled = false;
                uploadServerBtn.textContent = "Save";
                uploadStatus.style.color = "#ef4444";
                uploadStatus.textContent = "Uploading Failed, Please Check Network or Server Settings";
            });
    }, 'image/png');
});

// Helper: Combine Saturation and Contrast Adjustments in a single pass for better performance
function applyAdjustments(data, saturation, contrast) {
    const doSat = saturation !== 0;
    const doCon = contrast !== 0;
    if (!doSat && !doCon) return;

    const satFactor = 1 + (saturation / 100);
    const scaledContrast = contrast * 2.55;
    const conFactor = (259 * (scaledContrast + 255)) / (255 * (259 - scaledContrast));

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (doSat) {
            let gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            r = gray + satFactor * (r - gray);
            g = gray + satFactor * (g - gray);
            b = gray + satFactor * (b - gray);
        }

        if (doCon) {
            r = conFactor * (r - 128) + 128;
            g = conFactor * (g - 128) + 128;
            b = conFactor * (b - 128) + 128;
        }

        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
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
    let index = 0;
    const width4 = width * 4;

    // Precompute fractions to avoid division inside loop
    const w1 = 0.4375; // 7/16
    const w2 = 0.1875; // 3/16
    const w3 = 0.3125; // 5/16
    const w4 = 0.0625; // 1/16

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const oldR = data[index];
            const oldG = data[index + 1];
            const oldB = data[index + 2];

            const newColor = findClosestPaletteColor(oldR, oldG, oldB);

            data[index] = newColor[0];
            data[index + 1] = newColor[1];
            data[index + 2] = newColor[2];
            data[index + 3] = 255; // Ensure no transparency to avoid noise or black edges on e-paper

            const errR = oldR - newColor[0];
            const errG = oldG - newColor[1];
            const errB = oldB - newColor[2];

            // Distribute error
            // x + 1, y (7/16)
            if (x + 1 < width) {
                const i = index + 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * w1));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + errG * w1));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + errB * w1));
            }

            if (y + 1 < height) {
                // x - 1, y + 1 (3/16)
                if (x - 1 >= 0) {
                    const i = index + width4 - 4;
                    data[i] = Math.min(255, Math.max(0, data[i] + errR * w2));
                    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + errG * w2));
                    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + errB * w2));
                }
                // x, y + 1 (5/16)
                const i2 = index + width4;
                data[i2] = Math.min(255, Math.max(0, data[i2] + errR * w3));
                data[i2 + 1] = Math.min(255, Math.max(0, data[i2 + 1] + errG * w3));
                data[i2 + 2] = Math.min(255, Math.max(0, data[i2 + 2] + errB * w3));

                // x + 1, y + 1 (1/16)
                if (x + 1 < width) {
                    const i3 = index + width4 + 4;
                    data[i3] = Math.min(255, Math.max(0, data[i3] + errR * w4));
                    data[i3 + 1] = Math.min(255, Math.max(0, data[i3 + 1] + errG * w4));
                    data[i3 + 2] = Math.min(255, Math.max(0, data[i3 + 2] + errB * w4));
                }
            }

            index += 4; // Move to next pixel
        }
    }
}

// Helper: Atkinson Dithering
function applyAtkinsonDithering(imageData, width, height) {
    const data = imageData.data;
    let index = 0;
    const width4 = width * 4;
    const w = 0.125; // 1/8

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const oldR = data[index];
            const oldG = data[index + 1];
            const oldB = data[index + 2];

            const newColor = findClosestPaletteColor(oldR, oldG, oldB);

            data[index] = newColor[0];
            data[index + 1] = newColor[1];
            data[index + 2] = newColor[2];
            data[index + 3] = 255;

            const errR = oldR - newColor[0];
            const errG = oldG - newColor[1];
            const errB = oldB - newColor[2];

            // Distribute error
            // x + 1, y (1/8)
            if (x + 1 < width) {
                const i = index + 4;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * w));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + errG * w));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + errB * w));
            }
            // x + 2, y (1/8)
            if (x + 2 < width) {
                const i = index + 8;
                data[i] = Math.min(255, Math.max(0, data[i] + errR * w));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + errG * w));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + errB * w));
            }

            if (y + 1 < height) {
                // x - 1, y + 1 (1/8)
                if (x - 1 >= 0) {
                    const i = index + width4 - 4;
                    data[i] = Math.min(255, Math.max(0, data[i] + errR * w));
                    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + errG * w));
                    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + errB * w));
                }
                // x, y + 1 (1/8)
                const i2 = index + width4;
                data[i2] = Math.min(255, Math.max(0, data[i2] + errR * w));
                data[i2 + 1] = Math.min(255, Math.max(0, data[i2 + 1] + errG * w));
                data[i2 + 2] = Math.min(255, Math.max(0, data[i2 + 2] + errB * w));

                // x + 1, y + 1 (1/8)
                if (x + 1 < width) {
                    const i3 = index + width4 + 4;
                    data[i3] = Math.min(255, Math.max(0, data[i3] + errR * w));
                    data[i3 + 1] = Math.min(255, Math.max(0, data[i3 + 1] + errG * w));
                    data[i3 + 2] = Math.min(255, Math.max(0, data[i3 + 2] + errB * w));
                }
            }

            // x, y + 2 (1/8)
            if (y + 2 < height) {
                const i4 = index + width4 * 2;
                data[i4] = Math.min(255, Math.max(0, data[i4] + errR * w));
                data[i4 + 1] = Math.min(255, Math.max(0, data[i4 + 1] + errG * w));
                data[i4 + 2] = Math.min(255, Math.max(0, data[i4 + 2] + errB * w));
            }

            index += 4;
        }
    }
}

// Bayer 8x8 matrix flattened for Yliluoma algorithm
const bayer8x8 = [
    0, 48, 12, 60, 3, 51, 15, 63,
    32, 16, 44, 28, 35, 19, 47, 31,
    8, 56, 4, 52, 11, 59, 7, 55,
    40, 24, 36, 20, 43, 27, 39, 23,
    2, 50, 14, 62, 1, 49, 13, 61,
    34, 18, 46, 30, 33, 17, 45, 29,
    10, 58, 6, 54, 9, 57, 5, 53,
    42, 26, 38, 22, 41, 25, 37, 21
];

// Helper: Joel Yliluoma's Ordered Dithering (Bisqwit)
function applyYliluomaDithering(imageData, width, height) {
    const data = imageData.data;
    let index = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tr = data[index];
            const tg = data[index + 1];
            const tb = data[index + 2];

            let minError = Infinity;
            let bestP1 = PALETTE[0];
            let bestP2 = PALETTE[0];
            let bestRatio = 0;

            for (let i = 0; i < PALETTE.length; i++) {
                for (let j = i; j < PALETTE.length; j++) {
                    const p1 = PALETTE[i];
                    const p2 = PALETTE[j];

                    if (i === j) {
                        const dr = tr - p1[0];
                        const dg = tg - p1[1];
                        const db = tb - p1[2];
                        const err = dr * dr + dg * dg + db * db;
                        if (err < minError) {
                            minError = err;
                            bestP1 = p1;
                            bestP2 = p1;
                            bestRatio = 1;
                        }
                    } else {
                        const vx = p1[0] - p2[0];
                        const vy = p1[1] - p2[1];
                        const vz = p1[2] - p2[2];

                        const cx = tr - p2[0];
                        const cy = tg - p2[1];
                        const cz = tb - p2[2];

                        const vDotV = vx * vx + vy * vy + vz * vz;
                        const cDotV = cx * vx + cy * vy + cz * vz;

                        let ratio = cDotV / vDotV;
                        if (ratio < 0) ratio = 0;
                        else if (ratio > 1) ratio = 1;

                        const ax = p2[0] + ratio * vx;
                        const ay = p2[1] + ratio * vy;
                        const az = p2[2] + ratio * vz;

                        const dr = tr - ax;
                        const dg = tg - ay;
                        const db = tb - az;
                        const err = dr * dr + dg * dg + db * db;

                        // Mix penalty to prevent blending highly contrasting colors (e.g., Red + Green -> Yellow)
                        // A lower value creates smoother blends but might introduce noisy speckles of weird colors
                        const mixPenalty = ratio * (1 - ratio) * vDotV * 0.1;
                        const totalError = err + mixPenalty;

                        if (totalError < minError) {
                            minError = totalError;
                            bestP1 = p1;
                            bestP2 = p2;
                            bestRatio = ratio;
                        }
                    }
                }
            }

            const bayerVal = bayer8x8[(y & 7) * 8 + (x & 7)];
            const threshold = (bayerVal + 0.5) / 64.0;

            const chosenColor = (bestRatio > threshold) ? bestP1 : bestP2;

            data[index] = chosenColor[0];
            data[index + 1] = chosenColor[1];
            data[index + 2] = chosenColor[2];
            data[index + 3] = 255;

            index += 4;
        }
    }
}

// Helper: Stucki Dithering (Error Diffusion)
function applyStuckiDithering(imageData, width, height) {
    const data = imageData.data;
    let index = 0;
    const width4 = width * 4;

    const w8 = 8 / 42, w4 = 4 / 42, w2 = 2 / 42, w1 = 1 / 42;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const oldR = data[index];
            const oldG = data[index + 1];
            const oldB = data[index + 2];

            const newColor = findClosestPaletteColor(oldR, oldG, oldB);

            data[index] = newColor[0];
            data[index + 1] = newColor[1];
            data[index + 2] = newColor[2];
            data[index + 3] = 255;

            const errR = oldR - newColor[0];
            const errG = oldG - newColor[1];
            const errB = oldB - newColor[2];

            // row 0
            if (x + 1 < width) {
                let i = index + 4;
                data[i] += errR * w8; data[i + 1] += errG * w8; data[i + 2] += errB * w8;
            }
            if (x + 2 < width) {
                let i = index + 8;
                data[i] += errR * w4; data[i + 1] += errG * w4; data[i + 2] += errB * w4;
            }

            // row 1
            if (y + 1 < height) {
                let offset = index + width4;
                if (x - 2 >= 0) {
                    let i = offset - 8;
                    data[i] += errR * w2; data[i + 1] += errG * w2; data[i + 2] += errB * w2;
                }
                if (x - 1 >= 0) {
                    let i = offset - 4;
                    data[i] += errR * w4; data[i + 1] += errG * w4; data[i + 2] += errB * w4;
                }
                data[offset] += errR * w8; data[offset + 1] += errG * w8; data[offset + 2] += errB * w8;
                if (x + 1 < width) {
                    let i = offset + 4;
                    data[i] += errR * w4; data[i + 1] += errG * w4; data[i + 2] += errB * w4;
                }
                if (x + 2 < width) {
                    let i = offset + 8;
                    data[i] += errR * w2; data[i + 1] += errG * w2; data[i + 2] += errB * w2;
                }
            }

            // row 2
            if (y + 2 < height) {
                let offset = index + width4 * 2;
                if (x - 2 >= 0) {
                    let i = offset - 8;
                    data[i] += errR * w1; data[i + 1] += errG * w1; data[i + 2] += errB * w1;
                }
                if (x - 1 >= 0) {
                    let i = offset - 4;
                    data[i] += errR * w2; data[i + 1] += errG * w2; data[i + 2] += errB * w2;
                }
                data[offset] += errR * w4; data[offset + 1] += errG * w4; data[offset + 2] += errB * w4;
                if (x + 1 < width) {
                    let i = offset + 4;
                    data[i] += errR * w2; data[i + 1] += errG * w2; data[i + 2] += errB * w2;
                }
                if (x + 2 < width) {
                    let i = offset + 8;
                    data[i] += errR * w1; data[i + 1] += errG * w1; data[i + 2] += errB * w1;
                }
            }

            index += 4;
        }
    }
}

// Helper: Interleaved Gradient Noise for Blue Noise approximation
function getIGN(x, y) {
    const magicZ = 52.9829189;
    const dot = x * 0.06711056 + y * 0.00583715;
    const fractDot = dot - Math.floor(dot);
    const val = magicZ * fractDot;
    return val - Math.floor(val);
}

// Helper: Blue Noise (using IGN and Bisqwit Color Mixing)
function applyBlueNoiseDithering(imageData, width, height) {
    const data = imageData.data;
    let index = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tr = data[index];
            const tg = data[index + 1];
            const tb = data[index + 2];

            let minError = Infinity;
            let bestP1 = PALETTE[0];
            let bestP2 = PALETTE[0];
            let bestRatio = 0;

            for (let i = 0; i < PALETTE.length; i++) {
                for (let j = i; j < PALETTE.length; j++) {
                    const p1 = PALETTE[i];
                    const p2 = PALETTE[j];

                    if (i === j) {
                        const dr = tr - p1[0];
                        const dg = tg - p1[1];
                        const db = tb - p1[2];
                        const err = dr * dr + dg * dg + db * db;
                        if (err < minError) {
                            minError = err;
                            bestP1 = p1;
                            bestP2 = p1;
                            bestRatio = 1;
                        }
                    } else {
                        const vx = p1[0] - p2[0];
                        const vy = p1[1] - p2[1];
                        const vz = p1[2] - p2[2];

                        const cx = tr - p2[0];
                        const cy = tg - p2[1];
                        const cz = tb - p2[2];

                        const vDotV = vx * vx + vy * vy + vz * vz;
                        const cDotV = cx * vx + cy * vy + cz * vz;

                        let ratio = cDotV / vDotV;
                        if (ratio < 0) ratio = 0;
                        else if (ratio > 1) ratio = 1;

                        const ax = p2[0] + ratio * vx;
                        const ay = p2[1] + ratio * vy;
                        const az = p2[2] + ratio * vz;

                        const dr = tr - ax;
                        const dg = tg - ay;
                        const db = tb - az;
                        const err = dr * dr + dg * dg + db * db;

                        const mixPenalty = ratio * (1 - ratio) * vDotV * 0.08;
                        const totalError = err + mixPenalty;

                        if (totalError < minError) {
                            minError = totalError;
                            bestP1 = p1;
                            bestP2 = p2;
                            bestRatio = ratio;
                        }
                    }
                }
            }

            const threshold = getIGN(x, y);
            const chosenColor = (bestRatio > threshold) ? bestP1 : bestP2;

            data[index] = chosenColor[0];
            data[index + 1] = chosenColor[1];
            data[index + 2] = chosenColor[2];
            data[index + 3] = 255;

            index += 4;
        }
    }
}

// Helper: Create an uncompressed 24-bit bottom-up BMP Blob
function createBMP24Blob(imageData, width, height) {
    const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
    const fileSize = 54 + rowSize * height;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    view.setUint16(0, 0x4D42, false);
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, 54, true);

    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(30, 0, true);
    view.setUint32(34, rowSize * height, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    view.setUint32(46, 0, true);
    view.setUint32(50, 0, true);

    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];

            view.setUint8(offset++, b);
            view.setUint8(offset++, g);
            view.setUint8(offset++, r);
        }
        for (let p = 0; p < (rowSize - width * 3); p++) {
            view.setUint8(offset++, 0);
        }
    }

    return new Blob([buffer], { type: 'image/bmp' });
}

