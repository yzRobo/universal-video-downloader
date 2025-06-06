import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import { load } from "cheerio";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
// MODIFIED: Import the ffmpeg-static package
import ffmpeg from 'ffmpeg-static';

// --- Server Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Module-level variables to handle cancellation ---
let isCancelled = false;
let activeFfmpegProcess = null;

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
    if (activeFfmpegProcess) {
        socket.emit("log", { type: 'error', message: '--- CANCELLATION INITIATED BY USER ---' });
        activeFfmpegProcess.kill('SIGKILL');
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
  
  socket.emit("log", { type: "info", message: "Normalizing Vimeo URLs for this batch..." });
  const processedVideos = videos.map(video => {
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
    return { ...video, url: newUrl };
  });

  socket.emit("log", { type: "info", message: `Starting batch download for ${processedVideos.length} videos.`});
  
  let prefixMinorCounter = parseInt(prefixMinorStart, 10);
  for (let i = 0; i < processedVideos.length; i++) {
    if (isCancelled) {
        socket.emit("log", { type: 'error', message: `Skipping remaining videos in batch due to cancellation.` });
        break;
    }
    const video = processedVideos[i];
    const filePrefix = `${prefixMajor}.${prefixMinorCounter}_`;
    await downloadVimeoPrivateVideo(video, i, processedVideos.length, filePrefix, format, socket);
    prefixMinorCounter++;
  }
}

// =========================================================================
//                  CORE VIMEO DOWNLOADER FUNCTIONS
// =========================================================================
async function downloadVimeoPrivateVideo(videoInfo, index, total, filenamePrefix, format, socket) {
  const logPrefix = `[${index + 1}/${total}]`;
  socket.emit("log", { type: "info", message: `${logPrefix} Fetching details for ${videoInfo.url}` });

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
    let defaultFilename = (filenamePrefix || "") + playerConfig.title;
    defaultFilename = defaultFilename.replace(/\s+on Vimeo$/i, "").trim().replace(/[<>:"/\\|?*]/g, '_') + '.mp4';

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

  // Use the path from the ffmpeg-static package instead of the global command
  console.log('--- Using FFmpeg from path:', ffmpeg);
  activeFfmpegProcess = spawn(ffmpeg, ffmpegArgs);

  activeFfmpegProcess.on("close", (code) => {
    activeFfmpegProcess = null;
    
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

  activeFfmpegProcess.stderr.on("data", (data) => {
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

  activeFfmpegProcess.on("error", (err) => {
    activeFfmpegProcess = null;
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