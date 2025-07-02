# Technology Stack

## Development Requirements

- **Node.js**: v20.18.1 (exact version via .nvmrc)
- **pnpm**: v10.8.1 (enforced via preinstall script) - NEVER use npm
- **Extension Runtime**: Extension runs automatically in VSCode - NEVER try to run watch mode

## Testing Commands

### Fast Targeted Testing

```bash
# Core extension test (Vitest) - PREFERRED
cd $WORKSPACE_ROOT/src; npx vitest run **/*.spec.ts

# Core extension test (Jest)
cd $WORKSPACE_ROOT/src; npx jest src/api/providers/__tests__/anthropic.test.ts

# Webview test (Jest)
cd $WORKSPACE_ROOT/webview-ui; npx jest src/components/__tests__/component.test.tsx
```

### Playwright E2E Testing

```bash
# Playwright tests (from apps/playwright-e2e directory)
cd $WORKSPACE_ROOT/apps/playwright-e2e; pnpm test

# Playwright tests in CI mode
cd $WORKSPACE_ROOT/apps/playwright-e2e; pnpm test:ci

# Docker-based Playwright testing
docker build -f Dockerfile.playwright-ci -t playwright-ci .
docker run --rm -e OPENROUTER_API_KEY=your_key playwright-ci
```

### Full Test Suite

```bash
# From workspace root only - slow, includes build
pnpm test
```

## Critical Testing Rules

- **NEVER run tests in watch mode** - causes system hang
- **Always verify file exists** with list_files before running tests
- **Use correct path format**: Remove `src/` prefix for vitest, keep for jest
- **Jest config**: Looks for `**/__tests__/**/*.test.ts` files
- **Vitest config**: Looks for `**/__tests__/**/*.spec.ts` files

## Playwright Docker Integration

- **No Chrome Installation**: Playwright manages browser binaries automatically
- **XVFB Required**: Use `xvfb-run` for virtual display in headless Docker environments
- **Sandbox Configuration**: Docker security restrictions require careful Chrome sandbox setup
- **Environment Variables**: Set `DISPLAY=:99`, `CI=true`, and proper Chrome paths

## Terminal Integration

- **WORKSPACE_ROOT Environment Variable**: All Kilo Code terminals automatically have `$WORKSPACE_ROOT` set to workspace root
- **Cross-platform**: Works on Windows (`%WORKSPACE_ROOT%`), macOS, and Linux (`$WORKSPACE_ROOT`)
