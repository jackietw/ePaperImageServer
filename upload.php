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
    
    // 設定檔名，這裡直接覆寫最新一張圖片給電子紙抓取
    // 若要保留歷史紀錄可改為 'epaper_' . time() . '.png'
    $fileName = 'latest.png'; 
    $destination = $uploadDir . $fileName;

    if (move_uploaded_file($tmpName, $destination)) {
        // 成功儲存
        // 取得相對路徑回傳給前端
        $path = 'processed/' . $fileName;
        echo json_encode([
            'success' => true,
            'message' => '檔案上傳成功',
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
