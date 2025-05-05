# Contributing to ChromeLogs

Thank you for your interest in contributing to ChromeLogs! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

Please help keep this project open and inclusive. By participating, you agree to:

- Be respectful of different viewpoints and experiences
- Accept constructive criticism
- Show empathy towards other community members
- Focus on what's best for the community

## How Can I Contribute?

### Reporting Bugs

When reporting bugs, please include:

1. **Clear title and description** of the issue
2. **Steps to reproduce** the problem
3. **Expected behavior** and what actually happened
4. **Screenshots** if applicable
5. **Environment details**:
   - OS: [e.g., Windows 10, macOS 12.3, Ubuntu 22.04]
   - Node.js version: [e.g., 16.14.0]
   - Chrome version: [e.g., 112.0.5615.138]
   - ChromeLogs version: [e.g., 1.0.0]

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Please provide:

1. **Clear title and description** of the enhancement
2. **Step-by-step description** of the suggested enhancement
3. **Explain why** this enhancement would be useful
4. **Include examples** of how it would work if applicable

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install development dependencies**
3. **Make your changes** and ensure they follow the project's coding style
4. **Add tests** for your changes if applicable
5. **Update documentation** to reflect your changes
6. **Submit your pull request** with a clear description of the changes

## Development Setup

1. **Clone your fork**:
   ```bash
   git clone https://github.com/Breinss/ChromeLogs.git
   cd ChromeLogs
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   node chrome.js
   ```

## Coding Guidelines

### JavaScript Style

- Use modern JavaScript (ES6+) features
- Follow consistent indentation (2 spaces)
- Use semicolons at the end of statements
- Use meaningful variable and function names
- Add comments for complex logic

### Commit Messages

- Use clear, concise commit messages
- Start with a verb in the present tense (e.g., "Add feature" not "Added feature")
- Reference issue numbers if applicable

Example:
```
Add automatic Chrome detection for macOS (#42)
```

## Testing

Before submitting a pull request, please test your changes:

1. **Manual testing**:
   - Verify functionality across different browsers (Chrome, Chromium-based browsers)
   - Test on different operating systems if possible
   - Test with various websites and use cases

2. **Edge cases to test**:
   - Very high-traffic websites
   - Long recording sessions
   - Low memory conditions
   - Network errors and reconnection
   - Multi-tab monitoring with many tabs

## Documentation

If your changes add new features or modify existing behavior, please update:

1. **Code comments** - Explain logic and function purpose
2. **README.md** - Update installation or usage instructions if needed
3. **User guide** - Update detailed usage information
4. **Examples** - Add examples demonstrating new features
5. **API documentation** - If you modify the API

## Release Process

Releases are managed by the core maintainers. The general process is:

1. **Version bump** in `package.json`
2. **Update CHANGELOG.md** with notable changes
3. **Create a release tag** in Git
4. **Publish to GitHub** with release notes

## Questions?

If you have questions about contributing, please open an issue labeled "question" on the GitHub repository.

Thank you for contributing to ChromeLogs!