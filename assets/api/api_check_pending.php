<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

$pendingPath = __DIR__ . '/../../processed/pending.bmp';

if (file_exists($pendingPath) && is_file($pendingPath)) {
    echo json_encode([
        'exists' => true,
        'timestamp' => filemtime($pendingPath),
        'size' => filesize($pendingPath)
    ]);
} else {
    echo json_encode([
        'exists' => false
    ]);
}
?>
