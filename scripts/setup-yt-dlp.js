// scripts/setup-yt-dlp.js
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadFile(url, dest) {
    const file = createWriteStream(dest);
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest);
            reject(err);
        });
    });
}

async function setupYtDlp() {
    const binDir = path.join(path.dirname(__dirname), 'bin');
    
    // Create bin directory if it doesn't exist
    try {
        await fs.mkdir(binDir, { recursive: true });
    } catch (err) {
        console.error('Error creating bin directory:', err);
    }

    const platform = process.platform;
    let ytDlpPath;
    let downloadUrl;

    if (platform === 'win32') {
        ytDlpPath = path.join(binDir, 'yt-dlp.exe');
        downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    } else if (platform === 'darwin') {
        ytDlpPath = path.join(binDir, 'yt-dlp');
        downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    } else {
        ytDlpPath = path.join(binDir, 'yt-dlp');
        downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    }

    // Check if yt-dlp already exists
    try {
        await fs.access(ytDlpPath);
        console.log('yt-dlp already exists at:', ytDlpPath);
        return;
    } catch (err) {
        // File doesn't exist, proceed with download
    }

    console.log('Downloading yt-dlp...');
    try {
        await downloadFile(downloadUrl, ytDlpPath);
        
        // Make executable on Unix-like systems
        if (platform !== 'win32') {
            await fs.chmod(ytDlpPath, 0o755);
        }
        
        console.log('yt-dlp downloaded successfully to:', ytDlpPath);
    } catch (err) {
        console.error('Error downloading yt-dlp:', err);
        console.log('You can manually download yt-dlp from: https://github.com/yt-dlp/yt-dlp/releases');
    }
}

setupYtDlp().catch(console.error);