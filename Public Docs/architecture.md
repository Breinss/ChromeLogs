# ChromeLogs Architecture

This document provides technical details on how ChromeLogs works internally, explaining its architecture, data flow, and component interactions.

## High-Level Architecture

ChromeLogs is built around the Chrome DevTools Protocol (CDP), which provides programmatic access to Chrome's internal instrumentation. The tool connects to Chrome's remote debugging port, attaches to all open tabs, and subscribes to network and console events.

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────┐
│                 │      │                  │      │                │
│  Chrome Browser ◄──────┤ ChromeLogs (CDP) ├──────► File System    │
│  (Debug Port)   │      │                  │      │ (HAR/JSON)     │
│                 │      │                  │      │                │
└─────────────────┘      └──────────────────┘      └────────────────┘
                               │
                               │
                         ┌─────▼─────┐
                         │           │
                         │ Terminal  │
                         │ Interface │
                         │           │
                         └───────────┘
```

## Key Components

### 1. Chrome Connection Module

- Uses Puppeteer Core to connect to Chrome via WebSocket
- Discovers the Chrome executable on different operating systems
- Can launch Chrome with required flags if not already running
- Handles connection state management and reconnection logic

### 2. Tab Monitoring System

- Attaches to all existing Chrome tabs upon startup
- Detects new tabs opened during recording
- Tracks tab closures and finalizes their data
- Maps internal tab IDs to readable names

### 3. Network Request Interceptor

- Intercepts all HTTP/HTTPS network requests and responses
- Captures detailed timing, headers, status codes
- Organizes requests by tab and domain
- Converts Chrome's internal representation to HAR format

### 4. Console Logger

- Captures all console output (logs, warnings, errors)
- Preserves stack traces for errors
- Records message timestamps
- Organizes console messages by tab

### 5. Memory Manager

- Implements configurable memory thresholds
- Uses bounded arrays to limit in-memory data
- Flushes data to disk when thresholds are reached
- Periodically saves data to prevent loss

### 6. Session Manager

- Creates and organizes session directories
- Handles file creation and writing
- Manages compression options
- Provides emergency recovery options

### 7. User Interface

- Real-time status display in terminal
- Interactive keyboard commands during recording
- Progress statistics for network and console events
- Memory usage monitoring

## Data Flow

1. **Initialization**:
   - ChromeLogs checks if Chrome is running with debugging port open
   - If not, it attempts to find and launch Chrome with proper flags
   - Creates a session directory for the current recording

2. **Connection**:
   - Establishes WebSocket connection to Chrome's debugging port
   - Enumerates all open tabs
   - Sets up event listeners for each tab

3. **Data Capture**:
   - Network requests are intercepted via request interception
   - Console messages are captured via console event listeners
   - Each event is timestamped and associated with a tab ID

4. **Data Processing**:
   - Network requests are formatted according to HAR specification
   - Console messages are structured with type, message, and stack information
   - In-memory structures track statistics and organize data

5. **Memory Management**:
   - Data is periodically flushed to disk based on configured thresholds
   - Each tab has dedicated tracking for network and console events
   - Inactive tabs have their data prioritized for flushing

6. **Finalization**:
   - When Chrome closes or user quits, all remaining data is flushed
   - Individual HAR files are created for each tab
   - Combined HAR file with all network events is generated
   - Console logs are saved as JSON files
   - Summary statistics are compiled

## Memory Management Details

### Configurable Thresholds

```javascript
const MEMORY_CONFIG = {
  maxEventsBeforeFlush: 5000, // Max network events to keep in memory per tab
  maxLogsPerTabBeforeFlush: 500, // Max console logs per tab
  autoFlushIntervalMs: 60000, // Flush to disk every minute
  maxInactiveTimeMs: 3600000, // 1 hour - tabs inactive for longer get logs flushed
  useCompression: true, // Enable gzip compression for flushed files
  batchSize: 100, // Process network events in batches for better performance
  useBufferedWrites: true, // Use buffered writes for better I/O performance
};
```

### BoundedArray Implementation

Network events are stored in a custom BoundedArray that:
- Has a configurable maximum size
- Automatically removes oldest entries when full
- Tracks overflow status for accurate logging

## Output File Structure

```
session_[timestamp]/
├── console_all.json            # Combined console logs summary
├── network_all.har             # Combined network HAR file
├── recording_summary.json      # Session statistics
├── console_logs/               # Individual tab console logs
│   ├── console_[domain]_[id].json
│   └── ...
├── console_flushes/            # Intermediate console log flushes
│   ├── console_[domain]_[id]_flush_1.json
│   └── ...
├── final_har_files/            # Individual tab HAR files
│   ├── [domain]_[id].har
│   └── ...
└── network_flushes/            # Intermediate network event flushes
    ├── [domain]_[id]_flush_1.har
    └── ...
```

## Chrome DevTools Protocol Integration

ChromeLogs uses these key CDP domains:

- **Network**: For capturing network requests and responses
- **Runtime**: For console message capture
- **Page**: For navigation and lifecycle events
- **Target**: For tab management

## Error Handling and Recovery

ChromeLogs implements several recovery mechanisms:

1. **Connection failures**: Attempts to reconnect to Chrome
2. **Write failures**: Falls back to alternative directories
3. **Emergency backups**: Creates emergency files if normal saving fails
4. **Session recovery**: Reconstructs sessions from flush files if main files are corrupted