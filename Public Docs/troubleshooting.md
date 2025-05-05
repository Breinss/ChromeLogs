# ChromeLogs: Troubleshooting Guide

This document provides solutions for common issues encountered when using ChromeLogs. If you're experiencing problems, check here first before reporting an issue.

## Connection Issues

### Cannot Connect to Chrome on Port 9222

**Symptoms:**
- "Cannot connect to Chrome on port 9222" error message
- "Chrome not running with debug port" warning

**Solutions:**

1. **Verify Chrome is running with debugging enabled**

   Make sure Chrome was launched with the correct flag:

   ```bash
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

   # Linux
   google-chrome --remote-debugging-port=9222
   ```

2. **Check if port 9222 is already in use**

   Another process might be using the port:

   ```bash
   # Windows
   netstat -ano | findstr :9222

   # macOS/Linux
   lsof -i :9222
   ```

   If the port is in use, try a different port (e.g., 9223) and update both commands:

   ```bash
   # Launch Chrome with different port
   chrome --remote-debugging-port=9223

   # Run ChromeLogs with the --debug-port option
   node chrome.js --debug-port=9223
   ```

3. **Check firewall settings**

   Your firewall might be blocking connections to port 9222. Add an exception for Node.js or for port 9222.

4. **Ensure no other Chrome instances are running**

   Close all Chrome windows, check your task manager/activity monitor for any Chrome processes, and try again.

5. **Try running as administrator/root**

   Some systems require elevated privileges to open debugging connections.

## Performance and Memory Issues

### High Memory Usage

**Symptoms:**
- Node.js process consuming excessive memory
- System becoming sluggish during recording
- "JavaScript heap out of memory" errors

**Solutions:**

1. **Adjust memory configuration**

   Edit these values in the `MEMORY_CONFIG` object in chrome.js:

   ```javascript
   const MEMORY_CONFIG = {
     maxEventsBeforeFlush: 1000, // Reduced from 5000
     maxLogsPerTabBeforeFlush: 200, // Reduced from 500
     autoFlushIntervalMs: 30000, // More frequent flushing (30s)
     // ...other settings...
   };
   ```

2. **Increase Node.js memory limit**

   ```bash
   node --max-old-space-size=4096 chrome.js
   ```

3. **Record for shorter periods**

   Instead of one long recording session, break it into multiple shorter sessions.

4. **Close unnecessary tabs**

   Every open tab consumes resources. Close tabs you don't need to monitor.

### ChromeLogs Becomes Unresponsive

**Symptoms:**
- Terminal output freezes
- No updates to status line

**Solutions:**

1. **Press any key** to refresh the UI

2. **Check system resources**

   Use Task Manager, Activity Monitor, or `top` to check if your system is running out of resources.

3. **Reduce batch size**

   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     batchSize: 50, // Reduced from 100
     // ...
   };
   ```

## Data Capture Issues

### Missing Network Requests

**Symptoms:**
- Some expected network requests don't appear in HAR files
- Initial page load requests missing

**Solutions:**

1. **Start recording before loading the page**

   Navigate to about:blank first, start ChromeLogs, then navigate to your target site.

2. **Verify network events are being captured**

   Monitor the terminal output to confirm the network events counter increases when making requests.

3. **Check for interception issues**

   Look for this warning in the output:
   ```
   Could not set request interception for [URL]: [error message]
   ```
   If you see this, try restarting Chrome with fewer tabs open.

### Incomplete or Corrupted HAR Files

**Symptoms:**
- HAR files cannot be opened in HAR viewers
- HAR files have incomplete data

**Solutions:**

1. **Check for emergency backup files**

   Look for files with `.backup` extension or in `emergency_*` directories.

2. **Verify write permissions**

   Ensure ChromeLogs has permission to write to the output directory.

3. **Disable compression temporarily**

   ```javascript
   const MEMORY_CONFIG = {
     // ...other settings...
     useCompression: false,
     // ...
   };
   ```

## Console Log Issues

### Missing Console Logs

**Symptoms:**
- Console logs don't appear in the output files
- Error messages from the browser aren't captured

**Solutions:**

1. **Test with a simple console message**

   Execute this in Chrome's DevTools console:
   ```javascript
   console.log("TEST_MESSAGE_123");
   ```
   Then check if "TEST_MESSAGE_123" appears in the logs.

2. **Check console log files**

   Look in these locations:
   - `session_*/console_logs/` directory
   - `session_*/console_all.json` file
   - `session_*/console_flushes/` directory

3. **Ensure you have enough logs to trigger a flush**

   If you're not seeing logs, you might not have generated enough to trigger a flush. Try generating more console messages or manually flush with the 'f' key.

## File System Issues

### Cannot Create Output Directory

**Symptoms:**
- "Failed to create session directory" error
- "Directory write test failed" message

**Solutions:**

1. **Run from a directory with write permissions**

   Move to a directory where you have full permissions, like your home directory.

2. **Pre-create the output directory**

   ```bash
   mkdir -p ChromeLogsOutput
   ```

3. **Use the --output-dir option**

   ```bash
   node chrome.js --output-dir=/path/to/writable/directory
   ```

### Cannot Find HAR Files After Recording

**Symptoms:**
- Message indicates files were saved, but you can't find them

**Solutions:**

1. **Look for the session directory path in the terminal output**

   ChromeLogs displays where files are saved at the end of recording.

2. **Check your current working directory**

   Files are saved relative to where you ran the script.

3. **Search for recently created files**

   ```bash
   # Windows
   dir /s /b /o:d session_*

   # macOS/Linux
   find . -name "session_*" -type d -mtime -1
   ```

## Chrome-specific Issues

### Chrome Updates During Recording

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

### Chrome Crashes With Many Tabs

**Symptoms:**
- Chrome becomes unresponsive with many tabs open
- High memory usage in Chrome

**Solutions:**

1. **Close unnecessary tabs** before recording

2. **Use a separate Chrome profile** for recording:

   ```bash
   chrome --remote-debugging-port=9222 --user-data-dir="C:\ChromeRecordingProfile"
   ```

3. **Increase Chrome's memory limit** (Windows):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --js-flags="--max_old_space_size=4096"
   ```

## Security Considerations

### Security Warnings in Chrome

**Symptoms:**
- Chrome shows security warnings about debugging
- Website refuses to load with debugging enabled

**Solutions:**

1. **Understand the security implications**

   The debugging port should only be used on trusted networks. Anyone with access to port 9222 can control your Chrome instance.

2. **Bind to localhost only**

   ```bash
   chrome --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1
   ```

3. **Close Chrome and disable debugging when finished**

   Do not leave Chrome running with debugging enabled when not in use.

## Still Having Problems?

If you're still experiencing issues:

1. **Check the GitHub repository issues** for similar problems and solutions

2. **Create a detailed bug report** including:
   - Your OS and Node.js version
   - Chrome version
   - Error messages
   - Steps to reproduce
   - Any modifications made to the script

3. **Consider running in debug mode**

   ```bash
   node chrome.js --debug
   ```