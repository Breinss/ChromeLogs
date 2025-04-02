# Chrome Logger User Guide

## 1. Introduction

### What is Chrome Logger?

Chrome Logger is a helpful tool that records everything happening in your Chrome browser. It captures:

- Network activity (website requests and responses)
- Console messages (error messages, warnings, and other behind-the-scenes information)

### Why Would I Use It?

Chrome Logger is useful when:

- A website isn't working correctly and you need proof to show tech support
- You want to understand what websites your browser is connecting to
- You're experiencing errors on websites and need evidence to report them
- You're curious about what's happening behind the scenes while browsing

This tool creates easy-to-share logs that technical support staff can use to diagnose problems with websites.

## 2. Getting Started

### System Requirements

- Windows, Mac, or Linux computer
- Google Chrome browser installed
- Basic computer skills (no programming knowledge needed!)

### Installation

1. **Download the Chrome Logger files** to your computer
2. **Place the files** in a folder where you can easily find them (like Documents or Desktop)

### Running Chrome Logger

1. **Open your command prompt/terminal**:

   - **Windows**: Press `Windows key + R`, type `cmd` and press Enter
   - **Mac**: Open the Applications folder, then Utilities, and double-click on Terminal
   - **Linux**: Open your terminal application

2. **Navigate to the Chrome Logger folder**:
   Type `cd` followed by the path to where you saved the files

   For example: `cd C:\Users\YourName\Documents\ChromeLogs`

3. **Run Chrome Logger**:
   In the command prompt window, type:

   ```
   node chrome.js
   ```

4. **What happens next**:

   - If Chrome is already running, Chrome Logger will try to connect to it
   - If Chrome is not running, Chrome Logger will attempt to find and launch Chrome automatically with the correct settings
   - If Chrome cannot be launched automatically, you'll see instructions for starting Chrome manually

5. **Success!** You should see a message like:
   ```
   Chrome debug connection confirmed. Connecting...
   Found 1 active browser pages
   Recording from ALL tabs shown above
   Network and console recording started.
   ```

## 3. Main Features and How to Use Them

### Recording Browser Activity

Once Chrome Logger is running, it automatically records:

- **Network Activity**: Every connection your browser makes to websites
- **Console Messages**: Error messages, warnings, and other technical information

You don't need to do anything special - just use Chrome normally!

### Using Chrome While Recording

- **Browse normally** - visit websites, log in, use web applications
- **Open new tabs** - all tabs will be recorded automatically
- **Chrome Logger will show you stats** in the command prompt window:
  ```
  Network: 1234 | Console: 567 (2 errors) | Tabs: 3
  ```
  This shows the number of network requests, console messages, and open tabs

### Finishing Your Recording Session

When you're done recording, simply:

1. **Close all Chrome windows**
2. Chrome Logger will detect that Chrome closed and will automatically:
   - Save all recordings
   - Create summary files
   - Show you where everything is saved

### Finding Your Recorded Data

After you close Chrome, Chrome Logger creates a folder with your recordings named like `session_4-30-45_PM` (based on the time)

Inside this folder, you'll find:

- **Network data**: Files with extension `.har` that contain all network activity
- **Console logs**: Files with extension `.json` that contain error messages and warnings
- **Summary files**: Files that give an overview of what was captured

## 4. Advanced Usage Tips

### Recording Specific Issues

To record a specific website issue:

1. **Start Chrome Logger** following the steps in section 2
2. **Clear browser data** for better results:
   - Open Chrome settings (three dots in upper right)
   - Select "Clear browsing data"
   - Choose "All time" and select at least "Cookies" and "Cached images"
   - Click "Clear data"
3. **Go directly to the website** having problems
4. **Reproduce the exact steps** that cause the issue
5. **Close Chrome** when you've finished reproducing the issue

### Sharing Recorded Data

To share logs with technical support:

1. **Find your session folder** (named like `session_4-30-45_PM`)
2. **Compress (zip) the folder**:
   - Right-click the folder
   - Select "Send to" then "Compressed (zipped) folder" on Windows
   - On Mac, right-click and select "Compress [folder name]"
3. **Upload or email** the zipped file according to support instructions

### Recording Multiple Sessions

You can record multiple sessions by:

1. **Closing Chrome** completely after each session
2. **Starting Chrome Logger again** for a new session
3. Each session will be in a **separate folder** with its own timestamp

## 5. Troubleshooting Common Issues

### "Chrome is not running with remote debugging enabled"

**Solution**:

1. Make sure Chrome is completely closed (check your task manager)
2. Run Chrome Logger again and let it try to start Chrome for you
3. If that doesn't work, you can manually start Chrome with debugging enabled:
   ```
   chrome.exe --remote-debugging-port=9222
   ```
   Then in another command prompt run:
   ```
   node chrome.js
   ```

### "Could not connect to Chrome"

**Solution**:

1. Check that Chrome is running and visible on your screen
2. Try restarting your computer
3. If Chrome Logger can't automatically start Chrome, try starting Chrome manually with:
   ```
   chrome.exe --remote-debugging-port=9222
   ```

### "Failed to save logs" or "Error saving HAR files"

**Solution**:

1. Make sure you have enough disk space
2. Try running Chrome Logger from a folder where you have full permissions:
   - On Windows, try your Documents folder instead of Program Files
   - On Mac/Linux, try your home directory

### Chrome Crashes While Recording

**Solution**:

1. Your session data until the crash should still be saved
2. Try disabling Chrome extensions before recording by adding a flag when running Chrome Logger:
   ```
   node chrome.js --disable-extensions
   ```
   Or when starting Chrome manually:
   ```
   chrome.exe --remote-debugging-port=9222 --disable-extensions
   ```

### High Memory Usage Warning

If you see warnings about memory usage:

**Solution**:

1. Try recording for shorter time periods
2. Focus on just the tabs you need for troubleshooting
3. Close unnecessary tabs to reduce memory usage

### Need More Help?

If you continue experiencing problems, try to take a screenshot or photo of any error messages to share with technical support.

---

## Quick Reference

### Starting Chrome Logger

1. Open command prompt/terminal
2. Navigate to Chrome Logger folder
3. Run: `node chrome.js`
4. Chrome will start automatically or you'll receive instructions if manual action is needed

### Stopping Chrome Logger

1. Simply close all Chrome windows
2. Data is automatically saved

### Finding Your Data

Look for folders named `session_[time]` where Chrome Logger is installed

---

_This user guide was last updated [Date]_
