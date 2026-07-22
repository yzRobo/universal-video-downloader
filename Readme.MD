# Universal Video Downloader

A self-hosted, incredibly simple, and powerful web interface for downloading video and audio from YouTube, Vimeo, Twitter, and 1000+ other websites.

With its latest update, the application is now a **fully portable, double-click-to-run executable** for Windows. No installation or command-line knowledge required.

## What's New in Version 3.3

*   **Single-File Download:** The app is now just one exe. On first run it downloads its own components (yt-dlp and ffmpeg) — no more zip files or bin folders to manage.
*   **Automatic App Updates:** The app checks GitHub for new releases on startup and shows an "Update & Restart" button right in the UI — no need to visit the repo again.
*   **Automatic yt-dlp Updates:** The app updates its downloader engine on startup (a stale yt-dlp was the main reason downloads suddenly stopped working). There is also an "Update yt-dlp" button in the UI.
*   **Browser Cookie Support (no more manual exports):** Pick your browser from the new "Sign-in / Cookies" dropdown and the app reads your login cookies directly — no cookies.txt export needed. `cookies.txt` still works as a fallback.
*   **More Reliable Downloads:** Vimeo downloads now fall back to yt-dlp when direct extraction fails, failed metadata lookups no longer abort the whole download, and cancelling now properly stops all background processes.

## Key Features

*   **Multi-Platform Support:** Download from:
    *   **YouTube** - Videos, playlists, shorts (now with cookie support for restricted content)
    *   **Vimeo** - Public and private/embedded videos
    *   **Twitter/X**, **Instagram**, **TikTok**, **Threads**, and more.
*   **User-Friendly Interface:**
    *   **Multi-URL Paste:** Paste a list of URLs, and the app creates input fields for you.
    *   **Private/Public Toggle:** Easily switch modes for public videos or domain-protected private videos.
    *   **Platform Indicators:** Instantly see which site each URL is from.
*   **Advanced Download Formats:** For each batch, choose to download:
    *   Video + Audio (Standard `.mp4`)
    *   Video Only (`.mp4` with a `_No_Audio` suffix)
    *   Audio Only as `.mp3` (Re-encoded for compatibility)
    *   Audio Only as `.m4a` (Copied directly for speed)
*   **Batch Organization:**
    *   Group downloads into sections that run one after another.
    *   Apply custom filename prefixes (e.g., `01.1_`, `01.2_`, then `02.1_`) for perfect course organization.
*   **Process Control & Real-Time Progress:**
    *   **Cancel Button:** Stop the entire download queue at any time.
    *   Live progress bars, download speed, file size, and detailed logs are displayed right in your browser.

## Getting Started (The Easy Way)

1.  Go to the [**Releases Page**](https://github.com/yzRobo/universal-video-downloader/releases).
2.  Under the latest release, download **`UniversalVideoDownloader.exe`** — that's the only file you need.
3.  Put it in a folder of your choice (e.g., a "Video Downloader" folder on your Desktop) and double-click it.

That's it! A console window will appear, and your default web browser will open to `http://localhost:3000` automatically.

### First Time Running

*   **One-time component download:** On first run, the app downloads its required tools (yt-dlp and ffmpeg, ~100 MB) into a `bin` folder it creates next to the exe. You'll see progress in the console. This only happens once.
*   **Windows Security:** Windows Defender SmartScreen might show a warning because the app is not code-signed. This is normal. Click "**More info**" and then "**Run anyway**".
*   **Firewall:** Your firewall may ask for permission for the app to access the network. Click "**Allow access**". This is required for it to function as a local server.

### Staying Up To Date — Automatic

*   **The app updates itself:** On startup it checks GitHub for a newer release. If one exists, a green banner appears in the web interface with an **"Update & Restart"** button — click it and the app downloads the new exe, swaps itself out, and restarts. No need to visit the repo again.
*   **The downloader engine updates itself:** yt-dlp is updated automatically on every startup, so YouTube changes won't silently break your downloads.

### Important Notes
*   The console window that opens is the server. **To stop the application, simply close this window.**
*   The app creates `bin/` and `downloads/` folders next to the exe. Your downloaded videos are saved in `downloads`.
*   Put the exe in its own folder (not directly on your Desktop) so those folders stay tidy.

## How to Use the Interface

1.  **Add Video URLs:**
    *   Paste any supported video URL into the input field. The platform will be automatically detected.
    *   To paste multiple URLs, copy a list (one per line) and paste it into a URL field. The app will create new rows for you.
2.  **Configure Download Options:**
    *   Choose your desired format (Video+Audio, Video Only, etc.).
    *   Set filename prefixes for organization.
3.  **Start Downloads:**
    *   Click "Start All Downloads".
    *   Monitor progress with real-time stats and cancel anytime if needed.

### Downloading Age-Restricted / Sign-in Required Videos

Use the **"Sign-in / Cookies"** dropdown at the top of the page:

*   **Easiest way — use your browser login:** Select your browser (e.g. "Use my Firefox login"). The app reads your login cookies directly from the browser — no manual export needed. Just make sure you are signed in to the site (e.g. YouTube) in that browser.
    *   Tip: Close the browser before starting the download for the most reliable read.
    *   Note: Recent versions of Chrome block cookie access on Windows. If Chrome fails, use Firefox or the cookies.txt method below.
*   **Fallback — cookies.txt file:** Leave the dropdown on "Automatic" and:
    1.  Install a browser extension like "Get cookies.txt LOCALLY"
    2.  Sign in to the site and export cookies in Netscape format
    3.  Save the file as `cookies.txt` in the `downloads` folder (or next to the app)
*   **No cookies:** Select "No cookies" to download without any authentication.

Your choice is remembered between sessions.

### Keeping the Downloader Working (yt-dlp Updates)

Sites like YouTube change frequently, and an out-of-date downloader engine is the most common reason downloads suddenly stop working. This app now **updates yt-dlp automatically every time it starts**. You can also click the **"Update yt-dlp"** button in the UI at any time. The current yt-dlp version is shown next to the button.

### Advanced: Downloading Private/Embedded Videos

Some videos (especially from Vimeo) are embedded on private sites.
1.  In the relevant section, toggle the download type to **"Private"**.
2.  Enter the website URL where the video is embedded (e.g., `https://courses.example.com`). This tells the downloader where to "pretend" it's coming from.

## For Developers: Building from Source

If you want to modify the code and build the executable yourself:

1.  **Prerequisites:** You must have [Node.js](https://nodejs.org/) (v18 or later) installed.
2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/yzRobo/universal-video-downloader.git
    cd universal-video-downloader
    ```
3.  **Install Dependencies:** This will also download `yt-dlp` and `ffmpeg` into the `bin` directory.
    ```bash
    npm install
    ```
4.  **Run in Development Mode:**
    ```bash
    npm run dev
    ```
    This enables auto-reload for CSS/HTML/JS changes during development.
5.  **Run in Production Mode:**
    ```bash
    npm start
    ```
6.  **Build the Executable:** This will create a `dist` folder containing the portable application.
    ```bash
    npm run build
    ```

## Troubleshooting

*   **Application closes immediately or components fail to download:** The app needs internet access on first run to download yt-dlp and ffmpeg into its `bin` folder. Check your connection and firewall, then restart the app — it will retry automatically. Developers can also run `npm install` to fetch the binaries.
*   **Antivirus/Firewall issues:** If the app is blocked, try temporarily disabling your antivirus or adding an exception for `UniversalVideoDownloader.exe` and the `bin` folder.
*   **Downloads fail:** First click "Update yt-dlp" in the UI — an outdated downloader engine is the most common cause. Then check that the URL is correct. For private videos, ensure you are using "Private" mode with the correct referer domain.
*   **Age-restricted YouTube videos:** Select your browser in the "Sign-in / Cookies" dropdown (and be signed in to YouTube in that browser), or provide a `cookies.txt` file in Netscape format in the downloads folder.
*   **"Could not find an available port":** The app tries to use port 3000 and up. If this error occurs, another application is using all the ports it's trying. Close other development servers or applications and try again.

## Supported Sites

This tool supports over 1,000 websites via `yt-dlp`. For a complete list, visit the [yt-dlp supported sites page](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

## License

This project is licensed under the MIT License.
