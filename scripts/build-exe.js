// scripts/build-exe.js - Updated version without BAT file creation
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

// Ensure bin directory exists and has the required files
const binDir = path.join(__dirname, '..', 'bin');
const requiredFiles = ['yt-dlp.exe', 'ffmpeg.exe'];

console.log('\nChecking required binaries...');
for (const file of requiredFiles) {
    const filePath = path.join(binDir, file);
    if (fs.existsSync(filePath)) {
        const size = fs.statSync(filePath).size;
        console.log(`✓ ${file} found (${(size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
        console.error(`✗ ${file} not found in bin directory`);
        console.log('Please run "npm install" first to download required binaries');
        process.exit(1);
    }
}

// Create dist directory
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Update package.json for pkg
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Configure pkg to NOT include binaries (we'll copy them separately)
packageJson.pkg = {
    assets: [
        "public/**/*",
        "index.html"
    ],
    targets: ["node18-win-x64"],
    outputPath: "dist",
    compress: "GZip"
};

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('✓ Updated package.json configuration');

// Build the executable
console.log('\nBuilding executable...');
console.log('This may take a few minutes...\n');

try {
    const outputName = 'UniversalVideoDownloader.exe';
    
    // Run pkg
    execSync(`pkg . --targets node18-win-x64 --output dist/${outputName} --compress GZip`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
    });
    
    console.log('\n✓ Build successful!');
    console.log(`Executable created: dist\\${outputName}`);
    console.log(`Size: ${(fs.statSync(path.join(distDir, outputName)).size / 1024 / 1024).toFixed(1)} MB`);
    
    // Copy bin directory to dist
    console.log('\nCopying binaries to dist folder...');
    const distBinDir = path.join(distDir, 'bin');
    if (!fs.existsSync(distBinDir)) {
        fs.mkdirSync(distBinDir, { recursive: true });
    }
    
    // Copy each binary
    for (const file of requiredFiles) {
        const sourcePath = path.join(binDir, file);
        const destPath = path.join(distBinDir, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`✓ Copied ${file}`);
    }
    
    // Create downloads directory in dist
    const distDownloadsDir = path.join(distDir, 'downloads');
    if (!fs.existsSync(distDownloadsDir)) {
        fs.mkdirSync(distDownloadsDir, { recursive: true });
    }
    console.log('✓ Created downloads directory');
    
    // Create a README for the dist folder
    const readmeContent = `# Universal Video Downloader - Portable Version

## How to Use
Simply double-click "UniversalVideoDownloader.exe" to start the application.
Your default web browser will automatically open to the interface.

## File Structure
- UniversalVideoDownloader.exe - Main application
- bin/ - Required binaries (yt-dlp.exe, ffmpeg.exe) - DO NOT DELETE
- downloads/ - Downloaded files will be saved here

## Important Notes
- Keep all files and folders together in the same directory
- The bin folder contains essential components - do not delete or move it
- All downloads are saved in the downloads folder
- The application runs a local server on port 3000

## First Time Use
When you first run the application:
1. Windows may show a security warning - click "More info" then "Run anyway"
2. Your firewall may ask for permission - click "Allow"
3. Your browser will open automatically to http://localhost:3000

## Troubleshooting
If the application doesn't start:
1. Make sure the bin folder is in the same directory as the exe
2. Check that yt-dlp.exe and ffmpeg.exe are in the bin folder
3. Try running as administrator if needed
4. Check if port 3000 is already in use by another application
5. Temporarily disable antivirus/firewall to test

## Closing the Application
To properly close the application, close the console window that appears when you run the exe.`;
    
    fs.writeFileSync(path.join(distDir, 'README.txt'), readmeContent);
    console.log('✓ Created README.txt');
    
    console.log('\n========================================');
    console.log('Build complete!');
    console.log('\nDist folder contents:');
    console.log('  - UniversalVideoDownloader.exe (double-click to run)');
    console.log('  - bin/');
    console.log('    - yt-dlp.exe');
    console.log('    - ffmpeg.exe');
    console.log('  - downloads/');
    console.log('  - README.txt');
    console.log('\nThe browser will open automatically when the exe is run.');
    console.log('\nTo distribute: ZIP the entire dist folder');
    console.log('========================================');
    
} catch (buildError) {
    console.error('\n✗ Build failed:', buildError.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure all node_modules are installed: npm install');
    console.log('2. Try building with verbose output: pkg . --debug');
    console.log('3. Check if antivirus is blocking the build process');
    process.exit(1);
}