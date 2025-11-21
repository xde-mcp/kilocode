# Cloud agent

Run Kilo Code from anywhere.

## Requirements

- Configure the GitHub App integration for your personal account or organization before starting a session.

## Cost

- During the beta compute usage is free.
- Kilo Code in your cloud sessions still use credits to perform work.

:::info Quick Start

1. Connect your GitHub account via the GitHub App integration
2. Select a repository
3. Configure custom env vars and define setup commands to prep the workspace
4. Send messages to your remote kilo code session, it will auto commit as work progresses.

:::

## How cloud agents work

- Every user gets access to a small isolated Linux container with Python, Node.js, and other common development tools pre-installed.
- All of your cloud sessions share a single container instance but get their own workspace within; Note that instance cpu/memory/disk size may change during the beta.
- Each session contains a clone of your repo and creates a unique branch where it stores its work.
- After every message the agent looks for changes to commit and pushes the branch. Sandboxes are ephemeral and can be interrupted/restarted/etc, so its important to save work as you go by pushing your branch.
- You can define env vars that will be set for each chat session.
- You can define startup scripts/commands that run after the repo is cloned and the branch is checked out.
- The sandbox will spin down after inactivity; expect slightly longer setup after idle periods.
- During the beta, inactive sessions are deleted after 7 days.

## Perfect for

- Offloading bug fixes and troubleshooting to Kilo Code debug mode
- Answering ad hoc questions about code bases you don't work on every day
- Brainstorming with Kilo Code architect mode while away from your desk
- Orchestrating the tech debt cleanup you've been wanting to tackle

## Limitations

- Each message to Kilo Code can run for up to 10 minutes; break work into smaller tasks and keep a `plan.md` or `todo.md`.
- Context is not shared between messages yet; use a persistent `plan.md`/`todo.md` to keep Kilo Code on track.
- Kilo Code is running in auto/yolo mode - so be aware that it will not prompt you for permission.
- Sessions saved in the sidebar are not yet shared across logins or resumable locally.
- MCP support is coming soon, but Docker-based MCP servers will not be supported.
