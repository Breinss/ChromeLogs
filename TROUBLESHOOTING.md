# Chrome Logs: Troubleshooting Guide

This document provides solutions for common issues encountered when using the Chrome Logs tool.

## Connection Issues

### Cannot Connect to Chrome on Port 9222

**Symptoms:**

- "Cannot connect to Chrome on port 9222" error message
- "Chrome not running with debug port" warning

**Possible Causes and Solutions:**

1. **Chrome is not running with debugging enabled**

   Verify Chrome was launched with the correct flag:

   ```bash
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

   # Linux
   google-chrome --remote-debugging-port=9222
   ```

2. **Port 9222 is already in use**

   Check if another process is using port 9222:

   ```bash
   # Windows
   netstat -ano | findstr :9222

   # macOS/Linux
   lsof -i :9222
   ```

   Solution: Use a different port (e.g., 9223) and update both the Chrome launch command and the script:

   ```bash
   # Launch Chrome with different port
   chrome --remote-debugging-port=9223

   # Modify the script (temporary change)
   # In chrome.js, find this line in the isChromeReachable function:
   port: 9222,
   # and change it to:
   port: 9223,
   ```

3. **Firewall blocking connection**

   Check if your firewall is blocking local connections on port 9222.
   Add an exception for Node.js or for port 9222 in your firewall settings.

4. **Chrome launched with different user profile**

   If you have multiple Chrome profiles, make sure you're launching Chrome with the right profile:

   ```bash
   chrome --remote-debugging-port=9222 --user-data-dir="C:\path\to\your\profile"
   ```

## Memory and Performance Issues

### High Memory Usage

**Symptoms:**

- Node.js process consuming excessive memory
- System becoming sluggish during recording
- "JavaScript heap out of memory" errors

**Solutions:**

1. **Adjust memory configuration:**

   Modify these values in the MEMORY_CONFIG object:

   ```javascript
   const MEMORY_CONFIG = {
     maxEventsBeforeFlush: 1000, // Reduced from 5000
     maxLogsPerTabBeforeFlush: 200, // Reduced from 500
     autoFlushIntervalMs: 30000, // More frequent flushing (30s)
     // ...other settings...
   };
   ```

2. **Increase Node.js memory limit:**

   ```bash
   node --max-old-space-size=4096 chrome.js
   ```

3. **Enable compression if not already:**

   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     useCompression: true,
     // ...
   };
   ```

4. **Record in shorter sessions:**

   Instead of one long recording session, break it into multiple shorter sessions.

### Slow Performance or Crashes

**Symptoms:**

- Chrome becomes unresponsive
- Script stops responding
- Terminal output freezes

**Solutions:**

1. **Reduce batch size:**

   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     batchSize: 50, // Reduced from 100
     // ...
   };
   ```

2. **Disable some monitoring features:**

   If you only need network data and not console logs, you can comment out the console log event handlers in the `setupPageMonitoring` function.

3. **Use process monitoring:**

   Monitor the Node.js process while recording:

   ```bash
   # Linux/macOS
   top -pid $(pgrep -n node)

   # Windows (in another PowerShell window)
   Get-Process -Name node | Select-Object CPU,WorkingSet,Id
   ```

## Data Capture Issues

### Missing Network Requests

**Symptoms:**

- Some expected network requests don't appear in HAR files
- Initial page load requests are missing

**Solutions:**

1. **Start recording before loading the page:**

   Navigate to about:blank first, then start Chrome Logs, then navigate to your target site.

2. **Check request interception:**

   If request interception fails, some requests might not be captured. Look for this warning in the output:

   ```
   Could not set request interception for [URL]: [error message]
   ```

   In this case, try restarting Chrome with fewer tabs open.

3. **Verify network events are being captured:**

   Monitor the terminal output to confirm network events counter increases when making requests.

### Incomplete or Corrupted HAR Files

**Symptoms:**

- HAR files cannot be opened in HAR viewers
- HAR files have incomplete data
- JSON parsing errors when opening files

**Solutions:**

1. **Check for emergency backup files:**

   Look for files with `.backup` extension or in `emergency_*` directories.

2. **Verify write permissions:**

   Ensure the script has permission to write to the output directory.

3. **Disable compression temporarily:**

   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     useCompression: false,
     // ...
   };
   ```

4. **Manually repair JSON files:**

   If a HAR file is truncated but mostly complete, you might be able to repair it by adding missing closing brackets: `]}`.

## Common Console Log Issues

### Missing Console Logs

**Symptoms:**

- Console logs don't appear in the output files
- Error messages from the browser aren't captured

**Solutions:**

1. **Check console events are properly attached:**

   Ensure the console event listeners are working by adding a test console log in the browser:

   ```javascript
   // Execute in Chrome's DevTools console
   console.log("TEST_MESSAGE_123");
   ```

   Then check if "TEST_MESSAGE_123" appears in the recorded logs.

2. **Verify console log files:**

   Look for console log files in these locations:

   - `session_*/console_logs/` directory
   - `session_*/console_all.json` file
   - `session_*/console_flushes/` directory

3. **Check for console flushes:**

   If there are many console logs, they might be flushed to disk before the final save.

## File System Issues

### Cannot Create Output Directory

**Symptoms:**

- "Failed to create session directory" error
- Files being saved to unexpected locations

**Solutions:**

1. **Check permissions:**

   Ensure the Node.js process has write permissions to the script's directory.

2. **Specify absolute path:**

   Modify the sessionDir path to use an absolute path where you have write permissions:

   ```javascript
   sessionDir = path.join(
     os.homedir(),
     "ChromeLogsOutput",
     `session_${timestamp}`
   );
   ```

3. **Pre-create the directory:**

   Manually create the output directory before running the script:

   ```bash
   mkdir -p ChromeLogsOutput
   ```

### Compressed Files Cannot Be Opened

**Symptoms:**

- `.har.gz` or `.json.gz` files cannot be opened directly

**Solutions:**

1. **Decompress the files:**

   ```bash
   # Windows (with 7-Zip)
   "C:\Program Files\7-Zip\7z.exe" e filename.har.gz

   # macOS/Linux
   gunzip filename.har.gz
   ```

2. **Disable compression:**
   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     useCompression: false,
     // ...
   };
   ```

## Chrome-specific Issues

### Chrome Auto-updates During Recording

**Symptoms:**

- Chrome suddenly closes and relaunches
- Error message about Chrome being disconnected

**Solution:**
Temporarily disable Chrome automatic updates before recording:

```bash
# Windows: Rename the Google Update service
sc config gupdate start= disabled
sc config gupdatem start= disabled

# macOS: Modify the update preferences
defaults write com.google.Keystone.Agent checkInterval 0

# Linux (Ubuntu/Debian)
sudo apt-mark hold google-chrome-stable
```

Remember to re-enable updates after your recording session.

### Chrome Crashes with Many Tabs

**Symptoms:**

- Chrome becomes unresponsive with many tabs open
- High memory usage in Chrome

**Solutions:**

1. **Record with fewer tabs:**

   Close unnecessary tabs before recording.

2. **Increase Chrome's memory limit (Windows):**

   Create a shortcut with additional flags:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --js-flags="--max_old_space_size=4096"
   ```

3. **Use a separate Chrome profile:**

   Create a new profile specifically for recording sessions:

   ```bash
   chrome --remote-debugging-port=9222 --user-data-dir="C:\ChromeRecordingProfile"
   ```

## Security Considerations

### Security Warnings

**Symptoms:**

- Chrome shows security warnings about debugging
- Website refuses to load with debugging enabled

**Solutions:**

1. **Understand the security implications:**

   The debugging port should only be used on trusted networks. Anyone with access to port 9222 can control your Chrome instance.

2. **Limit network access:**

   Bind the debugging port to localhost only:

   ```bash
   chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1
   ```

3. **Close Chrome and disable debugging when finished:**

   Do not leave Chrome running with debugging enabled when not in use.

## Advanced Troubleshooting

### Logging the Debugging Process

To troubleshoot issues with the tool itself, add additional debugging output:

```javascript
// Add this at the top of chrome.js, after the other requires
const DEBUG = true;

// Then add debug logs throughout the code
function debugLog(message) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`);
  }
}

// Use it like this
debugLog("About to connect to Chrome");
```

### Capturing Raw Chrome DevTools Protocol Messages

For deep debugging, you can capture the raw CDP messages:

```javascript
// Add this to the browser connection code
browser.on("targetcreated", async (target) => {
  // ...existing code...

  const client = await target.createCDPSession();
  client.on("Network.requestWillBeSent", (params) => {
    fs.appendFileSync("cdp_raw_messages.log", JSON.stringify(params) + "\n");
  });
});
```

### Memory Leak Detection

If you suspect a memory leak in the tool:

1. Install the heapdump module:

   ```bash
   npm install heapdump
   ```

2. Add code to generate heap snapshots:

   ```javascript
   const heapdump = require("heapdump");

   // Add this to the autoSaveInterval
   if (process.memoryUsage().heapUsed > 1.5 * 1024 * 1024 * 1024) {
     // 1.5GB
     heapdump.writeSnapshot(
       `${sessionDir}/heapdump-${Date.now()}.heapsnapshot`
     );
   }
   ```

3. Analyze the heap snapshots in Chrome DevTools.

## Getting Help

If you're still experiencing issues:

1. Check the GitHub repository issues page for similar problems and solutions
2. Create a detailed bug report including:

   - Your OS and Node.js version
   - Chrome version
   - Error messages
   - Steps to reproduce
   - Any modifications made to the script
