let currentPath = '';

document.addEventListener('DOMContentLoaded', () => {
    loadDirectory('');
});

async function loadDirectory(path) {
    currentPath = path;
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);

        if (res.status === 401) {
            window.location.href = '/';
            return;
        }

        const data = await res.json();
        renderBreadcrumbs(path);
        renderFileList(data.items);
    } catch (err) {
        fileList.innerHTML = '<div class="error">Failed to load directory</div>';
    }
}

function renderBreadcrumbs(path) {
    const breadcrumbs = document.getElementById('breadcrumbs');
    let html = '<a href="#" data-path="">Home</a>';

    if (path) {
        const parts = path.split('/');
        let accumulated = '';

        for (const part of parts) {
            accumulated += (accumulated ? '/' : '') + part;
            html += `<span>/</span><a href="#" data-path="${accumulated}">${part}</a>`;
        }
    }

    breadcrumbs.innerHTML = html;

    // Add click handlers
    breadcrumbs.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            loadDirectory(link.dataset.path);
        });
    });
}

function renderFileList(items) {
    const fileList = document.getElementById('file-list');

    if (items.length === 0) {
        fileList.innerHTML = '<div class="empty">This folder is empty</div>';
        return;
    }

    // Sort: folders first, then files
    items.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name);
        }
        return a.isDirectory ? -1 : 1;
    });

    fileList.innerHTML = items.map(item => `
    <div class="file-item" data-name="${item.name}" data-is-dir="${item.isDirectory}">
      <span class="file-icon">${item.isDirectory ? '📁' : getFileIcon(item.name)}</span>
      <span class="file-name">${item.name}</span>
      ${item.size !== null ? `<span class="file-size">${formatSize(item.size)}</span>` : ''}
      <span class="file-action">${item.isDirectory ? '→' : '↓'}</span>
    </div>
  `).join('');

    // Add click handlers
    fileList.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.name;
            const isDir = item.dataset.isDir === 'true';
            const itemPath = currentPath ? `${currentPath}/${name}` : name;

            if (isDir) {
                loadDirectory(itemPath);
            } else {
                downloadFile(itemPath);
            }
        });
    });
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        // Images
        jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
        // Documents
        pdf: '📕', doc: '📄', docx: '📄', txt: '📄', rtf: '📄',
        // Code
        js: '📜', ts: '📜', py: '📜', html: '📜', css: '📜', json: '📜',
        // Archives
        zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
        // Media
        mp3: '🎵', wav: '🎵', mp4: '🎬', mov: '🎬', avi: '🎬'
    };
    return icons[ext] || '📄';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function downloadFile(path) {
    window.open(`/api/file?path=${encodeURIComponent(path)}`, '_blank');
}
