# Chrome Logs: Example Usage Scenarios

This document provides detailed examples of how to use the Chrome Logs tool for various common scenarios. These practical examples will help you understand how to apply this tool in real-world situations.

## Example 1: Debugging a Production Error

### Scenario

Users report intermittent errors on your production website that you can't reproduce in your development environment.

### Steps

1. **Launch Chrome with debugging enabled:**

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

2. **Start the recording tool:**

```bash
node chrome.js
```

3. **Reproduce the issue:**

   - Navigate to your website
   - Perform the actions that typically trigger the error
   - Continue using the site until the error occurs

4. **Stop recording:**

   - Either close Chrome or press Ctrl+C in the terminal

5. **Analyze the results:**
   - Check console logs for JavaScript errors:
     ```bash
     # Look for error entries in the console logs
     grep -r "error" session_*/console_logs/
     ```
   - Examine network requests around the time of the error:
     ```bash
     # Look at the combined HAR file using a HAR viewer
     # or use jq to extract specific information
     jq '.log.entries[] | select(.response.status >= 400) | {url: .request.url, status: .response.status}' session_*/network_all.har
     ```

### Analysis Techniques

- Look for error messages in the console logs with timestamps
- Identify failed API calls (4xx or 5xx responses) in the HAR files
- Examine request/response payloads for malformed data
- Check for CORS or network-related errors

## Example 2: Performance Analysis

### Scenario

Your website feels slow to users, and you want to identify performance bottlenecks.

### Steps

1. **Launch Chrome and the recording tool as shown above**

2. **Perform a typical user journey:**

   - Navigate to your homepage
   - Browse through product categories
   - Add items to cart
   - Complete checkout process

3. **Stop recording**

4. **Analyze performance data:**
   - Use a HAR analyzer tool like [HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/)
   - Import the HAR file(s) from your `session_*/final_har_files/` directory
   - Identify slow-loading resources, long API calls, and blocking requests

### Analysis Techniques

- Look for the "waterfall" of requests to identify blocking resources
- Check for large file downloads that may be slowing the experience
- Identify API calls that take more than 200-300ms to complete
- Look for unnecessary or duplicate requests

Example analysis command using jq:

```bash
# Find the slowest 10 requests
jq -c '.log.entries | sort_by(.time) | reverse | .[0:10] | .[] | {url: .request.url, time: .time}' session_*/network_all.har
```

## Example 3: Monitoring Single-Page Application (SPA) Behavior

### Scenario

You want to understand what API calls your SPA makes during different user interactions.

### Steps

1. **Launch Chrome and the recording tool**

2. **Use the SPA normally:**

   - Navigate between different views/pages
   - Interact with various features
   - Submit forms and trigger data-loading actions

3. **Stop recording**

4. **Extract API calls from the HAR files:**

```bash
# Extract all XHR/fetch API calls with their timing information
jq '.log.entries[] | select(._resourceType == "xhr" or ._resourceType == "fetch") | {method: .request.method, url: .request.url, status: .response.status, time: .time}' session_*/network_all.har
```

### Analysis Techniques

- Group API calls by endpoint to identify frequent requests
- Look for repeated calls to the same endpoints (potential optimization)
- Check if proper HTTP caching headers are being used
- Identify patterns in API usage that could be batched or optimized

## Example 4: Tracking Third-Party Script Behavior

### Scenario

You suspect third-party scripts (analytics, ads, etc.) might be causing performance or stability issues.

### Steps

1. **Launch Chrome and the recording tool**

2. **Load your website and interact with it normally**

3. **Stop recording**

4. **Analyze third-party script activity:**

```bash
# Find all third-party domains making requests
jq -r '.log.entries[].request.url' session_*/network_all.har | awk -F/ '{print $3}' | sort | uniq -c | sort -nr
```

5. **Check console logs for errors from third-party scripts:**

```bash
# Search console logs for third-party domain names
grep -r "analytics\|ads\|tracking" session_*/console_logs/
```

### Analysis Techniques

- Identify which third-party scripts consume the most bandwidth
- Look for scripts that trigger errors in the console
- Check for long-running JavaScript from external domains
- Analyze the performance impact of each third-party script

## Example 5: Debugging CORS and Authentication Issues

### Scenario

You're experiencing CORS errors or authentication problems in your web application.

### Steps

1. **Launch Chrome and the recording tool**

2. **Reproduce the authentication or CORS issue:**

   - Log in to your application
   - Access protected resources
   - Perform actions that trigger CORS requests

3. **Stop recording**

4. **Analyze CORS and auth headers:**

```bash
# Find CORS preflight requests
jq '.log.entries[] | select(.request.method == "OPTIONS")' session_*/network_all.har

# Examine Authentication headers
jq '.log.entries[] | select(.request.headers[] | .name == "Authorization")' session_*/network_all.har
```

### Analysis Techniques

- Check for proper CORS headers in both requests and responses
- Verify that Authentication tokens are being correctly sent
- Look for redirects that might be losing authentication information
- Check console logs for CORS-related errors

## Integrating with Other Tools

### Example: Converting HAR to cURL Commands

To reproduce specific requests for debugging:

```bash
# Install har-to-curl if you haven't already
npm install -g har-to-curl

# Convert a HAR file to cURL commands
har-to-curl session_*/network_all.har > curl_commands.sh

# Make the script executable
chmod +x curl_commands.sh
```

### Example: Using with Lighthouse

For performance analysis:

```bash
# Install Lighthouse if you haven't already
npm install -g lighthouse

# Run Lighthouse on your site while recording with chrome-logs
# In terminal 1:
node chrome.js

# In terminal 2:
lighthouse https://example.com --output json --output html --output-path ./lighthouse-report
```

This allows you to correlate Lighthouse findings with detailed network and console information captured by Chrome Logs.
