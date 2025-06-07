// server.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { load } = require("cheerio");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

// --- Server Setup ---
// In CommonJS, __dirname is a global variable, simplifying our setup.
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

// --- Path Definitions for Binaries ---
// This strategy works for BOTH development and the packaged .exe
const platform = process.platform;
const ytDlpPath = path.join(__dirname, 'bin', platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const ffmpegPath = path.join(__dirname, 'bin', platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');


// =========================================================================
//                  THE FINAL ATTEMPT - A NEW APPROACH
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

// Check yt-dlp on startup
checkYtDlp();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Module-level variables to handle cancellation ---
let isCancelled = false;
let activeProcess = null;

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
  console.log("A user connected:", socket.id);

  socket.on("start-download", async (data) => {
    console.log("Received download request with batches:", data.batches.length);
    isCancelled = false;
    await processAllBatches(data.batches, socket);
  });

  socket.on("cancel-download", () => {
    console.log("Cancellation request received from:", socket.id);
    isCancelled = true;
    if (activeProcess) {
        socket.emit("log", { type: 'error', message: '--- CANCELLATION INITIATED BY USER ---' });
        activeProcess.kill('SIGKILL');
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
  console.log("Open this URL in your browser to use the downloader.");
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
      const outputDir = path.join(__dirname, 'downloads');
      if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
      }

      socket.emit("log", { type: "info", message: `${logPrefix} Fetching video information...` });
      
      let videoInfoJson = '';
      let errorOutput = '';
      
      try {
          const infoProcess = spawnYtDlp(['--dump-json', '--no-warnings', videoInfo.url]);
          
          infoProcess.stdout.on('data', (data) => videoInfoJson += data.toString());
          infoProcess.stderr.on('data', (data) => {
              errorOutput += data.toString();
              if (data.toString()) {
                 socket.emit("log", { type: "info", message: `${logPrefix} yt-dlp: ${data.toString()}` });
              }
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
              throw new Error(`yt-dlp exited with code ${infoCode}.`);
          }
      } catch (error) {
          const finalErrorMsg = `${logPrefix} Failed to run yt-dlp: ${error.message}. Stderr: ${errorOutput}`;
          socket.emit("log", { type: "error", message: finalErrorMsg });
          throw new Error(finalErrorMsg);
      }

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
      } else {
          socket.emit("log", { type: "error", message: `${logPrefix} No video info returned. ${errorOutput}` });
      }

      const sanitizedTitle = (videoDetails.title || 'Unknown')
          .replace(/\.(mp4|mkv|webm|mov|avi|mp3|m4a)$/i, '')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim();
      
      let filename = (filenamePrefix || "") + sanitizedTitle;

      // Construct yt-dlp arguments
      const ytDlpArgs = [];
      
      // Add referer if domain is provided
      if (videoInfo.domain) {
          ytDlpArgs.push('--referer', videoInfo.domain);
      }

      // Format selection based on user choice
      switch (format) {
          case 'audio-mp3':
              ytDlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
              filename += '.mp3';
              break;
          case 'audio-m4a':
              ytDlpArgs.push('-x', '--audio-format', 'm4a', '--audio-quality', '0');
              filename += '.m4a';
              break;
          case 'video-only':
              ytDlpArgs.push('-f', 'bestvideo[ext=mp4]/bestvideo', '--merge-output-format', 'mp4');
              filename += '_No_Audio.mp4';
              break;
          case 'video-audio':
          default:
              // Ensure best quality video+audio merge
              ytDlpArgs.push(
                  '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio',
                  '--merge-output-format', 'mp4'
                  // Removed --recode-video as it's causing issues
              );
              // Add useful metadata options
              ytDlpArgs.push('--embed-subs', '--embed-thumbnail', '--add-metadata');
              filename += '.mp4';
              break;
      }

      // Build the full output path
      const outputPath = path.join(outputDir, filename);

      // Add common arguments
      ytDlpArgs.push(
          '--no-warnings',
          '--progress',
          '--newline',
          '--no-playlist',
          '--output', outputPath  // Output path as a single argument
      );
      
      // Add ffmpeg location if it exists
      if (fs.existsSync(ffmpegPath)) {
          ytDlpArgs.push('--ffmpeg-location', ffmpegPath);
      }
            
      // Add URL at the very end
      ytDlpArgs.push(videoInfo.url);
      
      // Log the command for debugging (with properly quoted paths for display)
      const displayCommand = ytDlpArgs.map(arg => 
          arg.includes(' ') || arg.includes('\\') ? `"${arg}"` : arg
      ).join(' ');
      socket.emit("log", { type: "info", message: `${logPrefix} Running: yt-dlp ${displayCommand}` });

      socket.emit("progress", {
          index: index, percentage: 0, status: "⇣ Starting download", size: "0 MB",
          duration: "00:00:00", filename: filename, speed: "..."
      });

      activeProcess = spawnYtDlp(ytDlpArgs);
      
      let lastPercent = 0;
      let isPostProcessing = false;
      
      activeProcess.stdout.on('data', (data) => {
          const output = data.toString();
          
          // Log all output for debugging
          if (output.trim()) {
              socket.emit("log", { type: "info", message: `${logPrefix} yt-dlp output: ${output.trim()}` });
          }
          
          const percentMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
          const speedMatch = output.match(/at\s+([\d.]+\w+\/s)/);
          const sizeMatch = output.match(/of\s+([\d.]+\w+)/);
          
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

      activeProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (!error.includes('WARNING')) {
              socket.emit("log", { type: 'error', message: `${logPrefix} ${error}` });
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
          const finalPath = path.join(outputDir, filename);
          if (fs.existsSync(finalPath)) {
              const fileSize = formatBytes(fs.statSync(finalPath).size);
              socket.emit("progress", { 
                  index: index, percentage: 100, status: "✅ Downloaded",
                  size: fileSize
              });
              socket.emit("log", { type: 'success', message: `${logPrefix} Successfully downloaded: ${filename} (${fileSize})` });
          } else {
              socket.emit("log", { type: 'error', message: `${logPrefix} Download completed but file not found: ${filename}` });
              socket.emit("progress", { index: index, status: `❌ Error: File not found` });
          }
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
    for (let i = 0; i < 3; i++) {
        playerConfig = await extractVimeoPlayerConfig(videoInfo.url, videoInfo.domain, logPrefix, socket);
        if (playerConfig) break;
        if(isCancelled) return;
        socket.emit("log", { type: "info", message: `${logPrefix} Retrying in 5 seconds...` });
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    
    if (!playerConfig) {
        throw new Error("Failed to extract player config after multiple retries.");
    }
    
    const stream = playerConfig.streamUrl;

    const sanitizedTitle = playerConfig.title
        .replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
        .replace(/\s+on Vimeo$/i, "")
        .trim()
        .replace(/[<>:"/\\|?*]/g, '_');
    
    const defaultFilename = (filenamePrefix || "") + sanitizedTitle + '.mp4';

    const outputDir = path.join(__dirname, 'downloads');
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
    const response = await axios.get(url, {
      headers: { Referer: domain, "User-Agent": "Mozilla/5.0" },
    });
    if (!response) throw new Error("No response from Vimeo");

    const $ = load(response.data);
    const scriptTag = $("script").filter((i, el) => $(el).html().includes("window.playerConfig =")).first();
    const playerConfigString = scriptTag.html().replace("window.playerConfig = ", "").replace(/;$/, "");
    const playerConfig = JSON.parse(playerConfigString);

    return {
      title: playerConfig.video.title,
      duration: playerConfig.video.duration,
      streamUrl: playerConfig.request.files.hls.cdns.akfire_interconnect_quic.avc_url || playerConfig.request.files.hls.cdns.fastly_skyfire.avc_url,
    };
  } catch (error) {
    if (isCancelled) return null;
    const errorMsg = `${pre} Error extracting Vimeo player config: ${error.message}`;
    socket.emit("log", { type: "error", message: errorMsg });
    if (error?.response?.headers?.["set-cookie"]) {
      axios.defaults.headers.common["Cookie"] = error.response.headers["set-cookie"].join("; ");
      socket.emit("log", { type: "info", message: `${pre} Video Security Error... Trying again with new cookies...`});
    }
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

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}