---
title: "Using Kilo for Free"
description: "Learn how to use Kilo Code without spending money through free models, free autocomplete, and understanding CLI background tasks"
---

# Using Kilo for Free

Kilo Code offers several ways to use AI-powered coding assistance without spending money. This guide covers free models for agentic tasks, free autocomplete setup, and how the CLI handles background tasks.

## Free Models for Agentic Tasks

Kilo Code provides access to free models that you can use for your coding tasks. These models are available through the Kilo Gateway and partner providers.

### Kilo Gateway Free Models

From time to time, Kilo works with AI inference providers to offer free models. Currently available free models include:

- **MiniMax M2.1 (free)** - A capable model with strong general-purpose performance
- **Z.AI: GLM 4.7 (free)** - Purpose-built for agent-centric applications
- **MoonshotAI: Kimi K2.5 (free)** - Optimized for tool use, reasoning, and code synthesis
- **Giga Potato (free)** - A stealth release model free during its evaluation period
- **Arcee AI: Trinity Large Preview (free)** - A preview model with strong capabilities

### How to Select Free Models

1. Open Kilo Code settings
2. Navigate to **Providers**
3. Select **Kilo Code** as your provider
4. Browse the model list and look for models marked as "(free)"
5. Select your preferred free model

### OpenRouter Free Tier

OpenRouter also offers several models with generous free tiers:

1. Create a free [OpenRouter account](https://openrouter.ai)
2. Get your API key from the dashboard
3. Configure Kilo Code with the OpenRouter provider
4. Select from available free models like:
   - **Qwen3 Coder (free)** - Optimized for agentic coding tasks
   - **DeepSeek: R1 0528 (free)** - Open-sourced with fully open reasoning tokens
   - **MoonshotAI: Kimi K2 (free)** - Advanced tool use and reasoning

For more details on free and budget-friendly options, see our [Free & Budget Models](/docs/code-with-ai/agents/free-and-budget-models) guide.

## Free Autocomplete with Mistral

Kilo Code's autocomplete feature uses **Codestral** (`codestral-latest`), a model by Mistral AI specifically optimized for code completion. Mistral offers a free tier for Codestral that's perfect for getting started with AI-powered code completions.

### Setting Up Free Autocomplete

To use autocomplete for free, you can get a Codestral API key directly from Mistral:

1. **Open Kilo Code Settings** - Click the gear icon in the Kilo Code panel
2. **Add a New Configuration Profile** - Navigate to **Settings → Providers** and click **Add Profile**
3. **Name Your Profile** - Enter a name like "Mistral Autocomplete"
4. **Select Mistral as Provider** - Choose "Mistral" from the API Provider dropdown
5. **Get Your Free API Key** - Click "Get Mistral / Codestral API Key" to open the Mistral console
6. **Navigate to Codestral** - In Mistral AI Studio, click **Codestral** under the Code section
7. **Generate and Copy Your Key** - Click "Generate API Key" and copy it
8. **Paste and Save** - Return to Kilo Code, paste your API key, and save

{% callout type="tip" %}
For a detailed step-by-step walkthrough with screenshots, see our [Mistral Setup Guide](/docs/code-with-ai/features/autocomplete/mistral-setup).
{% /callout %}

### Supported Autocomplete Providers

Autocomplete works with these providers (in priority order):

| Provider | Model |
|----------|-------|
| Mistral | `codestral-latest` |
| Kilo Code | `mistralai/codestral-2508` |
| OpenRouter | `mistralai/codestral-2508` |
| Requesty | `mistral/codestral-latest` |
| Bedrock | `mistral.codestral-2508-v1:0` |
| Hugging Face | `mistralai/Codestral-22B-v0.1` |
| LiteLLM | `codestral/codestral-latest` |
| LM Studio | `mistralai/codestral-22b-v0.1` |
| Ollama | `codestral:latest` |

## CLI Background Tasks

The Kilo CLI uses AI in the background for certain quality-of-life features. Understanding how these work helps you make the most of Kilo without unexpected costs.

### What Background Tasks Do

The CLI uses a small, fast model for tasks like:

- **Session Title Generation** - Automatically creates descriptive titles for your sessions based on your first message
- **Context Summarization** - Compresses conversation history to stay within context limits

### Graceful Degradation

If you don't have credits or haven't configured a provider:

- **Session titles** will fall back to truncating your first message instead of generating a smart summary
- **Context management** will use simple truncation instead of intelligent summarization
- **Your main workflow continues uninterrupted** - these are convenience features, not requirements

{% callout type="note" %}
Background tasks are designed to fail gracefully. If they can't run, Kilo simply uses simpler fallback methods. Your coding workflow won't be blocked.
{% /callout %}

### Configuring Background Tasks

Background tasks use your configured provider. To ensure these features work:

1. **Set up any provider** - Background tasks will use your active provider configuration
2. **Use a cost-effective model** - Consider using a free or budget model for your default provider

If you want these features but want to minimize costs:

- Use a free model from the Kilo Gateway as your default
- Background tasks will automatically use this model
- Switch to a more powerful model only when needed for complex tasks

## Summary

| Feature | Free Option | Fallback Behavior |
|---------|-------------|-------------------|
| Agentic Tasks | Kilo Gateway free models, OpenRouter free tier | N/A - requires a model |
| Autocomplete | Mistral Codestral (free tier) | Disabled without provider |
| Session Titles | Uses your configured provider | Truncates first message |
| Context Summarization | Uses your configured provider | Simple truncation |

## Related Resources

- [Free & Budget Models](/docs/code-with-ai/agents/free-and-budget-models) - Comprehensive guide to cost-effective AI usage
- [Mistral Setup Guide](/docs/code-with-ai/features/autocomplete/mistral-setup) - Step-by-step autocomplete setup
- [Autocomplete](/docs/code-with-ai/features/autocomplete) - Full autocomplete documentation
- [CLI Documentation](/docs/code-with-ai/platforms/cli) - Complete CLI reference
