# Common Tasks & Workflows

## 🔧 CURRENT TASK: Fix VSCode Secret Storage API Failure in Docker

### Problem Summary

VSCode's Secret Storage API (`context.secrets.get()` and `context.secrets.store()`) hangs indefinitely in Docker environments, preventing API configuration from being saved and causing the webview to remain stuck on the welcome screen.

### Root Cause Analysis ✅ COMPLETE

- **Issue**: `ProviderSettingsManager.saveConfig()` calls `context.secrets.store()` which never resolves in Docker
- **Evidence**: Debug logs show execution stops at `saveConfig()` call - never reaches completion or error handling
- **Impact**: `postStateToWebview()` never called, so webview doesn't transition from welcome to chat interface

### Solution Implementation 🔄 IN PROGRESS

**Strategy**: Implement Docker-compatible fallback storage that detects containerized environments and uses file-based storage instead of VSCode Secret Storage.

**Files Being Modified**:

- [`src/core/config/ProviderSettingsManager.ts`](src/core/config/ProviderSettingsManager.ts:1)

**Implementation Steps**:

1. ✅ Add Docker environment detection logic
2. ✅ Add fallback file path generation
3. 🔄 Implement fallback `load()` method
4. 🔄 Implement fallback `store()` method
5. 🔄 Update main `load()` and `store()` methods to use fallback when needed
6. ✅ Add comprehensive debugging logs

**Next Actions**:

1. Complete fallback storage implementation
2. Test Docker environment detection
3. Run Docker test to validate fix
4. Ensure no regression in normal VSCode environments

## Playwright Testing Workflows

### Local Playwright Testing

1. Navigate to Playwright directory: `cd apps/playwright-e2e`
2. Run tests locally: `pnpm test`
3. Run tests in CI mode: `pnpm test:ci`
4. View test reports: Open `playwright-report/index.html`

### Docker Playwright Testing (Optimized with Volume Mounts)

#### Fast Development Workflow (Recommended)

1. **First time or dependency changes**: `./run-playwright-ci-simulation.sh --build`
2. **Regular development**: `./run-playwright-ci-simulation.sh` (fast - uses existing image)

#### Command Options

- `./run-playwright-ci-simulation.sh` - Run with existing image (⚡ fast)
- `./run-playwright-ci-simulation.sh --build` - Rebuild image and run (🐌 slow)
- `./run-playwright-ci-simulation.sh --help` - Show usage help

#### Volume Mount Strategy

- Source code mounted from host for live updates
- `node_modules` preserved from Docker image for stability
- 90%+ time savings for regular development iterations

#### Legacy Docker Commands (Not Recommended)

1. Build Docker image: `docker build -f Dockerfile.playwright-ci -t playwright-ci .`
2. Run tests in Docker: `docker run --rm -e OPENROUTER_API_KEY playwright-ci`
3. For debugging, run interactive: `docker run -it --rm -e OPENROUTER_API_KEY_key playwright-ci bash`

### Troubleshooting Playwright Issues

1. **Display Issues**: Ensure XVFB is running with proper screen resolution
2. **Chrome Sandbox**: Check Docker security settings and Chrome flags
3. **API Key Issues**: Verify OPENROUTER_API_KEY is properly set in environment
4. **Memory Issues**: Increase Docker shared memory with `--shm-size=2gb`

## VSCode Extension Webview Docker Issues

### Core Problem

JavaScript execution failures in VSCode extension webviews in Docker containers due to:

- Docker's seccomp profile blocking Chrome system calls
- Missing webview configuration (`enableScripts: true`)
- Content Security Policy restrictions

### Solution: Custom Seccomp Profile

1. Download Chrome-optimized seccomp profile:
    ```bash
    wget https://raw.githubusercontent.com/jessfraz/dotfiles/master/etc/docker/seccomp/chrome.json -O chrome.json
    ```
2. Run Docker with custom seccomp:
    ```bash
    docker run --security-opt seccomp=./chrome.json --shm-size=1gb your-image
    ```

### Solution: Proper Webview Configuration

```typescript
const panel = vscode.window.createWebviewPanel("myExtension", "My Extension", vscode.ViewColumn.One, {
	enableScripts: true, // CRITICAL
	localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
	retainContextWhenHidden: true,
})
```

### Solution: Correct CSP Headers

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource};" />
```
