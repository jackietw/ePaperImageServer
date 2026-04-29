document.addEventListener('DOMContentLoaded', () => {
    const galleryGrid = document.getElementById('gallery-grid');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');
    
    const confirmModal = document.getElementById('confirm-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    
    const latestStatusContainer = document.getElementById('latest-status-container');
    
    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainNav = document.querySelector('.main-nav');
    if (mobileMenuBtn && mainNav) {
        mobileMenuBtn.addEventListener('click', () => {
            mainNav.classList.toggle('show');
        });
    }
    
    let fileToDelete = null;

    // 載入圖片清單
    function loadImages() {
        fetch('assets/api/api_list_images.php')
            .then(response => response.json())
            .then(data => {
                galleryGrid.innerHTML = ''; // 清空載入中字樣
                
                if (data.success && data.data.length > 0) {
                    data.data.forEach(image => {
                        const card = createImageCard(image);
                        galleryGrid.appendChild(card);
                    });
                } else {
                    galleryGrid.innerHTML = '<div class="loading-text" style="grid-column: 1/-1; text-align: center;">目前沒有上傳的圖片。</div>';
                }
            })
            .catch(err => {
                console.error('Error fetching images:', err);
                galleryGrid.innerHTML = '<div class="loading-text" style="color: var(--danger-color);">無法載入圖片。</div>';
            });
    }

    // 格式化日期
    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('zh-TW', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // 設為預設圖片 (latest.png)
    function setAsLatest(filename) {
        fetch('assets/api/api_set_latest.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: filename })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('成功！這張圖片已經設為電子紙最新的顯示圖片。');
                checkLatestStatus(); // 更新上方狀態區塊
            } else {
                alert('設定失敗：' + data.message);
            }
        })
        .catch(err => {
            console.error('Error setting latest:', err);
            alert('發生錯誤，無法設定');
        });
    }

    // 建立圖片卡片 DOM
    function createImageCard(image) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        // 點擊卡片開啟預覽
        item.addEventListener('click', (e) => {
            // 如果點擊的是按鈕，不要觸發預覽
            if(e.target.closest('button')) return;
            openLightbox(image.path); // 預覽維持用高畫質原圖
        });

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-wrapper';
        const img = document.createElement('img');
        // 使用縮圖路徑 (加入時間戳記避免快取)
        img.src = `${image.thumb_path}?t=${new Date().getTime()}`;
        img.alt = image.name;
        img.loading = 'lazy';
        imgWrapper.appendChild(img);

        const info = document.createElement('div');
        info.className = 'item-info';

        const details = document.createElement('div');
        details.className = 'item-details';
        
        const name = document.createElement('div');
        name.className = 'item-name';
        name.title = image.name;
        name.textContent = image.name;
        
        const date = document.createElement('div');
        date.className = 'item-date';
        date.textContent = formatDate(image.time);

        details.appendChild(name);
        details.appendChild(date);

        const btnGroup = document.createElement('div');
        btnGroup.className = 'btn-group';

        const setLatestBtn = document.createElement('button');
        setLatestBtn.className = 'set-latest-btn';
        setLatestBtn.textContent = '設為顯示';
        setLatestBtn.addEventListener('click', () => {
            setAsLatest(image.name);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '刪除';
        delBtn.addEventListener('click', () => {
            openConfirmModal(image.name);
        });

        btnGroup.appendChild(setLatestBtn);
        btnGroup.appendChild(delBtn);

        info.appendChild(details);
        info.appendChild(btnGroup);

        item.appendChild(imgWrapper);
        item.appendChild(info);

        return item;
    }

    // 開啟 Lightbox
    function openLightbox(src) {
        lightboxImg.src = `${src}?t=${new Date().getTime()}`;
        lightbox.classList.add('active');
    }

    // 關閉 Lightbox
    lightboxClose.addEventListener('click', () => {
        lightbox.classList.remove('active');
        setTimeout(() => lightboxImg.src = '', 300);
    });

    // 點擊背景關閉 Lightbox
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.classList.remove('active');
            setTimeout(() => lightboxImg.src = '', 300);
        }
    });

    // 開啟刪除確認框
    function openConfirmModal(filename) {
        fileToDelete = filename;
        confirmModal.classList.add('active');
    }

    // 關閉刪除確認框
    function closeConfirmModal() {
        confirmModal.classList.remove('active');
        fileToDelete = null;
    }

    cancelDeleteBtn.addEventListener('click', closeConfirmModal);

    // 點擊背景關閉確認框
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            closeConfirmModal();
        }
    });

    // 確認刪除邏輯
    confirmDeleteBtn.addEventListener('click', () => {
        if (!fileToDelete) return;

        fetch('assets/api/api_delete_image.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: fileToDelete })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 如果刪除的是預設圖，更新上方狀態
                if (fileToDelete === 'latest.png') {
                    checkLatestStatus();
                } else {
                    // 否則重新載入列表以更新 UI
                    loadImages();
                }
                closeConfirmModal();
            } else {
                alert('刪除失敗：' + data.message);
                closeConfirmModal();
            }
        })
        .catch(err => {
            console.error('Delete error:', err);
            alert('發生錯誤，無法刪除');
            closeConfirmModal();
        });
    });

    // 檢查最新預設圖狀態
    function checkLatestStatus() {
        fetch('assets/api/api_check_latest.php')
            .then(res => res.json())
            .then(data => {
                if (data.exists) {
                    latestStatusContainer.innerHTML = `
                        <div class="latest-actions">
                            <button id="preview-latest-btn" class="btn btn-secondary">預覽顯示圖</button>
                            <button id="delete-latest-btn" class="btn btn-danger">刪除預設圖</button>
                        </div>
                    `;
                    document.getElementById('preview-latest-btn').addEventListener('click', () => {
                        openLightbox('processed/latest.png');
                    });
                    document.getElementById('delete-latest-btn').addEventListener('click', () => {
                        openConfirmModal('latest.png');
                    });
                } else {
                    latestStatusContainer.innerHTML = `<span class="text-danger">沒有預設顯示圖檔</span>`;
                }
            })
            .catch(err => console.error('Error checking latest status:', err));
    }

    // 初始載入
    loadImages();
    checkLatestStatus();
});
