import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { PlanhatClient } from "./client.js";

type Handler = (
  client: PlanhatClient,
  args: Record<string, unknown>
) => Promise<unknown>;

const toolHandlers = new Map<string, Handler>();
const toolDefinitions: Tool[] = [];

function add(tool: Tool, handler: Handler): void {
  toolDefinitions.push(tool);
  toolHandlers.set(tool.name, handler);
}

// ---- Shared schema fragments ----

const paginationProps = {
  limit: { type: "number", description: "Max results to return" },
  offset: { type: "number", description: "Pagination offset (starting index)" },
  sort: {
    type: "string",
    description: "Sort field name; prefix with '-' for descending (e.g. '-createDate')",
  },
  select: {
    type: "string",
    description: "Comma-separated list of fields to include in response",
  },
};

const idProp = {
  id: {
    type: "string",
    description:
      "Planhat _id, or use 'ext-{externalId}' / 'src-{sourceId}' prefixes to look up by external IDs",
  },
};

// ---- CRUD factory ----

interface ResourceDef {
  path: string;
  singular: string;
  label: string;
  createRequired?: string[];
  createProperties: Record<string, object>;
  listExtraParams?: Record<string, object>;
  bulkUpsert?: boolean;
  companyFilter?: boolean;
}

function registerCRUD(def: ResourceDef): void {
  const {
    path,
    singular,
    label,
    createRequired = [],
    createProperties,
    listExtraParams = {},
    bulkUpsert = true,
    companyFilter = true,
  } = def;

  const companyProp = companyFilter
    ? {
        companyId: {
          type: "string",
          description: "Filter by company ID (comma-separated for multiple)",
        },
      }
    : {};

  // List
  add(
    {
      name: `list_${path}`,
      description: `List ${path} from Planhat. Automatically fetches all pages and returns every matching record. Pass 'limit' to cap results to a specific count (single request, no auto-pagination).`,
      inputSchema: {
        type: "object",
        properties: {
          ...paginationProps,
          ...companyProp,
          ...listExtraParams,
        } as Record<string, object>,
      },
    },
    (client, args) => client.list(path, args)
  );

  // Get by ID
  add(
    {
      name: `get_${singular}`,
      description: `Get a single ${label} by ID.`,
      inputSchema: {
        type: "object",
        properties: idProp,
        required: ["id"],
      },
    },
    (client, args) => client.getById(path, args.id as string)
  );

  // Create
  add(
    {
      name: `create_${singular}`,
      description: `Create a new ${label} in Planhat.`,
      inputSchema: {
        type: "object",
        properties: createProperties,
        required: createRequired,
        additionalProperties: true,
      },
    },
    (client, args) => client.create(path, args)
  );

  // Update
  add(
    {
      name: `update_${singular}`,
      description: `Update an existing ${label} in Planhat. Only include fields you want to change.`,
      inputSchema: {
        type: "object",
        properties: { ...idProp, ...createProperties },
        required: ["id"],
        additionalProperties: true,
      },
    },
    (client, args) => {
      const { id, ...rest } = args;
      return client.update(path, id as string, rest);
    }
  );

  // Delete
  add(
    {
      name: `delete_${singular}`,
      description: `Delete a ${label} from Planhat.`,
      inputSchema: {
        type: "object",
        properties: idProp,
        required: ["id"],
      },
    },
    (client, args) => client.remove(path, args.id as string)
  );

  // Bulk upsert
  if (bulkUpsert) {
    add(
      {
        name: `bulk_upsert_${path}`,
        description: `Bulk create or update up to 5,000 ${path} in a single request. Match existing records by _id, sourceId, or externalId.`,
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: `Array of ${label} objects to create or update`,
              items: { type: "object" },
            },
          },
          required: ["items"],
        },
      },
      (client, args) =>
        client.bulkUpsert(path, args.items as Record<string, unknown>[])
    );
  }
}

// ---- Resource registrations ----

registerCRUD({
  path: "companies",
  singular: "company",
  label: "company (customer account)",
  createRequired: ["name"],
  listExtraParams: {
    status: { type: "string", description: "Filter by status. Use find_company_by_name when searching by name — it is much more efficient." },
  },
  createProperties: {
    name: { type: "string", description: "Company name (required for creation)" },
    externalId: { type: "string", description: "ID in your external system" },
    sourceId: { type: "string", description: "CRM integration ID (e.g. Salesforce ID)" },
    owner: { type: "string", description: "Account manager Planhat user ID" },
    coOwner: { type: "string", description: "Secondary manager Planhat user ID" },
    status: {
      type: "string",
      enum: ["prospect", "coming", "customer", "canceled", "lost"],
      description: "Company lifecycle status",
    },
    phase: { type: "string", description: "Lifecycle phase name" },
    description: { type: "string" },
    website: { type: "string" },
    country: { type: "string" },
    city: { type: "string" },
    zip: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    custom: { type: "object", description: "Custom fields as key-value pairs" },
  },
});

// Lean companies list (lightweight, read-only)
add(
  {
    name: "list_lean_companies",
    description:
      "Get a lightweight list of companies with only _id, name, externalId, and sourceId. Intended for ID lookups and bulk mapping — not for name searches. Use find_company_by_name to search by name.",
    inputSchema: {
      type: "object",
      properties: {
        externalId: { type: "string", description: "Filter by external ID" },
        sourceId: { type: "string", description: "Filter by source ID" },
        status: { type: "string", description: "Filter by status" },
      },
    },
  },
  (client, args) => client.list("leancompanies", args)
);

add(
  {
    name: "find_company_by_name",
    description:
      "Search for companies by name. Fetches the lean company list (only _id, name, externalId, sourceId) to find matches efficiently, then retrieves full details only for the current page of results. Always prefer this over list_companies when looking up a company by name. Use 'page' and 'page_size' to paginate through large result sets without flooding context.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Company name to search for (case-insensitive substring match by default)",
        },
        exact: {
          type: "boolean",
          description: "Require an exact case-insensitive match instead of substring (default: false)",
        },
        page: {
          type: "number",
          description: "Page number to return (1-based, default: 1)",
        },
        page_size: {
          type: "number",
          description: "Number of full company records to return per page (default: 5, max: 20)",
        },
      },
      required: ["name"],
    },
  },
  async (client, args) => {
    const searchName = (args.name as string).toLowerCase();
    const exact = args.exact === true;
    const pageSize = Math.min(typeof args.page_size === "number" ? args.page_size : 5, 20);
    const page = typeof args.page === "number" ? Math.max(1, args.page) : 1;

    // Step 1: fetch all lean companies (auto-paginated, minimal payload)
    const lean = (await client.list("leancompanies", {})) as Array<{
      _id: string;
      name?: string;
    }>;

    // Step 2: filter by name client-side
    const allMatches = lean.filter((c) => {
      const n = (c.name ?? "").toLowerCase();
      return exact ? n === searchName : n.includes(searchName);
    });

    const totalMatches = allMatches.length;
    const totalPages = Math.ceil(totalMatches / pageSize) || 1;
    const pageMatches = allMatches.slice((page - 1) * pageSize, page * pageSize);

    if (pageMatches.length === 0) {
      return { total_matches: totalMatches, page, total_pages: totalPages, results: [] };
    }

    // Step 3: fetch full details only for this page of matches
    const results = await Promise.all(
      pageMatches.map((c) => client.getById("companies", c._id))
    );

    return { total_matches: totalMatches, page, total_pages: totalPages, results };
  }
);

registerCRUD({
  path: "endusers",
  singular: "enduser",
  label: "end user (contact)",
  createRequired: ["companyId"],
  listExtraParams: {
    email: { type: "string", description: "Filter by email address" },
    archived: { type: "boolean", description: "Include archived end users (default: false)" },
  },
  createProperties: {
    companyId: {
      type: "string",
      description: "Parent company Planhat ID, or 'extid-...' / 'srcid-...' prefix",
    },
    email: { type: "string", description: "Email address" },
    firstName: { type: "string" },
    lastName: { type: "string" },
    name: { type: "string", description: "Full name" },
    phone: { type: "string" },
    position: { type: "string", description: "Job title" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    featured: { type: "boolean", description: "Mark as a featured contact" },
    primary: { type: "boolean", description: "Mark as the primary contact" },
    tags: { type: "array", items: { type: "string" } },
    npsUnsubscribed: { type: "boolean", description: "Opt out of NPS surveys" },
    custom: { type: "object", description: "Custom fields" },
  },
});

registerCRUD({
  path: "conversations",
  singular: "conversation",
  label: "conversation (touchpoint)",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    type: {
      type: "string",
      description: "Conversation type (e.g. call, email, meeting, chat)",
    },
    date: { type: "string", description: "ISO date string" },
    subject: { type: "string" },
    description: { type: "string", description: "Conversation notes/content" },
    ownerId: { type: "string", description: "Owner Planhat user ID" },
    users: {
      type: "array",
      items: { type: "string" },
      description: "Participant Planhat user IDs",
    },
    endusers: {
      type: "array",
      items: { type: "string" },
      description: "Participant end user IDs",
    },
    activityTags: { type: "array", items: { type: "string" } },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "notes",
  singular: "note",
  label: "note",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    note: { type: "string", description: "Note content" },
    ownerId: { type: "string", description: "Owner user ID" },
    date: { type: "string", description: "ISO date string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "tasks",
  singular: "task",
  label: "task or event",
  createRequired: ["companyId", "mainType"],
  listExtraParams: {
    isArchived: { type: "boolean", description: "Filter archived tasks (default: false)" },
    enduserIds: {
      type: "string",
      description: "Filter by end user IDs (comma-separated)",
    },
  },
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    mainType: {
      type: "string",
      enum: ["task", "event"],
      description: "Record type: task or calendar event",
    },
    action: { type: "string", description: "Task title / action description" },
    description: { type: "string" },
    ownerId: { type: "string", description: "Assigned user Planhat ID" },
    startTime: { type: "string", description: "ISO datetime string" },
    endTime: { type: "string", description: "ISO datetime string" },
    status: { type: "string" },
    repeat: {
      type: "string",
      enum: ["daily", "weekly", "monthly", "quarterly", "yearly", "custom"],
    },
    checklist: {
      type: "array",
      items: { type: "object" },
      description: "Checklist items",
    },
    externalId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "tickets",
  singular: "ticket",
  label: "ticket (support issue)",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    title: { type: "string" },
    description: { type: "string" },
    status: { type: "string" },
    priority: { type: "string" },
    ownerId: { type: "string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "nps",
  singular: "nps",
  label: "NPS survey response",
  createRequired: ["companyId"],
  listExtraParams: {
    enduserId: { type: "string", description: "Filter by end user ID" },
  },
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    enduserId: { type: "string", description: "End user who responded" },
    score: { type: "number", description: "NPS score 0–10" },
    comment: { type: "string", description: "Verbatim comment" },
    date: { type: "string", description: "ISO date string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
  },
});

registerCRUD({
  path: "opportunities",
  singular: "opportunity",
  label: "opportunity (pipeline deal)",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    title: { type: "string" },
    description: { type: "string" },
    value: { type: "number", description: "Deal value" },
    status: { type: "string" },
    closeDate: { type: "string", description: "Expected close date (ISO string)" },
    ownerId: { type: "string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "sales",
  singular: "sale",
  label: "sale (license / subscription)",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    product: { type: "string" },
    value: { type: "number", description: "Contract value" },
    mrr: { type: "number", description: "Monthly recurring revenue" },
    currency: { type: "string", description: "3-letter currency code" },
    renewalDate: { type: "string", description: "ISO date string" },
    fromDate: { type: "string", description: "Contract start (ISO date)" },
    toDate: { type: "string", description: "Contract end (ISO date)" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "projects",
  singular: "project",
  label: "project",
  createRequired: ["companyId", "name"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    name: { type: "string" },
    description: { type: "string" },
    status: { type: "string" },
    ownerId: { type: "string" },
    startDate: { type: "string", description: "ISO date string" },
    endDate: { type: "string", description: "ISO date string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "assets",
  singular: "asset",
  label: "asset (product / subscription unit)",
  createRequired: ["companyId", "name"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    name: { type: "string" },
    description: { type: "string" },
    status: { type: "string" },
    product: { type: "string", description: "Product name or SKU" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "issues",
  singular: "issue",
  label: "issue",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    title: { type: "string" },
    description: { type: "string" },
    status: { type: "string" },
    priority: { type: "string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "objectives",
  singular: "objective",
  label: "objective (success plan goal)",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    objective: { type: "string", description: "Objective title" },
    description: { type: "string" },
    status: { type: "string" },
    progress: { type: "number", description: "Completion percentage 0–100" },
    ownerId: { type: "string" },
    dueDate: { type: "string", description: "ISO date string" },
    externalId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "churns",
  singular: "churn",
  label: "churn record",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    date: { type: "string", description: "Churn date (ISO string)" },
    amount: { type: "number", description: "Churned ARR/MRR amount" },
    reason: { type: "string" },
    note: { type: "string" },
    externalId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "invoices",
  singular: "invoice",
  label: "invoice",
  createRequired: ["companyId"],
  createProperties: {
    companyId: { type: "string", description: "Company Planhat ID" },
    invoiceNumber: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string", description: "3-letter currency code" },
    dueDate: { type: "string", description: "ISO date string" },
    issuedAt: { type: "string", description: "ISO date string" },
    status: { type: "string" },
    externalId: { type: "string" },
    sourceId: { type: "string" },
    custom: { type: "object" },
  },
});

registerCRUD({
  path: "campaigns",
  singular: "campaign",
  label: "campaign",
  createRequired: ["name"],
  companyFilter: false,
  bulkUpsert: false,
  createProperties: {
    name: { type: "string" },
    description: { type: "string" },
    status: { type: "string" },
    type: { type: "string" },
    startDate: { type: "string", description: "ISO date string" },
    endDate: { type: "string", description: "ISO date string" },
    custom: { type: "object" },
  },
});

// ---- Custom Fields ----

add(
  {
    name: "list_custom_fields",
    description: "List all custom field definitions in Planhat. Auto-paginates to return all results. Pass 'limit' to cap results.",
    inputSchema: {
      type: "object",
      properties: {
        ...paginationProps,
        parent: {
          type: "string",
          description: "Filter by parent model (Company, EndUser, Asset, Project, etc.)",
        },
      },
    },
  },
  (client, args) => client.list("customfields", args)
);

add(
  {
    name: "get_custom_field",
    description: "Get a custom field definition by ID.",
    inputSchema: {
      type: "object",
      properties: idProp,
      required: ["id"],
    },
  },
  (client, args) => client.getById("customfields", args.id as string)
);

add(
  {
    name: "create_custom_field",
    description: "Create a new custom field definition in Planhat.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Field label" },
        parent: {
          type: "string",
          description:
            "Parent model this field belongs to: Company, EndUser, Asset, Project, Conversation, etc.",
        },
        type: {
          type: "string",
          enum: [
            "number",
            "text",
            "rich text",
            "checkbox",
            "day",
            "date",
            "list",
            "multipicklist",
            "team member",
            "team members",
            "rating",
            "phone",
            "email",
            "enduser",
            "endusers",
            "url",
          ],
          description: "Field data type",
        },
        isFeatured: { type: "boolean" },
        isHidden: { type: "boolean" },
        isShared: { type: "boolean" },
        isLocked: { type: "boolean" },
        isMandatory: { type: "boolean" },
        formula: { type: "string", description: "Formula expression (for computed fields)" },
        listValues: {
          type: "array",
          items: { type: "string" },
          description: "Dropdown options for list / multipicklist fields",
        },
      },
      required: ["name", "parent", "type"],
    },
  },
  (client, args) => client.create("customfields", args)
);

add(
  {
    name: "update_custom_field",
    description: "Update a custom field definition.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Custom field Planhat ID" },
        name: { type: "string" },
        isFeatured: { type: "boolean" },
        isHidden: { type: "boolean" },
        isShared: { type: "boolean" },
        isLocked: { type: "boolean" },
        isMandatory: { type: "boolean" },
        formula: { type: "string" },
        listValues: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  (client, args) => {
    const { id, ...rest } = args;
    return client.update("customfields", id as string, rest);
  }
);

add(
  {
    name: "delete_custom_field",
    description: "Delete a custom field definition.",
    inputSchema: {
      type: "object",
      properties: idProp,
      required: ["id"],
    },
  },
  (client, args) => client.remove("customfields", args.id as string)
);

// ---- Users (team members, read-only) ----

add(
  {
    name: "list_users",
    description: "List Planhat team members (users) in your workspace. Auto-paginates to return all results.",
    inputSchema: {
      type: "object",
      properties: paginationProps,
    },
  },
  (client, args) => client.list("users", args)
);

add(
  {
    name: "get_user",
    description: "Get a Planhat team member by ID.",
    inputSchema: {
      type: "object",
      properties: idProp,
      required: ["id"],
    },
  },
  (client, args) => client.getById("users", args.id as string)
);

// ---- Metrics / Dimension Data ----

add(
  {
    name: "push_metrics",
    description:
      "Push dimension data (metrics/analytics) into Planhat. Requires PLANHAT_TENANT_UUID to be configured.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Array of metric data points",
          items: {
            type: "object",
            properties: {
              dimensionId: {
                type: "string",
                description: "Metric identifier — no spaces or special characters",
              },
              value: { type: "number", description: "Numeric metric value" },
              externalId: {
                type: "string",
                description: "External ID of the Company, EndUser, Asset, or Project",
              },
              model: {
                type: "string",
                enum: ["Company", "EndUser", "Asset", "Project"],
                description: "Model to associate metric with (default: Company)",
              },
              date: {
                type: "string",
                description: "ISO date string; defaults to current time if omitted",
              },
            },
            required: ["dimensionId", "value", "externalId"],
          },
        },
      },
      required: ["items"],
    },
  },
  (client, args) => client.pushMetrics(args.items as Record<string, unknown>[])
);

add(
  {
    name: "get_metrics",
    description: "Retrieve dimension data (metrics/analytics) from Planhat. Auto-paginates to return all matching records. Pass 'limit' to cap results.",
    inputSchema: {
      type: "object",
      properties: {
        cId: { type: "string", description: "Filter by company Planhat ID" },
        dimid: { type: "string", description: "Filter by dimension ID" },
        from: { type: "number", description: "Start period (days since Unix epoch)" },
        to: { type: "number", description: "End period (days since Unix epoch)" },
        limit: { type: "number", description: "Max results" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
  },
  (client, args) => client.getMetrics(args)
);

// ---- Exports ----

export function getAllTools(): Tool[] {
  return toolDefinitions;
}

export async function handleToolCall(
  client: PlanhatClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const handler = toolHandlers.get(name);
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(client, args);
}
