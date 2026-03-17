---
title: "Google Workspace Integration"
description: "Connect your Google account to KiloClaw for access to Gmail, Calendar, Drive, Docs, Sheets, and more"
---

# Google Workspace Integration

Connect your Google account to KiloClaw so it can interact with your Google Workspace services — Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, People, Forms, Chat, Classroom, and Apps Script.

{% callout type="warning" title="Use a standalone Google account" %}
We strongly recommend creating a **dedicated Google account** specifically for KiloClaw rather than giving it access to your personal Google account. This keeps your personal data separate and gives you full control over what KiloClaw can access. 
{% /callout %}

## What You Get

Once setup is complete, your KiloClaw machine will have the following configured automatically:

- The [`gog` CLI](/docs/kiloclaw/pre-installed-software) pre-loaded with your Google credentials, giving the agent access to 12+ Google APIs
- Real-time Gmail push notifications via Google Pub/Sub, so KiloClaw can react to incoming emails without polling
- Access to the full range of Google Workspace services:

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

## Prerequisites

Before you begin, make sure you have:

- **Docker** installed and running on your machine

## Setup

### Step 1: Verify Google Cloud Console access

Log into the [Google Cloud Console](https://console.cloud.google.com) to confirm you have access.

{% callout type="info" %}
Don't worry about providing billing details — this setup does not use any paid resources. The Google Cloud Console access is only needed for creating an OAuth consent screen and enabling APIs.
{% /callout %}

### Step 2: Run the setup container

1. Go to the **Settings** tab on your [KiloClaw dashboard](/docs/kiloclaw/dashboard)
2. Find the **Google Account** section
3. Copy the provided `docker run` command — it includes a short-lived authentication token
4. Paste the command into a terminal on your local machine and run it

The container launches an interactive setup flow. Follow the on-screen prompts — you will need to switch to a web browser at several points during the process.

## Using Google Services

Once setup is complete, you can ask KiloClaw to interact with your Google services naturally. For example:

- "Check my Gmail for unread messages"
- "Create a new Google Doc summarizing our meeting notes"
- "Add a meeting to my calendar for tomorrow at 2pm"
- "Find the latest spreadsheet in my Drive"

KiloClaw will automatically use the configured Google credentials to fulfill these requests.

{% callout type="info" %}
If you followed our recommendation and set up a **standalone Google account** for KiloClaw, remember that KiloClaw's credentials are tied to that account — not your personal one. To access your personal Google data, you'll need to delegate access from your personal account to the standalone KiloClaw account (e.g., sharing calendars, Drive folders, or granting Gmail delegation). When making requests, instruct KiloClaw to access **your** account that was delegated to it, not its own account.
{% /callout %}

## Related

- [KiloClaw Overview](/docs/kiloclaw/overview)
- [Dashboard Reference](/docs/kiloclaw/dashboard)
- [GitHub Integration](/docs/kiloclaw/development-tools/github)
- [Pre-installed Software](/docs/kiloclaw/pre-installed-software)
- [Chat Platforms](/docs/kiloclaw/chat-platforms)
