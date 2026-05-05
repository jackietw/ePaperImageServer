<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");

// Receive JSON format request
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if (!isset($input['filename']) || empty($input['filename'])) {
    echo json_encode(['success' => false, 'message' => 'Filename not provided']);
    exit;
}

$fileName = basename($input['filename']);
$uploadDir = __DIR__ . '/../../processed/';
$filePath = $uploadDir . $fileName;
$latestPath = $uploadDir . 'latest.png';
$pendingPath = $uploadDir . 'pending.bmp';

if (file_exists($filePath) && is_file($filePath)) {
    if (copy($filePath, $latestPath)) {
        // Generate uncompressed pending.bmp (for device to fetch)
        if (function_exists('imagecreatefromstring') && function_exists('imagebmp')) {
            $img = @imagecreatefromstring(file_get_contents($filePath));
            if ($img !== false) {
                imagebmp($img, $pendingPath);
            } else {
                copy($filePath, $pendingPath);
            }
        } else {
            copy($filePath, $pendingPath);
        }
        echo json_encode(['success' => true, 'message' => 'Set as default E-Paper image']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Setup failed, please check folder permissions']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Original file does not exist']);
}
?>