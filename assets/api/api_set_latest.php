<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");

// 接收 JSON 格式的請求
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if (!isset($input['filename']) || empty($input['filename'])) {
    echo json_encode(['success' => false, 'message' => '未提供檔名']);
    exit;
}

$fileName = basename($input['filename']);
$uploadDir = __DIR__ . '/../../processed/';
$filePath = $uploadDir . $fileName;
$latestPath = $uploadDir . 'latest.png';

if (file_exists($filePath) && is_file($filePath)) {
    if (copy($filePath, $latestPath)) {
        echo json_encode(['success' => true, 'message' => '已設為電子紙預設圖']);
    } else {
        echo json_encode(['success' => false, 'message' => '設定失敗，請檢查資料夾權限']);
    }
} else {
    echo json_encode(['success' => false, 'message' => '原始檔案不存在']);
}
?>