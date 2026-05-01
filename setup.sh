#!/usr/bin/env bash
set -euo pipefail

# ---- Colors ----
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ---- Paths ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PATH="$SCRIPT_DIR/dist/index.js"
CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

echo ""
echo -e "${BOLD}${CYAN}Planhat MCP — Setup${RESET}"
echo "=============================="
echo ""

# ---- Check build output exists ----
if [ ! -f "$SERVER_PATH" ]; then
  echo -e "${RED}Error:${RESET} ${SERVER_PATH} not found."
  echo ""
  echo -e "Run ${BOLD}npm install && npm run build${RESET} first, then re-run this script."
  exit 1
fi

echo -e "Server binary : ${BOLD}${SERVER_PATH}${RESET}"
echo -e "Claude config : ${BOLD}${CONFIG_FILE}${RESET}"
echo ""
echo -e "Find your credentials in ${BOLD}Planhat → Settings → API${RESET}"
echo ""

# ---- Prompt for API token (required) ----
while true; do
  read -rp "$(echo -e "${BOLD}Planhat API Token${RESET} (required): ")" API_TOKEN
  if [ -n "$API_TOKEN" ]; then
    break
  fi
  echo -e "${RED}API token cannot be empty. Please try again.${RESET}"
done

# ---- Prompt for Tenant UUID (optional) ----
echo ""
echo -e "${YELLOW}Tenant UUID is only needed for the push_metrics tool.${RESET}"
echo -e "Find it in Planhat → Settings → Account Setup → ${BOLD}Tenant Token${RESET}."
read -rp "$(echo -e "${BOLD}Planhat Tenant UUID${RESET} (press Enter to skip): ")" TENANT_UUID

# ---- Write config via Python (avoids jq dependency) ----
echo ""

export _PLANHAT_TOKEN="$API_TOKEN"
export _PLANHAT_UUID="$TENANT_UUID"
export _PLANHAT_PATH="$SERVER_PATH"
export _PLANHAT_CONFIG="$CONFIG_FILE"

python3 << 'PYEOF'
import json, os, sys

config_path = os.environ["_PLANHAT_CONFIG"]
server_path = os.environ["_PLANHAT_PATH"]
api_token   = os.environ["_PLANHAT_TOKEN"]
tenant_uuid = os.environ.get("_PLANHAT_UUID", "").strip()

# Ensure the directory exists (Claude Desktop may not have been run yet)
os.makedirs(os.path.dirname(config_path), exist_ok=True)

# Load existing config, preserving any other MCP servers
config = {}
if os.path.exists(config_path):
    try:
        with open(config_path) as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Warning: could not parse existing config ({e}). Starting fresh.")

if "mcpServers" not in config:
    config["mcpServers"] = {}

env = {"PLANHAT_API_TOKEN": api_token}
if tenant_uuid:
    env["PLANHAT_TENANT_UUID"] = tenant_uuid

action = "Updated" if "planhat" in config["mcpServers"] else "Added"

config["mcpServers"]["planhat"] = {
    "command": "node",
    "args": [server_path],
    "env": env,
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")

other_servers = [k for k in config["mcpServers"] if k != "planhat"]
print(f"{action} 'planhat' entry in: {config_path}")
if other_servers:
    print(f"Preserved existing servers: {', '.join(other_servers)}")
PYEOF

echo ""
echo -e "${GREEN}${BOLD}Done!${RESET} Restart Claude Desktop to activate the Planhat MCP server."
echo ""
echo -e "  ${BOLD}105 Planhat tools${RESET} will be available across all API resources:"
echo -e "  companies, contacts, conversations, tasks, notes, tickets, NPS,"
echo -e "  opportunities, sales, projects, assets, issues, objectives,"
echo -e "  churns, invoices, campaigns, custom fields, users, and metrics."
echo ""
