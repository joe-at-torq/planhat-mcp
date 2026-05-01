#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PlanhatClient } from "./client.js";
import { getAllTools, handleToolCall } from "./tools.js";

const apiToken = process.env.PLANHAT_API_TOKEN;
if (!apiToken) {
  process.stderr.write(
    "Error: PLANHAT_API_TOKEN environment variable is required.\n" +
      "Set it in your Claude Desktop config or shell environment.\n"
  );
  process.exit(1);
}

const client = new PlanhatClient(apiToken, process.env.PLANHAT_TENANT_UUID);

const server = new Server(
  { name: "planhat-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const result = await handleToolCall(
      client,
      name,
      args as Record<string, unknown>
    );
    return {
      content: [
        {
          type: "text",
          text:
            typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
