# Universal Video Downloader

A self-hosted, portable, and powerful web interface for downloading videos from YouTube, Vimeo, Twitter, Instagram, TikTok, and 1000+ other websites. This tool provides a user-friendly way to manage, organize, and customize batch downloads without touching the command line.

## Features

*   **Multi-Platform Support:** Download from:
    *   **YouTube** - Videos, playlists, shorts
    *   **Vimeo** - Public and private videos
    *   **Twitter/X** - Tweets with videos
    *   **Instagram** - Posts, reels, stories
    *   **TikTok** - Videos without watermark
    *   **Threads** - Video posts
    *   **1000+ other sites** supported by yt-dlp
*   **Fully Portable:** All required tools (FFmpeg and yt-dlp) are automatically downloaded when you first run the application.
*   **Smart Platform Detection:** The interface automatically detects which platform each URL is from and displays a badge.
*   **Advanced Download Formats:** For each batch, you can choose to download:
    *   Video + Audio (Standard `.mp4`)
    *   Video Only (`.mp4`)
    *   Audio Only as `.mp3` (Re-encoded for maximum compatibility)
    *   Audio Only as `.m4a` (Copied directly for maximum speed)
*   **Smart Filenaming:** Videos downloaded with no audio are automatically given a `_No_Audio` suffix for easy identification.
*   **Process Control:**
    *   **Cancel Button:** Immediately stop the entire download queue at any time.
    *   **Collapsible Logs:** Keep the interface clean by showing or hiding the detailed logs with a single click.
*   **User-Friendly Interface:**
    *   **Multi-URL Paste:** Paste an entire list of URLs at once, and the app will create the input fields for you.
    *   **Private/Public Toggle:** Easily switch between modes for downloading public videos or domain-protected private videos.
    *   **Platform Indicators:** Each URL shows which platform it's from (YouTube, Vimeo, etc.)
*   **Batch Organization:**
    *   Organize downloads into sections that run sequentially.
    *   Apply custom filename prefixes (e.g., `01.1_`, `01.2_`, then `02.1_`) for perfect course organization.
*   **Real-Time Progress:** Live progress bars, download speed, file size, and detailed logs are displayed in the browser.

## Prerequisites

All you need is **Node.js** installed on the machine that will run the server.
*   Version 18.x or later is recommended.
*   [Download Node.js](https://nodejs.org/)

*(FFmpeg and yt-dlp will be downloaded automatically on first run)*

## Installation & Usage

There are two ways to get started:

### Easy Installation (Recommended for most users)

1.  Go to the [**Releases Page**](https://github.com/yzRobo/universal-video-downloader/releases) of this repository.
2.  Under the latest release, download the `Source code (zip)` file.
3.  Unzip the folder to a location of your choice.
4.  Run the startup script for your operating system. It will automatically install all required dependencies.
    *   **On Windows:** Double-click `start-server.bat`.
    *   **On macOS/Linux:** Open a terminal, navigate to the folder, and run `chmod +x start-server.sh` followed by `./start-server.sh`.

Open your web browser and navigate to **http://localhost:3000**.

### Developer Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yzRobo/universal-video-downloader.git
    cd universal-video-downloader
    ```
2.  **Install Dependencies & Run**
    Use the startup scripts, which will install dependencies and start the server:
    *   **On Windows**: `start-server.bat`
    *   **On macOS/Linux**: `chmod +x start-server.sh` and then `./start-server.sh`

3. **Access the Web UI**
    Once the server is running, your terminal will display:

    ```
    ✅ Server is running on http://localhost:3000
    Open this URL in your browser to use the downloader.
    ```

Open your web browser and navigate to **http://localhost:3000**.

## How to Use the Interface

### Basic Usage

1.  **Add Video URLs:**
    *   Paste any supported video URL into the input field
    *   The platform will be automatically detected and shown with a badge
    *   To paste multiple URLs at once, copy them from a text file (one per line) and paste

2.  **Configure Download Options:**
    *   Choose your desired format (Video+Audio, Video Only, Audio MP3/M4A)
    *   Set filename prefixes for organization

3.  **Start Downloads:**
    *   Click "Start All Downloads" to begin
    *   Monitor progress with real-time stats
    *   Cancel anytime if needed

### Advanced Features

#### Downloading Private/Embedded Videos

Some videos (especially from Vimeo) may be embedded on private sites and require authentication:

1.  Toggle to **"Private"** mode
2.  Enter the website URL where the video is embedded (e.g., `https://courses.example.com`)
3.  The downloader will use this as a referer to access the video

#### Batch Organization

Organize downloads into sections for courses or series:

1.  Each section runs sequentially (one after another)
2.  Use the Major prefix (01, 02, etc.) for sections/chapters
3.  Use the Minor prefix (1, 2, 3, etc.) for videos within a section
4.  Result: Files named like `01.1_Introduction.mp4`, `01.2_Overview.mp4`, etc.

## Supported Sites

This tool supports 1000+ websites through yt-dlp. Some popular ones include:

- **Video Platforms:** YouTube, Vimeo, Dailymotion, Twitch
- **Social Media:** Twitter/X, Instagram, TikTok, Facebook, Reddit
- **Educational:** Coursera, Udemy, Khan Academy, TED
- **News:** CNN, BBC, NBC, Fox News
- **And many more!**

For a complete list, visit the [yt-dlp supported sites page](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

## Troubleshooting

### "yt-dlp not found" error
- The setup script should download yt-dlp automatically
- If it fails, you can manually download it from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
- Place the executable in the `bin` folder of the project

### Downloads fail immediately
- Check if the URL is correct and the video is publicly accessible
- For private videos, make sure you're using "Private" mode with the correct domain
- Some sites may require cookies or authentication (not yet supported)

### Slow downloads
- Download speed depends on your internet connection and the source server
- Some sites throttle download speeds for non-premium users

## Notes

- Downloaded files are saved in the `downloads` folder
- The tool respects the source website's quality settings
- Some platforms may have restrictions on downloading content
- Always respect copyright and terms of service of the platforms you're downloading from

## License

This project is licensed under the MIT License.
