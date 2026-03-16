---
title: "Google Workspace Integration"
description: "Connect your Google account to KiloClaw for access to Gmail, Calendar, Drive, Docs, Sheets, and more"
---

# Google Workspace Integration

Connect your Google account to KiloClaw so it can interact with your Google Workspace services — Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, People, Forms, Chat, Classroom, and Apps Script.

The setup uses the `ghcr.io/kilo-org/google-setup` container, which walks you through an interactive flow to authorize KiloClaw against 12+ Google APIs and securely upload your credentials.

## Prerequisites

Before you begin, make sure you have:

- **Docker** installed and running on your machine
- A **Google account** with access to [Google Cloud Console](https://console.cloud.google.com)
- A **web browser** for the OAuth authentication flow

## Setup

### Step 1: Copy the setup command

1. Go to the **Settings** tab on your [KiloClaw dashboard](/docs/kiloclaw/dashboard)
2. Find the **Google Account** section
3. Copy the provided `docker run` command — it includes a short-lived authentication token

### Step 2: Run the setup container

Paste the command into your terminal and run it:

```bash
docker run -it --rm ghcr.io/kilo-org/google-setup <token>
```

The container launches an interactive setup flow. Follow the on-screen prompts — you will need to switch to a web browser at several points during the process.

### Step 3: Authenticate with KiloClaw

The container first verifies your identity using the short-lived session token included in the `docker run` command.

### Step 4: Sign in to Google Cloud

The setup opens a browser-based Google Cloud authentication flow. During this step, the container:

1. Signs you into Google Cloud
2. Creates or selects a GCP project for KiloClaw
3. Enables the necessary Google APIs on that project

### Step 5: Configure OAuth consent screen

You will be guided through creating an OAuth consent screen in your Google Cloud project:

1. Configure the OAuth consent screen with the required details
2. Create a **Desktop OAuth client** — the container provides the exact steps

### Step 6: Authorize Google services

The setup uses the [`gog` CLI](/docs/kiloclaw/pre-installed-software) to authenticate against all supported Google APIs with your OAuth credentials. This grants KiloClaw access to:

| Service               | What KiloClaw can do         |
| --------------------- | ---------------------------- |
| **Gmail**             | Read, draft, and send emails |
| **Google Calendar**   | View and manage events       |
| **Google Drive**      | Access and organize files    |
| **Google Docs**       | Read and edit documents      |
| **Google Sheets**     | Read and edit spreadsheets   |
| **Google Slides**     | Read and edit presentations  |
| **Google Tasks**      | View and manage tasks        |
| **People (Contacts)** | Access contact information   |
| **Google Forms**      | Read and manage forms        |
| **Google Chat**       | Send and read messages       |
| **Google Classroom**  | Access classroom resources   |
| **Apps Script**       | Manage Apps Script projects  |

### Step 7: Gmail push notifications

The container configures Google Pub/Sub so that KiloClaw receives real-time email notifications. This allows the agent to react to incoming emails without polling.

### Step 8: Upload credentials

Your Google credentials are encrypted with **RSA + AES-256-GCM envelope encryption** and uploaded to KiloClaw's backend. No plaintext credentials leave the setup container.

## How It Works

After setup completes, KiloClaw automatically:

1. Decrypts your Google credentials inside your personal KiloClaw machine at startup
2. Makes the `gog` CLI available to the agent with your credentials pre-loaded
3. Receives real-time Gmail push notifications via Pub/Sub

The agent can then interact with your Google Workspace services through natural language requests.

## Using Google Services

Once setup is complete, you can ask KiloClaw to interact with your Google services naturally. For example:

- "Check my Gmail for unread messages"
- "Create a new Google Doc summarizing our meeting notes"
- "Add a meeting to my calendar for tomorrow at 2pm"
- "Find the latest spreadsheet in my Drive"

KiloClaw will automatically use the configured Google credentials to fulfill these requests.

## Security

- Credentials are encrypted with RSA + AES-256-GCM envelope encryption before leaving the setup container
- Encrypted credentials are stored in KiloClaw's backend and are only decrypted inside your running instance
- The setup token is short-lived and single-use
- OAuth scopes are limited to the Google APIs that KiloClaw needs to operate
- You can revoke access at any time from your [Google Account permissions page](https://myaccount.google.com/permissions)

## Related

- [KiloClaw Overview](/docs/kiloclaw/overview)
- [Dashboard Reference](/docs/kiloclaw/dashboard)
- [GitHub Integration](/docs/kiloclaw/development-tools/github)
- [Pre-installed Software](/docs/kiloclaw/pre-installed-software)
- [Chat Platforms](/docs/kiloclaw/chat-platforms)
