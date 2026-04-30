<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

$latestPath = __DIR__ . '/../../processed/latest.bmp';

echo json_encode([
    'exists' => file_exists($latestPath) && is_file($latestPath)
]);
?>