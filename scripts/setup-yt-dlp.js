// Replace scripts/setup-yt-dlp.js with this enhanced version

const { promises: fs } = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

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

async function setWindowsPermissions(filePath) {
    if (process.platform === 'win32') {
        try {
            // Remove any read-only attributes
            execSync(`attrib -r "${filePath}"`, { stdio: 'ignore' });
            
            // Try to unblock the file if it was downloaded from internet
            try {
                execSync(`powershell -Command "Unblock-File -Path '${filePath}'"`, { stdio: 'ignore' });
                console.log('✓ Unblocked file for Windows security');
            } catch (e) {
                // Unblock-File might not be available on all Windows versions
            }
            
            // Set full permissions for current user
            try {
                const username = process.env.USERNAME || process.env.USER;
                execSync(`icacls "${filePath}" /grant "${username}:F"`, { stdio: 'ignore' });
                console.log('✓ Set file permissions for current user');
            } catch (e) {
                console.log('Note: Could not set explicit permissions, but file should still work');
            }
        } catch (err) {
            console.warn('Warning: Could not set Windows permissions:', err.message);
        }
    }
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
    
    // Check if file exists and is accessible
    let needsReinstall = false;
    try {
        await fs.access(finalPath, fs.constants.F_OK | fs.constants.X_OK);
        const stats = await fs.stat(finalPath);
        
        if (stats.size > 1000) {
            // Try to execute it to verify it works
            try {
                if (platform === 'win32') {
                    execSync(`"${finalPath}" --version`, { stdio: 'ignore' });
                } else {
                    execSync(`"${finalPath}" --version`, { stdio: 'ignore' });
                }
                console.log(`✓ ${path.basename(finalPath)} already exists and is valid. Setup complete.`);
                return;
            } catch (testErr) {
                console.log(`Found ${path.basename(finalPath)} but it's not executable. Re-installing...`);
                needsReinstall = true;
            }
        } else {
            console.log(`Found invalid ${path.basename(finalPath)}. Re-installing...`);
            needsReinstall = true;
        }
    } catch (err) {
        console.log(`${path.basename(finalPath)} not found, beginning installation...`);
        needsReinstall = true;
    }

    if (!needsReinstall) {
        return;
    }

    if (platform === 'win32') {
        const sourcePath = path.join(binDir, WIN_SOURCE_NAME);
        try {
            console.log('Windows detected. Downloading yt-dlp...');
            
            console.log('Cleaning up old files...');
            try { await fs.unlink(sourcePath); } catch (e) {}
            try { await fs.unlink(finalPath); } catch (e) {}

            await downloadFile(WIN_SOURCE_URL, sourcePath);
            
            const stats = await fs.stat(sourcePath);
            if (stats.size < 1000) {
                throw new Error(`Downloaded file is empty or too small. Check network or firewall.`);
            }
            console.log(`✓ Downloaded ${WIN_SOURCE_NAME} successfully (${(stats.size / 1024 / 1024).toFixed(1)} MB).`);

            console.log(`Renaming ${WIN_SOURCE_NAME} to ${WIN_FINAL_NAME}...`);
            await fs.rename(sourcePath, finalPath);
            console.log('✓ Rename successful.');
            
            // Set permissions on Windows
            await setWindowsPermissions(finalPath);

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
    
    // Final verification
    try {
        const { stdout } = await execAsync(`"${finalPath}" --version`);
        console.log(`✓ Final verification successful. Version: ${stdout.trim()}`);
    } catch (testErr) {
        console.error(`✗ Warning: Could not verify final installation:`, testErr.message);
        console.log('This might be due to antivirus software. Please check your antivirus settings.');
        
        if (platform === 'win32') {
            console.log('\nTroubleshooting steps:');
            console.log('1. Check if Windows Defender or antivirus is blocking yt-dlp.exe');
            console.log('2. Add the "bin" folder to your antivirus exclusions');
            console.log('3. Right-click yt-dlp.exe, go to Properties, and check "Unblock" if present');
        }
    }
}

// Also download ffmpeg-static files to bin directory
async function setupFFmpeg() {
    const platform = process.platform;
    const binDir = path.join(path.dirname(__dirname), 'bin');
    
    try {
        const ffmpegStatic = require('ffmpeg-static');
        const ffmpegPath = ffmpegStatic.path || ffmpegStatic;
        
        if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
            const targetPath = path.join(binDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
            
            // Check if already copied
            try {
                await fs.access(targetPath, fs.constants.F_OK);
                console.log('✓ FFmpeg already exists in bin directory');
                return;
            } catch (e) {
                // File doesn't exist, copy it
            }
            
            console.log('Copying ffmpeg to bin directory...');
            await fs.copyFile(ffmpegPath, targetPath);
            
            if (platform !== 'win32') {
                await fs.chmod(targetPath, 0o755);
            } else {
                await setWindowsPermissions(targetPath);
            }
            
            console.log('✓ FFmpeg copied successfully');
        }
    } catch (err) {
        console.log('Note: Could not copy ffmpeg-static to bin directory:', err.message);
    }
}

// Run both setups
(async () => {
    await setupDownloader();
    await setupFFmpeg();
})().catch((err) => {
    console.error("An unexpected error occurred during setup:", err);
});