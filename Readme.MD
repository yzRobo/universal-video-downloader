# Vimeo Downloader Web UI

A self-hosted, portable, and powerful web interface for downloading public and private Vimeo videos. This tool uses a self-contained version of FFmpeg to capture HLS streams and VODs, providing a user-friendly way to manage, organize, and customize batch downloads without touching the command line.

## 🎉 Features

*   **Fully Portable:** No need to install FFmpeg yourself! The correct version is automatically downloaded when you run the startup script, making the application self-contained.
*   **Advanced Download Formats:** For each batch, you can choose to download:
    *   Video + Audio (Standard `.mp4`)
    *   Video Only (`.mp4`)
    *   Audio Only as an `.mp3` (Re-encoded for maximum compatibility)
    *   Audio Only as an `.m4a` (Copied directly for maximum speed)
*   **Smart Filenaming:** Videos downloaded with no audio are automatically given a `_No_Audio` suffix for easy identification.
*   **Process Control:**
    *   **Cancel Button:** Immediately stop the entire download queue at any time.
    *   **Collapsible Logs:** Keep the interface clean by showing or hiding the detailed logs with a single click.
*   **User-Friendly Interface:**
    *   **Multi-URL Paste:** Paste an entire list of URLs at once, and the app will create the input fields for you.
    *   **Private/Public Toggle:** Easily switch between modes for downloading public videos or domain-protected private videos.
*   **Batch Organization:**
    *   Organize downloads into sections that run sequentially.
    *   Apply custom filename prefixes (e.g., `01.1_`, `01.2_`, then `02.1_`) for perfect course organization.
*   **Real-Time Progress:** Live progress bars, download speed (Mbps), file size, and detailed logs are displayed in the browser.

## ✅ Prerequisites

All you need is **Node.js** installed on the machine that will run the server.
*   Version 18.x or later is recommended.
*   [Download Node.js](https://nodejs.org/)

*(You do **not** need to install FFmpeg yourself.)*

## 🚀 Installation & Usage

There are two ways to get started:

### Easy Installation (Recommended for most users)

1.  Go to the [**Releases Page**](https://github.com/your-username/vimeo-downloader-ui/releases) of this repository.
2.  Under the latest release, download the `Source code (zip)` file.
3.  Unzip the folder to a location of your choice.
4.  Run the startup script for your operating system. It will automatically install all required dependencies (including FFmpeg).
    *   **On Windows:** Double-click `start-server.bat`.
    *   **On macOS/Linux:** Open a terminal, navigate to the folder, and run `chmod +x start-server.sh` followed by `./start-server.sh`.

### Developer Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/vimeo-downloader-ui.git
    cd vimeo-downloader-ui
    ```
2.  **Install Dependencies & Run**
    Use the startup scripts, which will install dependencies and start the server:
    *   **On Windows**: `start-server.bat`
    *   **On macOS/Linux**: `chmod +x start-server.sh` and then `./start-server.sh`

3. **Access the Web UI**
    Once the server is running, your terminal will display a confirmation message:

    ```
    ✅ Server is running on http://localhost:3000
    Open this URL in your browser to use the downloader.
    ```

    Open your favorite web browser and navigate to **http://localhost:3000**.

## 📖 How to Use the Interface

The interface is organized into **Sections**. Each section is a batch that will run one after the other.

1.  **Configure a Section:**
    *   **Download Type:** Use the toggle to switch between **Private** (for domain-protected videos) and **Public**.
    *   **Filename Prefixes:** Set the **Major** (`01`, `02`, etc.) and starting **Minor** (`1`, `2`, etc.) numbers for your files.
    *   **Domain (for Private videos):** Enter the **Default Domain** where the private videos are embedded (e.g., `https://www.my-private-course.com`). You can also override this for individual videos.
    *   **Download Format:** Choose your desired output from the dropdown (Video+Audio, Video Only, MP3, or M4A).

2.  **Add Video URLs:**
    *   Paste a single Vimeo URL into the input field.
    *   **To paste a list:** Copy a list of URLs from a text file and paste it into any URL input. The app will automatically create new rows for you.
    *   Use the **"+ Add Video URL"** button to add more rows manually.

3.  **Manage Sections:**
    *   Click **"+ Add Another Section"** to create a new, independent batch.
    *   Click **"Remove Section"** to delete an entire section.

4.  **Start and Monitor Downloads:**
    *   Click **"Start All Downloads"** to begin the process.
    *   The progress area will appear, showing live stats for each download.
    *   Click **"Cancel All"** at any time to stop the queue.
    *   Click **"Show/Hide Logs"** to view detailed FFmpeg output.

5.  **Find Your Files:**
    *   All successfully downloaded files will be saved in the `downloads` folder, which is created automatically in the project's root directory.

## License

This project is licensed under the MIT License.
