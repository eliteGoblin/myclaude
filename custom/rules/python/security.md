---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

<!-- Sources: ecc@d8409a4b rules/python/security.md (forked 2026-10-25; prompt-audit 2026-10-25: dangling common/ pointer and missing-skill reference removed). -->

## Secret Management

```python
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ["OPENAI_API_KEY"]  # Raises KeyError if missing
```

## Security Scanning

- Use **bandit** for static security analysis:
  ```bash
  bandit -r src/
  ```
