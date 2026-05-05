<?php
header('Content-Type: application/json');

// Allow cross-domain requests (if frontend and backend are on different domains)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");

$uploadDir = __DIR__ . '/../../processed/';

// If the folder does not exist, create it
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Check if file is uploaded
if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    $tmpName = $_FILES['image']['tmp_name'];

    // Generate unique filename, keep history
    $timestamp = time();
    $historyFileName = 'epaper_' . $timestamp . '.png';
    $latestFileName = 'latest.png';

    $historyDestination = $uploadDir . $historyFileName;
    $latestDestination = $uploadDir . $latestFileName;
    $pendingDestination = $uploadDir . 'pending.bmp';

    $uploadSuccess = false;

    // Frontend uploads PNG directly to save space
    if (move_uploaded_file($tmpName, $historyDestination)) {
        $uploadSuccess = true;
    }

    if ($uploadSuccess) {
        // Copy to latest.png for web preview
        copy($historyDestination, $latestDestination);

        // Generate uncompressed pending.bmp for device to fetch
        if (function_exists('imagecreatefrompng') && function_exists('imagebmp')) {
            $img = @imagecreatefrompng($historyDestination);
            if ($img !== false) {
                imagebmp($img, $pendingDestination);
            } else {
                copy($historyDestination, $pendingDestination);
            }
        } else {
            copy($historyDestination, $pendingDestination);
        }

        // --- Generate thumbnail ---
        $thumbName = 'thumb_epaper_' . $timestamp . '.jpg';
        $thumbDestination = $uploadDir . $thumbName;

        $info = @getimagesize($historyDestination);
        if ($info !== false) {
            // Check if the server has GD library installed
            if (function_exists('imagecreatetruecolor')) {
                $mime = $info['mime'];
                $srcImage = null;
                if ($mime === 'image/jpeg') {
                    $srcImage = @imagecreatefromjpeg($historyDestination);
                } elseif ($mime === 'image/png') {
                    $srcImage = @imagecreatefrompng($historyDestination);
                } elseif ($mime === 'image/webp') {
                    $srcImage = @imagecreatefromwebp($historyDestination);
                } elseif ($mime === 'image/gif') {
                    $srcImage = @imagecreatefromgif($historyDestination);
                } elseif ($mime === 'image/bmp' || $mime === 'image/x-ms-bmp') {
                    if (function_exists('imagecreatefrombmp')) {
                        $srcImage = @imagecreatefrombmp($historyDestination);
                    }
                }

                if ($srcImage) {
                    $origWidth = imagesx($srcImage);
                    $origHeight = imagesy($srcImage);

                    if ($origWidth > 0) {
                        // Set thumbnail width and height (maximum width 400)
                        $thumbWidth = 400;
                        $thumbHeight = floor($origHeight * ($thumbWidth / $origWidth));

                        $thumbImage = imagecreatetruecolor($thumbWidth, $thumbHeight);

                        // JPEG does not support transparency, so fill the background with white
                        $white = imagecolorallocate($thumbImage, 255, 255, 255);
                        imagefill($thumbImage, 0, 0, $white);

                        imagecopyresampled($thumbImage, $srcImage, 0, 0, 0, 0, $thumbWidth, $thumbHeight, $origWidth, $origHeight);
                        // Save as JPEG, quality set to 75 (0-100) to significantly reduce size
                        imagejpeg($thumbImage, $thumbDestination, 75);

                    } else {
                        copy($historyDestination, $thumbDestination);
                    }
                } else {
                    copy($historyDestination, $thumbDestination);
                }
            } else {
                // If no GD library is installed, copy the original image directly as a thumbnail to avoid errors
                copy($historyDestination, $thumbDestination);
            }
        }
        // --- Thumbnail generation ends ---
        // Check if permission is 0777, if so, add a warning message
        $warningMsg = '';
        if (substr(sprintf('%o', fileperms($uploadDir)), -4) === '0777') {
            $warningMsg = " (⚠️ Warning: Upload folder permission is 0777, severe security risk, recommend changing to 0755)";
        }

        // Get relative path to return to frontend (return latest copied path for compatibility, or return history path is acceptable)
        $path = 'processed/' . $latestFileName;
        echo json_encode([
            'success' => true,
            'message' => 'File uploaded successfully' . $warningMsg,
            'path' => $path
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to move file, please check folder permissions.'
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'No file received or error occurred during upload.',
        'error_code' => isset($_FILES['image']) ? $_FILES['image']['error'] : 'No File'
    ]);
}
?>