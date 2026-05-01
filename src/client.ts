import axios, { AxiosInstance } from "axios";

export class PlanhatClient {
  private readonly api: AxiosInstance;
  private readonly apiToken: string;
  readonly tenantUUID?: string;

  constructor(apiToken: string, tenantUUID?: string) {
    this.apiToken = apiToken;
    this.tenantUUID = tenantUUID;
    this.api = axios.create({
      baseURL: "https://api.planhat.com",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async list(path: string, params?: Record<string, unknown>): Promise<unknown[]> {
    // When the caller supplies an explicit limit, do a single request and return as-is.
    if (params?.limit !== undefined) {
      const { data } = await this.api.get(`/${path}`, { params: stripEmpty(params) });
      return Array.isArray(data) ? data : [data];
    }

    // No explicit limit — auto-paginate until the API returns a partial page.
    const PAGE_SIZE = 1000;
    const MAX_RECORDS = 50_000;
    const results: unknown[] = [];
    let offset = typeof params?.offset === "number" ? params.offset : 0;
    const baseParams = { ...params };
    delete baseParams.offset;

    while (results.length < MAX_RECORDS) {
      const { data } = await this.api.get(`/${path}`, {
        params: stripEmpty({ ...baseParams, limit: PAGE_SIZE, offset }),
      });
      const page: unknown[] = Array.isArray(data) ? data : [];
      results.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return results;
  }

  async getById(path: string, id: string) {
    const { data } = await this.api.get(`/${path}/${id}`);
    return data;
  }

  async create(path: string, body: Record<string, unknown>) {
    const { data } = await this.api.post(`/${path}`, body);
    return data;
  }

  async update(path: string, id: string, body: Record<string, unknown>) {
    const { data } = await this.api.put(`/${path}/${id}`, body);
    return data;
  }

  async remove(path: string, id: string) {
    const { data } = await this.api.delete(`/${path}/${id}`);
    return data;
  }

  async bulkUpsert(path: string, items: Record<string, unknown>[]) {
    const { data } = await this.api.put(`/${path}`, items);
    return data;
  }

  async pushMetrics(items: Record<string, unknown>[]) {
    if (!this.tenantUUID) {
      throw new Error(
        "PLANHAT_TENANT_UUID environment variable is required to push metrics"
      );
    }
    const { data } = await axios.post(
      `https://analytics.planhat.com/dimensiondata/${this.tenantUUID}`,
      items,
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return data;
  }

  async getMetrics(params?: Record<string, unknown>): Promise<unknown[]> {
    return this.list("dimensiondata", params);
  }
}

function stripEmpty(
  obj?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}
