# planhat-mcp

A self-hosted MCP (Model Context Protocol) server that gives Claude full access to the [Planhat](https://planhat.com) CRM API using your own API key.

## Prerequisites

- Node.js 18+
- Claude Desktop

## Setup

### 1. Get your Planhat credentials

**API Token** (required)
In Planhat, go to **Settings → API** and copy your API token.

**Tenant UUID** (optional — only needed for the `push_metrics` tool)
In Planhat, go to **Settings → Account Setup → Tenant Token** and copy the UUID.

### 2. Install and build

```bash
cd planhat-mcp
npm install
npm run build
```

### 3. Run the setup script

The setup script will prompt for your credentials and automatically write them to the Claude Desktop config file:

```bash
./setup.sh
```

It will ask for:
- **Planhat API Token** — required
- **Planhat Tenant UUID** — optional, press Enter to skip

The script safely merges the `planhat` entry into your existing Claude Desktop config without affecting any other MCP servers you may have configured.

### 4. Restart Claude Desktop

After the script completes, quit and reopen Claude Desktop. The Planhat tools will be available immediately.

---

## Manual configuration (alternative to setup.sh)

If you prefer to edit the config yourself, add the following to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "planhat": {
      "command": "node",
      "args": ["/absolute/path/to/planhat-mcp/dist/index.js"],
      "env": {
        "PLANHAT_API_TOKEN": "your_api_token_here",
        "PLANHAT_TENANT_UUID": "your_tenant_uuid_here"
      }
    }
  }
}
```

Replace `/absolute/path/to/planhat-mcp` with the actual path on your machine, then restart Claude Desktop.

---

## Available tools

105 tools are exposed across all major Planhat resources. Every resource supports full CRUD and bulk upsert unless noted.

### ID lookups

All `get_*` and `update_*` tools accept the `id` parameter in three forms:

| Form | Example |
|---|---|
| Planhat `_id` | `abc123` |
| External ID | `ext-sfdc_001` |
| Source ID | `src-hs_001` |

### Resources

| Resource | Tools | Notes |
|---|---|---|
| Companies | `list_companies`, `get_company`, `create_company`, `update_company`, `delete_company`, `bulk_upsert_companies` | |
| Companies (lean) | `list_lean_companies` | Lightweight list: _id, name, externalId, sourceId only |
| End Users | `list_endusers`, `get_enduser`, `create_enduser`, `update_enduser`, `delete_enduser`, `bulk_upsert_endusers` | Contacts within companies |
| Conversations | `list_conversations`, `get_conversation`, `create_conversation`, `update_conversation`, `delete_conversation`, `bulk_upsert_conversations` | Touchpoints: calls, emails, meetings |
| Notes | `list_notes`, `get_note`, `create_note`, `update_note`, `delete_note`, `bulk_upsert_notes` | |
| Tasks | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `bulk_upsert_tasks` | Tasks and calendar events |
| Tickets | `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `delete_ticket`, `bulk_upsert_tickets` | Support issues |
| NPS | `list_nps`, `get_nps`, `create_nps`, `update_nps`, `delete_nps`, `bulk_upsert_nps` | Survey responses |
| Opportunities | `list_opportunities`, `get_opportunity`, `create_opportunity`, `update_opportunity`, `delete_opportunity`, `bulk_upsert_opportunities` | Pipeline deals |
| Sales | `list_sales`, `get_sale`, `create_sale`, `update_sale`, `delete_sale`, `bulk_upsert_sales` | Licenses / subscriptions |
| Projects | `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `bulk_upsert_projects` | |
| Assets | `list_assets`, `get_asset`, `create_asset`, `update_asset`, `delete_asset`, `bulk_upsert_assets` | Product / subscription units |
| Issues | `list_issues`, `get_issue`, `create_issue`, `update_issue`, `delete_issue`, `bulk_upsert_issues` | |
| Objectives | `list_objectives`, `get_objective`, `create_objective`, `update_objective`, `delete_objective`, `bulk_upsert_objectives` | Success plan goals |
| Churns | `list_churns`, `get_churn`, `create_churn`, `update_churn`, `delete_churn`, `bulk_upsert_churns` | |
| Invoices | `list_invoices`, `get_invoice`, `create_invoice`, `update_invoice`, `delete_invoice`, `bulk_upsert_invoices` | |
| Campaigns | `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `delete_campaign` | No bulk upsert |
| Custom Fields | `list_custom_fields`, `get_custom_field`, `create_custom_field`, `update_custom_field`, `delete_custom_field` | Field definitions |
| Users | `list_users`, `get_user` | Team members (read-only) |
| Metrics | `push_metrics`, `get_metrics` | Dimension data / analytics |

## Example prompts

- *"List all customer companies in Planhat"*
- *"Create a conversation note for Acme Corp about our QBR today"*
- *"Show me all open tasks assigned to me"*
- *"What is the NPS score trend for our enterprise accounts?"*
- *"Bulk update the renewal dates for these 5 companies: ..."*
- *"Push daily active user metrics for all companies"*
