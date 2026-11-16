"""Use a temporary site database and vault for the entire test suite."""

import os
import sys
import tempfile
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
_STATE = tempfile.TemporaryDirectory(prefix="mydefaultsite-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_STATE.name}/test.db"
os.environ["VAULT_DIR"] = f"{_STATE.name}/vault"
os.environ["VAULT_WATCH"] = "off"
os.environ["SECRET_KEY"] = "test-secret-key"
