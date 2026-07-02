// Create By Jackie
// Date: 2026/4/30
// Copyright 2026 Jackie All Rights Reserved.

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

        // Close mobile menu when clicking navigation links/buttons
        mainNav.querySelectorAll('a, button').forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('show');
            });
        });
    }

    let fileToDelete = null;

    // Load Images
    function loadImages() {
        fetch('/api/list_images')
            .then(response => {
                if (!response.ok) throw new Error("HTTP error " + response.status);
                return response.json();
            })
            .then(data => {
                galleryGrid.innerHTML = ''; // Clear loading text

                if (data.success && data.data.length > 0) {
                    data.data.forEach(image => {
                        const card = createImageCard(image);
                        galleryGrid.appendChild(card);
                    });
                } else {
                    galleryGrid.innerHTML = '<div class="loading-text" style="grid-column: 1/-1; text-align: center;">目前沒有任何已上傳的圖片。</div>';
                }
            })
            .catch(err => {
                console.error('Error fetching images:', err);
                galleryGrid.innerHTML = '<div class="loading-text" style="color: #f87171; grid-column: 1/-1; text-align: center; padding: 30px; line-height: 1.8; background: rgba(239,68,68,0.1); border-radius: 12px; border: 1px solid rgba(239,68,68,0.3);"><h3 style="margin-bottom: 10px; color: #fca5a5;">⚠️ 無法連接到後端伺服器 (讀取圖片清單失敗)</h3><p style="font-size: 0.95rem; color: #cbd5e1;">請確認後端伺服器 (執行專案目錄下的 <b>run.bat</b> 或 <b>python main.py</b>) 是否正在運行！<br>並請確保您是透過瀏覽器訪問網址 <a href="http://localhost:8000/admin.html" style="color: #60a5fa; text-decoration: underline;">http://localhost:8000/admin.html</a> 進入此頁面。</p></div>';
            });
    }

    // Format Date
    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Set as Latest Image (latest.png)
    function setAsLatest(filename) {
        fetch('/api/set_latest', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: filename })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Success! This image has been set as the latest display image for E-Paper.');
                    checkLatestStatus(); // Update the status section above
                } else {
                    alert('Setup failed: ' + data.message);
                }
            })
            .catch(err => {
                console.error('Error setting latest:', err);
                alert('Error occurred, failed to set');
            });
    }

    // Create Image Card DOM
    function createImageCard(image) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        // Click card to open preview
        item.addEventListener('click', (e) => {
            // If clicking a button, don't trigger preview
            if (e.target.closest('button')) return;
            openLightbox(image.path); // Preview uses high-quality original image
        });

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-wrapper';
        const img = document.createElement('img');
        // Use thumbnail path (add timestamp to avoid cache)
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
        setLatestBtn.textContent = '📲';
        setLatestBtn.addEventListener('click', () => {
            setAsLatest(image.name);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '🗑️';
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

    // Open Lightbox
    function openLightbox(src) {
        lightboxImg.src = `${src}?t=${new Date().getTime()}`;
        lightbox.classList.add('active');
    }

    // Close Lightbox
    lightboxClose.addEventListener('click', () => {
        lightbox.classList.remove('active');
        setTimeout(() => lightboxImg.src = '', 300);
    });

    // Click background to close Lightbox
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.classList.remove('active');
            setTimeout(() => lightboxImg.src = '', 300);
        }
    });

    // Open Delete Confirmation Dialog
    function openConfirmModal(filename) {
        fileToDelete = filename;
        confirmModal.classList.add('active');
    }

    // Close Delete Confirmation Dialog
    function closeConfirmModal() {
        confirmModal.classList.remove('active');
        fileToDelete = null;
    }

    cancelDeleteBtn.addEventListener('click', closeConfirmModal);

    // Click background to close Delete Confirmation Dialog
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            closeConfirmModal();
        }
    });

    // Confirm Delete Logic
    confirmDeleteBtn.addEventListener('click', () => {
        if (!fileToDelete) return;

        fetch('/api/delete_image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: fileToDelete })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // If the deleted file is the latest image, update the status above
                    if (fileToDelete === 'latest.png') {
                        checkLatestStatus();
                    } else {
                        // Otherwise, reload the list to update the UI
                        loadImages();
                    }
                    closeConfirmModal();
                } else {
                    alert('Delete failed: ' + data.message);
                    closeConfirmModal();
                }
            })
            .catch(err => {
                console.error('Delete error:', err);
                alert('Error occurred, failed to delete');
                closeConfirmModal();
            });
    });

    // Check latest display image status
    function checkLatestStatus() {
        fetch('/api/check_latest')
            .then(res => res.json())
            .then(data => {
                if (data.exists) {
                    latestStatusContainer.innerHTML = `
                        <div class="latest-actions">
                            <button id="preview-latest-btn" class="btn btn-secondary">Preview Display Image</button>
                        </div>
                    `;
                    document.getElementById('preview-latest-btn').addEventListener('click', () => {
                        openLightbox('processed/latest.png');
                    });
                } else {
                    latestStatusContainer.innerHTML = `<span class="text-danger">No default display image</span>`;
                }
            })
            .catch(err => console.error('Error checking latest status:', err));
    }

    // Initial loading
    loadImages();
    checkLatestStatus();
});
