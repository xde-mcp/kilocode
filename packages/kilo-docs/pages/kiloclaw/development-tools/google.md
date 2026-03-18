---
title: "Google Workspace Integration"
description: "Connect a dedicated Google account to KiloClaw for access to Gmail, Calendar, Drive, Docs, Sheets, and more"
---

# Google Workspace Integration

Connect a dedicated Google account to KiloClaw so it can interact with Google Workspace services — Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, People, Forms, Chat, Classroom, and Apps Script.

{% callout type="warning" title="Use a standalone Google account" %}
We strongly recommend creating a **dedicated Google account** specifically for KiloClaw rather than connecting your personal Google account. This keeps your personal data separate and gives you full control over what KiloClaw can access. Throughout this guide, "the KiloClaw Google account" refers to this dedicated account.
{% /callout %}

## What You Get

Once setup is complete, your KiloClaw machine will have the following configured automatically:

- The [`gog` CLI](/docs/kiloclaw/pre-installed-software) pre-loaded with the KiloClaw Google account's credentials, giving the agent access to 12+ Google APIs
- Real-time Gmail push notifications via Google Pub/Sub, so KiloClaw can react to incoming emails sent to the dedicated account without polling
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

Log into the [Google Cloud Console](https://console.cloud.google.com) with the dedicated KiloClaw Google account to confirm you have access.

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

Once setup is complete, KiloClaw can interact with the dedicated Google account's services. You can issue natural language prompts referencing the KiloClaw account directly. For example:

- "Check the KiloClaw Gmail inbox for unread messages"
- "Create a new Google Doc in the KiloClaw account summarizing our meeting notes"
- "Add a meeting to the KiloClaw account's calendar for tomorrow at 2pm"
- "List recent files in KiloClaw's Google Drive"

KiloClaw will automatically use the dedicated account's credentials to fulfill these requests.

### Accessing your personal Google data

KiloClaw's credentials are tied to its dedicated Google account — not your personal one. To let KiloClaw work with your personal Google data, you need to **share or delegate access from your personal account to the KiloClaw account**:

| Service                           | How to share access                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Calendar**               | Share your calendar with the KiloClaw account's email address ([instructions](https://support.google.com/calendar/answer/37082))      |
| **Google Drive**                  | Share specific files or folders with the KiloClaw account's email address                                                             |
| **Gmail**                         | Set up [Gmail delegation](https://support.google.com/mail/answer/138350) to grant the KiloClaw account read/send access to your inbox |
| **Google Docs / Sheets / Slides** | Share individual documents with the KiloClaw account's email address                                                                  |

Once access is shared, reference the delegation in your prompts so KiloClaw knows where to look:

- "Check the shared calendar from alice@example.com for tomorrow's meetings"
- "Open the Q3 report that was shared with the KiloClaw account from the team Drive"
- "Read the latest emails in the delegated inbox from alice@example.com"
- "Draft a reply in the delegated Gmail from alice@example.com to the last message from Bob"

## Related

- [KiloClaw Overview](/docs/kiloclaw/overview)
- [Dashboard Reference](/docs/kiloclaw/dashboard)
- [GitHub Integration](/docs/kiloclaw/development-tools/github)
- [Pre-installed Software](/docs/kiloclaw/pre-installed-software)
- [Chat Platforms](/docs/kiloclaw/chat-platforms)
