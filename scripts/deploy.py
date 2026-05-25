import subprocess
import time
import json
import os
import sys

service_id = os.environ["RENDER_SERVICE_ID"]
api_key = os.environ["RENDER_API_KEY"]
base_url = f"https://api.render.com/v1/services/{service_id}"

# Trigger deploy
print("Triggering deploy...")
result = subprocess.run(
    ["curl", "-s", "-X", "POST", f"{base_url}/deploys",
     "-H", f"Authorization: Bearer {api_key}",
     "-H", "Content-Type: application/json",
     "-d", '{"clearCache": false}'],
    capture_output=True, text=True
)
print(f"Response: {result.stdout}")

# Wait for build
print("Waiting 90s for build...")
time.sleep(90)

# Check status
for attempt in range(1, 6):
    result = subprocess.run(
        ["curl", "-s", f"{base_url}/deploys",
         "-H", f"Authorization: Bearer {api_key}"],
        capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
        status = data[0].get("status", "unknown") if data else "unknown"
    except Exception:
        status = "unknown"

    print(f"Attempt {attempt} - Status: {status}")

    if status in ("live", "deployed", "update_success"):
        print("✅ Deploy successful!")
        sys.exit(0)
    if status in ("build_failed", "update_failed", "canceled"):
        print(f"❌ Deploy failed: {status}")
        sys.exit(1)

    if attempt < 5:
        print("Waiting 30s...")
        time.sleep(30)

print("⚠️ Timed out")
sys.exit(0)
