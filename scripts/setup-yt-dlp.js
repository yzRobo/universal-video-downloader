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
    console.log(`Downloading from: ${url}`);
    const file = createWriteStream(dest);
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }
        }).on('error', (err) => {
            fs.unlink(dest).catch(() => {});
            reject(err);
        });
    });
}

async function setupYtDlp() {
    const binDir = path.join(path.dirname(__dirname), 'bin');
    
    // Create bin directory if it doesn't exist
    try {
        await fs.mkdir(binDir, { recursive: true });
        console.log('Created bin directory at:', binDir);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.error('Error creating bin directory:', err);
            return;
        }
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
        console.log('✓ yt-dlp already exists at:', ytDlpPath);
        
        // Verify it's executable on Unix-like systems
        if (platform !== 'win32') {
            try {
                await fs.chmod(ytDlpPath, 0o755);
                console.log('✓ Made yt-dlp executable');
            } catch (err) {
                console.error('Warning: Could not set executable permissions:', err.message);
            }
        }
        return;
    } catch (err) {
        // File doesn't exist, proceed with download
        console.log('yt-dlp not found, downloading...');
    }

    try {
        await downloadFile(downloadUrl, ytDlpPath);
        
        // Make executable on Unix-like systems
        if (platform !== 'win32') {
            await fs.chmod(ytDlpPath, 0o755);
            console.log('✓ Made yt-dlp executable');
        }
        
        console.log('✓ yt-dlp downloaded successfully to:', ytDlpPath);
        
        // Test if yt-dlp works
        try {
            const { stdout } = await execAsync(`"${ytDlpPath}" --version`);
            console.log('✓ yt-dlp version:', stdout.trim());
        } catch (testErr) {
            console.error('Warning: Could not verify yt-dlp installation:', testErr.message);
        }
    } catch (err) {
        console.error('Error downloading yt-dlp:', err.message);
        console.log('\nManual installation instructions:');
        console.log('1. Go to: https://github.com/yt-dlp/yt-dlp/releases');
        console.log('2. Download the appropriate file for your system:');
        console.log('   - Windows: yt-dlp.exe');
        console.log('   - macOS: yt-dlp_macos');
        console.log('   - Linux: yt-dlp');
        console.log(`3. Place it in: ${binDir}`);
        if (platform !== 'win32') {
            console.log('4. Make it executable: chmod +x yt-dlp');
        }
    }
}

setupYtDlp().catch(console.error);