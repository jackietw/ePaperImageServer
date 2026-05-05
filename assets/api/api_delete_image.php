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

$fileName = basename($input['filename']); // Use basename to avoid directory traversal vulnerability

// Protect system files from being deleted
if ($fileName === 'latest.bmp' || $fileName === 'latest.png' || $fileName === 'pending.bmp') {
    echo json_encode(['success' => false, 'message' => 'Cannot delete system reserved files.']);
    exit;
}

$uploadDir = __DIR__ . '/../../processed/';
$filePath = $uploadDir . $fileName;
$thumbPath = $uploadDir . 'thumb_' . preg_replace('/\.(png|jpe?g|gif|webp|bmp)$/i', '.jpg', $fileName);

if (file_exists($filePath) && is_file($filePath)) {
    if (unlink($filePath)) {
        // Delete thumbnail
        if (file_exists($thumbPath) && is_file($thumbPath)) {
            unlink($thumbPath);
        }
        echo json_encode(['success' => true, 'message' => 'File and thumbnail deleted successfully']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Cannot delete file, please check permissions']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'File does not exist']);
}
?>