import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Server Config
HOST = os.getenv("FIRE_SERVICE_HOST", "0.0.0.0")
PORT = int(os.getenv("FIRE_SERVICE_PORT", "5005"))

# Emergency Service Notification Config
# In TEST_MODE (default True), SMS and Voice calls are simulated and logged safely
TEST_MODE = os.getenv("TEST_MODE", "true").lower() in ("true", "1", "yes")
FIRE_RESPONSE_PHONE = os.getenv("FIRE_RESPONSE_PHONE", "+15550199")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "+15550100")

# Node.js backend URL for state synchronization
NODE_SERVER_URL = os.getenv("NODE_SERVER_URL", "http://localhost:3000")

# Detection Thresholds
CONFIDENCE_THRESHOLD = float(os.getenv("FIRE_CONFIDENCE_THRESHOLD", "0.60"))
SMOKE_CONFIDENCE_THRESHOLD = float(os.getenv("SMOKE_CONFIDENCE_THRESHOLD", "0.50"))
CONSECUTIVE_FRAMES_REQUIRED = int(os.getenv("CONSECUTIVE_FRAMES_REQUIRED", "2"))
DEDUPLICATION_WINDOW_SECONDS = int(os.getenv("DEDUPLICATION_WINDOW_SECONDS", "60"))

# Storage paths
SNAPSHOT_DIR = BASE_DIR / "snapshots"
SNAPSHOT_DIR.mkdir(exist_ok=True)
