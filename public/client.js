document.addEventListener("DOMContentLoaded", () => {
    const socket = io();
    let sectionCounter = 1; // Counter for unique IDs in new sections

    // Element references
    const form = document.getElementById("download-form");
    const submitBtn = document.getElementById("submit-btn");
    const addSectionBtn = document.getElementById("add-section-btn");
    const sectionsContainer = document.getElementById("sections-container");
    const resultsContainer = document.getElementById("results-container");
    const progressBarsContainer = document.getElementById("progress-bars");
    const logOutput = document.getElementById("log-output");

    // --- Event Delegation for all dynamic elements ---
    sectionsContainer.addEventListener("click", (e) => {
        const target = e.target;
        
        if (target.classList.contains("add-video-btn")) {
            const section = target.closest(".download-section");
            const videoRowsContainer = section.querySelector(".video-rows-container");
            const firstRow = videoRowsContainer.querySelector(".video-row");
            const newRow = firstRow.cloneNode(true);
            newRow.querySelector(".video-url").value = "";
            newRow.querySelector(".domain-override").value = "";
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

    // Handle change event for the download type toggle
    sectionsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('download-type')) {
            const section = e.target.closest('.download-section');
            section.classList.toggle('is-public', e.target.value === 'public');
        }
    });

    // --- ADDED: PASTE EVENT LISTENER FOR AUTO-SPLITTING URLS ---
    sectionsContainer.addEventListener('paste', (e) => {
        // Only act on the video URL input fields
        if (!e.target.classList.contains('video-url')) {
            return;
        }

        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        // Split by newlines, spaces, or commas, and remove any empty entries
        const urls = pastedText.split(/\s*[\n\s,]\s*/).filter(url => url.trim() !== '');

        if (urls.length > 1) {
            e.preventDefault(); // Prevent the default paste action

            const targetInput = e.target;
            const currentRow = targetInput.closest('.video-row');
            const container = currentRow.parentElement;

            // Put the first URL in the current input
            targetInput.value = urls[0];

            // Create new rows for the rest of the URLs
            for (let i = 1; i < urls.length; i++) {
                const newRow = currentRow.cloneNode(true);
                newRow.querySelector('.video-url').value = urls[i];
                newRow.querySelector('.domain-override').value = ""; // Clear override
                container.appendChild(newRow);
            }
        }
        // If only one URL is pasted, the default behavior is fine.
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
        
        // Update IDs and names for the new toggle switch to make it unique
        ['private', 'public'].forEach(type => {
            const radio = newSection.querySelector(`input[id$="-${type}"]`);
            const label = newSection.querySelector(`label[for$="-${type}"]`);
            radio.id = `s${sectionCounter}-${type}`;
            radio.name = `download-type-s${sectionCounter}`;
            label.htmlFor = radio.id;
        });

        // Default new sections to Private mode
        newSection.querySelector('input[value="private"]').checked = true;
        newSection.classList.remove('is-public');
        
        const videoRowsContainer = newSection.querySelector(".video-rows-container");
        while (videoRowsContainer.children.length > 1) { videoRowsContainer.lastChild.remove(); }
        
        newSection.querySelector(".remove-section-btn").style.display = "inline-block";
        sectionsContainer.appendChild(newSection);
        updateSectionTitles();
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
            
            if (!prefixMajor || !prefixMinorStart) {
                alert(`Error in Section ${index + 1}: Prefix fields are required.`); hasError = true; return;
            }
            if (downloadType === 'private' && !defaultDomain) {
                alert(`Error in Section ${index + 1}: Default Domain is required for Private downloads.`); hasError = true; return;
            }

            const videos = [];
            const videoRows = section.querySelectorAll(".video-row");

            videoRows.forEach(row => {
                const url = row.querySelector(".video-url").value.trim();
                let domain = ''; // Default to empty for public videos

                if (downloadType === 'private') {
                    const overrideDomain = row.querySelector(".domain-override").value.trim();
                    domain = overrideDomain || defaultDomain;
                }
                
                if (url) { videos.push({ url, domain }); }
            });

            if (videos.length === 0) {
                 alert(`Error in Section ${index + 1}: No valid video URLs were found.`); hasError = true; return;
            }
            
            batches.push({ prefixMajor, prefixMinorStart, videos });
        });

        if (hasError) return;
        
        submitBtn.disabled = true;
        document.querySelectorAll('input, button').forEach(el => el.disabled = true);
        resultsContainer.classList.remove("hidden");
        logOutput.innerHTML = "";
        progressBarsContainer.innerHTML = "";
        socket.emit("start-download", { batches });
    });
    
    // --- Socket Event Listeners ---
    socket.on("log", (data) => { const logEntry = document.createElement("div"); logEntry.textContent = data.message; if (data.type) logEntry.classList.add(`log-${data.type}`); logOutput.appendChild(logEntry); logOutput.scrollTop = logOutput.scrollHeight; });
    
    socket.on("new-batch-starting", ({ batchIndex, totalVideos }) => { document.querySelectorAll('.download-section').forEach((sec, idx) => { sec.classList.toggle('active', idx === batchIndex); }); progressBarsContainer.innerHTML = `<h4>Batch ${batchIndex + 1} Progress</h4>`; for(let i = 0; i < totalVideos; i++) { const barHtml = ` <div class="progress-bar-container" id="progress-container-${i}"> <div class="progress-bar-label"> <span class="progress-bar-filename" id="filename-${i}">Video ${i + 1} - Waiting...</span> <div class="progress-bar-stats"> <span class="progress-bar-speed" id="speed-${i}"></span> <span class="progress-bar-details" id="details-${i}"></span> </div> </div> <div class="progress-bar-outer"> <div class="progress-bar-inner" id="progress-bar-${i}" style="width: 0%;">0%</div> </div> </div> `; progressBarsContainer.insertAdjacentHTML('beforeend', barHtml); } });
    
    // --- Download speed handling ---
    socket.on("progress", (data) => { const { index, percentage, status, size, duration, filename, speed } = data; const progressBar = document.getElementById(`progress-bar-${index}`); const details = document.getElementById(`details-${index}`); const filenameSpan = document.getElementById(`filename-${index}`); const speedSpan = document.getElementById(`speed-${index}`); if (!progressBar) return; progressBar.style.width = `${percentage}%`; progressBar.textContent = `${percentage}%`; if (percentage === 100) progressBar.classList.add("complete"); if (filename) filenameSpan.textContent = filename; if (speed && speedSpan) { speedSpan.textContent = speed; } if (status) { details.textContent = status; if (status.includes("Error")) progressBar.classList.add("error"); } else { details.textContent = `Time: ${duration} | Size: ${size}`; } });
    
    socket.on("all-batches-complete", () => { submitBtn.disabled = false; document.querySelectorAll('input, button').forEach(el => el.disabled = false); document.querySelectorAll('.download-section').forEach(sec => sec.classList.remove('active')); });
    
    // --- Pre-populate form with example data ---
    document.querySelector('.default-domain').value = "https://www.example.com/";
    document.querySelector('.video-url').value = "https://vimeo.com/123456789/abcdef1234";
});