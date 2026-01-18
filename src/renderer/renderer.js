const selectFolderBtn = document.getElementById('select-folder');
const folderName = document.getElementById('folder-name');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusIndicator = document.getElementById('status-indicator');
const shareSection = document.getElementById('share-section');
const shareLink = document.getElementById('share-link');
const sharePassword = document.getElementById('share-password');
const copyLinkBtn = document.getElementById('copy-link');
const copyPasswordBtn = document.getElementById('copy-password');

let folderSelected = false;

// Select folder
selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
        folderName.textContent = result.path;
        folderName.classList.add('selected');
        folderSelected = true;
        startBtn.disabled = false;
    }
});

// Start sharing
startBtn.addEventListener('click', async () => {
    setStatus('starting', 'Starting...');
    startBtn.disabled = true;

    const result = await window.electronAPI.startSharing();

    if (result.success) {
        setStatus('running', 'Running');
        shareLink.value = result.url;
        sharePassword.value = result.password;
        shareSection.style.display = 'block';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        selectFolderBtn.disabled = true;
    } else {
        setStatus('stopped', 'Stopped');
        startBtn.disabled = false;
        alert('Error: ' + result.error);
    }
});

// Stop sharing
stopBtn.addEventListener('click', async () => {
    await window.electronAPI.stopSharing();

    setStatus('stopped', 'Stopped');
    shareSection.style.display = 'none';
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    selectFolderBtn.disabled = false;
    startBtn.disabled = false;
});

// Copy link
copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLink.value);
    copyLinkBtn.textContent = '✓';
    setTimeout(() => {
        copyLinkBtn.textContent = '📋';
    }, 1500);
});

// Copy password
copyPasswordBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(sharePassword.value);
    copyPasswordBtn.textContent = '✓';
    setTimeout(() => {
        copyPasswordBtn.textContent = '📋';
    }, 1500);
});

function setStatus(state, text) {
    statusIndicator.className = 'status ' + state;
    statusIndicator.textContent = text;
}
