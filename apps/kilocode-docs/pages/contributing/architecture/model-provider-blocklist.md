---
title: "Model/Provider Blocklist"
description: "Proposal to replace the model/provider allowlist with a blocklist approach for enterprise team management"
---

# Model/Provider Blocklist

## Overview

Enterprise organization administrators currently manage which models and providers their team members can use through an **allowlist** system in the Providers & Models settings page. The current implementation stores two fields in `OrganizationSettings`: `model_allow_list` and `provider_allow_list`. This system has proven confusing and difficult to maintain:

- By default, an empty allowlist means "allow everything." Once an admin customizes any setting, new models added by providers are **not** automatically available -- the admin must manually approve each one.
- An "Allow all current and future models" checkbox was added per-provider to address this. It works by adding a `providerSlug/*` wildcard entry to `model_allow_list`, which allows any model offered by that provider (including future ones) via a 3-tier matching system (exact match, namespace wildcard, provider-membership wildcard). However, it has a critical flaw: if an admin wants to block one specific model while keeping the wildcard active, disabling that model removes the provider wildcard entirely (see `toggleModelAllowed()` in `allowLists.domain.ts`). The admin is then forced back into manual per-model curation.
- The current server-side enforcement is also inconsistent: `checkOrganizationModelRestrictions` in `llm-proxy-helpers.ts` only performs 2-tier matching (exact + namespace wildcard), while `listAvailableModels` uses `createProviderAwareModelAllowPredicate` which performs full 3-tier matching (exact + namespace wildcard + provider-membership wildcard). This means the model list shown to users can differ from what the proxy actually enforces.
- The net result is that admins must either allow everything wholesale or commit to ongoing manual curation of hundreds of model/provider combinations.

This proposal replaces the allowlist with a **blocklist** approach. The default behavior becomes "everything is allowed unless explicitly blocked," which eliminates the ongoing maintenance burden while still giving admins precise control.

## Requirements

- This feature remains restricted to **enterprise plans only**, consistent with the current allowlist system. Teams-plan organizations get unrestricted model/provider access.
- All models and providers are **allowed by default**, including newly added ones.
- Admins can block an entire provider (all current and future models from that provider).
- Admins can block a specific model/provider combination without affecting other providers offering the same model.
- The UI must make it easy to find and block specific models across a large catalog (300+ models, 65+ providers).
- Blocked state must be enforced server-side at the LLM proxy layer, **consistently** across both the proxy enforcement path (`checkOrganizationModelRestrictions`) and the model listing path (`listAvailableModels`).
- Migration from the existing allowlist data (`model_allow_list`, `provider_allow_list`) must be handled without disrupting current customer configurations.

### Non-requirements

- Blocking a model across _all_ current and future providers (e.g., "block model X regardless of who offers it"). This can be added later if there is demand, but adds complexity and is not needed for the initial implementation.
- Per-user or per-team blocklists. This proposal covers organization-level controls only.
- Cost controls or spending limits per model. This is a separate concern.

## System Design

### Core Semantics

The system shifts from "deny by default, explicitly allow" to **"allow by default, explicitly deny"**:

| Scenario                              | Behavior                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No blocklist entries                  | All models and providers are available (default)                                                                                                       |
| Provider blocked                      | All current and future models from that provider are unavailable. The same model may still be available from other providers.                          |
| Specific model/provider combo blocked | Only that specific combination is unavailable. The model remains available from other providers, and other models from that provider remain available. |

### Plan Gating

Blocklist enforcement only applies to enterprise-plan organizations (`organizationPlan === 'enterprise'`). For non-enterprise organizations (including teams plans), the blocklist fields are ignored and all models/providers are available. This mirrors the current behavior where `checkOrganizationModelRestrictions` gates model allow list checks on `params.organizationPlan === 'enterprise'`.

The `updateBlockLists` tRPC mutation must remain gated behind `organizationOwnerProcedure` and an enterprise plan check, consistent with the existing `updateAllowLists` mutation.

### Data Model

Replace the current allowlist fields in `OrganizationSettings` with blocklist equivalents:

```ts
const OrganizationSettingsSchema = z.object({
	// New blocklist fields
	model_block_list: z.array(z.string()).optional(), // e.g. ["chutes:anthropic/claude-opus-4.6"]
	provider_block_list: z.array(z.string()).optional(), // e.g. ["chutes", "ambient"]

	// Deprecated -- keep for migration, remove later
	model_allow_list: z.array(z.string()).optional(),
	provider_allow_list: z.array(z.string()).optional(),

	// ... other settings unchanged
})
```

**Entry formats:**

- `provider_block_list`: Provider slug strings (e.g. `"chutes"`, `"ambient"`). Blocks all models routed through that provider.
- `model_block_list`: Model/provider combination strings using a **colon separator** between the provider slug and model ID: `providerSlug:modelId` (e.g. `"chutes:anthropic/claude-opus-4.6"`). The colon is used because model IDs already contain slashes (e.g. `anthropic/claude-opus-4.6`), so using a slash as a separator would be ambiguous. Blocks only that specific combination.

### Enforcement Logic

Server-side enforcement replaces the current 3-tier allowlist matching with a simpler blocklist check. Unlike the current system where `checkOrganizationModelRestrictions` and `createProviderAwareModelAllowPredicate` use different matching tiers, the new blocklist logic must be **identical** across all code paths:

**In the LLM proxy (`checkOrganizationModelRestrictions`):**

```
1. If organizationPlan !== 'enterprise' → ALLOW (skip all checks)
2. If the requested provider is in provider_block_list → DENY
3. If "requestedProvider:normalizedModelId" is in model_block_list → DENY
4. Otherwise → ALLOW
```

**In `listAvailableModels`:**

The same logic applies. For each model, check if any of its providers are blocked (provider-level) or if the specific model/provider combination is blocked. Only exclude models where _all_ available providers are blocked.

**Provider config behavior:**

The current system sets `providerConfig.only = providerAllowList` to restrict OpenRouter routing. With a blocklist, the equivalent is to set `providerConfig.ignore = providerBlockList` (or compute the inverse), telling OpenRouter to avoid blocked providers. The `data_collection` setting on `providerConfig` is orthogonal and unchanged.

### UI Design

Replace the current dual-tab (Models / Providers) layout with a **single unified view** organized by provider:

**Main view: Provider list with expandable models**

- A flat list of all providers, each expandable to show its offered models.
- Each provider row has a block/unblock toggle. Blocking a provider visually marks all its models as blocked.
- Each model row (within an expanded provider) has a block/unblock toggle for that specific model/provider combination.
- A **free-text search/filter box** at the top filters both providers and models. For example, typing "K2.5" filters the provider list to only those offering a matching model, and within each provider only shows the matching models. This makes it easy to block a specific model across select providers.
- Blocked items are visually distinct (e.g., a red/muted treatment) so the current block state is immediately clear.
- A summary indicator shows total blocked count (e.g., "3 providers blocked, 7 model combinations blocked").

**Interaction examples:**

| Action                                   | Result                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block provider "Chutes"                  | All Chutes models become unavailable. Future models from Chutes are also blocked.                                                                     |
| Block `chutes:anthropic/claude-opus-4.6` | Only Claude Opus 4.6 via Chutes is blocked. Claude Opus 4.6 via Anthropic or other providers remains available. Other Chutes models remain available. |
| Search "K2.5", block it under Fireworks  | Only K2.5 via Fireworks is blocked. K2.5 via other providers is unaffected.                                                                           |

### Migration

For existing enterprise organizations with configured allowlists:

1. Compute the inverse of `provider_allow_list`: any provider slug NOT in the current list becomes a `provider_block_list` entry.
2. Compute the inverse of `model_allow_list`: for each model/provider combination NOT currently allowed (considering all 3 matching tiers: exact, namespace wildcard, and provider-membership wildcard via `createProviderAwareModelAllowPredicate`), add a `providerSlug:modelId` entry to `model_block_list`.
3. Write the new blocklist fields and clear the deprecated allowlist fields.
4. Run as a one-time migration script with dry-run capability for validation.

Organizations with empty allowlists (the default "allow all" state) require no migration -- the new default blocklist state is equivalent.

**Note:** The migration must use the full 3-tier matching logic from `createProviderAwareModelAllowPredicate` (not the incomplete 2-tier logic from `checkOrganizationModelRestrictions`) to accurately reflect what users currently see in the UI.

## Scope/Implementation

- **Backend**
    - Add `model_block_list` and `provider_block_list` fields to `OrganizationSettings` schema in `organization-base-types.ts`
    - Update `checkOrganizationModelRestrictions` in `llm-proxy-helpers.ts` to use blocklist logic (enterprise-only gating preserved)
    - Create new `updateBlockLists` tRPC mutation in `organization-settings-router.ts` (gated behind `organizationOwnerProcedure` + enterprise plan check), or update the existing `updateAllowLists` mutation in-place
    - Create blocklist equivalents of `createProviderAwareModelAllowPredicate` (`model-allow.server.ts`) and `isModelAllowedProviderAwareClient` (`model-allow.client.ts`)
    - Update `listAvailableModels` query to filter based on blocklist instead of allowlist
    - Update OpenRouter proxy provider filtering (currently `providerConfig.only = providerAllowList`) to use blocklist
    - Update `createAllowListsDiffMessage` audit log helper (or create blocklist equivalent) for audit logging
    - Write migration script to convert existing allowlist data to blocklist data
- **Dashboard UI**
    - Build new unified provider/model blocklist view component (replacing `ModelsTab`, `ProvidersTab`, `ProviderDetailsDialog`, `ModelDetailsDialog`)
    - Replace `useProvidersAndModelsAllowListsState` reducer and `allowLists.domain.ts` domain logic with blocklist equivalents
    - Implement provider-level block toggle
    - Implement model/provider combination block toggle
    - Add free-text search/filter with provider and model matching
    - Add blocked-items summary indicator
    - Remove or redirect old Models/Providers tab UI
- **Extension**
    - Update model selection to respect blocklist (if any client-side filtering exists)
    - Ensure `listAvailableModels` API changes are transparent to the extension

## Compliance Considerations

No new compliance concerns. This change simplifies the enforcement model while maintaining equivalent access control. The enterprise-only gating is preserved. Audit logging for blocklist changes should use the existing audit log infrastructure (the `organization.settings.change` action type).

## Features for the Future

- **Cross-provider model blocking**: Block a model ID across all current and future providers (e.g., "block anthropic/claude-opus-4.6 regardless of which provider serves it"). Deferred unless there is significant demand.
- **Per-team / per-project blocklists**: Allow different teams within an organization to have different blocklist policies.
- **Cost-based controls**: Automatically block models above a certain price threshold.
- **Temporary blocks**: Time-limited blocks for models under evaluation or during incident response.
