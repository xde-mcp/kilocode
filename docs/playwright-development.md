# Playwright Development with Docker

This document explains how to use the new Docker-based development environment for debugging Playwright tests with volume mounting for faster iteration.

## Overview

The development setup uses volume mounting instead of copying the entire codebase into the Docker container. This approach provides:

- **Fast iteration**: No need to rebuild the container when code changes
- **Real-time updates**: Changes to source code are immediately reflected in the container
- **Consistent environment**: Same environment as CI but with development conveniences

## Files

- [`Dockerfile.playwright-dev`](../Dockerfile.playwright-dev) - Development Dockerfile with volume mounting
- [`docker-compose.dev.yml`](../docker-compose.dev.yml) - Docker Compose configuration for development
- [`scripts/playwright-dev.sh`](../scripts/playwright-dev.sh) - Convenience script for common operations

## Quick Start

1. **Build the development image:**

    ```bash
    ./scripts/playwright-dev.sh build
    ```

2. **Set your API key:**

    ```bash
    export OPENROUTER_API_KEY=your_api_key_here
    ```

3. **Run tests:**

    ```bash
    ./scripts/playwright-dev.sh test
    ```

4. **Start interactive development shell:**
    ```bash
    ./scripts/playwright-dev.sh shell
    ```

## Available Commands

The [`scripts/playwright-dev.sh`](../scripts/playwright-dev.sh) script provides these commands:

| Command   | Description                                           |
| --------- | ----------------------------------------------------- |
| `build`   | Build the development Docker image                    |
| `shell`   | Start an interactive shell in the container           |
| `test`    | Run Playwright tests                                  |
| `test-ui` | Run Playwright tests with UI mode (limited in Docker) |
| `clean`   | Clean up Docker resources                             |
| `logs`    | Show container logs                                   |

## Development Workflow

### Interactive Development

1. Start an interactive shell:

    ```bash
    ./scripts/playwright-dev.sh shell
    ```

2. Inside the container, navigate to the test directory:

    ```bash
    cd apps/playwright-e2e
    ```

3. Run specific tests or commands:

    ```bash
    # Run all tests
    pnpm test:ci

    # Run specific test file
    pnpm test tests/sanity.spec.ts

    # Run tests with debug output
    DEBUG=pw:* pnpm test:ci

    # Install new dependencies (if needed)
    pnpm install
    ```

### Quick Test Runs

For quick test runs without interactive mode:

```bash
OPENROUTER_API_KEY=your_key ./scripts/playwright-dev.sh test
```

## Volume Mounting Details

The Docker Compose configuration mounts:

- **Source code**: `.:/workspace` - Your entire project directory
- **Excluded directories**: `node_modules`, `test-results`, `playwright-report`, etc. are excluded to avoid conflicts

### Benefits

1. **No copy step**: Eliminates the slow `COPY . .` operation from the original Dockerfile
2. **Real-time changes**: Edit files on your host machine and see changes immediately in the container
3. **Persistent dependencies**: `node_modules` is managed inside the container but persists between runs
4. **Clean separation**: Build artifacts stay in the container, source code stays on the host

### Considerations

- **First run**: Dependencies are installed automatically on first run
- **Dependency updates**: Run `pnpm install` manually inside the container if you update `package.json`
- **File permissions**: Files created in the container may have different ownership (use `docker-compose down` to reset if needed)

## Comparison with CI Dockerfile

| Aspect           | CI Dockerfile                 | Development Dockerfile          |
| ---------------- | ----------------------------- | ------------------------------- |
| **Build time**   | Slow (copies entire codebase) | Fast (no copy step)             |
| **Code changes** | Requires rebuild              | Immediate                       |
| **Dependencies** | Installed during build        | Installed on first run          |
| **Use case**     | CI/CD pipelines               | Local development/debugging     |
| **Persistence**  | Immutable container           | Mutable development environment |

## Troubleshooting

### Container won't start

```bash
# Clean up and rebuild
./scripts/playwright-dev.sh clean
./scripts/playwright-dev.sh build
```

### Permission issues

```bash
# Reset Docker volumes
docker-compose -f docker-compose.dev.yml down --volumes
```

### Dependencies out of sync

```bash
# Start shell and reinstall
./scripts/playwright-dev.sh shell
# Inside container:
rm -rf node_modules
pnpm install
```

### API key issues

```bash
# Verify API key is set
echo $OPENROUTER_API_KEY

# Set API key for current session
export OPENROUTER_API_KEY=your_key_here
```

## Advanced Usage

### Custom Commands

You can run any command in the development container:

```bash
# Using docker-compose directly
docker-compose -f docker-compose.dev.yml run --rm playwright-dev bash -c "your-command-here"

# Using the helper script with shell access
./scripts/playwright-dev.sh shell
# Then run commands interactively
```

### Debugging Specific Tests

```bash
./scripts/playwright-dev.sh shell
cd apps/playwright-e2e

# Run with verbose output
DEBUG=pw:* pnpm test tests/your-test.spec.ts

# Run with headed mode (if display forwarding is set up)
pnpm test tests/your-test.spec.ts --headed

# Run with specific timeout
pnpm test tests/your-test.spec.ts --timeout=60000
```

### Environment Variables

The development environment supports these environment variables:

- `OPENROUTER_API_KEY` - Required for API access
- `DEBUG` - Playwright debug output (e.g., `pw:*`)
- `NODE_ENV` - Set to `development` by default
- `CI` - Set to `true` to match CI environment

## Migration from Original Dockerfile

If you were using the original [`Dockerfile.playwright-ci`](../Dockerfile.playwright-ci):

**Before:**

```bash
docker build -f Dockerfile.playwright-ci -t playwright-ci .
docker run -e OPENROUTER_API_KEY=your_key playwright-ci
```

**After:**

```bash
./scripts/playwright-dev.sh build
OPENROUTER_API_KEY=your_key ./scripts/playwright-dev.sh test
```

The development approach is much faster for iterative debugging while maintaining the same test environment.
