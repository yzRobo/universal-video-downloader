# Vimeo Downloader Web UI

A self-hosted, web-based interface for a powerful Node.js script that downloads private and domain-protected Vimeo videos. This tool uses FFmpeg to capture HLS streams, providing a user-friendly way to manage and organize batch downloads without using the command line for every task.

## Features

*   **Web-Based Interface**: Easy-to-use UI for managing downloads, accessible from your browser.
*   **Batch Downloads**: Queue up multiple videos for download at once.
*   **Section Organization**: Group videos into different sections, each with its own custom filename prefixing rules (e.g., `01.1_`, `01.2_`, then `02.1_`, `02.2_`).
*   **Real-Time Progress**: Live progress bars, time elapsed, file size, and detailed logs are displayed in the browser during the download process.
*   **URL Normalization**: Automatically converts various Vimeo URL formats into the correct player URL for processing.
*   **Local Storage**: Videos are saved directly to a `downloads` folder within the project directory.

## Prerequisites

Before you begin, ensure you have the following installed on the machine that will run the server:

1.  **Node.js**: Version 18.x or later is recommended.
    *   [Download Node.js](https://nodejs.org/)

2.  **FFmpeg**: This is essential for the video downloading process. It must be installed and accessible from your system's command line PATH.
    *   [Download FFmpeg](https://ffmpeg.org/download.html)
    *   To check if it's installed correctly, open a terminal or command prompt and type `ffmpeg -version`. If it shows version information, you are ready. If not, you must install it and add it to your system's PATH.

## Installation and Running the Server

Follow these simple steps to get the application running.

1.  **Clone the Repository**
    Clone this repository to your local machine.
    ```bash
    git clone https://github.com/your-username/vimeo-downloader-ui.git
    cd vimeo-downloader-ui
    ```

2.  **Run the Startup Script**
    Convenient startup scripts are included for different operating systems. These scripts will automatically install the required Node.js dependencies (`npm install`) on the first run and then start the server.

    *   **On Windows**:
        Simply double-click the `start-server.bat` file.

    *   **On macOS or Linux**:
        Open a terminal in the project directory, make the script executable, and then run it:
        ```bash
        chmod +x start-server.sh
        ./start-server.sh
        ```

3.  **Access the Web UI**
    Once the server is running, your terminal will display a confirmation message:
    ```
    ✅ Server is running on http://localhost:3000
    Open this URL in your browser to use the downloader.
    ```
    Open your favorite web browser and navigate to **http://localhost:3000**.

## How to Use the Interface

1.  **Sections**: The interface is organized into sections. Each section represents a distinct batch of downloads that will be run sequentially.

2.  **Filename Prefixes**:
    *   **Major Prefix**: The main identifier for a section (e.g., `01`, `02`, `SM1`).
    *   **Minor Prefix Start**: The starting number for the videos within that section (e.g., `1`).
    *   A video downloaded with a Major Prefix of `03` and a starting Minor Prefix of `1` will be named something like `03.1_Video-Title.mp4`.

3.  **Video List**:
    *   This textarea requires a JSON array of video objects.
    *   Each object must have a `url` and a `domain`.
    *   The `url` is the link to the Vimeo video.
    *   The `domain` is the website where the video is embedded (this is used for the `Referer` header and is crucial for downloading domain-protected videos).

    **Example JSON format:**
    ```json
    [
      {
        "url": "https://vimeo.com/123456789/abcdef1234",
        "domain": "https://www.some-private-course.com/"
      },
      {
        "url": "https://player.vimeo.com/video/987654321",
        "domain": "https://www.another-client-site.net/"
      }
    ]
    ```

4.  **Managing Sections**:
    *   Click **"Add Another Section"** to create a new batch.
    *   Click **"Remove Section"** to delete an unwanted section (the first section cannot be removed).

5.  **Start Downloading**:
    *   Once you have configured all your sections, click **"Start All Downloads"**.
    *   The application will process each section one by one. The active section will be highlighted in the UI.
    *   You can monitor the progress bars and logs in the "Download Progress" area that appears.

6.  **Output**:
    *   All successfully downloaded videos will be saved in the `downloads` folder, which is created automatically in the project's root directory.

## License

This project is licensed under the MIT License.