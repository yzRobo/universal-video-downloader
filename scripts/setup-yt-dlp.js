// scripts/setup-yt-dlp.js
const { promises: fs } = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios'); // Use the robust axios library for downloads

const execAsync = promisify(exec);

// --- CONFIGURATION ---
const EXECUTABLE_NAME = 'yt-dlp';
const WIN_FINAL_NAME = `${EXECUTABLE_NAME}.exe`;
const WIN_SOURCE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_x86.exe';
const WIN_SOURCE_NAME = 'yt-dlp_x86.exe';

const DOWNLOAD_URL_MACOS = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${EXECUTABLE_NAME}_macos`;
const DOWNLOAD_URL_LINUX = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${EXECUTABLE_NAME}`;
// --- END CONFIGURATION ---

async function downloadFile(url, dest) {
    console.log(`Attempting to download from: ${url}`);
    
    const { data } = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        }
    });

    const writer = createWriteStream(dest);
    data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function setupDownloader() {
    console.log(`--- Setting up ${EXECUTABLE_NAME} ---`);
    const binDir = path.join(path.dirname(__dirname), 'bin');
    
    try {
        await fs.mkdir(binDir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.error('Error creating bin directory:', err);
            return;
        }
    }

    const platform = process.platform;
    const finalPath = path.join(binDir, platform === 'win32' ? WIN_FINAL_NAME : EXECUTABLE_NAME);
    
    try {
        await fs.access(finalPath);
        const stats = await fs.stat(finalPath);
        if (stats.size > 1000) {
             console.log(`✓ ${path.basename(finalPath)} already exists and is valid. Setup complete.`);
             return;
        }
        console.log(`Found invalid ${path.basename(finalPath)}. Re-installing...`);
    } catch (err) {
        console.log(`${path.basename(finalPath)} not found, beginning installation...`);
    }

    if (platform === 'win32') {
        const sourcePath = path.join(binDir, WIN_SOURCE_NAME);
        try {
            console.log('Windows detected. Forcing 32-bit download for compatibility.');
            
            console.log('Cleaning up old files...');
            await fs.unlink(sourcePath).catch(() => {});
            await fs.unlink(finalPath).catch(() => {});

            await downloadFile(WIN_SOURCE_URL, sourcePath);
            
            const stats = await fs.stat(sourcePath);
            if (stats.size < 1000) {
                throw new Error(`Downloaded file is empty or too small. Check network or firewall.`);
            }
            console.log(`✓ Downloaded ${WIN_SOURCE_NAME} successfully (${(stats.size / 1024).toFixed(0)} KB).`);

            console.log(`Renaming ${WIN_SOURCE_NAME} to ${WIN_FINAL_NAME}...`);
            await fs.rename(sourcePath, finalPath);
            console.log('✓ Rename successful.');

        } catch (downloadErr) {
            console.error(`✗ Windows setup failed:`, downloadErr.message);
            return;
        }
    } else {
        // Logic for macOS and Linux
        let downloadUrl = platform === 'darwin' ? DOWNLOAD_URL_MACOS : DOWNLOAD_URL_LINUX;
        try {
            await downloadFile(downloadUrl, finalPath);
            await fs.chmod(finalPath, 0o755);
            console.log(`✓ Downloaded and set permissions for ${path.basename(finalPath)}`);
        } catch (downloadErr) {
            console.error(`✗ Download failed for ${platform}:`, downloadErr.message);
            return;
        }
    }
    
    try {
        const { stdout } = await execAsync(`"${finalPath}" --version`);
        console.log(`✓ Final verification successful. Version: ${stdout.trim()}`);
    } catch (testErr) {
        console.error(`✗ Warning: Could not verify final installation:`, testErr.message);
    }
}

setupDownloader().catch((err) => {
    console.error("An unexpected error occurred during setup:", err);
});