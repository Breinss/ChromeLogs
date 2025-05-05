# ChromeLogs

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-ISC-green)
![Node](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen)

<p align="center">
  <img src="https://raw.githubusercontent.com/Breinss/ChromeLogs/main/docs/images/logo.png" alt="ChromeLogs Logo" width="200"/>
</p>

## 🔍 Overview

ChromeLogs is a powerful Node.js utility that connects to Google Chrome to capture and record detailed network traffic and console logs across all tabs simultaneously. It provides developers, QA testers, and performance analysts with comprehensive HTTP request data and browser console activity without requiring browser extensions or modifications to target websites.

### 🌟 Key Features

- **Multi-tab Recording**: Captures data from all Chrome tabs simultaneously
- **Network Traffic Capture**: Records all HTTP/HTTPS requests and responses in HAR format
- **Console Logging**: Tracks all console activity including errors, warnings, and logs
- **Memory Efficient**: Automatically manages memory with configurable thresholds
- **Cross-platform**: Works on Windows, macOS, and Linux
- **User-friendly**: Simple command-line interface with real-time statistics
- **Chrome Auto-detection**: Finds and launches Chrome with proper debugging flags
- **Standardized Output**: Exports HAR files compatible with performance analysis tools

## 📊 Why ChromeLogs?

When debugging web applications, you often need comprehensive data about what's happening in the browser. ChromeLogs provides:

1. **Complete visibility** into all network requests and browser console output
2. **Evidence for troubleshooting** production issues that are difficult to reproduce
3. **Performance insights** through detailed timing information for all requests
4. **Multi-tab support** to monitor complex workflows across multiple pages
5. **Session-based recording** with automatic data organization

Unlike browser DevTools, ChromeLogs can run for extended periods, monitor all tabs simultaneously, and save everything automatically.

## 🔧 Installation

```bash
# Clone the repository
git clone https://github.com/Breinss/ChromeLogs.git

# Navigate to the project directory
cd ChromeLogs

# Install dependencies
npm install
```

## 🚀 Quick Start

1. **Start Chrome with debugging enabled**:

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

2. **Launch ChromeLogs**:

```bash
node chrome.js
```

3. **Use Chrome normally** - ChromeLogs will record all activity

4. **When finished, close Chrome** or press `q` in the ChromeLogs terminal

5. **Find your data** in the automatically created `session_[timestamp]` folder

## 📚 Documentation

- [User Guide](user_guide.md): Complete guide to using ChromeLogs
- [Examples](examples.md): Practical usage scenarios and commands
- [Architecture](architecture.md): Technical details about how it works
- [Troubleshooting](troubleshooting.md): Solutions to common issues
- [API Reference](api.md): Technical details for developers
- [Contributing](contributing.md): How to contribute to the project

## 🛠️ Technical Stack

- **Node.js**: Core runtime environment
- **Puppeteer-Core**: For connecting to Chrome's DevTools Protocol
- **Chrome DevTools Protocol**: For accessing browser data
- **HAR Format**: HTTP Archive format for network data storage
- **Native Node.js Modules**: fs, path, http, os, child_process

## 📦 Building Standalone Executables

ChromeLogs can be packaged into standalone executables for Windows, macOS, and Linux:

```bash
# Build for all platforms
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## ⚖️ License

ISC License - See [LICENSE](LICENSE) for details.

## 👤 Author

**Brean** - [GitHub Profile](https://github.com/Breinss)

## 🙏 Support

If you find ChromeLogs useful, please consider:
- Starring the repository on GitHub
- Contributing code or documentation
- Reporting issues or suggesting enhancements