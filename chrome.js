const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync, spawn } = require("child_process");
const os = require("os");
const { StringDecoder } = require("string_decoder");
const { Readable, Transform } = require("stream");
const SKIP_CHROMIUM_DOWNLOAD = true;
// Global variables
let uniqueRequestId = 0; // Moved to global scope so it's accessible in all functions and new tabs
// Add sessionDir as a truly global variable
let sessionDir;
let networkEvents;
let pages;
const requestUrlMaps = new Map(); // Map<tabId, Map<url, entry>>

// Memory management configurations
const MEMORY_CONFIG = {
  maxEventsBeforeFlush: 5000, // Max network events to keep in memory per tab
  maxLogsPerTabBeforeFlush: 500, // Max console logs per tab
  autoFlushIntervalMs: 60000, // Flush to disk every minute
  maxInactiveTimeMs: 3600000, // 1 hour - tabs inactive for longer get logs flushed
  useCompression: true, // Enable gzip compression for flushed files
  batchSize: 100, // Process network events in batches for better performance
  useBufferedWrites: true, // Use buffered writes for better I/O performance
};

// Progress tracking variables
const progressStats = {
  networkEvents: 0,
  consoleLogs: 0,
  errorLogs: 0,
  warningLogs: 0,
  activeTabs: 0,
  lastUpdate: Date.now(),
  updateFrequencyMs: 500, // Update the status line every 500ms
};

// Structure to track URL statistics per tab
const tabUrlStats = new Map();

// Helper function to extract base URL (domain) from a full URL
function extractBaseUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown-domain";
  }
}

// Helper function to track the most frequent base URL for a tab
function trackTabBaseUrl(tabId, url) {
  if (!url || url === "about:blank") return;

  const baseUrl = extractBaseUrl(url);

  // Initialize if needed
  if (!tabUrlStats.has(tabId)) {
    tabUrlStats.set(tabId, {
      urlCounts: {},
      primaryBaseUrl: null,
      maxCount: 0,
      lastUrl: url,
      lastBaseUrl: baseUrl,
    });
  }

  const stats = tabUrlStats.get(tabId);

  // Update URL counts
  if (!stats.urlCounts[baseUrl]) {
    stats.urlCounts[baseUrl] = 1;
  } else {
    stats.urlCounts[baseUrl]++;
  }

  // Update primary base URL if this one is now more frequent
  if (stats.urlCounts[baseUrl] > stats.maxCount) {
    stats.maxCount = stats.urlCounts[baseUrl];
    stats.primaryBaseUrl = baseUrl;
  }

  stats.lastUrl = url;
  stats.lastBaseUrl = baseUrl;
}

// Function to get a clean filename from a base URL
function getCleanFilenameFromUrl(baseUrl, tabId) {
  return `${baseUrl
    .replace(/[\\/:*?"<>|]/g, "_")
    .substring(0, 50)}_${tabId.substring(0, 6)}`;
}

// Add to utility functions
function throttle(func, limit) {
  let lastRan;
  let lastFunc;
  return function (...args) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// Add to utility functions
class BoundedArray {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.array = [];
    this.overflowed = false;
  }

  push(item) {
    if (this.array.length >= this.maxSize) {
      // Remove oldest item when at capacity
      this.array.shift();
      this.overflowed = true;
    }
    this.array.push(item);
    return this.array.length;
  }

  get length() {
    return this.array.length;
  }

  getItems() {
    return this.array;
  }

  clear() {
    this.array = [];
    this.overflowed = false;
  }
}

// Add to utility functions
const chalk = require("chalk"); // If not installed, will be handled gracefully
chalk.level = 1;

// Helper for colorized output with fallback for environments without chalk
const colors = {
  info: (text) => {
    try {
      return chalk ? chalk.blue(text) : text;
    } catch {
      return text;
    }
  },
  success: (text) => {
    try {
      return chalk ? chalk.green(text) : text;
    } catch {
      return text;
    }
  },
  warning: (text) => {
    try {
      return chalk ? chalk.yellow(text) : text;
    } catch {
      return text;
    }
  },
  error: (text) => {
    try {
      return chalk ? chalk.red(text) : text;
    } catch {
      return text;
    }
  },
  highlight: (text) => {
    try {
      return chalk ? chalk.cyan(text) : text;
    } catch {
      return text;
    }
  },
  dim: (text) => {
    try {
      return chalk ? chalk.gray(text) : text;
    } catch {
      return text;
    }
  },
};

// UI State
const uiState = {
  showAdvanced: false,
  lastKeypress: Date.now(),
  showHelp: false,
  sessionStart: new Date(),
  spinnerState: 0,
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

// Helper to format numbers for display
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

// Helper to format time elapsed
function formatTimeElapsed(startTime) {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Show help menu
function showHelp() {
  process.stdout.write("\n\n");
  console.log(colors.highlight("=== Chrome Logger Help ==="));
  console.log(colors.info("Available commands:"));
  console.log(`  ${colors.success("h")} - Show/hide this help menu`);
  console.log(`  ${colors.success("a")} - Toggle advanced metrics display`);
  console.log(`  ${colors.success("f")} - Force flush all data to disk`);
  console.log(`  ${colors.success("s")} - Show session summary`);
  console.log(
    `  ${colors.success("q")} - Quit (closes the logger, not Chrome)`
  );
  console.log("\nYour data is being saved to:");
  console.log(
    `  ${colors.highlight(sessionDir || "Session directory not yet created")}`
  );
  console.log("\nPress any key to return to the main display");
}

// Show a simplified status display
function showSimpleStatus() {
  // Get current spinner frame
  uiState.spinnerState =
    (uiState.spinnerState + 1) % uiState.spinnerFrames.length;
  const spinner = uiState.spinnerFrames[uiState.spinnerState];

  // Format time running
  const timeRunning = formatTimeElapsed(uiState.sessionStart);

  // Basic info
  const networkCount = formatNumber(progressStats.networkEvents);
  const consoleCount = formatNumber(progressStats.consoleLogs);
  const errorWarningInfo =
    progressStats.errorLogs > 0 || progressStats.warningLogs > 0
      ? colors.warning(
          `(${
            progressStats.errorLogs > 0
              ? colors.error(formatNumber(progressStats.errorLogs) + " errors")
              : ""
          }${
            progressStats.errorLogs > 0 && progressStats.warningLogs > 0
              ? ", "
              : ""
          }${
            progressStats.warningLogs > 0
              ? formatNumber(progressStats.warningLogs) + " warnings"
              : ""
          })`
        )
      : "";

  // Create status line
  let statusLine = `${colors.info(spinner)} Recording for ${colors.highlight(
    timeRunning
  )} | ${colors.success(networkCount)} requests | ${colors.success(
    consoleCount
  )} logs ${errorWarningInfo} | ${colors.info(progressStats.activeTabs)} tabs`;

  // Return the basic status line if advanced info is not requested
  if (!uiState.showAdvanced) {
    statusLine += colors.dim(" | Press h for help");
    return statusLine;
  }

  // Add advanced info if requested
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

  statusLine += `\n${colors.dim(
    "Mem:"
  )} ${heapUsedMB}/${heapTotalMB}MB | ${colors.dim("Flushed:")} ${formatNumber(
    flushStats.totalNetworkEventsFlushed
  )} reqs, ${formatNumber(
    Object.values(flushStats.totalConsoleLogsFlushed).reduce(
      (sum, count) => sum + count,
      0
    )
  )} logs`;

  return statusLine;
}

// Replace updateStatusLine with enhanced version
const updateStatusLine = throttle((force = false) => {
  const now = Date.now();
  // Only update if forced or if enough time has passed since last update
  if (
    !force &&
    now - progressStats.lastUpdate < progressStats.updateFrequencyMs
  ) {
    return;
  }

  progressStats.lastUpdate = now;

  // Clear the current line and move cursor to beginning
  process.stdout.clearLine();
  process.stdout.cursorTo(0);

  // If help is showing, don't update status
  if (uiState.showHelp) return;

  // Write the status line
  process.stdout.write(showSimpleStatus());
}, progressStats.updateFrequencyMs);

// Set up keyboard input handling
function setupKeyboardHandling() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", async (key) => {
      // Detect Ctrl+C to exit
      if (key === "\u0003") {
        console.log("\nExiting...");
        process.exit();
      }

      // Other key commands
      switch (key.toLowerCase()) {
        case "h": // Toggle help
          uiState.showHelp = !uiState.showHelp;
          if (uiState.showHelp) {
            showHelp();
          } else {
            console.clear();
            updateStatusLine(true);
          }
          break;

        case "a": // Toggle advanced display
          uiState.showAdvanced = !uiState.showAdvanced;
          updateStatusLine(true);
          break;

        case "f": // Force flush
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          console.log(colors.info("Manually flushing data to disk..."));
          await performMemoryCheck(true);
          updateStatusLine(true);
          break;

        case "s": // Show session summary
          process.stdout.clearLine();
          process.stdout.cursorTo(0);

          console.log(colors.highlight("\n=== Session Summary ==="));
          console.log(
            `Running for: ${formatTimeElapsed(uiState.sessionStart)}`
          );
          console.log(`Active browser tabs: ${progressStats.activeTabs}`);
          console.log(`Total network requests: ${progressStats.networkEvents}`);
          console.log(`Total console logs: ${progressStats.consoleLogs}`);

          if (progressStats.errorLogs > 0) {
            console.log(
              colors.error(`Errors detected: ${progressStats.errorLogs}`)
            );
          }
          if (progressStats.warningLogs > 0) {
            console.log(
              colors.warning(`Warnings detected: ${progressStats.warningLogs}`)
            );
          }

          console.log(
            colors.info(`\nAll data is being saved to: ${sessionDir}`)
          );
          console.log(colors.dim("Press any key to continue..."));

          // Wait for keypress to continue
          await waitForKeypress();
          console.clear();
          updateStatusLine(true);
          break;

        case "q": // Quit (but keep Chrome running)
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          console.log(colors.info("Saving final data and exiting..."));
          // This will naturally exit when complete
          // Force disconnect from browser to trigger cleanup
          if (browser) {
            browser.disconnect();
          } else {
            process.exit(0);
          }
          break;

        default:
          // Any other key just updates the UI
          if (uiState.showHelp) {
            uiState.showHelp = false;
            console.clear();
          }
          updateStatusLine(true);
          break;
      }
    });
  }
}

// Function to find Chrome executable in the system
const findChromeExecutable = () => {
  console.log("Searching for Chrome installation...");
  const platform = os.platform();

  // Array of common Chrome installation paths by platform
  const commonChromePaths = {
    win32: [
      // Windows paths in order of priority
      process.env["PROGRAMFILES(X86)"] +
        "\\Google\\Chrome\\Application\\chrome.exe",
      process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
      process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
      // Canary paths
      process.env["LOCALAPPDATA"] +
        "\\Google\\Chrome SxS\\Application\\chrome.exe",
    ],
    darwin: [
      // macOS paths
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ],
    linux: [
      // Linux paths
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ],
  };

  // Get Chrome paths for current platform (defaults to Linux paths if platform is not recognized)
  const chromePaths = commonChromePaths[platform] || commonChromePaths.linux;

  // On Windows, try to get Chrome path from registry using WMIC
  if (platform === "win32") {
    try {
      const wmicOutput = execSync(
        'wmic datafile where name="chrome.exe" get Version,Name /format:csv',
        { encoding: "utf-8" }
      );

      const regPaths = wmicOutput
        .split("\n")
        .filter((line) => line.toLowerCase().includes("chrome.exe"))
        .map((line) => {
          // Extract path from the WMIC output
          const parts = line.split(",");
          return parts.length >= 2 ? parts[1].trim() : null;
        })
        .filter(Boolean);

      // Add registry-found paths to our search list
      if (regPaths.length > 0) {
        chromePaths.push(...regPaths);
      }
    } catch {
      // Registry lookup failed, continue with known paths
      console.log("Registry lookup failed, using predefined paths");
    }
  }

  // Check if Chrome paths exist
  for (const chromePath of chromePaths) {
    if (chromePath && fs.existsSync(chromePath)) {
      console.log(`Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }

  // If Chrome is not found, try to use 'where' command on Windows or 'which' on Unix
  try {
    let command = platform === "win32" ? "where chrome" : "which google-chrome";
    const chromePath = execSync(command, { encoding: "utf-8" }).trim();
    if (chromePath && fs.existsSync(chromePath)) {
      console.log(`Found Chrome using system PATH: ${chromePath}`);
      return chromePath;
    }
  } catch {
    // Command failed, Chrome isn't in PATH
  }

  console.log("Chrome executable not found in common locations.");
  return null;
};

// Function to launch Chrome with debug port if it's not running
const launchChrome = async (chromePath) => {
  if (!chromePath) {
    console.error("Cannot launch Chrome: No executable path provided");
    return false;
  }

  console.log(`Attempting to launch Chrome from: ${chromePath}`);

  try {
    // Check if Chrome is already running with remote debugging
    const isRunning = await isChromeReachable();
    if (isRunning.success) {
      console.log("Chrome is already running with remote debugging enabled");
      return true;
    }

    // Launch Chrome with remote debugging enabled
    const args = [
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
    ];

    console.log(`Launching Chrome with args: ${args.join(" ")}`);

    // Use spawn instead of exec to avoid hanging
    const chromeProcess = spawn(chromePath, args, {
      detached: true, // Detach from parent process
      stdio: "ignore", // Avoid hanging the Node process
    });

    // Detach the child process so it doesn't keep the Node.js process alive
    chromeProcess.unref();

    // Wait for Chrome to start and become available
    console.log("Waiting for Chrome to start...");
    for (let attempts = 1; attempts <= 10; attempts++) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second between attempts

      const checkResult = await isChromeReachable();
      if (checkResult.success) {
        console.log(
          "Chrome successfully launched with remote debugging enabled"
        );
        return true;
      }

      console.log(
        `Waiting for Chrome to become available (attempt ${attempts}/10)...`
      );
    }

    console.error("Failed to launch Chrome after multiple attempts");
    return false;
  } catch (error) {
    console.error(`Error launching Chrome: ${error.message}`);
    return false;
  }
};

// Wait for user to press any key
const waitForKeypress = async () => {
  process.stdin.setRawMode(true);
  return new Promise((resolve) =>
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      resolve();
    })
  );
};

// Check if Chrome is running with debug port open
const isChromeReachable = () => {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 9222,
        path: "/json/version",
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              success: true,
              url: JSON.parse(data).webSocketDebuggerUrl,
            });
          } catch {
            resolve({ success: false });
          }
        });
      }
    );

    req.on("error", () => resolve({ success: false }));
    req.end();
  });
};

// Add to utility functions
const headerCache = new Map();

function formatHeaders(headers) {
  if (!headers) return [];

  // Create a cache key from headers object
  const cacheKey = JSON.stringify(headers);

  // Check cache first
  if (headerCache.has(cacheKey)) {
    return headerCache.get(cacheKey);
  }

  // Format headers
  const formatted = Object.entries(headers).map(([name, value]) => ({
    name,
    value: String(value),
  }));

  // Cache the result (with limit to prevent memory leaks)
  if (headerCache.size < 1000) {
    headerCache.set(cacheKey, formatted);
  }

  return formatted;
}

function extractQueryString(url) {
  try {
    const parsedUrl = new URL(url);
    return Array.from(parsedUrl.searchParams.entries()).map(
      ([name, value]) => ({ name, value: String(value) })
    );
  } catch {
    return [];
  }
}

function createHarFile(entries, pages) {
  // Handle both Map objects and arrays by ensuring entries is always an array
  const eventsArray = Array.isArray(entries)
    ? entries
    : entries instanceof Map
    ? Array.from(entries.values()).flat() // If it's a Map of arrays, flatten the values
    : []; // If it's neither a Map nor an array, use an empty array

  // Process entries in batches to avoid large memory allocations
  const batchSize = MEMORY_CONFIG.batchSize || 100;
  let processedEntries = [];

  // Process entries in batches
  for (let i = 0; i < eventsArray.length; i += batchSize) {
    const batch = eventsArray.slice(i, i + batchSize).map((entry) => {
      // Reuse timing object for better performance
      const timings = {
        blocked: parseFloat((entry.timings.blocked || 0).toFixed(5)),
        dns: entry.timings.dns || -1,
        ssl: entry.timings.ssl || -1,
        connect: entry.timings.connect || -1,
        send: parseFloat((entry.timings.send || 0).toFixed(5)),
        wait: parseFloat((entry.timings.wait || 0).toFixed(5)),
        receive: parseFloat((entry.timings.receive || 0).toFixed(5)),
        _blocked_queueing: parseFloat(
          (entry.timings._blocked_queueing || 0).toFixed(5)
        ),
      };

      // Create a clean entry that matches Chrome's format - use minimal object properties
      return {
        _initiator: { type: "script" },
        _priority: entry._priority || "High",
        _resourceType: entry._resourceType || "other",
        cache: {},
        connection: entry.connection || "443",
        request: entry.request,
        response: entry.response || {
          status: 0,
          statusText: "",
          httpVersion: "http/1.1",
          headers: [],
          cookies: [],
          content: { mimeType: "" },
          redirectURL: "",
          headersSize: -1,
          bodySize: -1,
          _transferSize: 0,
          _error: null,
        },
        serverIPAddress: entry.serverIPAddress || "",
        startedDateTime: entry.startedDateTime,
        time: parseFloat((entry.time || 0).toFixed(5)),
        timings: timings,
      };
    });

    processedEntries.push(...batch);
  }

  // Create a HAR file that matches Chrome's expected format - use minimal object
  return {
    log: {
      version: "1.2",
      creator: {
        name: "WebInspector", // Match Chrome's creator name
        version: "537.36", // Match Chrome's version
      },
      pages: pages.map((page) => ({
        startedDateTime: page.startedDateTime,
        id: page.id,
        title: page.title || "",
        pageTimings: {
          onContentLoad: -1,
          onLoad: -1,
        },
      })),
      entries: processedEntries,
    },
  };
}

// Function to save console logs for all tabs
function saveAllConsoleLogs(sessionDir, allTabsLogs) {
  return new Promise(async (resolve, reject) => {
    try {
      // Create a console logs directory if many tabs
      let logsDir;
      const consoleDir = path.join(sessionDir, "console_logs");
      const hasMultipleTabs = Object.keys(allTabsLogs).length > 1;

      if (hasMultipleTabs && !fs.existsSync(consoleDir)) {
        try {
          fs.mkdirSync(consoleDir, { recursive: true });
          logsDir = consoleDir;
        } catch (e) {
          console.warn(`Could not create console logs directory: ${e.message}`);
          // Fall back to session directory
          logsDir = sessionDir;
        }
      } else {
        logsDir = fs.existsSync(consoleDir) ? consoleDir : sessionDir;
      }

      let totalLogEntries = 0;
      const tabSummaries = [];
      const savePromises = [];

      // For each tab, create a separate log file - process in parallel for better performance
      Object.entries(allTabsLogs).forEach(([pageId, tabData], index) => {
        // Skip if no logs for this tab
        if (!tabData.logs || tabData.logs.length === 0) {
          return;
        }

        totalLogEntries += tabData.logs.length;

        // Create a clean filename from tab title or use tab index if title unavailable
        const safeTitle = (tabData.pageTitle || `Tab${index + 1}`)
          .replace(/[^a-z0-9]/gi, "_")
          .substring(0, 30);

        const tabLogFilePath = path.join(
          logsDir,
          `console_${safeTitle}_${pageId.substring(0, 6)}.json`
        );

        // Calculate entry types in a single pass
        const entriesByType = {
          log: 0,
          info: 0,
          warning: 0,
          error: 0,
          debug: 0,
          other: 0,
        };

        tabData.logs.forEach((entry) => {
          const type = entry.type;
          if (entriesByType.hasOwnProperty(type)) {
            entriesByType[type]++;
          } else {
            entriesByType.other++;
          }
        });

        // Create structured log output for this tab
        const formattedLogs = {
          timestamp: new Date().toLocaleTimeString(),
          pageId,
          pageTitle: tabData.pageTitle,
          pageUrl: tabData.pageUrl,
          totalEntries: tabData.logs.length,
          entriesByType,
          entries: tabData.logs,
        };

        // Save asynchronously for better performance
        const savePromise = writeCompressedFile(
          tabLogFilePath,
          formattedLogs
        ).catch((err) =>
          console.error(`Error saving logs for tab ${pageId}: ${err.message}`)
        );

        savePromises.push(savePromise);

        // Store summary for combined log file
        tabSummaries.push({
          pageId,
          pageTitle: tabData.pageTitle,
          pageUrl: tabData.pageUrl,
          logCount: tabData.logs.length,
        });
      });

      // Also create a combined log file - but with limited entries to avoid memory pressure
      const combinedLogFilePath = path.join(sessionDir, `console_all.json`);

      // Create a summary version with limited full data to avoid memory pressure
      const combinedLogData = {
        timestamp: new Date().toLocaleTimeString(),
        totalTabs: tabSummaries.length,
        tabs: tabSummaries,
        totalEntries: totalLogEntries,
        // Include limited log data - just first 100 logs per tab
        tabLogs: Object.fromEntries(
          Object.entries(allTabsLogs).map(([tabId, data]) => {
            const limitedLogs = {
              ...data,
              logs: data.logs?.slice(0, 100) || [],
              logCount: data.logs?.length || 0,
              truncated: (data.logs?.length || 0) > 100,
            };
            return [tabId, limitedLogs];
          })
        ),
      };

      const combinedSavePromise = writeCompressedFile(
        combinedLogFilePath,
        combinedLogData
      ).catch((err) =>
        console.error(`Error saving combined logs: ${err.message}`)
      );

      savePromises.push(combinedSavePromise);

      // Wait for all save operations to complete
      await Promise.allSettled(savePromises);
      resolve();
    } catch (e) {
      console.error(`Error saving console logs: ${e.message}`);
      // Try a simpler approach as fallback
      try {
        const backupPath = path.join(sessionDir, "console_backup.json");
        fs.writeFileSync(
          backupPath,
          JSON.stringify({
            timestamp: new Date().toLocaleTimeString(),
            error: e.message,
            tabCount: Object.keys(allTabsLogs).length,
          })
        );
        console.log(`Created backup logs summary at ${backupPath}`);
        resolve();
      } catch (backupErr) {
        console.error(
          `Critical error - couldn't save logs: ${backupErr.message}`
        );
        reject(e);
      }
    }
  });
}

// The original saveConsoleLogs function remains as a fallback
function saveConsoleLogs(filePath, logs) {
  try {
    if (!logs || logs.length === 0) {
      console.log("No console logs to save");
      // Save an empty structure with metadata
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          {
            timestamp: new Date().toLocaleTimeString(),
            totalEntries: 0,
            message: "No console logs were captured during this session",
            entries: [],
          },
          null,
          2
        )
      );
      return;
    }

    // Count by type in a single pass
    const entriesByType = {
      log: 0,
      info: 0,
      warning: 0,
      error: 0,
      debug: 0,
      other: 0,
    };
    logs.forEach((log) => {
      const type = log.type;
      if (entriesByType.hasOwnProperty(type)) {
        entriesByType[type]++;
      } else {
        entriesByType.other++;
      }
    });

    // Create structured log output
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          timestamp: new Date().toLocaleTimeString(),
          totalEntries: logs.length,
          entriesByType,
          entries: logs,
        },
        null,
        2
      )
    );

    console.log(`Saved ${logs.length} console log entries to ${filePath}`);
  } catch (e) {
    console.error(`Error saving console logs: ${e.message}`);
    // Try a simpler approach as fallback
    try {
      fs.writeFileSync(filePath + ".backup", JSON.stringify(logs));
    } catch (backupErr) {
      console.error(
        `Critical error - couldn't save logs: ${backupErr.message}`
      );
    }
  }
}

// Save final HAR files - one per tab
const saveFinalHarFiles = () => {
  return new Promise(async (resolve, reject) => {
    try {
      // Create har directory - use let instead of const since we might need to change it
      let harDir = path.join(sessionDir, "final_har_files");
      if (!fs.existsSync(harDir)) {
        try {
          fs.mkdirSync(harDir, { recursive: true });
        } catch (dirErr) {
          console.error(`Failed to create HAR directory: ${dirErr.message}`);
          // Fall back to session directory
          harDir = sessionDir;
        }
      }

      // Process tabs in parallel for better performance
      const savePromises = [];

      // Process each tab
      for (const [tabId, tabEvents] of networkEvents.entries()) {
        // Skip empty tabs
        if (tabEvents.length === 0) continue;

        const tabInfo = pages.get(tabId) || {
          id: tabId,
          title: "Unknown Tab",
          url: "unknown",
          startedDateTime: new Date().toISOString(),
        };

        // Get base URL for filename
        let baseUrl = "unknown-domain";
        if (tabUrlStats.has(tabId)) {
          const tabUrlStat = tabUrlStats.get(tabId);
          baseUrl =
            tabUrlStat.primaryBaseUrl ||
            tabUrlStat.lastBaseUrl ||
            "unknown-domain";
        }

        // Create a clean filename
        const cleanBaseUrl = getCleanFilenameFromUrl(baseUrl, tabId);

        // Generate HAR file path with base URL as name
        const harFilePath = path.join(harDir, `${cleanBaseUrl}.har`);

        // Create HAR data from events for this tab
        const harData = createHarFile(tabEvents, [tabInfo]);

        // Use optimized async file write
        const savePromise = writeCompressedFile(harFilePath, harData)
          .then(() => {
            console.log(
              `Saved HAR file for tab "${tabInfo.title}" to: ${harFilePath}`
            );
          })
          .catch((err) => {
            console.error(
              `Error saving HAR for tab "${tabInfo.title}": ${err.message}`
            );
          });

        savePromises.push(savePromise);
      }

      // Also create a combined HAR file for convenience
      const combinedHarPath = path.join(sessionDir, "network_all.har");

      // Flatten all events from all tabs into a single array - safely check for iterability
      const allEvents = [];
      for (const events of networkEvents.values()) {
        // Check if events is an array or array-like iterable before spreading
        if (events && Array.isArray(events)) {
          if (events.length > 0) {
            allEvents.push(...events);
          }
        } else if (
          events &&
          typeof events === "object" &&
          events.array &&
          Array.isArray(events.array)
        ) {
          // Handle BoundedArray objects which store their items in an 'array' property
          if (events.array.length > 0) {
            allEvents.push(...events.array);
          }
        } else if (events && typeof events.getItems === "function") {
          // Handle objects with a getItems() method that returns an array (like BoundedArray)
          const items = events.getItems();
          if (Array.isArray(items) && items.length > 0) {
            allEvents.push(...items);
          }
        }
      }

      // Create combined HAR file with the array of events
      const combinedHarData = createHarFile(
        allEvents,
        Array.from(pages.values())
      );

      // Add the combined HAR save to our promises
      const combinedSavePromise = writeCompressedFile(
        combinedHarPath,
        combinedHarData
      )
        .then(() => {
          console.log(`Saved combined HAR file to: ${combinedHarPath}`);
        })
        .catch((err) => {
          console.error(`Error saving combined HAR: ${err.message}`);
        });

      savePromises.push(combinedSavePromise);

      // Wait for all save operations to complete
      await Promise.allSettled(savePromises);
      resolve();
    } catch (e) {
      console.error(`Error saving final HAR files: ${e.message}`);
      reject(e);
    }
  });
};

// Helper function for compressed writes
function writeCompressedFile(filePath, data) {
  return new Promise((resolve, reject) => {
    try {
      // For small files, use synchronous write for simplicity
      if (
        MEMORY_CONFIG.useCompression &&
        typeof data === "object" &&
        Object.keys(data).length > 10
      ) {
        const zlib = getZlib();
        const gzip = zlib.createGzip();
        const compressedPath = `${filePath}.gz`;
        const fileStream = fs.createWriteStream(compressedPath);

        // Handle stream errors
        fileStream.on("error", (err) => {
          // Try fallback to sync write if streaming fails
          try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            resolve(filePath);
          } catch (fallbackErr) {
            reject(
              new Error(
                `Stream error: ${err.message}, Fallback error: ${fallbackErr.message}`
              )
            );
          }
        });

        const jsonString = JSON.stringify(data);
        const dataStream = require("stream").Readable.from([jsonString]);

        dataStream.pipe(gzip).pipe(fileStream);

        fileStream.on("finish", () => resolve(compressedPath));
      } else {
        // For small data or when compression is disabled, use sync write
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        resolve(filePath);
      }
    } catch (e) {
      // Fall back to a simpler approach if error occurs
      try {
        fs.writeFileSync(filePath + ".backup", JSON.stringify(data));
        resolve(filePath + ".backup");
      } catch (backupErr) {
        reject(
          new Error(
            `Original error: ${e.message}, Backup error: ${backupErr.message}`
          )
        );
      }
    }
  });
}

// Function to flush network events to disk for a specific tab and clear memory
const flushNetworkEventsForTab = async (tabId, forceSave = false) => {
  try {
    if (!sessionDir || !networkEvents.has(tabId)) {
      return; // Skip if directory not set or no events for this tab
    }

    const tabEvents = networkEvents.get(tabId);

    // Skip if not enough events to flush (unless forced)
    if (tabEvents.length < MEMORY_CONFIG.maxEventsBeforeFlush && !forceSave) {
      return;
    }

    // Get tab information
    let tabInfo = pages.get(tabId) || {
      id: tabId,
      title: "Unknown Tab",
      url: "unknown",
      startedDateTime: new Date().toISOString(),
    };

    // Get base URL for filename
    let baseUrl = "unknown-domain";
    if (tabUrlStats.has(tabId)) {
      const tabUrlStat = tabUrlStats.get(tabId);
      baseUrl =
        tabUrlStat.primaryBaseUrl || tabUrlStat.lastBaseUrl || "unknown-domain";
    }

    // Create a clean filename
    const cleanBaseUrl = getCleanFilenameFromUrl(baseUrl, tabId);

    // Create flush directory if needed
    const flushDir = path.join(sessionDir, "network_flushes");
    if (!fs.existsSync(flushDir)) {
      fs.mkdirSync(flushDir, { recursive: true });
    }

    // Create a unique flush filename
    const tabFlushCount = flushStats.perTabNetworkEventsFlushed[tabId] || 0;
    const flushFilePath = path.join(
      flushDir,
      `${cleanBaseUrl}_flush_${tabFlushCount + 1}.har`
    );

    // Create HAR file from current events for this tab
    const harData = createHarFile(tabEvents, [tabInfo]);

    // Use optimized write function
    await writeCompressedFile(flushFilePath, harData);

    // Update stats
    flushStats.perTabNetworkEventsFlushed[tabId] = tabFlushCount + 1;
    flushStats.totalNetworkEventsFlushed += tabEvents.length;
    flushStats.networkEventFlushes++;
    flushStats.lastFlushTime = new Date();

    // Clear current line and show flush message on its own line
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(
      `Memory management: Flushed ${tabEvents.length} network events for tab "${tabInfo.title}" (${baseUrl}) to disk`
    );

    // Clear memory for this tab
    networkEvents.set(tabId, []);

    // Store reference to the flush file in tab info
    if (!tabInfo.networkFlushFiles) {
      tabInfo.networkFlushFiles = [];
    }
    tabInfo.networkFlushFiles.push(flushFilePath);

    // Restore status line
    updateStatusLine(true);
  } catch (e) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.error(
      `Failed to flush network events for tab ${tabId}: ${e.message}`
    );
    updateStatusLine(true);
  }
};

// Helper function to fetch Chrome WebSocket URL manually without using fetch
function fetchChromeWebSocketUrl() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 9222,
        path: "/json/version",
        method: "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const wsUrl = JSON.parse(data).webSocketDebuggerUrl;
            if (!wsUrl) {
              reject(new Error("WebSocket URL not found in Chrome response"));
            } else {
              resolve(wsUrl);
            }
          } catch (err) {
            reject(
              new Error(`Failed to parse Chrome response: ${err.message}`)
            );
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });

    req.end();
  });
}

// Main function
(async () => {
  let browser = null;
  networkEvents = new Map(); // Assign to global
  const consoleLogs = {}; // Changed to an object that will group logs by tab ID
  pages = new Map(); // Assign to global
  const startTime = new Date();
  uiState.sessionStart = startTime;

  // Define sessionDir in the global scope to ensure it's accessible in all functions
  const timestamp = new Date().toLocaleTimeString().replace(/[:.]/g, "-");

  // Get base directory for outputs
  const baseDir = getWritablePath(path.join(getAppDir(), "sessions"));
  sessionDir = path.join(baseDir, `session_${timestamp}`);

  // Create the directory if it doesn't exist
  if (!fs.existsSync(sessionDir)) {
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log(colors.dim(`Created session directory: ${sessionDir}`));
    } catch (err) {
      console.error(
        colors.error(`Failed to create session directory: ${err.message}`)
      );
      // Fall back to a different location
      sessionDir = path.join(
        getWritablePath(os.tmpdir()),
        `chrome_logs_${timestamp}`
      );
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
        console.log(colors.dim(`Created fallback directory: ${sessionDir}`));
      } catch (innerErr) {
        console.error(
          colors.error(
            `Failed to create fallback directory: ${innerErr.message}`
          )
        );
        sessionDir = getAppDir(); // Last resort: use current directory
      }
    }
  }

  // Track flush counts for reporting
  const flushStats = {
    networkEventFlushes: 0,
    totalNetworkEventsFlushed: 0,
    perTabNetworkEventsFlushed: {}, // Track per-tab flush counts
    consoleLogFlushes: 0,
    totalConsoleLogsFlushed: {},
    lastFlushTime: new Date(),
  };

  // Initialize tab network events
  const initTabNetworkEvents = (tabId) => {
    if (!networkEvents.has(tabId)) {
      networkEvents.set(
        tabId,
        new BoundedArray(MEMORY_CONFIG.maxEventsBeforeFlush * 1.2)
      );
    }
    return networkEvents.get(tabId);
  };

  // Function to flush console logs for a specific tab
  const flushConsoleLogsForTab = async (tabId, forceSave = false) => {
    try {
      if (!sessionDir || !consoleLogs[tabId]) {
        return; // Skip if directory not set or no logs for tab
      }

      const tabLogs = consoleLogs[tabId];

      // Skip if not enough logs to flush (unless forced)
      if (
        tabLogs.logs.length < MEMORY_CONFIG.maxLogsPerTabBeforeFlush &&
        !forceSave
      ) {
        return;
      }

      // Make sure we have a clean tab name for the filename
      let safeTitle = tabLogs.pageTitle || `Tab_${tabId.substring(0, 6)}`;
      safeTitle = safeTitle.replace(/[^a-z0-9]/gi, "_").substring(0, 30);

      // Create flush directory if needed
      const flushDir = path.join(sessionDir, "console_flushes");
      if (!fs.existsSync(flushDir)) {
        fs.mkdirSync(flushDir, { recursive: true });
      }

      // Create a unique flush filename
      const tabFlushCount = flushStats.totalConsoleLogsFlushed[tabId] || 0;
      const flushFilePath = path.join(
        flushDir,
        `console_${safeTitle}_${tabId.substring(0, 6)}_flush_${
          tabFlushCount + 1
        }.json`
      );

      // Calculate entry types in a single pass
      const entriesByType = {
        log: 0,
        info: 0,
        warning: 0,
        error: 0,
        debug: 0,
        other: 0,
      };
      tabLogs.logs.forEach((log) => {
        const type = log.type;
        if (entriesByType.hasOwnProperty(type)) {
          entriesByType[type]++;
        } else {
          entriesByType.other++;
        }
      });

      // Create structured log output
      const formattedLogs = {
        timestamp: new Date().toLocaleTimeString(),
        pageId: tabId,
        pageTitle: tabLogs.pageTitle,
        pageUrl: tabLogs.pageUrl,
        flushSequence: tabFlushCount + 1,
        totalEntries: tabLogs.logs.length,
        entriesByType,
        entries: tabLogs.logs,
      };

      // Write to disk
      fs.writeFileSync(flushFilePath, JSON.stringify(formattedLogs, null, 2));

      // Update stats
      flushStats.totalConsoleLogsFlushed[tabId] =
        (flushStats.totalConsoleLogsFlushed[tabId] || 0) + tabLogs.logs.length;
      flushStats.consoleLogFlushes++;
      flushStats.lastFlushTime = new Date();

      // Clear current line and show flush message on its own line
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(
        `Memory management: Flushed ${tabLogs.logs.length} console logs for "${tabLogs.pageTitle}"`
      );

      // Clear memory but keep tab metadata
      consoleLogs[tabId].logs = [];

      // Store reference to the flush file
      if (!consoleLogs[tabId].flushFiles) {
        consoleLogs[tabId].flushFiles = [];
      }
      consoleLogs[tabId].flushFiles.push(flushFilePath);

      // Restore status line
      updateStatusLine(true);
    } catch (e) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.error(
        `Failed to flush console logs for tab ${tabId}: ${e.message}`
      );
      updateStatusLine(true);
    }
  };

  // Memory check function - runs periodically to flush data if needed
  const performMemoryCheck = async (force = false) => {
    try {
      // Check network events for each tab
      for (const [tabId, tabEvents] of networkEvents.entries()) {
        if (tabEvents.length >= MEMORY_CONFIG.maxEventsBeforeFlush || force) {
          await flushNetworkEventsForTab(tabId, force);
        }
      }

      // Check each tab's console logs
      for (const tabId of Object.keys(consoleLogs)) {
        const tabData = consoleLogs[tabId];

        // Check if this tab needs flushing
        if (
          (tabData.logs &&
            tabData.logs.length >= MEMORY_CONFIG.maxLogsPerTabBeforeFlush) ||
          force
        ) {
          await flushConsoleLogsForTab(tabId, force);
        }
      }

      if (force) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.log("Memory management: Forced flush completed");
      }

      // Calculate and log memory usage
      const memoryUsage = process.memoryUsage();
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(
        `Memory usage: RSS ${Math.round(
          memoryUsage.rss / 1024 / 1024
        )}MB, Heap ${Math.round(
          memoryUsage.heapUsed / 1024 / 1024
        )}/${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
      );

      // Restore status line
      updateStatusLine(true);
    } catch (e) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.error(`Memory check error: ${e.message}`);
      updateStatusLine(true);
    }
  };

  // Function to set up monitoring for a page (extracted for reuse with new tabs)
  const setupPageMonitoring = async (page) => {
    try {
      const pageId = page.target()._targetId;
      let pageUrl = "";
      let pageTitle = "";

      try {
        pageUrl = await page.url();
        pageTitle = await page.title();

        // Initialize URL tracking for this tab
        trackTabBaseUrl(pageId, pageUrl);
      } catch (e) {
        pageUrl = "unknown";
        pageTitle = "Unknown";
        console.warn(`Could not get page details: ${e.message}`);
      }

      // Update active tab count
      progressStats.activeTabs++;
      updateStatusLine(true);
      console.log(`Setting up monitoring for tab: "${pageTitle}" - ${pageUrl}`);

      // Initialize the console logs array for this tab ID
      consoleLogs[pageId] = {
        pageTitle,
        pageUrl,
        logs: [],
        lastActivity: new Date(),
      };

      // Initialize network events for this tab ID
      initTabNetworkEvents(pageId);

      // Add to pages map
      pages.set(pageId, {
        id: pageId,
        title: pageTitle,
        startedDateTime: new Date().toISOString(),
        url: pageUrl,
      });

      // Enable network request and response tracking
      try {
        await page.setRequestInterception(true);
      } catch (e) {
        console.warn(
          `Could not set request interception for ${pageUrl}: ${e.message}`
        );
      }

      // Track URL changes
      page.on("framenavigated", async (frame) => {
        try {
          if (frame.isMainFrame()) {
            const url = frame.url();
            if (url && url !== "about:blank") {
              const title = await page.title();
              trackTabBaseUrl(pageId, url);

              // Update page info
              if (pages.has(pageId)) {
                const pageInfo = pages.get(pageId);
                pageInfo.url = url;
                pageInfo.title = title;
              }
            }
          }
        } catch {
          // Silently ignore navigation errors
        }
      });

      // Track requests
      page.on("request", (request) => {
        try {
          // Get pageId safely with fallbacks for detached frames/pages
          let pageId;
          try {
            const frame = request.frame();
            if (frame && frame.page()) {
              pageId = frame.page().target()._targetId;

              // Track URL for this tab
              const url = frame.url();
              if (frame.isMainFrame() && url && url !== "about:blank") {
                trackTabBaseUrl(pageId, url);
              }
            } else {
              // Fallback to the current page's ID if frame/page is not available
              pageId = page.target()._targetId;
            }
          } catch {
            // If any error occurs when getting the page, use current page's ID
            pageId = page.target()._targetId;
          }

          uniqueRequestId++; // Using the global variable

          const startedDateTime = new Date().toISOString();

          // Extract headers as an array of name-value pairs - reuse object with Map for better performance
          const headerMap = new Map(Object.entries(request.headers() || {}));
          const headerArray = Array.from(headerMap).map(([name, value]) => ({
            name,
            value: String(value),
          }));

          // Make sure we have a list for this tab
          const tabEvents = initTabNetworkEvents(pageId);

          // Use lightweight object with only necessary fields
          tabEvents.push({
            _requestId: String(uniqueRequestId),
            _priority: "High",
            _resourceType: request.resourceType(),
            pageref: pageId,
            startedDateTime: startedDateTime,
            time: 0,
            request: {
              method: request.method(),
              url: request.url(),
              httpVersion: "HTTP/1.1",
              headers: headerArray,
              queryString: extractQueryString(request.url()),
              cookies: [],
              headersSize: -1,
              bodySize: 0,
            },
            response: {
              status: 0,
              statusText: "",
              httpVersion: "HTTP/1.1",
              headers: [],
              cookies: [],
              content: {
                size: 0,
                mimeType: "",
              },
              redirectURL: "",
              headersSize: -1,
              bodySize: -1,
              _transferSize: 0,
              _error: null,
            },
            cache: {},
            timings: {
              blocked: 0.0,
              dns: -1,
              ssl: -1,
              connect: -1,
              send: 0.0,
              wait: 0.0,
              receive: 0.0,
              _blocked_queueing: 0.0,
            },
            serverIPAddress: "",
            connection: "443",
            _timestamp: Date.now(),
          });

          // Store reference in URL map
          if (!requestUrlMaps.has(pageId)) {
            requestUrlMaps.set(pageId, new Map());
          }
          const urlMap = requestUrlMaps.get(pageId);
          urlMap.set(request.url(), tabEvents[tabEvents.length - 1]);

          progressStats.networkEvents++;

          // Use batched updates to reduce update frequency
          if (progressStats.networkEvents % MEMORY_CONFIG.batchSize === 0) {
            updateStatusLine(true);

            // Check if we need to flush network events for this tab - only check every batchSize events
            if (tabEvents.length >= MEMORY_CONFIG.maxEventsBeforeFlush) {
              flushNetworkEventsForTab(pageId);
            }
          } else {
            // Less frequently update for better performance
            updateStatusLine();
          }
        } catch {
          // Errors handled silently - don't interrupt status line
        }

        // Always continue the request even if we had errors processing it
        try {
          request.continue();
        } catch {
          // Request might have already been handled
        }
      });

      // Track responses
      page.on("response", async (response) => {
        try {
          const request = response.request();
          const url = request.url();

          // Get pageId safely
          let pageId;
          try {
            const frame = request.frame();
            if (frame && frame.page()) {
              pageId = frame.page().target()._targetId;
            } else {
              pageId = page.target()._targetId;
            }
          } catch {
            pageId = page.target()._targetId;
          }

          // Make sure we have a list for this tab
          const tabEvents = networkEvents.get(pageId);
          if (!tabEvents) return; // Skip if no events for this tab

          // O(1) lookup instead of O(n) search
          const urlMap = requestUrlMaps.get(pageId);
          const entry = urlMap ? urlMap.get(url) : null;

          if (entry) {
            // Calculate time (must be a floating-point number to match Chrome format)
            const duration = Date.now() - entry._timestamp;

            // Convert to floating-point for HAR format compatibility
            entry.time = parseFloat(duration.toFixed(5));

            // Set timings (must be floating-point numbers)
            // These are estimates since we don't have precise metrics
            const waitTime = parseFloat((duration * 0.8).toFixed(5));
            const receiveTime = parseFloat((duration * 0.2).toFixed(5));

            entry.timings.wait = waitTime;
            entry.timings.receive = receiveTime;

            // Add response data
            const status = response.status();

            // Get headers more efficiently
            const respHeaders = response.headers() || {};
            const contentType = respHeaders["content-type"] || "";

            // Create response object more efficiently
            entry.response = {
              status: status,
              statusText: response.statusText() || "",
              httpVersion: "HTTP/1.1",
              headers: Object.entries(respHeaders).map(([name, value]) => ({
                name,
                value: String(value),
              })),
              cookies: [],
              content: {
                size: -1,
                mimeType: contentType,
              },
              redirectURL: "",
              headersSize: -1,
              bodySize: -1,
              _transferSize: 0,
              _error: null,
            };

            // Try to get the IP address (might not always be available)
            try {
              const remoteAddress = response.remoteAddress();
              if (remoteAddress && remoteAddress.ip) {
                entry.serverIPAddress = remoteAddress.ip;
              }
            } catch {
              // IP might not be available
            }

            // Clean up map to prevent memory leaks
            urlMap.delete(url);
          }
        } catch {
          // Errors handled silently - don't interrupt status line
        }
      });

      // Enhanced console message tracking
      page.on("console", async (message) => {
        try {
          // Get basic information
          const type = message.type();
          const text = message.text();
          const timestamp = new Date().toLocaleTimeString();

          // Make sure we have safe values for logging
          const safePageTitle = pageTitle || "Unknown Tab";
          const safePageId = pageId || "unknown";

          // Update console log count
          progressStats.consoleLogs++;

          // Update error and warning counts for status display
          if (type === "error") {
            progressStats.errorLogs++;
          } else if (type === "warning") {
            progressStats.warningLogs++;
          }

          updateStatusLine();

          // Extract all arguments when possible
          let args = [];
          try {
            const argHandles = message.args();
            const argPromises = Array.from(argHandles).map((handle) =>
              safeEvaluate(handle)
            );
            args = await Promise.all(argPromises);
          } catch {
            // If extracting arguments fails, we still have the message text
            args = [text];
          }

          // Get stack trace if available
          let stackTrace = [];
          if (message.stackTrace && message.stackTrace()) {
            stackTrace = message.stackTrace().map((frame) => ({
              url: frame.url || "",
              lineNumber: frame.lineNumber,
              columnNumber: frame.columnNumber,
              functionName: frame.functionName || "(anonymous)",
            }));
          }

          // Get the current page info in case it has changed
          let currentPageUrl = pageUrl;
          let currentPageTitle = pageTitle;
          try {
            currentPageUrl = await page.url();
            currentPageTitle = await page.title();

            // Update stored info if it changed
            if (currentPageTitle !== pageTitle) {
              pageTitle = currentPageTitle;
              consoleLogs[pageId].pageTitle = currentPageTitle;
            }
            if (currentPageUrl !== pageUrl) {
              pageUrl = currentPageUrl;
              consoleLogs[pageId].pageUrl = currentPageUrl;
            }
          } catch {
            // Page might be closed or unavailable - use what we had before
          }

          // Store console message in the appropriate tab array
          if (!consoleLogs[safePageId]) {
            consoleLogs[safePageId] = {
              pageTitle: safePageTitle,
              pageUrl: currentPageUrl || "unknown",
              logs: [],
              lastActivity: new Date(),
            };
          } else {
            consoleLogs[safePageId].lastActivity = new Date();
          }

          consoleLogs[safePageId].logs.push({
            timestamp,
            type,
            text,
            args,
            stackTrace,
          });

          // Check if we need to flush console logs for this tab
          if (
            consoleLogs[safePageId].logs.length >=
            MEMORY_CONFIG.maxLogsPerTabBeforeFlush
          ) {
            flushConsoleLogsForTab(safePageId);
          }
        } catch (err) {
          // Even on error, try to capture something
          if (!consoleLogs[pageId]) {
            consoleLogs[pageId] = {
              pageTitle: "Error Tab",
              pageUrl: "unknown",
              logs: [],
              lastActivity: new Date(),
            };
          }

          consoleLogs[pageId].logs.push({
            timestamp: new Date().toLocaleTimeString(),
            type: "error",
            text: `[Failed to capture console message: ${err.message}]`,
            error: String(err),
          });

          progressStats.consoleLogs++;
          progressStats.errorLogs++;
          updateStatusLine();
        }
      });

      // Add specific listeners for console errors
      page.on("pageerror", (error) => {
        if (!consoleLogs[pageId]) {
          consoleLogs[pageId] = {
            pageTitle: pageTitle || "Unknown",
            pageUrl: pageUrl || "unknown",
            logs: [],
            lastActivity: new Date(),
          };
        } else {
          consoleLogs[pageId].lastActivity = new Date();
        }

        consoleLogs[pageId].logs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: "pageerror",
          text: String(error),
          error: {
            message: error.message,
            stack: error.stack,
          },
        });

        progressStats.consoleLogs++;
        progressStats.errorLogs++;
        updateStatusLine();
      });

      // Add listener for console warnings
      page.on("warning", (warning) => {
        if (!consoleLogs[pageId]) {
          consoleLogs[pageId] = {
            pageTitle: pageTitle || "Unknown",
            pageUrl: pageUrl || "unknown",
            logs: [],
            lastActivity: new Date(),
          };
        } else {
          consoleLogs[pageId].lastActivity = new Date();
        }

        consoleLogs[pageId].logs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: "warning",
          text: String(warning),
          warning: warning,
        });

        progressStats.consoleLogs++;
        progressStats.warningLogs++;
        updateStatusLine();
      });

      return true; // Successfully set up monitoring
    } catch (error) {
      console.error(`Failed to set up monitoring for page: ${error.message}`);
      return false;
    }
  };

  try {
    console.clear(); // Start with a clean screen
    console.log(colors.highlight("=== Chrome Logger ==="));
    console.log(
      colors.info(
        "Capturing network traffic and console logs from Chrome browser..."
      )
    );
    console.log(colors.info("Checking Chrome connection..."));

    // Initialize keyboard handling
    setupKeyboardHandling();

    // First check if Chrome is actually reachable
    let chromeStatus = await isChromeReachable();

    // If Chrome is not running with debug port, try to find and launch it
    if (!chromeStatus.success) {
      console.log(
        colors.warning(
          "Chrome not running with debug port. Attempting to find and launch Chrome..."
        )
      );
      const chromePath = findChromeExecutable();

      if (chromePath) {
        const launchResult = await launchChrome(chromePath);
        if (launchResult) {
          // Check again after launch
          chromeStatus = await isChromeReachable();
        }
      }

      // If Chrome is still not reachable, show error and exit
      if (!chromeStatus.success) {
        console.error(
          colors.error("❌ Cannot connect to Chrome on port 9222!")
        );
        console.log(
          colors.info(
            "Please start Chrome with remote debugging enabled using one of these methods:"
          )
        );
        console.log(
          colors.highlight("Method 1:") +
            " Close Chrome and run this script again - it will try to launch Chrome for you"
        );
        console.log(
          colors.highlight("Method 2:") +
            " Start Chrome manually with this command:"
        );
        console.log(
          "  " + colors.dim("chrome.exe --remote-debugging-port=9222")
        );
        console.log(colors.info("\nPress any key to exit..."));
        await waitForKeypress();
        return;
      }
    }

    console.log(
      colors.success("✅ Chrome debug connection confirmed. Connecting...")
    );

    // Create timestamp for the session folder and files
    const timestamp = new Date().toLocaleTimeString().replace(/[:.]/g, "-");

    // Create a new directory for this session
    sessionDir = path.join(getAppDir(), `session_${timestamp}`);

    // Create the directory if it doesn't exist
    if (!fs.existsSync(sessionDir)) {
      try {
        fs.mkdirSync(sessionDir);
        console.log(colors.dim(`Created session directory: ${sessionDir}`));
      } catch (err) {
        console.error(
          colors.error(`Failed to create session directory: ${err.message}`)
        );
        // Rather than falling back to __dirname, we can create a special error directory
        const errorDir = path.join(getAppDir(), `error_session_${timestamp}`);
        try {
          fs.mkdirSync(errorDir);
          console.log(colors.dim(`Created error directory: ${errorDir}`));
        } catch {
          console.error(
            colors.error(
              "Failed to create error directory, using current directory"
            )
          );
        }
      }
    }

    // Set file paths in the session directory
    const finalHarFilePath = path.join(sessionDir, `network_final.har`);
    const consoleLogsFilePath = path.join(sessionDir, `console_final.json`);

    // Test if we can write to the directory - use try/catch with async writeFile for better performance
    try {
      const testFilePath = path.join(sessionDir, "test-write.tmp");
      await fs.promises
        .writeFile(testFilePath, "test")
        .then(() => fs.promises.unlink(testFilePath))
        .catch((err) => {
          throw new Error(`Cannot write to directory: ${err.message}`);
        });
    } catch (err) {
      console.error(
        `Cannot write to directory ${sessionDir}. Error: ${err.message}`
      );
      return;
    }

    // Connect to Chrome using the confirmed WebSocket URL if available
    try {
      // Manually fetch the WebSocket URL instead of relying on Puppeteer's implementation
      const webSocketUrl = await fetchChromeWebSocketUrl();
      console.log(colors.dim(`Using WebSocket URL: ${webSocketUrl}`));

      browser = await puppeteer.connect({
        browserWSEndpoint: webSocketUrl,
        defaultViewport: null,
      });
    } catch (wsError) {
      console.error(
        colors.error(`Failed to get WebSocket URL: ${wsError.message}`)
      );
      console.log(
        colors.info("Falling back to browserURL connection method...")
      );

      // Try the original method as fallback
      browser = await puppeteer.connect({
        browserURL: "http://localhost:9222",
        defaultViewport: null,
      });
    }

    // Get all browser pages
    const activePagesArray = await browser.pages();

    if (activePagesArray.length === 0) {
      console.log(colors.info("No active pages found. Opening a new tab..."));
      await browser.newPage();
      activePagesArray.push(await browser.pages()[0]);
    }

    console.log(
      colors.info(`Found ${activePagesArray.length} active browser tabs`)
    );

    // Log the page titles and URLs to confirm multi-tab recording
    for (let i = 0; i < activePagesArray.length; i++) {
      try {
        const title = await activePagesArray[i].title();
        const url = await activePagesArray[i].url();
        console.log(
          `  ${colors.highlight("•")} ${colors.success(
            title || "Untitled"
          )} - ${colors.dim(url)}`
        );
      } catch {
        console.log(`  ${colors.highlight("•")} [Unable to get details]`);
      }
    }

    console.log(colors.success("\n✅ Recording from ALL tabs shown above"));
    console.log(colors.info("Data will be saved to:"));
    console.log(`  ${colors.highlight(sessionDir)}`);
    console.log(
      colors.dim(
        "\nUse Chrome normally. This window will display activity statistics."
      )
    );
    console.log(colors.dim("Press h for help and additional options.\n"));

    // Reset uniqueRequestId at the start of session
    uniqueRequestId = 0;

    // Set up monitoring for all initial pages
    for (const page of activePagesArray) {
      await setupPageMonitoring(page);
    }

    // Add listener for new tabs being created
    browser.on("targetcreated", async (target) => {
      // Only handle page targets (tabs)
      if (target.type() === "page") {
        try {
          // Get the page object
          const page = await target.page();
          if (page) {
            // Set up monitoring for this new page
            const success = await setupPageMonitoring(page);
            if (success) {
              console.log("✅ New tab detected and monitoring started");
              try {
                const title = await page.title();
                const url = await page.url();
                console.log(`New Tab: "${title}" - ${url}`);
              } catch {
                console.log("New Tab: [Unable to get details]");
              }
            }
          }
        } catch (e) {
          console.error(
            `Error setting up monitoring for new tab: ${e.message}`
          );
        }
      }
    });

    // Track tab closures
    browser.on("targetdestroyed", async (target) => {
      if (target.type() === "page") {
        const targetId = target._targetId;
        if (pages.has(targetId)) {
          const pageInfo = pages.get(targetId);

          // Update active tab count
          progressStats.activeTabs = Math.max(0, progressStats.activeTabs - 1);
          updateStatusLine(true);
          console.log(`Tab closed: "${pageInfo.title}" - ${pageInfo.url}`);

          // We keep the page in the pages Map for reference in the HAR file
          // Just mark it as closed
          pageInfo.closed = true;
          pageInfo.closedAt = new Date().toISOString();
        }
      }
    });

    console.log(
      `${colors.success("✅")} Network and console recording started.`
    );
    console.clear();

    // Initialize the status line
    updateStatusLine(true);

    // Set up auto-save timer
    const autoSaveInterval = setInterval(() => {
      try {
        // Perform memory check and flush only if necessary
        const now = Date.now();
        const timeSinceLastFlush = now - flushStats.lastFlushTime;

        // Only do full flush check if enough time has passed
        if (timeSinceLastFlush > MEMORY_CONFIG.autoFlushIntervalMs / 2) {
          performMemoryCheck();
        }

        // Use partial flush for tabs with very high activity without requiring full memory check
        for (const [tabId, tabEvents] of networkEvents.entries()) {
          if (tabEvents.length >= MEMORY_CONFIG.maxEventsBeforeFlush * 0.9) {
            flushNetworkEventsForTab(tabId);
          }
        }

        // Save current summary HAR data without interrupting status line
        const partialHarFilePath = finalHarFilePath + ".part";

        // Only create this partial file with a limited subset of network events
        // to avoid memory pressure during large recording sessions

        // Create an array with max 1000 events for the partial file
        const sampleSize = 1000;
        let allEventsSample = [];

        for (const [tabId, tabEvents] of networkEvents.entries()) {
          if (tabEvents.length > 0) {
            // Take a proportional sample from each tab
            const tabSampleSize = Math.min(
              tabEvents.length,
              Math.floor(
                sampleSize * (tabEvents.length / progressStats.networkEvents)
              )
            );

            if (tabSampleSize > 0) {
              // Take most recent events for the sample
              const startIndex = Math.max(0, tabEvents.length - tabSampleSize);
              allEventsSample.push(...tabEvents.slice(startIndex));
            }
          }
        }

        // Limit total sample size
        if (allEventsSample.length > sampleSize) {
          allEventsSample = allEventsSample.slice(-sampleSize);
        }

        // Create HAR with the sample array
        const harData = createHarFile(
          allEventsSample,
          Array.from(pages.values())
        );

        // Use optimized write
        if (MEMORY_CONFIG.useBufferedWrites) {
          writeCompressedFile(partialHarFilePath, harData);
        } else {
          fs.writeFileSync(
            partialHarFilePath,
            JSON.stringify(harData, null, 2)
          );
        }

        // Create summary file of current state - simplified to reduce memory usage
        const statusFilePath = path.join(sessionDir, "recording_status.json");

        // Calculate current console logs across all tabs
        const currentConsoleLogs = Object.keys(consoleLogs).reduce(
          (sum, tabId) =>
            sum +
            (consoleLogs[tabId].logs ? consoleLogs[tabId].logs.length : 0),
          0
        );

        // Calculate total console logs flushed
        const totalConsoleLogsFlushed = Object.values(
          flushStats.totalConsoleLogsFlushed
        ).reduce((sum, count) => sum + count, 0);

        const statusData = {
          timestamp: new Date().toLocaleTimeString(),
          runningFor: `${Math.round(
            (new Date() - startTime) / 1000 / 60
          )} minutes`,
          activeTabs: progressStats.activeTabs,
          currentNetworkEvents: networkEvents.size,
          totalNetworkEvents: progressStats.networkEvents,
          totalNetworkEventsFlushed: flushStats.totalNetworkEventsFlushed,
          currentConsoleLogs,
          totalConsoleLogs: progressStats.consoleLogs,
          totalConsoleLogsFlushed,
          totalErrorLogs: progressStats.errorLogs,
          totalWarningLogs: progressStats.warningLogs,
          lastFlushTime: flushStats.lastFlushTime.toLocaleTimeString(),
        };

        fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2));
      } catch (e) {
        // Clear the status line to show error
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.error("Error during auto-save:", e);
        // Restore status line
        updateStatusLine(true);
      }
    }, MEMORY_CONFIG.autoFlushIntervalMs);

    // Wait for disconnection with proper error handling
    await new Promise((resolve) => {
      browser.on("disconnected", async () => {
        // Clear status line before showing final message
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.log("\nChrome was closed or connection was lost");
        clearInterval(autoSaveInterval);

        try {
          if (!fs.existsSync(sessionDir)) {
            console.error(
              "Session directory doesn't exist. Creating emergency directory."
            );
            const emergencyDir = path.join(
              getAppDir(),
              `emergency_${new Date()
                .toLocaleTimeString()
                .replace(/[:.]/g, "-")}`
            );
            try {
              fs.mkdirSync(emergencyDir);
              // If successful, update sessionDir to use the emergency directory
              sessionDir = emergencyDir;
            } catch (dirErr) {
              console.error(
                `Failed to create emergency directory: ${dirErr.message}`
              );
              // Fall back to current directory
              sessionDir = getAppDir();
            }
          }

          // Perform final flush of all data with proper error handling
          try {
            await performMemoryCheck(true); // Force flush all remaining data
          } catch (flushErr) {
            console.error(
              `Error during final memory flush: ${flushErr.message}`
            );
          }

          // Save final HAR files with proper error handling
          try {
            await saveFinalHarFiles();
          } catch (harErr) {
            console.error(`Error saving final HAR files: ${harErr.message}`);
          }

          // Save final console logs with proper error handling
          try {
            saveAllConsoleLogs(sessionDir, consoleLogs);
          } catch (logErr) {
            console.error(`Error saving console logs: ${logErr.message}`);
          }

          // Create a final summary file
          try {
            const summaryPath = path.join(sessionDir, "recording_summary.json");
            const summaryData = {
              sessionStartTime: startTime.toLocaleTimeString(),
              sessionEndTime: new Date().toLocaleTimeString(),
              sessionDuration: `${Math.round(
                (new Date() - startTime) / 1000 / 60
              )} minutes`,
              totalTabs: Object.keys(consoleLogs).length,
              totalNetworkEvents: progressStats.networkEvents,
              totalConsoleLogs: progressStats.consoleLogs,
              totalErrorLogs: progressStats.errorLogs,
              totalWarningLogs: progressStats.warningLogs,
              flushStats: {
                networkFlushes: flushStats.networkEventFlushes,
                consoleFlushes: flushStats.consoleLogFlushes,
              },
            };

            await fs.promises.writeFile(
              summaryPath,
              JSON.stringify(summaryData, null, 2)
            );

            console.log(`\n---- Recording Session Complete ----`);
            console.log(
              `Network data saved to individual HAR files in: ${path.join(
                sessionDir,
                "final_har_files"
              )}`
            );
            console.log(
              `Console logs saved to individual files in: ${sessionDir}`
            );
            console.log(
              `Total network events: ${summaryData.totalNetworkEvents}`
            );
            console.log(
              `Total console logs: ${summaryData.totalConsoleLogs} (${summaryData.totalErrorLogs} errors, ${summaryData.totalWarningLogs} warnings)`
            );
            console.log(`Session summary saved to: ${summaryPath}`);
          } catch (summaryErr) {
            console.error(`Error saving summary data: ${summaryErr.message}`);
          }
        } catch (e) {
          console.error("Error during cleanup process:", e);
        }

        resolve();
      });
    });
  } catch (error) {
    // Clear status line before showing error
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.error("Error occurred:", error);
    console.log(
      "Make sure Chrome is running with --remote-debugging-port=9222"
    );

    // Try to save any captured data with emergency flush
    try {
      if (sessionDir && fs.existsSync(sessionDir)) {
        performMemoryCheck(true); // Force flush all data
      } else {
        // Try to save any captured data
        const timestamp = new Date().toLocaleTimeString().replace(/[:.]/g, "-");

        // Create emergency directory
        const emergencyDir = path.join(getAppDir(), `emergency_${timestamp}`);
        if (!fs.existsSync(emergencyDir)) {
          try {
            fs.mkdirSync(emergencyDir);
          } catch (dirErr) {
            console.error(
              `Failed to create emergency directory: ${dirErr.message}`
            );
          }
        }

        const saveDir = fs.existsSync(emergencyDir)
          ? emergencyDir
          : getAppDir();

        if (networkEvents && networkEvents.size > 0) {
          const allEvents = Array.from(networkEvents.values()).flat();
          if (allEvents.length > 0) {
            const emergencyHarFilePath = path.join(saveDir, `network.har`);
            const harData = createHarFile(
              allEvents,
              Array.from(pages.values() || [])
            );
            fs.writeFileSync(
              emergencyHarFilePath,
              JSON.stringify(harData, null, 2)
            );
            console.log(
              `Emergency network data saved to: ${emergencyHarFilePath}`
            );
          }
        }

        if (consoleLogs && Object.keys(consoleLogs).length > 0) {
          const emergencyConsoleFilePath = path.join(saveDir, `console.json`);
          saveConsoleLogs(emergencyConsoleFilePath, consoleLogs);
          console.log(
            `Emergency console logs saved to: ${emergencyConsoleFilePath}`
          );
        }
      }
    } catch (e) {
      console.error("Failed to save emergency data:", e);
    }
  }
})();

// Helper function for safe evaluation with timeout
function safeEvaluate(handle, timeout = 500) {
  return Promise.race([
    handle.evaluate((obj) => {
      try {
        if (obj === null) return "null";
        if (obj === undefined) return "undefined";
        if (typeof obj === "object") {
          try {
            // Limit serialization depth for large objects
            return JSON.stringify(obj, (k, v) => {
              // Prevent circular references and limit depth
              return k && typeof v === "object" && Object.keys(v).length > 20
                ? "[Complex Object]"
                : v;
            });
          } catch {
            return String(obj);
          }
        }
        return String(obj);
      } catch {
        return "[UnserializableValue]";
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve("[Timeout]"), timeout)),
  ]).catch(() => "[EvaluationError]");
}

function streamHarFile(entries, pages, outputStream) {
  // Convert entries to array if it's not already
  const entriesArray = Array.isArray(entries)
    ? entries
    : entries instanceof Map
    ? Array.from(entries.values()).flat()
    : [];

  // Write HAR file header
  outputStream.write(
    '{"log":{"version":"1.2","creator":{"name":"WebInspector","version":"537.36"},"pages":'
  );

  // Stream pages as JSON
  const pagesJson = JSON.stringify(
    pages.map((page) => ({
      startedDateTime: page.startedDateTime,
      id: page.id,
      title: page.title || "",
      pageTimings: { onContentLoad: -1, onLoad: -1 },
    }))
  );
  outputStream.write(pagesJson);

  // Start entries array
  outputStream.write(',"entries":[');

  // Stream entries in batches
  const batchSize = MEMORY_CONFIG.batchSize || 100;
  const totalEntries = entriesArray.length;

  return new Promise((resolve, reject) => {
    let processed = 0;

    function processNextBatch() {
      if (processed >= totalEntries) {
        // Close entries array and HAR object
        outputStream.write("]}");
        resolve();
        return;
      }

      const batch = entriesArray.slice(
        processed,
        Math.min(processed + batchSize, totalEntries)
      );
      processed += batch.length;

      // Process batch and write to stream with appropriate commas
      const batchJson = batch
        .map((entry, i) => {
          // Format entry as in createHarFile function
          const formatted = {
            /* formatted entry */
          };

          // Add comma for all but the last entry of the last batch
          const isLastEntry =
            processed >= totalEntries && i === batch.length - 1;
          return JSON.stringify(formatted) + (isLastEntry ? "" : ",");
        })
        .join("");

      // Write batch to stream
      outputStream.write(batchJson);

      // Schedule next batch with setImmediate to avoid blocking
      setImmediate(processNextBatch);
    }

    processNextBatch();
  });
}

// Use lazy loading
function getZlib() {
  if (!getZlib.module) {
    getZlib.module = require("zlib");
  }
  return getZlib.module;
}

// Get application directory - works in both development and packaged environments
function getAppDir() {
  // Always use the directory where the executable is located
  return path.dirname(process.execPath);
}

// Helper to get a valid path where we can write files
function getWritablePath(desiredPath) {
  try {
    // Test if the path exists and is writable
    if (fs.existsSync(desiredPath)) {
      // Test write permissions by creating a temp file
      const testFile = path.join(desiredPath, ".write-test");
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      return desiredPath;
    }

    // If path doesn't exist, try to create it
    fs.mkdirSync(desiredPath, { recursive: true });
    return desiredPath;
  } catch (err) {
    console.log(
      colors.warning(`Cannot write to ${desiredPath}: ${err.message}`)
    );

    // Fall back to appropriate OS-specific user data directory
    try {
      let fallbackDir;
      if (process.platform === "win32") {
        fallbackDir = path.join(
          process.env.APPDATA || process.env.USERPROFILE,
          "ChromeLogs"
        );
      } else if (process.platform === "darwin") {
        fallbackDir = path.join(
          process.env.HOME,
          "Library",
          "Application Support",
          "ChromeLogs"
        );
      } else {
        fallbackDir = path.join(process.env.HOME, ".chromelogs");
      }

      // Create the directory if it doesn't exist
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }

      return fallbackDir;
    } catch (fallbackErr) {
      // Last resort: use temp directory
      const os = require("os");
      const tempDir = path.join(os.tmpdir(), "ChromeLogs");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      return tempDir;
    }
  }
}
