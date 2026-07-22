// server.js

  const { spawn } = require("child_process");
  const fs = require("fs");
  const path = require("path");
  const { Readable, Transform } = require("stream");
  const { pipeline } = require("stream/promises");
  const express = require("express");
  const { createServer } = require("http");
  const { Server } = require("socket.io");
  
  // Development mode detection
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || process.argv.includes('dev');
  
  // Function to open browser
  function openBrowser(url) {
    const { exec } = require('child_process');
    
    switch (process.platform) {
        case 'win32':
            exec(`start ${url}`);
            break;
        case 'darwin':
            exec(`open ${url}`);
            break;
        default:
            // Linux/Unix
            exec(`xdg-open ${url}`);
    }
  }
  
  // Function to check if port is in use
  function checkPort(port) {
    return new Promise((resolve) => {
        const testServer = require('net').createServer();
        
        testServer.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false); // Port is in use
            } else {
                resolve(false); // Some other error
            }
        });
        
        testServer.once('listening', () => {
            testServer.close();
            resolve(true); // Port is available
        });
        
        testServer.listen(port);
    });
  }
  
  // --- Server Setup ---
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;
  
  // Detect if running as a pkg executable
  const isPkg = typeof process.pkg !== 'undefined';
  
  // Get the correct base directory
  const getBasePath = () => {
      if (isPkg) {
          // When running as exe, use the exe's directory
          return path.dirname(process.execPath);
      } else {
          // When running with node, use __dirname
          return __dirname;
      }
  };
  
  const basePath = getBasePath();
  
  // --- Path Definitions for Binaries ---
  const platform = process.platform;
  const ytDlpPath = path.join(basePath, 'bin', platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const ffmpegPath = path.join(basePath, 'bin', platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  
  // Also update the downloads directory path
  const getDownloadsDir = () => path.join(basePath, 'downloads');
  
  // Log the paths for debugging
  if (isDev) {
      console.log('🔧 Development mode enabled');
  }
  console.log('Running as pkg:', isPkg);
  console.log('Base path:', basePath);
  console.log('yt-dlp path:', ytDlpPath);
  console.log('ffmpeg path:', ffmpegPath);
  
  // Auto-reload functionality for development
  if (isDev && !isPkg) {
      console.log('🔄 Auto-reload enabled for development');
      
      try {
          // Try to require chokidar - it's a dev dependency so it might not exist in production
          const chokidar = require('chokidar');
          
          // Watch for file changes and notify clients
          const watcher = chokidar.watch(['public/style.css', 'index.html', 'public/client.js'], {
              ignored: /(^|[\/\\])\../,
              persistent: true
          });
          
          watcher.on('change', (filepath) => {
              console.log(`📝 File changed: ${filepath}`);
              // Emit reload signal to all connected clients
              io.emit('dev-reload', { file: filepath });
          });
          
          // Add reload script to HTML in development
          const originalSendFile = express.response.sendFile;
          express.response.sendFile = function(filepath, options, fn) {
              if (filepath.endsWith('index.html')) {
                  let html = fs.readFileSync(filepath, 'utf8');
                  
                  // Add development reload script
                  const reloadScript = `
                  <script>
                      if (typeof io !== 'undefined') {
                          const socket = io();
                          socket.on('dev-reload', (data) => {
                              console.log('🔄 File changed:', data.file, '- Reloading...');
                              setTimeout(() => window.location.reload(), 100);
                          });
                      }
                  </script>`;
                  
                  html = html.replace('</body>', `${reloadScript}</body>`);
                  
                  this.type('html');
                  this.send(html);
                  return this;
              }
              
              return originalSendFile.call(this, filepath, options, fn);
          };
      } catch (err) {
          console.log('📝 File watching not available (chokidar not installed) - manual refresh required');
      }
  }
  
  // =========================================================================
  //                  SPAWN FUNCTION
  // =========================================================================
  function spawnYtDlp(args, options = {}) {
      // Ensure all arguments are properly formatted strings
      const cleanArgs = args.map(arg => String(arg));
      
      if (platform === 'win32') {
          // On Windows, use spawn directly without shell
          return spawn(ytDlpPath, cleanArgs, {
              ...options,
              windowsHide: true,
              shell: false,
              stdio: options.stdio || 'pipe'
          });
      } else {
          // On Unix-like systems
          return spawn(ytDlpPath, cleanArgs, {
              ...options,
              shell: false,
              stdio: options.stdio || 'pipe'
          });
      }
  }
  
  // =========================================================================
  //                  PROCESS / COOKIE / UPDATE HELPERS
  // =========================================================================

  // Kill a process and its whole tree (yt-dlp spawns ffmpeg children that
  // plain .kill() leaves running on Windows)
  function killProcessTree(proc) {
      if (!proc || proc.killed) return;
      if (platform === 'win32') {
          try {
              spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
          } catch (e) {
              proc.kill('SIGKILL');
          }
      } else {
          proc.kill('SIGKILL');
      }
  }

  // Find a VALID cookies.txt file (downloads folder or next to the app).
  // Empty or non-Netscape files are ignored — passing one to yt-dlp makes
  // every download fail with "does not look like a Netscape format cookies
  // file".
  function findCookiesFile() {
      const candidates = [
          path.join(getDownloadsDir(), 'cookies.txt'),
          path.join(basePath, 'cookies.txt')
      ];
      for (const candidate of candidates) {
          try {
              const content = fs.readFileSync(candidate, 'utf8');
              const looksValid = content.includes('# Netscape')
                  || content.includes('# HTTP Cookie File')
                  || content.includes('\t');
              if (looksValid) return candidate;
              console.log(`Ignoring ${candidate}: not a valid Netscape cookies file`);
          } catch (e) { /* not here, try next */ }
      }
      return null;
  }

  const SUPPORTED_COOKIE_BROWSERS = ['firefox', 'chrome', 'edge', 'brave', 'opera', 'vivaldi', 'chromium'];

  // Chromium-based browsers lock their cookie database while running, which
  // makes --cookies-from-browser fail on Windows (yt-dlp issue #7271)
  const CHROMIUM_BROWSER_PROCESSES = {
      chrome: 'chrome.exe',
      chromium: 'chrome.exe',
      brave: 'brave.exe',
      edge: 'msedge.exe',
      opera: 'opera.exe',
      vivaldi: 'vivaldi.exe'
  };

  function displayBrowserName(source) {
      const names = { chrome: 'Chrome', chromium: 'Chromium', brave: 'Brave', edge: 'Microsoft Edge', opera: 'Opera', vivaldi: 'Vivaldi', firefox: 'Firefox' };
      return names[source] || source;
  }

  function isProcessRunning(exeName) {
      return new Promise((resolve) => {
          if (platform !== 'win32') return resolve(false);
          const proc = spawn('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], { windowsHide: true });
          let out = '';
          proc.stdout.on('data', (d) => out += d.toString());
          proc.on('close', () => resolve(out.toLowerCase().includes(exeName.toLowerCase())));
          proc.on('error', () => resolve(false));
      });
  }

  // Translate cryptic yt-dlp failures into instructions a user can act on.
  // Returns null when there is no better explanation than the raw output.
  function friendlyYtDlpError(text, cookieSource) {
      if (/Could not copy .*cookie database/i.test(text)) {
          const browser = displayBrowserName(cookieSource);
          return `${browser} is locking its cookie database because it is still running. ` +
                 `Close ${browser} COMPLETELY — including the system tray icon (in ${browser} settings, disable "Continue running background apps" if enabled) — then click Start again. ` +
                 `Alternatively, switch the Sign-in / Cookies dropdown to Firefox or a cookies.txt file.`;
      }
      if (/DPAPI|App.?Bound/i.test(text)) {
          return `Windows blocked reading ${displayBrowserName(cookieSource)}'s cookies (newer Chromium versions encrypt them against outside access). ` +
                 `Use Firefox (recommended) or a cookies.txt file instead.`;
      }
      if (/Sign in to confirm|not a bot|age.?restricted|login required/i.test(text)) {
          return `This video requires being signed in. Pick your browser in the Sign-in / Cookies dropdown (Firefox is the most reliable) and make sure you are logged in to the site there.`;
      }
      return null;
  }

  // Turn the UI's cookie-source choice into yt-dlp arguments.
  // Returns { args: [...], description: string }
  function resolveCookieArgs(cookieSource) {
      const source = cookieSource || 'auto';

      if (source === 'none') {
          return { args: [], description: null };
      }

      if (SUPPORTED_COOKIE_BROWSERS.includes(source)) {
          return {
              args: ['--cookies-from-browser', source],
              description: `browser cookies (${source})`
          };
      }

      // 'auto' (default): use cookies.txt if one exists
      const cookiesFile = findCookiesFile();
      if (cookiesFile) {
          return { args: ['--cookies', cookiesFile], description: `cookies.txt (${cookiesFile})` };
      }
      return { args: [], description: null };
  }

  // --- yt-dlp version / self-update ---
  let ytDlpVersion = null;
  let isUpdatingYtDlp = false;

  function getYtDlpVersion() {
      return new Promise((resolve) => {
          const proc = spawnYtDlp(['--version']);
          let out = '';
          proc.stdout.on('data', (d) => out += d.toString());
          proc.on('close', () => resolve(out.trim() || null));
          proc.on('error', () => resolve(null));
      });
  }

  // yt-dlp standalone builds support self-updating via -U. A stale yt-dlp is
  // the most common reason YouTube downloads suddenly stop working.
  function updateYtDlp(onLog) {
      return new Promise((resolve) => {
          if (isUpdatingYtDlp) return resolve({ updated: false, message: 'Update already in progress' });
          if (isDownloading) return resolve({ updated: false, message: 'Busy downloading; skipping yt-dlp update' });
          isUpdatingYtDlp = true;

          const proc = spawnYtDlp(['-U']);
          let output = '';

          const handleData = (d) => {
              const text = d.toString();
              output += text;
              text.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
                  if (onLog) onLog(line);
                  console.log('[yt-dlp update]', line);
              });
          };
          proc.stdout.on('data', handleData);
          proc.stderr.on('data', handleData);

          proc.on('close', async (code) => {
              isUpdatingYtDlp = false;
              ytDlpVersion = await getYtDlpVersion();
              const updated = code === 0 && !output.includes('is up to date');
              resolve({ updated, message: output.trim(), version: ytDlpVersion });
          });
          proc.on('error', (err) => {
              isUpdatingYtDlp = false;
              resolve({ updated: false, message: `Update failed: ${err.message}` });
          });
      });
  }

  // =========================================================================
  //                  FIRST-RUN BINARY BOOTSTRAP (single-exe distribution)
  // =========================================================================
  // The exe ships alone; yt-dlp and ffmpeg are downloaded next to it on
  // first run so users only ever need to download one file.

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const BINARY_SOURCES = {
      'yt-dlp': {
          win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
          darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
          linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
      },
      'ffmpeg': {
          win32: 'https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-win32-x64',
          darwin: `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-darwin-${arch}`,
          linux: `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-linux-${arch}`
      }
  };

  function broadcastLog(type, message) {
      console.log(message);
      io.emit("log", { type, message });
  }

  async function downloadToFile(url, dest, label) {
      const response = await fetch(url, {
          headers: { 'User-Agent': 'universal-video-downloader' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${label}`);

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
      let received = 0;
      let lastLogged = 0;

      const progress = new Transform({
          transform(chunk, enc, cb) {
              received += chunk.length;
              if (received - lastLogged > 15 * 1024 * 1024) {
                  lastLogged = received;
                  const mb = (received / 1024 / 1024).toFixed(0);
                  const total = totalBytes ? ` of ${(totalBytes / 1024 / 1024).toFixed(0)}` : '';
                  broadcastLog('info', `  ${label}: ${mb}${total} MB downloaded...`);
              }
              cb(null, chunk);
          }
      });

      await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(dest));
  }

  async function ensureBinaries() {
      const binDir = path.join(basePath, 'bin');
      const needed = [
          { name: 'yt-dlp', target: ytDlpPath },
          { name: 'ffmpeg', target: ffmpegPath }
      ].filter(b => !fs.existsSync(b.target));

      if (needed.length === 0) return true;

      fs.mkdirSync(binDir, { recursive: true });
      broadcastLog('info', `First run: downloading required components (${needed.map(b => b.name).join(', ')}). This happens only once...`);

      for (const binary of needed) {
          const url = BINARY_SOURCES[binary.name][platform];
          if (!url) {
              broadcastLog('error', `No download source for ${binary.name} on ${platform}.`);
              return false;
          }
          const tempPath = binary.target + '.download';
          try {
              broadcastLog('info', `Downloading ${binary.name}...`);
              await downloadToFile(url, tempPath, binary.name);
              fs.renameSync(tempPath, binary.target);
              if (platform !== 'win32') fs.chmodSync(binary.target, 0o755);
              broadcastLog('success', `✓ ${binary.name} installed (${(fs.statSync(binary.target).size / 1024 / 1024).toFixed(1)} MB)`);
          } catch (err) {
              try { fs.rmSync(tempPath, { force: true }); } catch (e) {}
              broadcastLog('error', `✗ Failed to download ${binary.name}: ${err.message}. Check your internet connection and restart the app.`);
              return false;
          }
      }
      return true;
  }

  // Resolves once binaries are present (or bootstrap failed); downloads wait on this
  let binariesReadyResolve;
  const binariesReady = new Promise((resolve) => { binariesReadyResolve = resolve; });

  // =========================================================================
  //                  APP SELF-UPDATE (via GitHub releases)
  // =========================================================================
  const APP_REPO = 'yzRobo/universal-video-downloader';
  const APP_EXE_NAME = 'UniversalVideoDownloader.exe';
  let APP_VERSION = '0.0.0';
  try { APP_VERSION = require('./package.json').version; } catch (e) {}

  let lastAppUpdateStatus = { currentVersion: APP_VERSION, updateAvailable: false };
  let isInstallingAppUpdate = false;

  function compareVersions(a, b) {
      const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
      const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
  }

  async function checkForAppUpdate() {
      try {
          const res = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
              headers: {
                  'User-Agent': 'universal-video-downloader',
                  'Accept': 'application/vnd.github+json'
              }
          });
          if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
          const release = await res.json();
          const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
          const exeAsset = (release.assets || []).find(a => a.name === APP_EXE_NAME);

          lastAppUpdateStatus = {
              currentVersion: APP_VERSION,
              latestVersion,
              updateAvailable: !!latestVersion && compareVersions(latestVersion, APP_VERSION) > 0,
              canSelfUpdate: isPkg && platform === 'win32' && !!exeAsset,
              downloadUrl: exeAsset ? exeAsset.browser_download_url : null,
              releasePage: release.html_url || `https://github.com/${APP_REPO}/releases`
          };
      } catch (err) {
          console.log('App update check failed:', err.message);
          lastAppUpdateStatus = { currentVersion: APP_VERSION, updateAvailable: false, error: err.message };
      }
      return lastAppUpdateStatus;
  }

  // Downloads the new exe next to the current one, then hands off to a small
  // batch script that swaps the files once this process exits and relaunches.
  async function installAppUpdate(socket) {
      if (!isPkg || platform !== 'win32') {
          socket.emit("log", { type: 'error', message: 'In-app updating only works in the packaged Windows exe. Use git pull instead.' });
          return false;
      }
      if (!lastAppUpdateStatus.downloadUrl) {
          socket.emit("log", { type: 'error', message: 'No update download URL available.' });
          return false;
      }
      if (isInstallingAppUpdate) return false;
      isInstallingAppUpdate = true;

      const exePath = process.execPath;
      const newExePath = exePath + '.new';
      const updaterPath = path.join(basePath, 'update-uvd.bat');

      try {
          broadcastLog('info', `Downloading update v${lastAppUpdateStatus.latestVersion}...`);
          await downloadToFile(lastAppUpdateStatus.downloadUrl, newExePath, 'app update');

          const stats = fs.statSync(newExePath);
          if (stats.size < 5 * 1024 * 1024) {
              throw new Error('Downloaded update looks too small; aborting.');
          }

          const batch = [
              '@echo off',
              'title Updating Universal Video Downloader',
              'echo Waiting for the application to close...',
              'timeout /t 2 /nobreak >nul',
              ':retry',
              `del "${exePath}" >nul 2>&1`,
              `if exist "${exePath}" (`,
              '    timeout /t 1 /nobreak >nul',
              '    goto retry',
              ')',
              `move /y "${newExePath}" "${exePath}" >nul`,
              'echo Update complete! Restarting...',
              `start "" "${exePath}"`,
              '(goto) 2>nul & del "%~f0"'
          ].join('\r\n');
          fs.writeFileSync(updaterPath, batch);

          broadcastLog('success', '✓ Update downloaded. Restarting the application...');
          io.emit('app-update-installing');

          const child = spawn('cmd.exe', ['/c', 'start', 'Updating...', '/min', updaterPath], {
              detached: true,
              stdio: 'ignore',
              cwd: basePath
          });
          child.unref();

          setTimeout(() => process.exit(0), 1500);
          return true;
      } catch (err) {
          isInstallingAppUpdate = false;
          try { fs.rmSync(newExePath, { force: true }); } catch (e) {}
          broadcastLog('error', `✗ Update failed: ${err.message}`);
          socket.emit('app-update-failed', { message: err.message });
          return false;
      }
  }

  // Check if yt-dlp exists on startup
  async function checkYtDlp() {
      try {
          await fs.promises.access(ytDlpPath, fs.constants.F_OK);
          console.log('✓ yt-dlp found at:', ytDlpPath);
          
          // Check if file is readable
          try {
              await fs.promises.access(ytDlpPath, fs.constants.R_OK);
          } catch (err) {
              console.error('✗ yt-dlp exists but is not readable. Check file permissions.');
              return false;
          }
          
          // For Windows, check if file is blocked
          if (platform === 'win32') {
              const stats = await fs.promises.stat(ytDlpPath);
              if (stats.size < 1000000) { // yt-dlp should be at least 1MB
                  console.error('✗ yt-dlp file seems corrupted (too small)');
                  return false;
              }
          }
          
          // Try to execute
          const testProcess = spawn(ytDlpPath, ['--version'], {
              windowsHide: true,
              shell: false
          });
          
          let output = '';
          let errorOutput = '';
          
          testProcess.stdout.on('data', (data) => output += data.toString());
          testProcess.stderr.on('data', (data) => errorOutput += data.toString());
          
          const code = await new Promise((resolve) => {
              testProcess.on('close', (code) => resolve(code));
              testProcess.on('error', (err) => {
                  console.error('✗ Error testing yt-dlp:', err.message);
                  if (err.code === 'EACCES') {
                      console.error('Permission denied. The file might be blocked by Windows security.');
                      console.error('Try: Right-click on', ytDlpPath, '→ Properties → Unblock');
                  }
                  resolve(1);
              });
          });
          
          if (code === 0) {
              console.log('✓ yt-dlp version:', output.trim() || '(No version output)');
              return true;
          } else {
              console.error(`✗ yt-dlp test failed with exit code: ${code}`);
              if (errorOutput) {
                  console.error(`Stderr: ${errorOutput}`);
              }
              return false;
          }
      } catch (err) {
          console.error('✗ yt-dlp not found at:', ytDlpPath);
          return false;
      }
  }
  
  // Startup sequence: bootstrap missing binaries (first run of the single
  // exe), then self-update yt-dlp so YouTube extractor changes don't silently
  // break downloads, then check GitHub for a newer app release.
  (async () => {
      const bootstrapped = await ensureBinaries();
      binariesReadyResolve(bootstrapped);

      if (bootstrapped) {
          const ok = await checkYtDlp();
          if (ok) {
              ytDlpVersion = await getYtDlpVersion();
              console.log('Checking for yt-dlp updates...');
              const result = await updateYtDlp();
              if (result.updated) {
                  console.log(`✓ yt-dlp updated to ${result.version}`);
              } else {
                  console.log('yt-dlp is up to date or could not be updated.');
              }
              io.emit('ytdlp-status', { version: ytDlpVersion, cookiesFile: findCookiesFile() });
          }
      }

      const updateStatus = await checkForAppUpdate();
      if (updateStatus.updateAvailable) {
          console.log(`\n🔔 A new version (v${updateStatus.latestVersion}) is available! You are on v${updateStatus.currentVersion}.`);
          console.log('   Use the "Update & Restart" button in the web interface to update.\n');
      }
      io.emit('app-update-status', lastAppUpdateStatus);
  })();
  
  // For serving static files when running as pkg
  if (isPkg) {
      // When running as exe, we need to handle static files differently
      app.get('/style.css', (req, res) => {
          res.type('text/css');
          res.send(fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8'));
      });
      
      app.get('/socket.io.min.js', (req, res) => {
          res.type('application/javascript');
          res.send(fs.readFileSync(path.join(__dirname, 'public', 'socket.io.min.js'), 'utf8'));
      });
      
      app.get('/client.js', (req, res) => {
          res.type('application/javascript');
          res.send(fs.readFileSync(path.join(__dirname, 'public', 'client.js'), 'utf8'));
      });
      
      app.get('/', (req, res) => {
          res.send(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
      });
  } else {
      // Normal development mode
      app.use(express.static(path.join(__dirname, 'public')));
      app.get('/', (req, res) => {
          res.sendFile(path.join(__dirname, 'index.html'));
      });
  }
  
  // --- Module-level variables to handle cancellation ---
  let isCancelled = false;
  let activeProcess = null;
  let isDownloading = false;
  let currentCookieArgs = { args: [], description: null };
  
  // --- Platform Detection ---
  function detectPlatform(url) {
      const urlLower = url.toLowerCase();
      
      if (urlLower.includes('vimeo.com')) return 'vimeo';
      if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
      if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
      if (urlLower.includes('instagram.com')) return 'instagram';
      if (urlLower.includes('tiktok.com')) return 'tiktok';
      if (urlLower.includes('threads.net')) return 'threads';
      
      return 'yt-dlp';
  }
  
  // --- WebSocket Connection Handling ---
  io.on("connection", (socket) => {
    if (isDev) {
      console.log("🔌 User connected:", socket.id);
    } else {
      console.log("A user connected:", socket.id);
    }
  
    // Tell the client what we know as soon as it connects
    socket.emit('ytdlp-status', { version: ytDlpVersion, cookiesFile: findCookiesFile() });
    socket.emit('app-update-status', lastAppUpdateStatus);

    socket.on("check-app-update", async () => {
      await checkForAppUpdate();
      socket.emit('app-update-status', lastAppUpdateStatus);
    });

    socket.on("install-app-update", async () => {
      if (isDownloading) {
          socket.emit("log", { type: 'error', message: 'Cannot update the app while a download is in progress.' });
          socket.emit('app-update-failed', { message: 'Download in progress' });
          return;
      }
      await installAppUpdate(socket);
    });

    socket.on("start-download", async (data) => {
      const binariesOk = await binariesReady;
      if (!binariesOk) {
          socket.emit("log", { type: 'error', message: 'Required components (yt-dlp/ffmpeg) could not be downloaded. Check your internet connection and restart the app.' });
          socket.emit("all-batches-complete", { cancelled: false });
          return;
      }
      if (!data || !Array.isArray(data.batches) || data.batches.length === 0) {
          socket.emit("log", { type: 'error', message: 'No batches received. Nothing to download.' });
          socket.emit("all-batches-complete", { cancelled: false });
          return;
      }
      if (isDownloading) {
          socket.emit("log", { type: 'error', message: 'A download is already in progress. Please wait for it to finish or cancel it.' });
          return;
      }
      console.log("Received download request with batches:", data.batches.length);
      isCancelled = false;
      isDownloading = true;
      currentCookieArgs = resolveCookieArgs(data.cookieSource);
      currentCookieArgs.source = data.cookieSource;
      if (currentCookieArgs.description) {
          socket.emit("log", { type: 'info', message: `Authentication: using ${currentCookieArgs.description}` });
      }

      // Warn up front if the chosen browser is open: Windows locks its cookie
      // database while it runs, and cookie extraction will fail.
      const browserExe = CHROMIUM_BROWSER_PROCESSES[data.cookieSource];
      if (browserExe && await isProcessRunning(browserExe)) {
          socket.emit("log", { type: 'warning', message: `⚠ ${displayBrowserName(data.cookieSource)} is currently open. Its cookies are locked while it runs — if the download fails, close ${displayBrowserName(data.cookieSource)} completely (including the tray icon) and try again.` });
      }
      try {
          await processAllBatches(data.batches, socket);
      } finally {
          isDownloading = false;
      }
    });

    socket.on("update-ytdlp", async () => {
      if (isDownloading) {
          socket.emit("log", { type: 'error', message: 'Cannot update yt-dlp while a download is in progress.' });
          socket.emit("ytdlp-update-complete", { updated: false, version: ytDlpVersion });
          return;
      }
      socket.emit("log", { type: 'info', message: 'Checking for yt-dlp updates...' });
      const result = await updateYtDlp((line) => socket.emit("log", { type: 'info', message: `yt-dlp: ${line}` }));
      socket.emit("ytdlp-update-complete", { updated: result.updated, version: result.version || ytDlpVersion });
      io.emit('ytdlp-status', { version: ytDlpVersion, cookiesFile: findCookiesFile() });
    });

    socket.on("cancel-download", () => {
      console.log("Cancellation request received from:", socket.id);
      isCancelled = true;
      if (activeProcess) {
          socket.emit("log", { type: 'error', message: '--- CANCELLATION INITIATED BY USER ---' });
          killProcessTree(activeProcess);
      }
    });
  
    socket.on("disconnect", () => {
      if (isDev) {
        console.log("🔌 User disconnected:", socket.id);
      } else {
        console.log("User disconnected:", socket.id);
      }
    });
  });
  
  // =========================================================================
  //                  ENHANCED SERVER STARTUP
  // =========================================================================
  async function startServer() {
      let port = PORT;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Try to find an available port
      while (attempts < maxAttempts) {
          const isAvailable = await checkPort(port);
          
          if (isAvailable) {
              // Start the server
              httpServer.listen(port, () => {
                  const url = `http://localhost:${port}`;
                  
                  if (isDev) {
                      console.log(`\n🚀 Development server running on ${url}`);
                      console.log('📁 Watching files for changes...');
                      console.log('🔄 Auto-reload enabled');
                  } else {
                      console.log(`✅ Server is running on ${url}`);
                  }
                  
                  if (isPkg) {
                      console.log("Opening your browser...");
                      console.log("\nTo stop the server, close this window.");
                      
                      // Open browser after a short delay to ensure server is ready
                      setTimeout(() => {
                          openBrowser(url);
                      }, 1000);
                  } else {
                      console.log("Open this URL in your browser to use the downloader.");
                      
                      if (isDev) {
                          console.log("\n📝 Make changes to CSS/HTML/JS files and they'll auto-reload!");
                          console.log("⏹️  Press Ctrl+C to stop the development server");
                      }
                  }
              });
              return; // Exit function on success
          } else {
              console.log(`Port ${port} is in use, trying ${port + 1}...`);
              port++;
              attempts++;
          }
      }
      
      if (attempts >= maxAttempts) {
          console.error('❌ Could not find an available port. Please close other applications and try again.');
          if (isPkg) {
              console.log('\nPress any key to exit...');
              process.stdin.resume();
              process.stdin.on('data', process.exit);
          }
      }
  }
  
  // Start the server
  startServer().catch(err => {
      console.error('Failed to start server:', err);
      if (isPkg) {
          console.log('\nPress any key to exit...');
          process.stdin.resume();
          process.stdin.on('data', process.exit);
      }
  });
  
  // =========================================================================
  //                  MAIN BATCH PROCESSING LOGIC
  // =========================================================================
  async function processAllBatches(batches, socket) {
    socket.emit("all-batches-start");
    
    for (const [index, batch] of batches.entries()) {
      if (isCancelled) {
          socket.emit("log", { type: 'error', message: `Skipping remaining batches due to cancellation.` });
          break;
      }
      socket.emit("log", { type: 'info', message: `\n--- Starting Batch ${index + 1} / ${batches.length} (Prefix: ${batch.prefixMajor}.x, Format: ${batch.format}) ---` });
      socket.emit("new-batch-starting", { 
          batchIndex: index, 
          totalVideos: batch.videos.length 
      });
      
      await runSingleBatch(batch, socket);
    }
    
    if (isCancelled) {
      socket.emit("log", { type: "error", message: "\nDownload process cancelled." });
    } else {
      socket.emit("log", { type: "success", message: "\nDownload process finished." });
    }
    socket.emit("all-batches-complete", { cancelled: isCancelled });
  }
  
  async function runSingleBatch(batchConfig, socket) {
    const { videos, prefixMajor, prefixMinorStart, format } = batchConfig;
    
    socket.emit("log", { type: "info", message: `Starting batch download for ${videos.length} videos.`});
    
    let prefixMinorCounter = parseInt(prefixMinorStart, 10);
    for (let i = 0; i < videos.length; i++) {
      if (isCancelled) {
          socket.emit("log", { type: 'error', message: `Skipping remaining videos in batch due to cancellation.` });
          break;
      }
      const video = videos[i];
      const filePrefix = `${prefixMajor}.${prefixMinorCounter}_`;
      const platform = detectPlatform(video.url);
      
      socket.emit("log", { type: "info", message: `[${i + 1}/${videos.length}] Detected platform: ${platform}` });
      
      if (platform === 'vimeo') {
          let newUrl = video.url;
          const match = video.url.match(/vimeo\.com\/(\d+)\/([a-zA-Z0-9]+)/);
          if (match) {
              newUrl = `https://player.vimeo.com/video/${match[1]}?h=${match[2]}`;
          } else {
              const simpleMatch = video.url.match(/vimeo\.com\/(\d+)$/);
              if (simpleMatch) {
                  newUrl = `https://player.vimeo.com/video/${simpleMatch[1]}`;
              }
          }
          if (newUrl !== video.url) {
              socket.emit("log", { type: "info", message: `  Converted: ${video.url} -> ${newUrl}` });
          }
          video.url = newUrl;
          await downloadVimeoPrivateVideo(video, i, videos.length, filePrefix, format, socket);
      } else {
          await downloadWithYtDlp(video, i, videos.length, filePrefix, format, platform, socket);
      }
      
      prefixMinorCounter++;
    }
  }
  
  // =========================================================================
  //                  YT-DLP DOWNLOAD FUNCTION
  // =========================================================================
  async function downloadWithYtDlp(videoInfo, index, total, filenamePrefix, format, platform, socket) {
    const logPrefix = `[${index + 1}/${total}]`;
    
    try {
        await fs.promises.access(ytDlpPath, fs.constants.F_OK);
    } catch (err) {
        const errorMsg = `${logPrefix} yt-dlp not found. Please run 'npm install'.`;
        socket.emit("log", { type: "error", message: errorMsg });
        socket.emit("progress", { index, status: `❌ Error: yt-dlp not found` });
        return;
    }
    
    // Check if ffmpeg exists
    try {
        await fs.promises.access(ffmpegPath, fs.constants.F_OK);
        socket.emit("log", { type: "info", message: `${logPrefix} FFmpeg found at: ${ffmpegPath}` });
    } catch (err) {
        socket.emit("log", { type: "warning", message: `${logPrefix} FFmpeg not found at: ${ffmpegPath}. Trying system ffmpeg...` });
    }
    
    socket.emit("log", { type: "info", message: `${logPrefix} Downloading from ${platform} using yt-dlp: ${videoInfo.url}` });
  
    try {
        const outputDir = getDownloadsDir();
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
  
        socket.emit("log", { type: "info", message: `${logPrefix} Fetching video information...` });
        
        let videoInfoJson = '';
        let errorOutput = '';
        
        // Metadata pre-fetch is best-effort only: if it fails we still attempt
        // the actual download, which can succeed where --dump-json does not.
        {
            const infoArgs = ['--dump-json', '--no-warnings', '--no-playlist',
                              ...currentCookieArgs.args];
            if (videoInfo.domain) {
                infoArgs.push('--referer', videoInfo.domain);
            }
            infoArgs.push(videoInfo.url);

            const infoProcess = spawnYtDlp(infoArgs);

            infoProcess.stdout.on('data', (data) => videoInfoJson += data.toString());
            infoProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            const infoCode = await new Promise((resolve) => {
                infoProcess.on('close', (code) => resolve(code));
                infoProcess.on('error', (err) => {
                    errorOutput += err.message;
                    socket.emit("log", { type: "error", message: `${logPrefix} Error spawning yt-dlp: ${err.message}` });
                    resolve(1);
                });
            });

            if (infoCode !== 0) {
                // Cookie-extraction failures are guaranteed to fail the real
                // download too — stop now with instructions instead of
                // failing twice with a cryptic error.
                if (/cookie database|DPAPI|App.?Bound/i.test(errorOutput)) {
                    const friendly = friendlyYtDlpError(errorOutput, currentCookieArgs.source);
                    socket.emit("log", { type: "error", message: `${logPrefix} ${friendly}` });
                    socket.emit("progress", { index, status: `❌ Close ${displayBrowserName(currentCookieArgs.source)} and retry` });
                    return;
                }
                socket.emit("log", { type: "warning", message: `${logPrefix} Could not pre-fetch video info (continuing anyway). ${errorOutput.trim().split('\n').pop() || ''}` });
                videoInfoJson = '';
            }
        }
        if (isCancelled) return;

        let videoDetails = { title: 'Unknown', duration: 0 };
        
        if (videoInfoJson) {
            try {
                const lastLine = videoInfoJson.trim().split('\n').pop();
                const info = JSON.parse(lastLine);
                socket.emit("log", { type: "info", message: `${logPrefix} Found video: ${info.title}` });
                videoDetails = { title: info.title || 'Unknown', duration: info.duration || 0 };
            } catch (e) {
                socket.emit("log", { type: "error", message: `${logPrefix} Failed to parse video info: ${e.message}` });
            }
        }
  
        const sanitizedTitle = (videoDetails.title || 'Unknown')
            .replace(/\.(mp4|mkv|webm|mov|avi|mp3|m4a)$/i, '')
            .replace(/[<>:"/\\|?*]/g, '_')
            .trim();
        
        // This base filename is for the UI progress bar, representing the whole post.
        let uiFilename = (filenamePrefix || "") + sanitizedTitle;
  
        // Construct yt-dlp arguments
        const ytDlpArgs = [];

        ytDlpArgs.push(...currentCookieArgs.args);

        if (videoInfo.domain) {
            ytDlpArgs.push('--referer', videoInfo.domain);
        }
  
        switch (format) {
            case 'audio-mp3':
                ytDlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
                uiFilename += '.mp3';
                break;
            case 'audio-m4a':
                ytDlpArgs.push('-x', '--audio-format', 'm4a', '--audio-quality', '0');
                uiFilename += '.m4a';
                break;
            case 'video-only':
                // Try to get video-only stream first, fallback to best and strip audio
                if (platform === 'youtube') {
                    // YouTube has separate streams
                    ytDlpArgs.push('-f', 'bestvideo[ext=mp4]/bestvideo');
                } else {
                    // Instagram, TikTok, etc. - download best and strip audio with ffmpeg
                    ytDlpArgs.push('-f', 'best[ext=mp4]/best');
                    // Add post-processor to strip audio
                    ytDlpArgs.push('--postprocessor-args', 'ffmpeg:-c:v copy -an');
                }
                ytDlpArgs.push('--merge-output-format', 'mp4');
                uiFilename += '_No_Audio.mp4';
                break;
            case 'video-audio':
            default:
                ytDlpArgs.push(
                    '-f', 'bestvideo+bestaudio/best',
                    '--merge-output-format', 'mp4'
                );
                // Convert thumbnails to jpg first: webp thumbnails cannot be
                // embedded into mp4 and used to fail the whole download.
                ytDlpArgs.push('--embed-thumbnail', '--convert-thumbnails', 'jpg', '--add-metadata');
                uiFilename += '.mp4';
                break;
        }
  
        // Create a dynamic output TEMPLATE for yt-dlp.
        // This allows it to create a unique file for each item in a carousel.
        // e.g., "01.1_Video 1.mp4", "01.1_Video 2.mp4", etc.
        const outputTemplate = path.join(outputDir, `${filenamePrefix}%(title)s.%(ext)s`);
  
        // Add common arguments
        ytDlpArgs.push(
            '--output', outputTemplate,
            '--no-warnings',
            '--progress',
            '--newline'
        );
        
        // Conditionally allow multi-file downloads ONLY for Instagram carousels
        if (platform === 'instagram') {
            socket.emit("log", { type: "info", message: `${logPrefix} Instagram post detected. Multi-video download enabled.` });
        } else {
            ytDlpArgs.push('--no-playlist');
        }
            
        if (fs.existsSync(ffmpegPath)) {
            ytDlpArgs.push('--ffmpeg-location', ffmpegPath);
        }
        
        ytDlpArgs.push(videoInfo.url);
        
        const displayCommand = ytDlpArgs.map(arg => 
            arg.includes(' ') || arg.includes('\\') ? `"${arg}"` : arg
        ).join(' ');
        socket.emit("log", { type: "info", message: `${logPrefix} Running: yt-dlp ${displayCommand}` });
  
        socket.emit("progress", {
            index: index, percentage: 0, status: "⇣ Starting download", size: "0 MB",
            duration: "00:00:00", filename: uiFilename, speed: "..."
        });
  
        activeProcess = spawnYtDlp(ytDlpArgs);
        
        let lastPercent = 0;
        let isPostProcessing = false;
        
        activeProcess.stdout.on('data', (data) => {
            const output = data.toString();
            
            const percentMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
            const speedMatch = output.match(/at\s+~?\s*([\d.]+\w+\/s)/);
            const sizeMatch = output.match(/of\s+~?\s*([\d.]+\w+)/);
            
            if (percentMatch) {
                const percent = parseFloat(percentMatch[1]);
                lastPercent = percent;
                
                socket.emit("progress", {
                    index: index, percentage: Math.round(percent), status: percent < 100 ? "⇣ Downloading" : "Processing...",
                    size: sizeMatch ? sizeMatch[1] : "Unknown", speed: speedMatch ? speedMatch[1] : "...",
                    duration: formatDuration(videoDetails.duration * (percent / 100))
                });
            }
            
            // Check for merging/post-processing messages
            if (output.includes('[Merger]') || output.includes('[ExtractAudio]') || 
                output.includes('[ffmpeg]') || output.includes('[EmbedThumbnail]')) {
                isPostProcessing = true;
                socket.emit("progress", { index: index, percentage: lastPercent, status: "🔄 Merging video and audio..." });
                socket.emit("log", { type: "info", message: `${logPrefix} Post-processing: ${output.trim()}` });
            }
            
            if (output.includes('Deleting original file')) {
                socket.emit("progress", { index: index, percentage: 99, status: "🔄 Finalizing..." });
            }
        });
  
        let friendlyErrorSent = false;
        activeProcess.stderr.on('data', (data) => {
            const error = data.toString();
            if (!error.includes('WARNING')) {
                socket.emit("log", { type: 'error', message: `${logPrefix} ${error}` });
                const friendly = friendlyYtDlpError(error, currentCookieArgs.source);
                if (friendly && !friendlyErrorSent) {
                    friendlyErrorSent = true;
                    socket.emit("log", { type: 'error', message: `${logPrefix} 💡 ${friendly}` });
                }
            }
        });
  
        const downloadCode = await new Promise((resolve) => {
            activeProcess.on('close', (code) => { activeProcess = null; resolve(code); });
            activeProcess.on('error', (err) => {
                activeProcess = null;
                socket.emit("log", { type: "error", message: `${logPrefix} Error spawning yt-dlp: ${err.message}` });
                resolve(1);
            });
        });
        
        if (isCancelled) {
            socket.emit("progress", { index: index, status: `🛑 Cancelled` });
          } else if (downloadCode === 0) {
              // Since we can have multiple files from a carousel, we no longer check for a single path.
              // An exit code of 0 from yt-dlp is our indicator of success.
              socket.emit("progress", {
                  index: index,
                  percentage: 100,
                  status: "✅ Downloaded"
                  // We can't easily get the final size of all combined files, so we omit it here.
              });
              socket.emit("log", { type: 'success', message: `${logPrefix} Successfully downloaded all videos from the post.` });
          } else {
              socket.emit("progress", { index: index, status: `❌ Error (code ${downloadCode})` });
              socket.emit("log", { type: 'error', message: `${logPrefix} yt-dlp exited with error code ${downloadCode}` });
          }
    } catch (error) {
      if (isCancelled) return;
      const errorMsg = `${logPrefix} Failed to download video: ${error.message}`;
      socket.emit("log", { type: "error", message: errorMsg });
      socket.emit("progress", { index, status: `❌ Error: ${error.message}` });
    }
  }
  
  // =========================================================================
  //                  VIMEO DOWNLOADER
  // =========================================================================
  async function downloadVimeoPrivateVideo(videoInfo, index, total, filenamePrefix, format, socket) {
    const logPrefix = `[${index + 1}/${total}]`;
    socket.emit("log", { type: "info", message: `${logPrefix} Fetching Vimeo details for ${videoInfo.url}` });
  
    try {
      let playerConfig;
      for (let i = 0; i < 2; i++) {
          playerConfig = await extractVimeoPlayerConfig(videoInfo.url, videoInfo.domain, logPrefix, socket);
          if (playerConfig) break;
          if (isCancelled) return;
          socket.emit("log", { type: "info", message: `${logPrefix} Retrying in 3 seconds...` });
          await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!playerConfig) {
          // Direct extraction failed (Vimeo changes its player page regularly).
          // yt-dlp has a maintained Vimeo extractor, so hand the URL to it.
          socket.emit("log", { type: "info", message: `${logPrefix} Direct Vimeo extraction failed, falling back to yt-dlp...` });
          await downloadWithYtDlp(videoInfo, index, total, filenamePrefix, format, 'vimeo', socket);
          return;
      }

      const stream = playerConfig.streamUrl;
  
      const sanitizedTitle = playerConfig.title
          .replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
          .replace(/\s+on Vimeo$/i, "")
          .trim()
          .replace(/[<>:"/\\|?*]/g, '_');
      
      const defaultFilename = (filenamePrefix || "") + sanitizedTitle + '.mp4';
  
      const outputDir = getDownloadsDir();
      const finalOutput = path.join(outputDir, defaultFilename);
      
      await new Promise((resolve) => {
        downloadHLSStream(stream, finalOutput, playerConfig.duration, format, resolve, logPrefix, socket, index);
      });
  
    } catch (error) {
      if (isCancelled) return;
      const errorMsg = `${logPrefix} Failed to download video: ${error.message}`;
      socket.emit("log", { type: "error", message: errorMsg });
      socket.emit("progress", { index, status: `❌ Error: ${error.message}` });
    }
  }
  
  async function extractVimeoPlayerConfig(url, domain, pre, socket) {
    try {
      const headers = { 'User-Agent': 'Mozilla/5.0' };
      if (domain) headers['Referer'] = domain;
      const response = await fetch(url, { headers });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const responseText = await response.text();

      // Pull the playerConfig JSON out of its inline <script> tag
      const marker = "window.playerConfig =";
      const markerIdx = responseText.indexOf(marker);
      if (markerIdx === -1) {
          throw new Error("Could not find playerConfig in page (video may be private or page layout changed)");
      }
      let playerConfigString = responseText.slice(markerIdx + marker.length);
      const scriptEnd = playerConfigString.indexOf("</script>");
      if (scriptEnd !== -1) {
          playerConfigString = playerConfigString.slice(0, scriptEnd);
      }
      playerConfigString = playerConfigString.trim().replace(/;\s*$/, "");
      const playerConfig = JSON.parse(playerConfigString);

      const cdns = playerConfig?.request?.files?.hls?.cdns || {};
      // Take whichever CDN entry exists rather than hard-coding two names
      const streamUrl = cdns.akfire_interconnect_quic?.avc_url
          || cdns.fastly_skyfire?.avc_url
          || Object.values(cdns).map(c => c && (c.avc_url || c.url)).find(Boolean);

      if (!streamUrl) {
          throw new Error("No HLS stream URL found in player config");
      }

      return {
        title: playerConfig.video.title,
        duration: playerConfig.video.duration,
        streamUrl,
      };
    } catch (error) {
      if (isCancelled) return null;
      const errorMsg = `${pre} Error extracting Vimeo player config: ${error.message}`;
      socket.emit("log", { type: "error", message: errorMsg });
      
      // Note: Cookie handling would need to be done differently with fetch
      socket.emit("log", { type: "info", message: `${pre} Video Security Error... Trying again...`});
      
      return null;
    }
  }
  
  async function downloadHLSStream(m3u8Url, outputFilename, duration, format, resolve, pre, socket, videoIndex) {
    const outputDir = path.dirname(outputFilename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  
    let finalOutput = outputFilename;
    const ffmpegArgs = ["-i", m3u8Url];
  
    switch (format) {
      case 'audio-mp3':
        finalOutput = outputFilename.replace(/\.mp4$/, '.mp3');
        ffmpegArgs.push('-vn', '-b:a', '192k');
        break;
      case 'audio-m4a':
        finalOutput = outputFilename.replace(/\.mp4$/, '.m4a');
        ffmpegArgs.push('-vn', '-c:a', 'copy');
        break;
      case 'video-only':
        finalOutput = outputFilename.replace(/\.mp4$/, '_No_Audio.mp4');
        ffmpegArgs.push('-an', '-c:v', 'copy');
        break;
      default:
        ffmpegArgs.push('-c', 'copy', '-bsf:a', 'aac_adtstoasc');
        break;
    }
    ffmpegArgs.push(finalOutput);
  
    socket.emit("progress", {
      index: videoIndex,
      percentage: 0,
      status: "⇣ Downloading",
      size: "0 MB",
      duration: "00:00:00",
      filename: path.basename(finalOutput),
      speed: "..."
    });
  
    try {
      if (fs.existsSync(finalOutput)) fs.rmSync(finalOutput);
    } catch (e) {
      console.warn("Could not remove existing file:", e.message);
    }
  
    activeProcess = spawn(ffmpegPath, ffmpegArgs);
  
    activeProcess.on("close", (code) => {
      activeProcess = null;
      
      if (isCancelled) {
          console.log(`FFmpeg process for video ${videoIndex} was killed by user.`);
          socket.emit("progress", { index: videoIndex, status: `🛑 Cancelled` });
          try {
            if (fs.existsSync(finalOutput)) fs.rmSync(finalOutput);
          } catch(e) { console.error("Could not remove cancelled file:", e.message)}
          resolve(false);
          return;
      }
  
      if (code === 0) {
        socket.emit("progress", { index: videoIndex, percentage: 100, status: "✅ Downloaded" });
        resolve(true);
      } else {
        socket.emit("log", { type: "error", message: `${pre} FFmpeg process exited with code ${code}` });
        socket.emit("progress", { index: videoIndex, status: `❌ Error (code ${code})`});
        resolve(false);
      }
    });
  
    activeProcess.stderr.on("data", (data) => {
      const dataStr = data.toString();
      if (dataStr.includes("time=")) {
        const timeMatch = dataStr.match(/time=(\s*\d{2}:\d{2}:\d{2}\.\d{2})/);
        const sizeMatch = dataStr.match(/size=(\s*\d+kB)/);
        const speedMatch = dataStr.match(/bitrate=\s*([\d\.]+)\s*kbits\/s/);
        if (timeMatch) {
          const currentTime = timeMatch[1].trim();
          const p = calculatePercentage(currentTime, duration);
          const currentSize = sizeMatch ? sizeMatch[1].trim().replace("kB", " KB") : "N/A";
          let speedString = "...";
          if (speedMatch && speedMatch[1]) {
              const speedInKbits = parseFloat(speedMatch[1]);
              if (!isNaN(speedInKbits)) {
                  const speedInMbps = (speedInKbits / 1000);
                  speedString = speedInMbps.toFixed(2) + " Mbps";
              }
          }
          socket.emit("progress", {
            index: videoIndex,
            percentage: Math.min(p, 100),
            duration: currentTime,
            size: currentSize,
            speed: speedString
          });
        }
      }
    });
  
    activeProcess.on("error", (err) => {
      activeProcess = null;
      const errorMsg = `${pre} Failed to start FFmpeg process: ${err.message}`;
      socket.emit("log", { type: "error", message: errorMsg });
      socket.emit("progress", { index: videoIndex, status: `❌ Error`});
      resolve(false);
    });
  }
  
  // =========================================================================
  //                  UTILITY FUNCTIONS
  // =========================================================================
  
  function convertToSeconds(timeStr) {
    const parts = timeStr.split(":");
    if (parts.length !== 3) return 0;
    return (
      parseInt(parts[0], 10) * 3600 +
      parseInt(parts[1], 10) * 60 +
      parseFloat(parts[2])
    );
  }
  
  function calculatePercentage(timeStr, x) {
    try {
      const totalSeconds = convertToSeconds(timeStr);
      if (x === 0) return 0;
      return Math.round((totalSeconds / x) * 100);
    } catch {
      console.log("Error calculating percentage for:", timeStr, x);
      return 0;
    }
  }
  
  function formatDuration(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
