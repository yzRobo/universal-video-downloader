// public/client.js
document.addEventListener("DOMContentLoaded", () => {
    const socket = io();
    let sectionCounter = 1;

    // Element references
    const form = document.getElementById("download-form");
    const submitBtn = document.getElementById("submit-btn");
    const addSectionBtn = document.getElementById("add-section-btn");
    const sectionsContainer = document.getElementById("sections-container");
    const resultsContainer = document.getElementById("results-container");
    const progressBarsContainer = document.getElementById("progress-bars");
    const logOutput = document.getElementById("log-output");
    const cancelBtn = document.getElementById("cancel-btn");
    const toggleLogsBtn = document.getElementById("toggle-logs-btn");
    const cookieSourceSelect = document.getElementById("cookie-source");
    const cookieStatus = document.getElementById("cookie-status");
    const ytdlpVersionSpan = document.getElementById("ytdlp-version");
    const updateYtdlpBtn = document.getElementById("update-ytdlp-btn");

    // Remember the user's cookie choice between visits
    const savedCookieSource = localStorage.getItem("cookieSource");
    if (savedCookieSource) cookieSourceSelect.value = savedCookieSource;
    cookieSourceSelect.addEventListener("change", () => {
        localStorage.setItem("cookieSource", cookieSourceSelect.value);
    });

    // --- Action banner: instructions the user must see (not buried in logs) ---
    const actionBanner = document.getElementById("action-banner");
    const actionBannerText = document.getElementById("action-banner-text");
    const showActionBanner = (message) => {
        actionBannerText.textContent = message;
        actionBanner.classList.remove("hidden");
    };
    const hideActionBanner = () => actionBanner.classList.add("hidden");
    socket.on("action-required", ({ message }) => showActionBanner(message));
    socket.on("action-clear", hideActionBanner);

    // First-run component download (there's no console window to watch)
    socket.on("bootstrap-status", ({ active, failed, message }) => {
        if (active || failed) {
            showActionBanner(message);
            submitBtn.disabled = !!active;
        } else {
            hideActionBanner();
            submitBtn.disabled = false;
        }
    });

    // --- yt-dlp status / update ---
    socket.on("ytdlp-status", ({ version, cookiesFile, defaultBrowser, platform }) => {
        ytdlpVersionSpan.textContent = version ? `yt-dlp: ${version}` : "yt-dlp: not found";
        cookieStatus.textContent = cookiesFile
            ? `✓ cookies.txt found (${cookiesFile})`
            : "No cookies.txt file found (only needed if you choose the Automatic option).";

        // Chrome's cookies cannot be read on Windows (Chrome encrypts them
        // against outside tools, even while closed)
        if (platform === "win32") {
            const chromeOption = cookieSourceSelect.querySelector('option[value="chrome"]');
            if (chromeOption && !chromeOption.disabled) {
                chromeOption.disabled = true;
                chromeOption.textContent = "Chrome — not supported on Windows";
                if (cookieSourceSelect.value === "chrome") {
                    const fallback = (defaultBrowser && defaultBrowser !== "chrome") ? defaultBrowser : "auto";
                    cookieSourceSelect.value = fallback;
                    localStorage.setItem("cookieSource", fallback);
                }
            }
        }

        // Point the user at the browser that actually holds their logins
        if (defaultBrowser) {
            const option = cookieSourceSelect.querySelector(`option[value="${defaultBrowser}"]`);
            if (option && !option.dataset.annotated && !option.disabled) {
                option.dataset.annotated = "1";
                option.textContent += " — your default browser";
            }
        }
    });

    // --- Quit button: cleanly stop the background app (no console to close) ---
    const quitBtn = document.getElementById("quit-btn");
    quitBtn.addEventListener("click", () => {
        if (confirm("Quit Universal Video Downloader? Any in-progress downloads will stop.")) {
            socket.emit("quit-app");
        }
    });
    socket.on("app-quitting", () => {
        document.body.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:1.3rem;color:#e2e8f0;text-align:center;padding:2rem;">' +
            'Universal Video Downloader has closed.<br>You can close this tab.</div>';
    });

    updateYtdlpBtn.addEventListener("click", () => {
        updateYtdlpBtn.disabled = true;
        updateYtdlpBtn.textContent = "Updating…";
        resultsContainer.classList.remove("hidden");
        socket.emit("update-ytdlp");
    });

    socket.on("ytdlp-update-complete", ({ updated, version }) => {
        updateYtdlpBtn.disabled = false;
        updateYtdlpBtn.textContent = "Update yt-dlp";
        if (version) ytdlpVersionSpan.textContent = `yt-dlp: ${version}`;
    });

    // --- App self-update ---
    const updateBanner = document.getElementById("update-banner");
    const updateBannerText = document.getElementById("update-banner-text");
    const updateReleaseLink = document.getElementById("update-release-link");
    const installUpdateBtn = document.getElementById("install-update-btn");
    const appVersionSpan = document.getElementById("app-version");
    let awaitingRestart = false;

    socket.on("app-update-status", (status) => {
        if (status.currentVersion) {
            appVersionSpan.textContent = `App: v${status.currentVersion}`;
        }
        if (!status.updateAvailable) {
            updateBanner.classList.add("hidden");
            return;
        }
        updateBannerText.textContent = `A new version (v${status.latestVersion}) is available — you are on v${status.currentVersion}.`;
        updateBanner.classList.remove("hidden");
        if (status.canSelfUpdate) {
            installUpdateBtn.classList.remove("hidden");
            updateReleaseLink.classList.add("hidden");
        } else {
            installUpdateBtn.classList.add("hidden");
            updateReleaseLink.href = status.releasePage || "#";
            updateReleaseLink.classList.remove("hidden");
        }
    });

    installUpdateBtn.addEventListener("click", () => {
        installUpdateBtn.disabled = true;
        installUpdateBtn.textContent = "Downloading update…";
        resultsContainer.classList.remove("hidden");
        socket.emit("install-app-update");
    });

    socket.on("app-update-installing", () => {
        awaitingRestart = true;
        updateBannerText.textContent = "Updating and restarting — this page will reconnect automatically…";
        installUpdateBtn.classList.add("hidden");
    });

    socket.on("app-update-failed", ({ message }) => {
        installUpdateBtn.disabled = false;
        installUpdateBtn.textContent = "Update & Restart";
        installUpdateBtn.classList.remove("hidden");
        alert(`Update failed: ${message}`);
    });

    // After the new exe restarts the server, socket.io reconnects — reload to
    // pick up the new UI
    socket.io.on("reconnect", () => {
        if (awaitingRestart) window.location.reload();
    });

    // Platform detection function
    function detectPlatform(url) {
        const urlLower = url.toLowerCase();
        
        if (urlLower.includes('vimeo.com')) return { name: 'vimeo', display: 'Vimeo' };
        if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return { name: 'youtube', display: 'YouTube' };
        if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return { name: 'twitter', display: 'Twitter/X' };
        if (urlLower.includes('instagram.com')) return { name: 'instagram', display: 'Instagram' };
        if (urlLower.includes('tiktok.com')) return { name: 'tiktok', display: 'TikTok' };
        if (urlLower.includes('threads.net')) return { name: 'threads', display: 'Threads' };
        
        return { name: 'other', display: 'Supported' };
    }

    // Update platform indicator for a video row
    function updatePlatformIndicator(videoRow) {
        const urlInput = videoRow.querySelector('.video-url');
        const indicator = videoRow.querySelector('.platform-indicator');
        const url = urlInput.value.trim();
        
        if (url) {
            const platform = detectPlatform(url);
            indicator.textContent = platform.display;
            indicator.className = `platform-indicator ${platform.name}`;
            indicator.style.display = 'inline-block';
        } else {
            indicator.style.display = 'none';
        }
    }

    // --- Event Delegation for UI elements ---
    sectionsContainer.addEventListener("click", (e) => {
        const target = e.target;
        
        if (target.classList.contains("add-video-btn")) {
            const section = target.closest(".download-section");
            const videoRowsContainer = section.querySelector(".video-rows-container");
            const firstRow = videoRowsContainer.querySelector(".video-row");
            const newRow = firstRow.cloneNode(true);
            newRow.querySelector(".video-url").value = "";
            newRow.querySelector(".domain-override").value = "";
            newRow.querySelector(".platform-indicator").style.display = "none";
            videoRowsContainer.appendChild(newRow);
        }

        if (target.classList.contains("remove-video-btn")) {
            const rowToRemove = target.closest(".video-row");
            const container = rowToRemove.parentElement;
            if (container.children.length > 1) {
                rowToRemove.remove();
            } else {
                alert("A section must have at least one video URL.");
            }
        }

        if (target.classList.contains("remove-section-btn")) {
            target.closest(".download-section").remove();
            updateSectionTitles();
        }
    });

    sectionsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('download-type')) {
            const section = e.target.closest('.download-section');
            section.classList.toggle('is-public', e.target.value === 'public');
        }
    });

    // Update platform indicator on URL input
    sectionsContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('video-url')) {
            updatePlatformIndicator(e.target.closest('.video-row'));
        }
    });

    sectionsContainer.addEventListener('paste', (e) => {
        if (!e.target.classList.contains('video-url')) {
            return;
        }
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const urls = pastedText
            .split(/[\n,]/)
            .map(url => url.trim())
            .filter(url => url.length > 0);

        if (urls.length > 1) {
            e.preventDefault();
            const targetInput = e.target;
            const currentRow = targetInput.closest('.video-row');
            const container = currentRow.parentElement;
            targetInput.value = urls[0];
            updatePlatformIndicator(currentRow);
            const remainingUrls = urls.slice(1);
            remainingUrls.forEach(url => {
                const newRow = currentRow.cloneNode(true);
                newRow.querySelector('.video-url').value = url;
                newRow.querySelector('.domain-override').value = "";
                container.appendChild(newRow);
                updatePlatformIndicator(newRow);
            });
        } else if (urls.length === 1) {
            // Still update the platform indicator for single URL paste
            setTimeout(() => updatePlatformIndicator(e.target.closest('.video-row')), 0);
        }
    });

    const updateSectionTitles = () => {
        const sections = document.querySelectorAll(".download-section");
        sections.forEach((section, index) => {
            section.querySelector(".section-title").textContent = `Section ${index + 1}`;
        });
    };
    
    // --- Add New Section Logic ---
    addSectionBtn.addEventListener("click", () => {
        sectionCounter++;
        const firstSection = sectionsContainer.querySelector(".download-section");
        const newSection = firstSection.cloneNode(true);
        
        newSection.querySelectorAll("input[type=text], input[type=number]").forEach(input => input.value = "");
        const majorPrefixInput = newSection.querySelector(".prefix-major");
        const lastMajor = parseInt(sectionsContainer.lastElementChild.querySelector('.prefix-major').value, 10);
        majorPrefixInput.value = isNaN(lastMajor) ? "" : String(lastMajor + 1).padStart(2, '0');
        newSection.querySelector(".prefix-minor").value = "1";
        
        newSection.querySelector('.download-format').value = 'video-audio';
        
        ['private', 'public'].forEach(type => {
            const radio = newSection.querySelector(`input[id$="-${type}"]`);
            const label = newSection.querySelector(`label[for$="-${type}"]`);
            radio.id = `s${sectionCounter}-${type}`;
            radio.name = `download-type-s${sectionCounter}`;
            label.htmlFor = radio.id;
        });

        newSection.querySelector('input[value="public"]').checked = true;
        newSection.classList.add('is-public');
        
        const videoRowsContainer = newSection.querySelector(".video-rows-container");
        while (videoRowsContainer.children.length > 1) { videoRowsContainer.lastChild.remove(); }
        
        // Hide platform indicator in new section
        newSection.querySelector('.platform-indicator').style.display = 'none';
        
        newSection.querySelector(".remove-section-btn").style.display = "inline-block";
        sectionsContainer.appendChild(newSection);
        updateSectionTitles();
    });

    // --- Cancel Button Logic ---
    cancelBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to cancel all downloads?")) {
            socket.emit("cancel-download");
            cancelBtn.disabled = true;
            cancelBtn.textContent = "Cancelling...";
        }
    });

    // --- Toggle Logs Button Logic ---
    toggleLogsBtn.addEventListener("click", () => {
        resultsContainer.classList.toggle("logs-hidden");
        const isHidden = resultsContainer.classList.contains("logs-hidden");
        toggleLogsBtn.textContent = isHidden ? "Show Logs" : "Hide Logs";
    });

    // --- Form Submission Logic ---
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const batches = [];
        const sectionElements = document.querySelectorAll(".download-section");
        let hasError = false;

        sectionElements.forEach((section, index) => {
            if (hasError) return;
            
            const downloadType = section.querySelector('.download-type:checked').value;
            const prefixMajor = section.querySelector(".prefix-major").value;
            const prefixMinorStart = section.querySelector(".prefix-minor").value;
            const defaultDomain = section.querySelector(".default-domain").value;
            const format = section.querySelector('.download-format').value;
            
            if (!prefixMajor || !prefixMinorStart) {
                alert(`Error in Section ${index + 1}: Prefix fields are required.`); hasError = true; return;
            }

            const videos = [];
            const videoRows = section.querySelectorAll(".video-row");

            videoRows.forEach(row => {
                const url = row.querySelector(".video-url").value.trim();
                let domain = '';

                if (downloadType === 'private' || defaultDomain) {
                    const overrideDomain = row.querySelector(".domain-override").value.trim();
                    domain = overrideDomain || defaultDomain;
                }
                
                if (url) { videos.push({ url, domain }); }
            });

            if (videos.length === 0) {
                 alert(`Error in Section ${index + 1}: No valid video URLs were found.`); hasError = true; return;
            }
            
            batches.push({ prefixMajor, prefixMinorStart, videos, format });
        });

        if (hasError) return;
        
        document.querySelectorAll('input, button, select').forEach(el => el.disabled = true);
        resultsContainer.classList.remove("hidden");
        progressBarsContainer.innerHTML = "";
        
        resultsContainer.classList.add("logs-hidden");
        toggleLogsBtn.textContent = "Show Logs";
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel All";
        logOutput.innerHTML = "";
        
        socket.emit("start-download", { batches, cookieSource: cookieSourceSelect.value });
    });
    
    // --- Socket Event Listeners ---
    const appendLog = (data) => {
        const logEntry = document.createElement("div");
        logEntry.textContent = data.message;
        if (data.type) logEntry.classList.add(`log-${data.type}`);
        logOutput.appendChild(logEntry);
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    socket.on("log", appendLog);

    // Replay of activity we missed (e.g. the page was closed while the
    // browser had to quit so its cookies could be read)
    socket.on("log-replay", ({ logs, active }) => {
        if (!logs || logs.length === 0 || logOutput.childElementCount > 0) return;
        resultsContainer.classList.remove("hidden");
        resultsContainer.classList.remove("logs-hidden");
        toggleLogsBtn.textContent = "Hide Logs";
        appendLog({ type: "info", message: "--- Reconnected: showing activity from while this page was closed ---" });
        logs.forEach(appendLog);
        if (active) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = "Cancel All";
        }
    });
    
    socket.on("new-batch-starting", ({ batchIndex, totalVideos }) => {
        document.querySelectorAll('.download-section').forEach((sec, idx) => {
            sec.classList.toggle('active', idx === batchIndex);
        });
        progressBarsContainer.innerHTML = `<h4>Batch ${batchIndex + 1} Progress</h4>`;
        for(let i = 0; i < totalVideos; i++) {
            const barHtml = ` <div class="progress-bar-container" id="progress-container-${i}"> <div class="progress-bar-label"> <span class="progress-bar-filename" id="filename-${i}">Video ${i + 1} - Waiting...</span> <div class="progress-bar-stats"> <span class="progress-bar-speed" id="speed-${i}"></span> <span class="progress-bar-details" id="details-${i}"></span> </div> </div> <div class="progress-bar-outer"> <div class="progress-bar-inner" id="progress-bar-${i}" style="width: 0%;">0%</div> </div> </div> `;
            progressBarsContainer.insertAdjacentHTML('beforeend', barHtml);
        }
    });
    
    socket.on("progress", (data) => {
        const { index, percentage, status, size, duration, filename, speed } = data;
        const progressBar = document.getElementById(`progress-bar-${index}`);
        const details = document.getElementById(`details-${index}`);
        const filenameSpan = document.getElementById(`filename-${index}`);
        const speedSpan = document.getElementById(`speed-${index}`);
        if (!progressBar) return;
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${percentage}%`;
        if (percentage === 100) progressBar.classList.add("complete");
        if (filename) filenameSpan.textContent = filename;
        if (speed && speedSpan) { speedSpan.textContent = speed; }
        if (status) {
            details.textContent = status;
            if (status.includes("Error") || status.includes("Cancelled")) progressBar.classList.add("error");
        } else if (size && duration) {
            details.textContent = `Time: ${duration} | Size: ${size}`;
        }
    });
    
    socket.on("all-batches-complete", (data) => {
        document.querySelectorAll('input, button, select').forEach(el => el.disabled = false);
        document.querySelectorAll('.download-section').forEach(sec => sec.classList.remove('active'));
        cancelBtn.disabled = true;
        hideActionBanner();
        // Chrome stays unsupported on Windows even after controls re-enable
        const chromeOption = cookieSourceSelect.querySelector('option[value="chrome"]');
        if (chromeOption && chromeOption.textContent.includes("not supported")) chromeOption.disabled = true;
    });
});