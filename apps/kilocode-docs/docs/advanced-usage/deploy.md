---
sidebar_label: Deploy
---

# Deploy

Deploy your Next.js applications directly from Kilo Code with automatic builds and continuous deployment from GitHub.

:::tip Quick Start

1. Connect your GitHub account via the GitHub App integration
2. Select a repository and branch to deploy
3. Kilo Code handles the build and assigns a random subdomain
4. Push new commits to trigger automatic redeployments

:::

## Package Manager Support

Kilo Code Deploy supports all major package managers including npm, pnpm, yarn, and bun. The deployment system automatically detects which package manager your project uses and runs the appropriate build commands.

## Supported Next.js Versions

All minor and patch versions of Next.js 15 and the latest minor of Next.js 14 are supported.

## Database Support

Kilo Code Deploy does not include built-in database hosting. However, you can connect to external database services.
