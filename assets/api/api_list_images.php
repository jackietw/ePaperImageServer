<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

$uploadDir = __DIR__ . '/../../processed/';
$images = [];

if (is_dir($uploadDir)) {
    // 取得所有檔案
    $files = scandir($uploadDir);
    foreach ($files as $file) {
        // 過濾掉 ., .., latest.png 以及縮圖 (以 thumb_ 開頭)
        if ($file !== '.' && $file !== '..' && $file !== 'latest.png' && strpos($file, 'thumb_') !== 0) {
            $filePath = $uploadDir . $file;
            // 簡易檢查副檔名
            if (is_file($filePath) && preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $file)) {

                // 檢查對應的縮圖是否存在 (現在縮圖強制存成 .jpg)
                $thumbName = 'thumb_' . preg_replace('/\.(png|jpe?g|gif|webp)$/i', '.jpg', $file);
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

// 依照修改時間排序，最新的在最前面
usort($images, function ($a, $b) {
    return $b['time'] - $a['time'];
});

echo json_encode([
    'success' => true,
    'data' => $images
]);
?>