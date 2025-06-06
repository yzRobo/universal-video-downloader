import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import { load } from "cheerio";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';

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

// --- WebSocket Connection Handling ---
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("start-download", async (data) => {
    console.log("Received download request with batches:", data.batches.length);
    // Call the master function to process all batches sequentially
    await processAllBatches(data.batches, socket);
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

/**
 * Main orchestrator function that processes an array of download batches sequentially.
 * @param {Array} batches - An array of batch configurations from the client.
 * @param {Socket} socket - The client's socket instance for emitting updates.
 */
async function processAllBatches(batches, socket) {
  socket.emit("all-batches-start");
  
  for (const [index, batch] of batches.entries()) {
    socket.emit("log", { type: 'info', message: `\n--- Starting Batch ${index + 1} / ${batches.length} (Prefix: ${batch.prefixMajor}.x) ---` });
    // Let the client know a new batch is starting so it can set up the UI
    socket.emit("new-batch-starting", { 
        batchIndex: index, 
        totalVideos: batch.videos.length 
    });
    
    // Process this single batch and wait for it to complete
    await runSingleBatch(batch, socket);
    
    socket.emit("log", { type: 'success', message: `--- Finished Batch ${index + 1} / ${batches.length} ---\n` });
  }

  socket.emit("log", { type: "success", message: "\n✅ All download batches are complete!" });
  socket.emit("all-batches-complete");
}

/**
 * Processes a single batch of videos.
 * @param {object} batchConfig - The configuration for this specific batch.
 * @param {Socket} socket - The client's socket instance.
 */
async function runSingleBatch(batchConfig, socket) {
  const { videos, prefixMajor, prefixMinorStart } = batchConfig;
  
  // --- URL Normalization ---
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
    const video = processedVideos[i];
    
    const filePrefix = `${prefixMajor}.${prefixMinorCounter}_`;
    await downloadVimeoPrivateVideo(video, i, processedVideos.length, filePrefix, socket);
    
    prefixMinorCounter++;
  }
}

// =========================================================================
//                  CORE VIMEO DOWNLOADER FUNCTIONS
// =========================================================================

async function downloadVimeoPrivateVideo(videoInfo, index, total, filenamePrefix, socket) {
  const logPrefix = `[${index + 1}/${total}]`;
  socket.emit("log", { type: "info", message: `${logPrefix} Fetching details for ${videoInfo.url}` });

  try {
    let playerConfig;
    for (let i = 0; i < 3; i++) { // Retry loop
        playerConfig = await extractVimeoPlayerConfig(videoInfo.url, videoInfo.domain, logPrefix, socket);
        if (playerConfig) break;
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
    
    socket.emit("log", { type: "info", message: `${logPrefix} Saving video as: ${path.basename(finalOutput)}` });

    await new Promise((resolve) => {
      downloadHLSStream(stream, finalOutput, playerConfig.duration, resolve, logPrefix, socket, index);
    });

  } catch (error) {
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
    const errorMsg = `${pre} Error extracting Vimeo player config: ${error.message}`;
    socket.emit("log", { type: "error", message: errorMsg });

    if (error?.response?.headers?.["set-cookie"]) {
      axios.defaults.headers.common["Cookie"] = error.response.headers["set-cookie"].join("; ");
      socket.emit("log", { type: "info", message: `${pre} Video Security Error... Trying again with new cookies...`});
    }
    return null; // Return null to indicate failure
  }
}

async function downloadHLSStream(m3u8Url, outputFilename, duration = 600, resolve, pre, socket, videoIndex) {
  const outputDir = path.dirname(outputFilename);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Initial progress event
  socket.emit("progress", {
    index: videoIndex,
    percentage: 0,
    status: "⇣ Downloading",
    size: "0 MB",
    duration: "00:00:00",
    filename: path.basename(outputFilename),
    speed: "..." 
  });

  try {
    if (fs.existsSync(outputFilename)) fs.rmSync(outputFilename);
  } catch (e) {
    console.warn("Could not remove existing file:", e.message);
  }

  const ffmpegArgs = ["-i", m3u8Url, "-c", "copy", "-bsf:a", "aac_adtstoasc", outputFilename];
  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      socket.emit("progress", { index: videoIndex, percentage: 100, status: "✅ Downloaded" });
      resolve(true);
    } else {
      const errorMsg = `${pre} FFmpeg process exited with code ${code}`;
      socket.emit("log", { type: "error", message: errorMsg });
      socket.emit("progress", { index: videoIndex, status: `❌ Error (code ${code})`});
      resolve(false);
    }
  });

  ffmpeg.stderr.on("data", (data) => {
    const dataStr = data.toString();
    if (dataStr.includes("time=")) {
      const timeMatch = dataStr.match(/time=(\s*\d{2}:\d{2}:\d{2}\.\d{2})/);
      const sizeMatch = dataStr.match(/size=(\s*\d+kB)/);
      const speedMatch = dataStr.match(/bitrate=\s*([\d\.]+)\s*kbits\/s/);

      if (timeMatch) {
        const currentTime = timeMatch[1].trim();
        const p = calculatePercentage(currentTime, duration);
        const currentSize = sizeMatch ? sizeMatch[1].trim().replace("kB", " KB") : "N/A";
        
        let speedString = "..."; // Default placeholder
        // --- MODIFIED: Convert kbits/s to Mbps ---
        if (speedMatch && speedMatch[1]) {
            const speedInKbits = parseFloat(speedMatch[1]);
            if (!isNaN(speedInKbits)) {
                // 1 Megabit = 1000 kilobits
                const speedInMbps = (speedInKbits / 1000);
                speedString = speedInMbps.toFixed(2) + " Mbps";
            }
        }

        socket.emit("progress", {
          index: videoIndex,
          percentage: Math.min(p, 100),
          duration: currentTime,
          size: currentSize,
          speed: speedString // Send the newly formatted string
        });
      }
    }
  });

  ffmpeg.on("error", (err) => {
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