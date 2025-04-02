# Chrome Logs

## Overview

Chrome Logs is a powerful Node.js utility that connects to an existing Google Chrome instance to capture and record detailed network traffic and console logs across all tabs simultaneously. This tool provides developers, QA testers, and performance analysts with comprehensive HTTP request data and browser console activity without requiring browser extensions or modifications to the target website.

Key features include:

- Captures detailed network requests and responses from all Chrome tabs
- Records all console output including errors, warnings, and logs
- Exports standardized HAR (HTTP Archive) files compatible with performance analysis tools
- Manages memory efficiently for extended recording sessions
- Works with any website without requiring code changes or permissions
- Handles large volumes of data with automatic flushing to disk

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v12.0.0 or higher)
- Google Chrome browser

### Steps

1. Clone or download this repository to your local machine:

```bash
git clone https://github.com/yourusername/chrome-logs.git
# Or simply download and extract the ZIP file
```

2. Navigate to the project directory and install dependencies:

```bash
cd ChromeLogs
npm install
```

3. Required NPM packages:

```bash
npm install puppeteer fs path http os
```

## Configuration

Configuration options are defined in the `MEMORY_CONFIG` object within chrome.js:

```javascript
const MEMORY_CONFIG = {
  maxEventsBeforeFlush: 5000, // Max network events to keep in memory per tab
  maxLogsPerTabBeforeFlush: 500, // Max console logs per tab
  autoFlushIntervalMs: 60000, // Flush to disk every minute
  maxInactiveTimeMs: 3600000, // 1 hour - tabs inactive for longer get logs flushed
  useCompression: true, // Enable gzip compression for flushed files
  batchSize: 100, // Process network events in batches
  useBufferedWrites: true, // Use buffered writes for better I/O performance
};
```

You can modify these values to adjust:

- Memory usage (lower values reduce memory usage but increase disk activity)
- Performance (batch size affects processing efficiency)
- Storage requirements (compression reduces file size but increases CPU usage)

## Usage

### Basic Usage

1. Launch Chrome with remote debugging enabled:

   On Windows:

   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

   On macOS:

   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```

   On Linux:

   ```bash
   google-chrome --remote-debugging-port=9222
   ```

2. Once Chrome is running, start the Chrome Logs tool:

   ```bash
   node chrome.js
   ```

3. Use Chrome normally - open websites, navigate between pages, etc.

4. When finished, close Chrome or press Ctrl+C in the terminal to stop recording.

5. The tool will automatically save all captured data to a session directory named `session_[timestamp]`.

### Output Files

The tool generates several types of files in the session directory:

- **Individual HAR files**: Located in `final_har_files/` folder, one per tab, named after the domain
- **Combined HAR file**: `network_all.har` containing all network requests from all tabs
- **Console logs**: Individual files in `console_logs/` folder, one per tab
- **Combined console logs**: `console_all.json` with an overview of console activity
- **Session summary**: `recording_summary.json` with statistics about the recording session

### Memory Management

For long recording sessions, the tool automatically:

- Flushes network events to disk when the per-tab limit is reached
- Saves console logs to disk when the per-tab limit is reached
- Creates incremental backup files during the session

## Usage Examples

### Scenario 1: Debugging Production Issues

1. When users report errors that you can't reproduce locally:

   ```bash
   # Launch Chrome with remote debugging
   chrome --remote-debugging-port=9222

   # Start recording
   node chrome.js

   # Ask user to reproduce the issue
   # When they encounter the error, stop recording
   ```

2. Examine the HAR files using tools like [HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/) or [HAR Viewer](http://www.softwareishard.com/har/viewer/)

3. Check console logs for JavaScript errors that occurred during the session

### Scenario 2: Performance Analysis

```bash
# Launch Chrome with remote debugging
chrome --remote-debugging-port=9222

# Start recording
node chrome.js

# Navigate to the website and perform key user journeys
# Close Chrome when finished
```

Analyze the resulting HAR files with performance tools like [WebPageTest](https://www.webpagetest.org/) or [Lighthouse](https://developers.google.com/web/tools/lighthouse) to identify slow requests, excessive resources, or other performance issues.

### Scenario 3: Monitoring API Usage

For monitoring all API calls made by a single-page application:

```bash
# Launch Chrome with remote debugging
chrome --remote-debugging-port=9222

# Start recording
node chrome.js

# Use the web application normally
# Close Chrome when finished
```

Review the HAR files to see all API calls, their payloads, response times, and error rates.

## Troubleshooting

### Common Issues

1. **"Cannot connect to Chrome on port 9222"**

   - Ensure Chrome is running with the `--remote-debugging-port=9222` flag
   - Check if another process is using port 9222
   - Try a different port (e.g., 9223) and update both the Chrome launch command and in the script

2. **High memory usage during long sessions**

   - Decrease `maxEventsBeforeFlush` and `maxLogsPerTabBeforeFlush` in MEMORY_CONFIG
   - Enable compression if it's not already enabled
   - Split recording into smaller sessions

3. **Missing network requests in HAR files**

   - Chrome's remote debugging protocol may miss some very early requests
   - Try navigating to about:blank first, then start the recording tool, then navigate to your target site

4. **Cannot run Chrome with debugging flag**
   - Try running Chrome as administrator/root
   - Ensure no other Chrome instances are running (check Task Manager/Activity Monitor)
   - Check if your organization has policies that restrict Chrome's debugging capabilities

### Debugging the Tool Itself

If you encounter issues with the Chrome Logs tool:

1. Check the console for error messages
2. Look for `emergency_*` directories which may contain data saved during unexpected failures
3. Increase Node.js memory limit if needed:
   ```bash
   node --max-old-space-size=4096 chrome.js
   ```

## FAQ

### General Questions

**Q: Does this tool work with other Chromium-based browsers like Edge or Brave?**  
A: Yes, most Chromium-based browsers support the remote debugging protocol, though the executable path and launch parameters may differ.

**Q: Can websites detect that their network traffic is being monitored?**  
A: No, since the tool connects to Chrome's debugging API, it's not detectable by websites as it operates outside of their scope.

**Q: How much disk space will the logs use?**  
A: It varies based on activity. For reference, a typical e-commerce session might generate 5-20MB of HAR files and 1-5MB of console logs. With compression enabled, these sizes are reduced by approximately 70%.

**Q: Can I filter the recorded requests by domain?**  
A: The tool records all requests, but HAR files are organized by tab and each tab's primary domain, making it easier to focus on specific sites during analysis.

**Q: Does this record HTTPS/encrypted traffic?**  
A: Yes, since it connects directly to Chrome's internals, it can record the decrypted content of HTTPS communications.

### Technical Questions

**Q: What's the performance impact on Chrome?**  
A: The performance impact is minimal, typically less than 5% additional CPU and memory usage. For very high traffic sites (hundreds of requests per second), you might notice more impact.

**Q: Does this tool capture WebSocket traffic?**  
A: Yes, WebSocket connections are captured in the HAR files, though the individual WebSocket frames are not currently recorded.

**Q: Will this work in headless Chrome?**  
A: Yes, as long as the headless Chrome instance is launched with the remote debugging port enabled.

**Q: Can I run this in a Docker container?**  
A: Yes, you'll need to:

1. Install Chrome and Node.js in your container
2. Launch Chrome with appropriate flags
3. Run the script as normal

**Q: How is this different from Chrome DevTools' "Save as HAR" feature?**  
A: This tool offers several advantages:

- Records from all tabs simultaneously
- Runs for extended periods with memory management
- Captures console logs alongside network activity
- Doesn't require manual interaction with DevTools
