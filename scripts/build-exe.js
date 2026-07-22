// scripts/build-exe.js - Builds the single self-contained executable.
// The exe downloads yt-dlp/ffmpeg by itself on first run, so the only
// distributable artifact is UniversalVideoDownloader.exe.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Universal Video Downloader - EXE Builder');
console.log('========================================\n');

// Check if pkg is installed
try {
    execSync('pkg --version', { stdio: 'ignore' });
    console.log('✓ pkg is installed');
} catch (e) {
    console.log('Installing pkg globally...');
    try {
        execSync('npm install -g pkg', { stdio: 'inherit' });
        console.log('✓ pkg installed successfully');
    } catch (installError) {
        console.error('✗ Failed to install pkg. Please run: npm install -g pkg');
        process.exit(1);
    }
}

// Create dist directory
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Build the executable
console.log('\nBuilding executable...');
console.log('This may take a few minutes...\n');

try {
    const outputName = 'UniversalVideoDownloader.exe';

    execSync(`pkg . --targets node18-win-x64 --output dist/${outputName} --compress GZip`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
    });

    console.log('\n✓ Build successful!');
    console.log(`Executable created: dist\\${outputName}`);
    console.log(`Size: ${(fs.statSync(path.join(distDir, outputName)).size / 1024 / 1024).toFixed(1)} MB`);

    // Flip console → GUI subsystem so no terminal window appears on launch
    console.log('\nPatching to GUI subsystem (no console window)...');
    execSync(`node "${path.join(__dirname, 'patch-subsystem.js')}" "${path.join(distDir, outputName)}"`, {
        stdio: 'inherit'
    });

    const readmeContent = `# Universal Video Downloader - Portable Version

## How to Use
Simply double-click "UniversalVideoDownloader.exe" to start the application.
Your default web browser will automatically open to the interface.

The exe is fully self-contained and runs with NO terminal window. On
first run it downloads its required components (yt-dlp and ffmpeg) into a
"bin" folder next to itself, and creates a "downloads" folder for your
files. After that, everything is kept up to date automatically:
- yt-dlp updates itself every time the app starts
- The app checks GitHub for new releases and can update itself from the UI

## First Time Use
1. Windows may show a security warning - click "More info" then "Run anyway"
2. Your firewall may ask for permission - click "Allow"
3. The first start downloads ~100 MB of components (one time only). The app
   window will show setup progress; it is ready in about a minute.
4. Your app window opens automatically.

## Closing the Application
Close the app window/tab. To fully stop the background server, use the
"Quit" behavior of the app, or end "UniversalVideoDownloader.exe" from
Task Manager. A "uvd-log.txt" file next to the exe records activity if you
ever need to troubleshoot.`;

    fs.writeFileSync(path.join(distDir, 'README.txt'), readmeContent);
    console.log('✓ Created README.txt');

    console.log('\n========================================');
    console.log('Build complete!');
    console.log('\nDistribute a release by uploading ONLY:');
    console.log(`  dist\\${outputName}`);
    console.log('\nThe exe bootstraps yt-dlp/ffmpeg on first run.');
    console.log('========================================');

} catch (buildError) {
    console.error('\n✗ Build failed:', buildError.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure all node_modules are installed: npm install');
    console.log('2. Try building with verbose output: pkg . --debug');
    console.log('3. Check if antivirus is blocking the build process');
    process.exit(1);
}
