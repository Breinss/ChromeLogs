// Simple bootstrap script to handle startup errors in packaged app
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Determine if we're running from a packaged executable
const isPackaged = !!process.pkg;
const appDir = isPackaged ? path.dirname(process.execPath) : __dirname;

// Setup error logging
const logError = (err) => {
  const errorLogPath = path.join(appDir, "error.log");
  const errorMessage = `${new Date().toISOString()}: ${
    err.stack || err.message || String(err)
  }\n`;

  // Log to file and console
  fs.appendFileSync(errorLogPath, errorMessage);
  console.error("ERROR: " + err.message);

  if (isPackaged) {
    console.log("\nError details saved to: " + errorLogPath);
    console.log("Press any key to exit...");
    // Wait for a keypress in packaged mode
    spawnSync("cmd", ["/c", "pause"], { shell: true });
  }
};

// Try to run the main app
try {
  require("./chrome.js");
} catch (err) {
  logError(err);
}
