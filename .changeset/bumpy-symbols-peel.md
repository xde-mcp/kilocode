---
"kilo-code": patch
---

Adds project usage tracking for Teams and Enterprise customers. Organization members can view and filter usage by project. Project identifier is automatically inferred from `.git/config`. It can be overwritten by writing a `.kilocode/config.json` file with the following contents:

```json
{
	"project": {
		"id": "my-project-id"
	}
}
```
