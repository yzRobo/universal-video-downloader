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