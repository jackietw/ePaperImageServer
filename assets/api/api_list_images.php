<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

$uploadDir = __DIR__ . '/../../processed/';
$images = [];

if (is_dir($uploadDir)) {
    // Get all files
    $files = scandir($uploadDir);
    foreach ($files as $file) {
        // Filter out ., .., latest.bmp, latest.png, pending.bmp, and thumbnails (starting with thumb_)
        if ($file !== '.' && $file !== '..' && $file !== 'latest.bmp' && $file !== 'latest.png' && $file !== 'pending.bmp' && strpos($file, 'thumb_') !== 0) {
            $filePath = $uploadDir . $file;
            // Simple check for file extension
            if (is_file($filePath) && preg_match('/\.(jpg|jpeg|png|gif|webp|bmp)$/i', $file)) {

                // Check if the corresponding thumbnail exists (thumbnails are now forced to be saved as .jpg)
                $thumbName = 'thumb_' . preg_replace('/\.(png|jpe?g|gif|webp|bmp)$/i', '.jpg', $file);
                $thumbPathFull = $uploadDir . $thumbName;
                $thumbPath = file_exists($thumbPathFull) ? 'processed/' . $thumbName : 'processed/' . $file;

                $images[] = [
                    'name' => $file,
                    'path' => 'processed/' . $file,
                    'thumb_path' => $thumbPath,
                    'time' => filemtime($filePath),
                    'size' => filesize($filePath)
                ];
            }
        }
    }
}

// Sort by modification time, with the latest first
usort($images, function ($a, $b) {
    return $b['time'] - $a['time'];
});

echo json_encode([
    'success' => true,
    'data' => $images
]);
?>