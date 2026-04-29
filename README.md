# E-Paper Image Server

A complete web-based solution for processing, managing, and preparing images for 6-color E-Paper displays. This tool allows you to seamlessly upload images, crop them to fit specific E-Paper dimensions (800x480 or 480x800), adjust saturation/contrast, and automatically apply a 6-color Floyd-Steinberg dithering algorithm to generate perfect images for your device.

## Features

- **Upload & Crop**: Supports standard images and HEIC format. Precise cropping via Cropper.js ensuring no sub-pixel artifacts.
- **Image Adjustments**: Real-time previews of saturation and contrast adjustments.
- **6-Color Dithering**: Highly optimized client-side Floyd-Steinberg dithering using the standard E-Paper 6-color palette (Black, White, Green, Blue, Red, Yellow).
- **Admin Dashboard**: A management interface (`admin.html`) to browse uploaded images, preview them, delete them, and set a specific image as the current "latest" for the e-paper to fetch.
- **Server-Side API**: PHP backend to securely upload and manage the state of your E-Paper display.

## Files Structure

### Frontend

- `index.html`: Main image uploading, cropping, and processing interface.
- `script.js`: Core logic for image handling, UI interaction, and the dithering algorithm.
- `style.css`: Styles for the main processor page.
- `admin.html`: Admin dashboard to manage uploaded images.
- `admin.js`: Logic for the admin dashboard (listing, previewing, and deleting files).
- `admin.css`: Styles for the admin dashboard.

### Backend (PHP)

- `upload.php`: Handles image uploading and saving the dithered results.
- `api_list_images.php`: Retrieves a list of processed images and their thumbnails.
- `api_delete_image.php`: Deletes a specific image and its thumbnail.
- `api_set_latest.php`: Sets an uploaded image as the current `latest.png` (the image your e-paper device will download).
- `api_check_latest.php`: Checks if a `latest.png` file currently exists.

## System Requirements

### Server-Side

- **Web Server**: Apache, Nginx, or any compatible web server.
- **PHP**: Version 7.4 or higher.
- **PHP-GD**: Version 7.4 or higher.
- **Permissions**: Write permissions for the directory where uploaded images and thumbnails are saved.

### Client-Side

- **Browser**: A modern web browser with HTML5 Canvas support (Chrome, Edge, Firefox, Safari, etc.).
- **JavaScript**: Must be enabled for the image processing and dithering algorithms to run.

## Usage

1. Start your local or remote PHP server in this directory.
2. Navigate to `index.html` to upload and process a new image.
3. Select your output dimensions (Landscape vs. Portrait), adjust image filters, and click **套用 6 色抖動處理**.
4. Click **儲存** to save the processed image to the server.
5. Navigate to `admin.html` (via the "管理圖檔" navigation link) to view your gallery, delete older files, and select which image should be displayed on the E-Paper device.

## Technical Details & Optimizations

- **Dithering Algorithm Performance**: The Floyd-Steinberg dithering algorithm runs directly on the user's browser. It has been highly optimized with single-pass matrix manipulation, linear array indexing, and precomputed fractional weights to ensure instantaneous processing even on lower-end devices.
- **Aspect Ratio Locking**: Employs magic formula scaling (`5*K` and `3*K`) to guarantee perfect integers matching the 5:3 or 3:5 aspect ratios across device screen sizes, preventing browser subpixel rendering errors (which often cause white/transparent borders).
