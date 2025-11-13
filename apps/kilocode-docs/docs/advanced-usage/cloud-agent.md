# Cloud agent

Run Kilo Code from anywhere.

Cloud agent runs your Kilo Code tasks in a cloud-based sandbox environment, handles multiple tasks in parallel, and integrates seamlessly with your GitHub repositories—all through a simple web interface.

## Perfect for

- **Offloading Bug fixes and troubleshooting** to Kilo Code debug mode.
- **Answering ad hoc questions about code bases you don't work on every day** but often interact with.
- **Brainstorming with Kilo Code architect mode** while away from your desk - like flights!
- **Orchestrating the tech debt cleanup you've been itching to tackle** but don't have the time to do yourself.

:::info Quick Start

1. Connect your GitHub account via the GitHub App integration
2. Select a repository and optional branch to work on
3. Configure custom env vars, mcp servers, and define setup commands to prep the workspace
4. Chat with Kilo Code like usual - switching between the models and modes you prefer
5. Kilo Code will automatically commit to the branch as it works. When you're ready, just ask it to open a pull request.

:::

## How it works

Your Kilo Code cloud agent runs in an Ubuntu based container provisioned for you. You can work on multiple tasks simultaneously without interference—each session maintains its own isolated workspace. Set up custom environment variables, install dependencies with pre-execution commands, and connect MCP servers to replicate your local development environment in the cloud.

Cloud agent handles cloning, commits, and branch management automatically. When you're ready, Kilo Code will send a pull request for you to review.

:::tip Tip
Team up Kilo Code cloud agents with automated code reviews for even faster iterations.
:::
