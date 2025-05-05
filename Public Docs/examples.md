# ChromeLogs: Example Usage Scenarios

This document provides detailed examples of how to use ChromeLogs for various common scenarios, showing its practical applications in web development, debugging, and performance analysis workflows.

## Scenario 1: Debugging Production Issues

### Problem

Users report intermittent errors on your production website that you can't reproduce in your development environment. You need evidence to understand what's happening when users encounter the problem.

### Solution

1. **Launch Chrome with debugging enabled:**

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

2. **Start ChromeLogs:**

```bash
node chrome.js
```

3. **Reproduce the issue:**
   - Navigate to your website
   - Perform the actions that typically trigger the error
   - Continue using the site until the error occurs

4. **Stop recording:**
   - Either close Chrome or press `q` in the ChromeLogs terminal

5. **Analyze the results:**
   - Check console logs for JavaScript errors:
     ```bash
     # Look for error entries in the console logs
     grep -r "error" session_*/console_logs/
     ```
   - Examine network requests around the time of the error:
     ```bash
     # Use a HAR viewer to analyze the network data
     # Or use jq to extract specific information
     jq '.log.entries[] | select(.response.status >= 400) | {url: .request.url, status: .response.status}' session_*/network_all.har
     ```

### Benefits

- Complete record of all JavaScript errors with stack traces
- Network request and response data before, during, and after the error
- Evidence of exactly what happened for sharing with dev teams
- Ability to see patterns that might only occur in production environments

## Scenario 2: Performance Analysis

### Problem

Your website feels slow to users, especially during key workflows like checkout or product searches. You need to identify bottlenecks and optimize performance.

### Steps

1. **Launch Chrome and ChromeLogs**

2. **Perform a typical user journey:**
   - Navigate to your homepage
   - Browse product categories
   - Add items to cart
   - Complete checkout process

3. **Stop recording**

4. **Analyze performance data:**
   - Import the HAR file(s) from your `session_*/final_har_files/` directory into a HAR analyzer tool like:
     - [HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/)
     - [WebPageTest HAR Analyzer](https://www.webpagetest.org/har/)
     - [Chrome DevTools](https://developer.chrome.com/docs/devtools/network/reference/#analyze-har-files)

### Analysis Techniques

- Look for the "waterfall" of requests to identify blocking resources
- Check for large file downloads that may be slowing the experience
- Identify API calls that take more than 200-300ms to complete
- Look for unnecessary or duplicate requests

Example command to find the slowest 10 requests:

```bash
jq -c '.log.entries | sort_by(.time) | reverse | .[0:10] | .[] | {url: .request.url, time: .time}' session_*/network_all.har
```

### Benefits

- Detailed timing information for all resources
- Real-world performance data as experienced by users
- Complete view of how resources load in relation to each other
- Identification of third-party scripts that impact performance

## Scenario 3: API Usage Analysis

### Problem

Your Single-Page Application (SPA) makes numerous API calls during user interaction. You want to optimize these calls by identifying patterns, redundancies, and potential batching opportunities.

### Steps

1. **Launch Chrome and ChromeLogs**

2. **Use the application normally:**
   - Navigate between different views/pages
   - Interact with various features
   - Submit forms and trigger data-loading actions

3. **Stop recording**

4. **Extract API calls from the HAR files:**

```bash
# Extract all XHR/fetch API calls with timing information
jq '.log.entries[] | select(._resourceType == "xhr" or ._resourceType == "fetch") | {method: .request.method, url: .request.url, status: .response.status, time: .time}' session_*/network_all.har
```

### Analysis Techniques

- Group API calls by endpoint to identify frequent requests
- Look for repeated calls to the same endpoints (potential optimization)
- Check if proper HTTP caching headers are being used
- Identify patterns in API usage that could be batched or optimized

### Benefits

- Complete inventory of all API endpoints used
- Actual request and response payloads for analysis
- Performance metrics for each API call
- Insights into frontend-backend communication patterns

## Scenario 4: Third-Party Script Monitoring

### Problem

You suspect third-party scripts (analytics, advertisements, trackers) might be causing performance or stability issues on your site.

### Steps

1. **Launch Chrome and ChromeLogs**

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

### Benefits

- Evidence to discuss with third-party vendors
- Quantifiable impact of each script on site performance
- Identification of problematic scripts to remove or optimize
- Understanding of how third-party code interacts with your site

## Scenario 5: Debugging Authentication Issues

### Problem

Users are experiencing login problems or getting unexpectedly logged out of your application.

### Steps

1. **Launch Chrome and ChromeLogs**

2. **Reproduce the authentication workflow:**
   - Log in to your application
   - Navigate between pages that require authentication
   - Perform actions that might trigger token refreshes

3. **Stop recording**

4. **Analyze authentication headers and cookies:**

```bash
# Examine Authentication headers
jq '.log.entries[] | select(.request.headers[] | .name == "Authorization")' session_*/network_all.har

# Check for cookie changes
jq '.log.entries[] | select(.response.headers[] | .name == "Set-Cookie")' session_*/network_all.har
```

### Analysis Techniques

- Track the flow of authentication tokens
- Check for token expirations or refreshes
- Look for redirects that might be losing authentication information
- Verify that secure and HttpOnly flags are set on cookies

### Benefits

- Complete visibility into the authentication flow
- Evidence of exactly where authentication breaks
- Understanding of token lifecycle in practice
- Identification of security issues in authentication implementation