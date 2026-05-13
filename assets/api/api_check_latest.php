<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

$latestPath = __DIR__ . '/../../processed/latest.png';

if (file_exists($latestPath) && is_file($latestPath)) {
    echo json_encode([
        'exists' => true,
        'timestamp' => filemtime($latestPath),
        'size' => filesize($latestPath)
    ]);
} else {
    echo json_encode([
        'exists' => false
    ]);
}
?>