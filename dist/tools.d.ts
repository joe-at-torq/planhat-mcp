import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { PlanhatClient } from "./client.js";
export declare function getAllTools(): Tool[];
export declare function handleToolCall(client: PlanhatClient, name: string, args: Record<string, unknown>): Promise<unknown>;
