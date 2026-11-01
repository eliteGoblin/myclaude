---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

<!-- Sources: ecc@d8409a4b rules/python/coding-style.md (forked 2026-10-25; prompt-audit 2026-10-25: dangling common/ pointer and missing-skill reference removed). -->

## Standards

- Follow **PEP 8** conventions
- Use **type annotations** on all function signatures

## Immutability

Prefer immutable data structures:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class User:
    name: str
    email: str

from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float
```

## Formatting

- **black** for code formatting
- **isort** for import sorting
- **ruff** for linting
