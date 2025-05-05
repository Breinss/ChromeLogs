# ChromeLogs API Reference

This document provides technical details for developers who want to understand, extend, or integrate with ChromeLogs.

## Core API Components

### Chrome Connection

```javascript
// Establishes connection to Chrome
async function connectToChrome(debugPort = 9222) { ... }

// Finds Chrome executable on the system
function findChromeExecutable() { ... }

// Launches Chrome with debugging enabled
async function launchChrome(chromePath) { ... }

// Checks if Chrome is running with debug port
function isChromeReachable() { ... }
```

### Data Capture

```javascript
// Sets up monitoring for a browser tab
async function setupPageMonitoring(page) { ... }

// Intercepts network requests
function setupNetworkInterception(page, tabId) { ... }

// Captures console messages
function setupConsoleLogging(page, tabId) { ... }
```

### Data Storage

```javascript
// Creates HAR file from captured network events
function createHarFile(entries, pages) { ... }

// Saves console logs to disk
function saveConsoleLogs(filePath, logs) { ... }

// Saves all console logs organized by tab
function saveAllConsoleLogs(sessionDir, allTabsLogs) { ... }

// Performs a memory check and flushes data if needed
async function performMemoryCheck(force = false) { ... }
```

### Utility Functions

```javascript
// Creates bounded array with maximum size
class BoundedArray { ... }

// Throttles function calls
function throttle(func, limit) { ... }

// Formats headers for HAR file
function formatHeaders(headers) { ... }

// Extracts query parameters from URL
function extractQueryString(url) { ... }

// Extracts base URL from full URL
function extractBaseUrl(url) { ... }
```

## Configuration Options

ChromeLogs can be configured through the `MEMORY_CONFIG` object:

```javascript
const MEMORY_CONFIG = {
  maxEventsBeforeFlush: 5000, // Max network events in memory per tab
  maxLogsPerTabBeforeFlush: 500, // Max console logs per tab
  autoFlushIntervalMs: 60000, // Flush to disk every minute
  maxInactiveTimeMs: 3600000, // 1 hour - inactive tabs get flushed
  useCompression: true, // Enable gzip compression for files
  batchSize: 100, // Process network events in batches
  useBufferedWrites: true, // Use buffered writes for I/O performance
};
```

## HAR File Format

ChromeLogs generates HAR (HTTP Archive) files that conform to the [HAR 1.2 specification](https://w3c.github.io/web-performance/specs/HAR/Overview.html) with some Chrome-specific extensions.

### HAR Structure

```javascript
{
  "log": {
    "version": "1.2",
    "creator": {
      "name": "WebInspector",
      "version": "1.0"
    },
    "pages": [
      {
        "id": "page_1",
        "title": "Page Title",
        "startedDateTime": "2023-05-05T12:34:56.789Z",
        "url": "https://example.com",
        "pageTimings": {
          "onContentLoad": -1,
          "onLoad": -1
        }
      }
    ],
    "entries": [
      {
        "_connectionId": "1234",
        "_initiator": {
          "type": "script",
          "stack": {
            "callFrames": [],
            "parentId": {}
          }
        },
        "_priority": "VeryHigh",
        "_resourceType": "document",
        "_requestId": "1000",
        "pageref": "page_1",
        "cache": {},
        "connection": "443",
        "request": {
          "method": "GET",
          "url": "https://example.com",
          "httpVersion": "http/2.0",
          "headers": [],
          "queryString": [],
          "cookies": [],
          "headersSize": -1,
          "bodySize": 0
        },
        "response": {
          "status": 200,
          "statusText": "OK",
          "httpVersion": "HTTP/2.0",
          "headers": [],
          "cookies": [],
          "content": {
            "size": 0,
            "mimeType": "text/html"
          },
          "redirectURL": "",
          "headersSize": -1,
          "bodySize": -1,
          "_transferSize": 0,
          "_error": null
        },
        "serverIPAddress": "123.45.67.89",
        "startedDateTime": "2023-05-05T12:34:56.789Z",
        "time": 123.45,
        "timings": {
          "blocked": 0.0,
          "dns": -1,
          "ssl": -1,
          "connect": -1,
          "send": 0.0,
          "wait": 100.0,
          "receive": 23.45,
          "_blocked_queueing": 0.0
        },
        "_timestamp": 1683286496789
      }
    ]
  }
}
```

### Chrome-Specific HAR Extensions

ChromeLogs preserves Chrome-specific HAR properties:

- `_connectionId`: Identifier for the network connection
- `_initiator`: Information about what initiated the request
- `_priority`: Request priority (VeryLow, Low, Medium, High, VeryHigh)
- `_resourceType`: Type of resource (document, stylesheet, image, etc.)
- `_requestId`: Unique identifier for the request
- `_timestamp`: Unix timestamp when the request was initiated
- `_transferSize`: Actual bytes transferred over the network
- `_error`: Error information if the request failed

## Console Log Format

Console logs are saved in JSON format:

```javascript
{
  "timestamp": "12:34:56 PM",
  "pageId": "tab-123456",
  "pageTitle": "Example Page",
  "pageUrl": "https://example.com",
  "totalEntries": 42,
  "entriesByType": {
    "log": 30,
    "info": 5,
    "warning": 4,
    "error": 3,
    "debug": 0,
    "other": 0
  },
  "entries": [
    {
      "timestamp": "12:34:56 PM",
      "type": "log",
      "text": "Hello, world!",
      "args": ["Hello, world!"],
      "stackTrace": []
    },
    {
      "timestamp": "12:34:57 PM",
      "type": "error",
      "text": "Uncaught TypeError: Cannot read property 'foo' of undefined",
      "args": ["Uncaught TypeError: Cannot read property 'foo' of undefined"],
      "stackTrace": [
        {
          "url": "https://example.com/script.js",
          "lineNumber": 42,
          "columnNumber": 10,
          "functionName": "processData"
        },
        {
          "url": "https://example.com/script.js",
          "lineNumber": 100,
          "columnNumber": 5,
          "functionName": "handleClick"
        }
      ]
    }
  ]
}
```

## Extending ChromeLogs

### Adding Custom Event Handlers

You can extend ChromeLogs to capture additional events from the Chrome DevTools Protocol:

```javascript
// In setupPageMonitoring function
page.on('customEvent', async (event) => {
  // Handle custom event
});
```

### Creating Custom Analyzers

To create custom analyzers for HAR files, you can use the jq command-line tool:

```bash
# Example: Extract all POST requests with JSON bodies
jq '.log.entries[] | select(.request.method == "POST" and .request.headers[] | select(.name == "Content-Type" and .value | contains("application/json")))' network_all.har
```

### Custom Data Processing

You can implement custom data processing by extending the data flush mechanism:

```javascript
// Custom processing before flushing
async function customProcessBeforeFlush(tabId, events) {
  // Process events here
  return processedEvents;
}

// Hook into the flushNetworkEventsForTab function
// by modifying it to call your custom function
```

## Command Line Options

ChromeLogs supports the following command line options:

- `--debug` - Enable debug mode with verbose logging
- `--chrome-path=PATH` - Specify the Chrome executable path
- `--debug-port=PORT` - Specify the Chrome debugging port (default: 9222)
- `--output-dir=DIR` - Specify a custom output directory for session data
- `--compress=true|false` - Enable or disable output compression
- `--max-memory=SIZE` - Set maximum memory usage in MB