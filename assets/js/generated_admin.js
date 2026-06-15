document.addEventListener('DOMContentLoaded', () => {
    const galleryGrid = document.getElementById('gallery-grid');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');
    const confirmModal = document.getElementById('confirm-modal');
    const logModal = document.getElementById('log-modal');
    const logContent = document.getElementById('log-content');
    
    let deleteTarget = null;
    let allGeneratedData = [];

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            document.querySelector('.main-nav').classList.toggle('active');
            this.classList.toggle('active');
        });
    }

    // Load images
    async function loadImages() {
        try {
            const response = await fetch('/api/list_generated');
            const data = await response.json();

            if (data.success) {
                allGeneratedData = data.data;
                renderGallery(allGeneratedData);
            } else {
                galleryGrid.innerHTML = '<div class="loading-text">Failed to load images.</div>';
            }
        } catch (error) {
            console.error('Error fetching images:', error);
            galleryGrid.innerHTML = '<div class="loading-text">Error loading images. Check server connection.</div>';
        }
    }

    // Render gallery
    function renderGallery(images) {
        galleryGrid.innerHTML = '';
        
        if (images.length === 0) {
            galleryGrid.innerHTML = '<div class="loading-text" style="grid-column: 1 / -1;">No generated images found.</div>';
            return;
        }

        images.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            
            // Format time
            const date = new Date(img.time * 1000);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Format size
            const sizeKB = (img.size / 1024).toFixed(1);

            let promptSnippet = "";
            if (img.log && img.log.params && img.log.params.prompt) {
                promptSnippet = img.log.params.prompt.substring(0, 40);
                if (img.log.params.prompt.length > 40) promptSnippet += "...";
            }

            card.innerHTML = `
                <img src="${img.path}?t=${Date.now()}" alt="${img.name}" loading="lazy" class="gallery-img" data-path="${img.path}">
                <div class="card-info" style="padding: 10px;">
                    <div class="filename">${img.name}</div>
                    <div class="meta">${dateStr} • ${sizeKB} KB</div>
                    ${promptSnippet ? `<div style="font-size: 0.8rem; color: #cbd5e1; margin-top: 5px; font-style: italic;">"${promptSnippet}"</div>` : ''}
                    <div class="card-actions" style="margin-top: 10px; display: flex; flex-direction: column; gap: 5px;">
                        <button class="btn btn-primary send-editor-btn" data-filename="${img.path}" style="padding: 6px; font-size: 0.85rem; width: 100%;">🎨 Send to Editor (Dithering)</button>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-secondary view-log-btn" data-name="${img.name}" style="padding: 6px; font-size: 0.85rem; flex: 1;">📄 Log</button>
                            <button class="btn btn-danger delete-btn" data-filename="${img.name}" style="padding: 6px; font-size: 0.85rem; flex: 1;">🗑️ Delete</button>
                        </div>
                    </div>
                </div>
            `;
            
            galleryGrid.appendChild(card);
        });

        // Add event listeners to newly created elements
        document.querySelectorAll('.gallery-img').forEach(img => {
            img.addEventListener('click', (e) => {
                lightboxImg.src = e.target.getAttribute('data-path');
                lightbox.classList.add('active');
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTarget = e.target.getAttribute('data-filename');
                confirmModal.classList.add('active');
            });
        });

        document.querySelectorAll('.view-log-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = e.target.getAttribute('data-name');
                const imgData = allGeneratedData.find(i => i.name === name);
                if (imgData && imgData.log) {
                    logContent.innerHTML = `<pre>${JSON.stringify(imgData.log, null, 2)}</pre>`;
                } else {
                    logContent.innerHTML = `<p>No log data found for this image.</p>`;
                }
                logModal.style.display = 'flex';
            });
        });

        document.querySelectorAll('.send-editor-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const path = e.target.getAttribute('data-filename');
                
                // We will set this as 'latest.png' so the editor picks it up, or pass it via URL
                // Let's call /api/set_latest with the path
                try {
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                    
                    const response = await fetch('/api/set_latest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: path })
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        // Redirect to index.html with a query param to open editor
                        window.location.href = '/index.html?mode=editor';
                    } else {
                        alert('Failed to send to editor: ' + data.message);
                        btn.disabled = false;
                        btn.textContent = '🎨 Send to Editor (Dithering)';
                    }
                } catch (error) {
                    console.error(error);
                    alert('Error communicating with server.');
                    btn.disabled = false;
                    btn.textContent = '🎨 Send to Editor (Dithering)';
                }
            });
        });
    }

    // Lightbox close
    lightboxClose.addEventListener('click', () => {
        lightbox.classList.remove('active');
    });
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) lightbox.classList.remove('active');
    });

    // Log modal close
    document.getElementById('close-log').addEventListener('click', () => {
        logModal.style.display = 'none';
    });

    // Delete confirmation
    document.getElementById('cancel-delete').addEventListener('click', () => {
        confirmModal.classList.remove('active');
        deleteTarget = null;
    });

    document.getElementById('confirm-delete').addEventListener('click', async () => {
        if (!deleteTarget) return;
        
        try {
            const response = await fetch('/api/delete_generated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: deleteTarget })
            });
            
            const data = await response.json();
            if (data.success) {
                // Reload images
                loadImages();
            } else {
                alert('Delete failed: ' + data.message);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('An error occurred while deleting.');
        } finally {
            confirmModal.classList.remove('active');
            deleteTarget = null;
        }
    });

    // Initial load
    loadImages();
});
