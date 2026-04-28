<?php
header('Content-Type: application/json');

// 允許跨網域請求 (若前端與後端在不同網域時使用)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");

$uploadDir = __DIR__ . '/processed/';

// 若資料夾不存在，則建立它
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// 檢查是否有檔案上傳
if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    $tmpName = $_FILES['image']['tmp_name'];
    
    // 產生唯一檔名，保留歷史紀錄
    $timestamp = time();
    $historyFileName = 'epaper_' . $timestamp . '.png';
    $latestFileName = 'latest.png'; 
    
    $historyDestination = $uploadDir . $historyFileName;
    $latestDestination = $uploadDir . $latestFileName;

    if (move_uploaded_file($tmpName, $historyDestination)) {
        // 成功儲存歷史紀錄後，複製一份覆寫給 latest.png
        copy($historyDestination, $latestDestination);
        
        // --- 產生縮圖 ---
        $thumbName = 'thumb_epaper_' . $timestamp . '.jpg';
        $thumbDestination = $uploadDir . $thumbName;
        
        $info = getimagesize($historyDestination);
        if ($info !== false) {
            // 檢查伺服器是否有安裝 GD 函式庫
            if (function_exists('imagecreatetruecolor')) {
                $mime = $info['mime'];
                $srcImage = null;
                if ($mime === 'image/jpeg') {
                    $srcImage = @imagecreatefromjpeg($historyDestination);
                } elseif ($mime === 'image/png') {
                    $srcImage = @imagecreatefrompng($historyDestination);
                } elseif ($mime === 'image/webp') {
                    $srcImage = @imagecreatefromwebp($historyDestination);
                } elseif ($mime === 'image/gif') {
                    $srcImage = @imagecreatefromgif($historyDestination);
                }
                
                if ($srcImage) {
                    $origWidth = imagesx($srcImage);
                    $origHeight = imagesy($srcImage);
                    
                    if ($origWidth > 0) {
                        // 設定縮圖寬高 (最大寬度400)
                        $thumbWidth = 400;
                        $thumbHeight = floor($origHeight * ($thumbWidth / $origWidth));
                        
                        $thumbImage = imagecreatetruecolor($thumbWidth, $thumbHeight);
                        
                        // JPEG 不支援透明背景，所以先把背景填滿白色
                        $white = imagecolorallocate($thumbImage, 255, 255, 255);
                        imagefill($thumbImage, 0, 0, $white);
                        
                        imagecopyresampled($thumbImage, $srcImage, 0, 0, 0, 0, $thumbWidth, $thumbHeight, $origWidth, $origHeight);
                        // 存成 JPEG，品質設定為 75 (0-100)，能大幅縮減大小
                        imagejpeg($thumbImage, $thumbDestination, 75); 
                        
                        imagedestroy($srcImage);
                        imagedestroy($thumbImage);
                    } else {
                        copy($historyDestination, $thumbDestination);
                    }
                } else {
                    copy($historyDestination, $thumbDestination);
                }
            } else {
                // 如果沒有 GD 函式庫，直接複製原圖當作縮圖以免報錯
                copy($historyDestination, $thumbDestination);
            }
        }
        // --- 縮圖產生結束 ---
        // 檢查權限是否為 0777，若是則加上警告訊息
        $warningMsg = '';
        if (substr(sprintf('%o', fileperms($uploadDir)), -4) === '0777') {
            $warningMsg = " (⚠️ 警告：上傳資料夾權限為 0777，有嚴重的安全風險，建議改為 0755)";
        }
        
        // 取得相對路徑回傳給前端 (這裡回傳最新複製的路徑以保持相容性，或回傳歷史路徑皆可)
        $path = 'processed/' . $latestFileName;
        echo json_encode([
            'success' => true,
            'message' => '檔案上傳成功' . $warningMsg,
            'path' => $path
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => '檔案移動失敗，請檢查資料夾權限。'
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => '未收到檔案或上傳過程發生錯誤。',
        'error_code' => isset($_FILES['image']) ? $_FILES['image']['error'] : 'No File'
    ]);
}
?>
