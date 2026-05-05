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
                    galleryGrid.innerHTML = '<div class="loading-text" style="grid-column: 1/-1; text-align: center;">No uploaded images currently.</div>';
                }
            })
            .catch(err => {
                console.error('Error fetching images:', err);
                galleryGrid.innerHTML = '<div class="loading-text" style="color: var(--danger-color);">Failed to load images.</div>';
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

    // 設為預設圖片 (latest.bmp)
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
        setLatestBtn.textContent = 'Set as Display';
        setLatestBtn.addEventListener('click', () => {
            setAsLatest(image.name);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = 'Delete';
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
        fetch('assets/api/api_check_latest.php')
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
