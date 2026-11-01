---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

<!-- Sources: ecc@d8409a4b rules/python/testing.md (forked 2026-10-25; prompt-audit 2026-10-25: dangling common/ pointer and missing-skill reference removed). -->

## Framework

Use **pytest** as the testing framework.

## Coverage

```bash
pytest --cov=src --cov-report=term-missing
```

## Test Organization

Use `pytest.mark` for test categorization:

```python
import pytest

@pytest.mark.unit
def test_calculate_total():
    ...

@pytest.mark.integration
def test_database_connection():
    ...
```
