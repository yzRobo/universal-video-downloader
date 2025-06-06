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
        
        socket.emit("start-download", { batches });
    });
    
    // --- Socket Event Listeners ---
    socket.on("log", (data) => {
        const logEntry = document.createElement("div");
        logEntry.textContent = data.message;
        if (data.type) logEntry.classList.add(`log-${data.type}`);
        logOutput.appendChild(logEntry);
        logOutput.scrollTop = logOutput.scrollHeight;
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
    });
});