---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Security

<!-- Sources: ecc@d8409a4b rules/typescript/security.md (forked 2026-10-25; prompt-audit 2026-10-25: dangling common/ pointer removed; security-reviewer named as an agent). -->

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.API_KEY

if (!apiKey) {
  throw new Error('API_KEY not configured')
}
```

## Agent Support

- Use the **security-reviewer** agent for comprehensive security audits
