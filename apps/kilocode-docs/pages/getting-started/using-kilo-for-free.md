---
title: "Using Kilo for Free"
description: "Learn how to use Kilo Code without spending money through free models, free autocomplete, and understanding CLI background tasks"
---

# Using Kilo for Free

Kilo Code lets you perform agentic coding tasks for free by choosing free models. In addition to agentic tasks, Kilo also provides features like autocomplete and CLI background tasks that use credits by default. If you run out of credits, these features won't work—but you can configure them to use free alternatives instead.

## Free Models for Agentic Tasks

Kilo Code provides access to free models that you can use for your coding tasks. These models are available through the Kilo Gateway and partner providers.

### Finding Free Models

Free models are clearly labeled in the model picker. To find and use them:

**In the VS Code Extension:**

1. Open Kilo Code settings
2. Navigate to **Providers**
3. Select **Kilo Code** as your provider
4. Browse the model list—free models are labeled as "(free)"
5. Select your preferred free model

**In the CLI:**

1. Run `kilo config` to open configuration
2. Browse available models—free models are labeled as "free"
3. Select a free model for your tasks

{% callout type="tip" %}
The available free models change over time as Kilo partners with different AI inference providers. Check the model picker regularly to see current free options.
{% /callout %}

## Free Autocomplete

Kilo Code's autocomplete feature provides AI-powered code completions as you type.

### How It Works

By default, autocomplete is routed through the Kilo Code provider, which uses credits. However, if you configure Mistral directly for autocomplete, that configuration takes precedence and provides free completions through Mistral's Codestral model.

### Setting Up Free Autocomplete

To use autocomplete for free, configure Mistral as your autocomplete provider. Mistral offers a free tier for their Codestral model that's perfect for code completions.

For step-by-step instructions with screenshots, see our [Mistral Setup Guide](/docs/code-with-ai/features/autocomplete/mistral-setup).

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

You can configure which model the CLI uses for background tasks by setting the `small_model` parameter in `~/.kilocode/config.json`. By default, this is set to `gpt-5-nano`, which is not free.

If you run out of credits, background tasks will fall back to using your main model. However, you can also configure `small_model` to use a free model if you prefer to avoid using credits entirely:

```json
{
  "small_model": "your-preferred-free-model"
}
```

Replace `your-preferred-free-model` with any free model available in the model picker.

## Summary

| Feature | Default Behavior | Free Alternative |
|---------|------------------|------------------|
| Agentic Tasks | Uses selected model | Select a free model from the model picker |
| Autocomplete | Routed through Kilo Code (uses credits) | Configure Mistral directly ([setup guide](/docs/code-with-ai/features/autocomplete/mistral-setup)) |
| CLI Background Tasks | Uses `gpt-5-nano` (uses credits) | Set `small_model` to a free model in config |

## Related Resources

- [Mistral Setup Guide](/docs/code-with-ai/features/autocomplete/mistral-setup) - Step-by-step free autocomplete setup
- [Autocomplete](/docs/code-with-ai/features/autocomplete) - Full autocomplete documentation
- [CLI Documentation](/docs/code-with-ai/platforms/cli) - Complete CLI reference
