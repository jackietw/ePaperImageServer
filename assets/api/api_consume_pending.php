<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");

$pendingPath = __DIR__ . '/../../processed/pending.bmp';

if (file_exists($pendingPath) && is_file($pendingPath)) {
    if (unlink($pendingPath)) {
        echo json_encode(['success' => true, 'message' => 'Pending image consumed and deleted.']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to delete pending image.']);
    }
} else {
    echo json_encode(['success' => true, 'message' => 'No pending image to consume.']);
}
?>
