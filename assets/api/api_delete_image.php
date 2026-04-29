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

$fileName = basename($input['filename']); // 使用 basename 避免目錄穿越漏洞
$uploadDir = __DIR__ . '/../../processed/';
$filePath = $uploadDir . $fileName;
$thumbPath = $uploadDir . 'thumb_' . preg_replace('/\.(png|jpe?g|gif|webp)$/i', '.jpg', $fileName);

if (file_exists($filePath) && is_file($filePath)) {
    if (unlink($filePath)) {
        // 同時嘗試刪除對應的縮圖
        if (file_exists($thumbPath) && is_file($thumbPath)) {
            unlink($thumbPath);
        }
        echo json_encode(['success' => true, 'message' => '檔案與縮圖刪除成功']);
    } else {
        echo json_encode(['success' => false, 'message' => '無法刪除檔案，請檢查權限']);
    }
} else {
    echo json_encode(['success' => false, 'message' => '檔案不存在']);
}
?>