import os
import sys
import tempfile
from pathlib import Path

# Isolated SQLite DB and offline provider for every test run (set before the app is imported).
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["SEED_DEMO"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
