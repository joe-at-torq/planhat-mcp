export declare class PlanhatClient {
    private readonly api;
    private readonly apiToken;
    readonly tenantUUID?: string;
    constructor(apiToken: string, tenantUUID?: string);
    list(path: string, params?: Record<string, unknown>): Promise<unknown[]>;
    getById(path: string, id: string): Promise<any>;
    create(path: string, body: Record<string, unknown>): Promise<any>;
    update(path: string, id: string, body: Record<string, unknown>): Promise<any>;
    remove(path: string, id: string): Promise<any>;
    bulkUpsert(path: string, items: Record<string, unknown>[]): Promise<any>;
    pushMetrics(items: Record<string, unknown>[]): Promise<any>;
    getMetrics(params?: Record<string, unknown>): Promise<unknown[]>;
}
