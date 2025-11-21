# Authentication System

This directory contains the reorganized authentication system for the Kilo Code CLI.

## Overview

The authentication system has been refactored to support multiple authentication methods per provider, with a focus on the new device authorization flow for Kilocode.

## Structure

```
cli/src/auth/
├── index.ts                          # Main auth wizard orchestrator
├── types.ts                          # Shared types and interfaces
├── providers/
│   ├── index.ts                      # Provider registry
│   ├── kilocode/
│   │   ├── index.ts                  # Kilocode provider exports
│   │   ├── device-auth.ts            # Device authorization flow (OAuth-like)
│   │   ├── token-auth.ts             # Manual token entry
│   │   ├── shared.ts                 # Shared Kilocode utilities
│   │   └── types.ts                  # Kilocode-specific types
│   ├── zai/
│   │   ├── index.ts                  # zAI provider exports
│   │   └── api-key-auth.ts           # zAI API key authentication
│   └── other/
│       └── index.ts                  # Manual config option
└── utils/
    ├── polling.ts                    # Generic polling utility
    ├── browser.ts                    # Browser opening utility
    └── validation.ts                 # Token/credential validation
```

## Authentication Methods

### Kilo Code (Device Auth) - Recommended

The new device authorization flow provides a seamless browser-based authentication experience:

1. CLI initiates auth request and receives a verification code
2. Browser opens automatically to the verification URL
3. User authorizes the device in their browser (where they're already logged in)
4. CLI polls for authorization status
5. Upon approval, CLI receives an API token automatically
6. User selects organization (if applicable) and model preferences
7. Configuration is saved

**Benefits:**

- No need to manually copy/paste tokens
- More secure (tokens never displayed in terminal)
- Better user experience
- Automatic token refresh capability (future)

**Usage:**

```bash
kilocode auth
# Select "Kilo Code (Recommended - Browser authentication)"
```

### Kilo Code Token - Advanced

The traditional manual token entry method is still available for advanced users or environments where browser access is limited:

1. User navigates to https://app.kilocode.ai
2. User copies API key from their profile
3. User pastes token into CLI
4. Token is validated
5. User selects organization and model preferences
6. Configuration is saved

**Usage:**

```bash
kilocode auth
# Select "Kilo Code Token (Advanced - Manual token entry)"
```

### zAI

Simple API key authentication for zAI provider.

### Other

Opens the config file for manual editing. Useful for advanced configurations or providers not yet supported by the wizard.

## Device Authorization Flow

### API Endpoints

#### POST /api/device-auth/initiate

Initiates a new device authorization request.

**Response:**

```json
{
	"code": "ABC-123",
	"verificationUrl": "https://app.kilocode.com/device-auth?code=ABC-123",
	"expiresIn": 600
}
```

#### GET /api/device-auth/poll?code=ABC-123

Polls for authorization status.

**Responses:**

- `202 Accepted` - Still pending
- `200 OK` - Approved (includes token)
- `403 Forbidden` - Denied by user
- `410 Gone` - Code expired

### Implementation Details

**Polling Strategy:**

- Interval: 2 seconds
- Timeout: Based on `expiresIn` from initiate response
- Retry: Automatic retry on transient network errors
- Progress: Real-time countdown display

**Error Handling:**

- Rate limiting (429): Clear message to wait
- Denied (403): Option to retry
- Expired (410): Restart flow
- Network errors: Automatic retry with backoff

## Adding New Providers

To add a new authentication provider:

1. Create a new directory under `providers/`
2. Implement the authentication flow
3. Export an `AuthProvider` object
4. Register in `providers/index.ts`

Example:

```typescript
// providers/newprovider/index.ts
import type { AuthProvider } from "../../types.js"

export const newProvider: AuthProvider = {
	name: "New Provider",
	value: "newprovider",
	authenticate: async () => {
		// Implement auth flow
		return {
			providerConfig: {
				id: "default",
				provider: "newprovider",
				// ... provider-specific fields
			},
		}
	},
}

// providers/index.ts
import { newProvider } from "./newprovider/index.js"

export const authProviders: AuthProvider[] = [
	// ... existing providers
	newProvider,
]
```

## Testing

Tests are located in `__tests__/` directory:

- `device-auth.test.ts` - Device authorization flow tests
- `polling.test.ts` - Polling utility tests

Run tests:

```bash
cd cli
npm test src/auth
```

## Backward Compatibility

The old authentication files have been converted to re-exports:

- `cli/src/utils/authWizard.ts` → `cli/src/auth/index.ts`
- `cli/src/utils/getKilocodeProfile.ts` → `cli/src/auth/providers/kilocode/shared.ts`
- `cli/src/utils/getKilocodeDefaultModel.ts` → `cli/src/auth/providers/kilocode/shared.ts`

Existing code importing from the old locations will continue to work.

## Configuration Format

Both authentication methods produce the same configuration structure:

```json
{
	"id": "default",
	"provider": "kilocode",
	"kilocodeToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
	"kilocodeModel": "anthropic/claude-sonnet-4",
	"kilocodeOrganizationId": "org-123" // Optional
}
```

## Security Considerations

1. **Token Storage**: Tokens are stored in `~/.kilocode/config.json` with restricted permissions
2. **Token Expiration**: Tokens are valid for 5 years but can be revoked by users
3. **Rate Limiting**: Maximum 5 pending authorization requests per IP
4. **Code Expiration**: Authorization codes expire after 10 minutes
5. **HTTPS Only**: All API communication uses HTTPS in production

## Future Enhancements

- [ ] Automatic token refresh
- [ ] Multiple profile support
- [ ] Token revocation detection and re-auth
- [ ] OAuth 2.0 PKCE flow
- [ ] Biometric authentication support
