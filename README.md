# Aurora Streamer

Aurora Streamer is a premium Electron-based desktop application built with React, TypeScript, and Vite. It allows you to stream video and audio media directly from your Google Drive using a local `rclone` mounting backend. It features on-the-fly audio transcoding, high-quality Dolby Vision / HDR tonemapping, metadata fetching, and an elegant, modern player UI.

---

## Key Features

- **Google Drive Integration**: Direct connection using a Google Cloud Service Account and `rclone` with active VFS read-ahead caching for smooth playback.
- **On-the-Fly Transcoding**: Dynamic audio transcoding to stereo AAC using `ffmpeg` when streaming formats unsupported by web browsers.
- **Advanced Tonemapping**: Built-in support for Dolby Vision Profile 5 and HDR-to-SDR tonemapping using `libplacebo` Vulkan filters or fallback software filters.
- **Rich Metadata Enrichment**: Automatically fetches show/episode posters, descriptions, and details from TVmaze and TMDb APIs.
- **Interactive UI**:
  - Command Palette (`Ctrl+K` or `Cmd+K`) for quick actions.
  - Custom UI accent colors.
  - Autoplay next episodes, watch history tracking, and playback resume points.
  - Watch history cleanup and privacy features.

---

## Prerequisites

Before running the application, make sure you have:
1. **Node.js** (v18 or higher) installed.
2. A **Google Cloud Service Account** key file (`sa.json`).
3. A Google Drive folder containing your media library.
4. An **rclone** executable matching your operating system placed in the project root.
5. An optional **TMDb API Key** (for enriched show metadata).

---

## Getting Started & Configuration

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Configure Credentials & Secrets
To keep your credentials secure, they are excluded from Git via `.gitignore`. You must configure them locally:

- **Google Service Account**:
  Copy `sa.json.example` to `sa.json` in the root directory and insert your Service Account key information:
  ```bash
  cp sa.json.example sa.json
  ```
- **Rclone Configuration**:
  Copy `rclone.conf.example` to `rclone.conf` in the root directory and configure your Google Drive parameters:
  ```bash
  cp rclone.conf.example rclone.conf
  ```
  Edit `rclone.conf` to set your desired default GDrive folder ID in `root_folder_id`.

### 3. Add Rclone Binary
Download the [rclone binary](https://rclone.org/downloads/) for your platform, rename it to `rclone.exe` (or `rclone` on Unix-like systems), and place it directly in the root of this project.

---

## Running the Application

To run the application locally in development mode with hot-reloading:

```bash
npm run electron:dev
```

This starts the Vite development server and launches Electron concurrently.

---

## License

This project is private and proprietary. Ensure credentials are never committed to version control. Refer to the `.gitignore` configuration for excluded files.
