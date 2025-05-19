import Cloudflare from "cloudflare";

export class CloudflareApiException extends Error {
  status: number;
  statusText: string;

  constructor(reason: string, status = 500) {
    super(reason);
    this.status = status;
    this.statusText = "Cloudflare API Error";
  }
}

export interface CloudflareZone {
  id: string;
  name: string;
}

export interface CloudflareDnsRecord {
  id: string;
  zone_id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export class CloudflareClient {
  private client: Cloudflare;

  constructor(token: string, baseUrl?: string) {
    this.client = new Cloudflare({
      apiToken: token,
      ...(baseUrl && { baseURL: baseUrl }),
    });
  }

  async findZone(name: string): Promise<CloudflareZone> {
    try {
      const response = await this.client.zones.list({ name });

      if (!response.result?.length) {
        throw new CloudflareApiException(`Failed to find zone '${name}'`, 404);
      }

      return {
        id: response.result[0].id,
        name: response.result[0].name,
      };
    } catch (error) {
      if (error instanceof CloudflareApiException) {
        throw error;
      }
      throw new CloudflareApiException(
        error instanceof Error ? error.message : "Unknown error finding zone",
        (error as any)?.status || 500,
      );
    }
  }

  async findRecord(
    zone: CloudflareZone,
    name: string,
    isIPV4 = true,
  ): Promise<CloudflareDnsRecord> {
    try {
      const recordType = isIPV4 ? "A" : "AAAA";
      const response = await this.client.dns.records.list({
        zone_id: zone.id,
        type: recordType,
      });

      // Filter records by name on our side since the API doesn't accept name as a direct parameter
      const records = response.result?.filter((record) => record.name === name);

      if (!records?.length) {
        throw new CloudflareApiException(
          `Failed to find DNS record '${name}'`,
          404,
        );
      }

      const record = records[0];

      return {
        id: record.id,
        zone_id: zone.id,
        type: record.type || recordType,
        name: record.name || name,
        content: record.content || "",
        proxied: record.proxied || false,
        ttl: record.ttl || 1,
      };
    } catch (error) {
      if (error instanceof CloudflareApiException) {
        throw error;
      }
      throw new CloudflareApiException(
        error instanceof Error
          ? error.message
          : "Unknown error finding DNS record",
        (error as any)?.status || 500,
      );
    }
  }

  async updateRecord(
    record: CloudflareDnsRecord,
    value: string,
  ): Promise<CloudflareDnsRecord> {
    try {
      const recordType = record.type as "A" | "AAAA";
      const response = await this.client.dns.records.edit(record.id, {
        zone_id: record.zone_id,
        type: recordType,
        name: record.name,
        content: value,
        ttl: record.ttl,
        proxied: record.proxied,
      });

      // The response type is complex and varies by record type, so we'll construct our own simplified version
      return {
        id: record.id,
        zone_id: record.zone_id,
        type: recordType,
        name: record.name,
        content: value,
        proxied: record.proxied,
        ttl: record.ttl,
      };
    } catch (error) {
      throw new CloudflareApiException(
        error instanceof Error
          ? error.message
          : "Unknown error updating DNS record",
        (error as any)?.status || 500,
      );
    }
  }

  async updateAccessGroup(
    account: string,
    group: string,
    ip: string,
  ): Promise<any> {
    try {
      // Use the raw request method instead since the typed methods don't support this endpoint directly
      const response = await this.client.put(
        `/accounts/${account}/access/groups/${group}`,
        {
          body: {
            name: "Local IP Address",
            include: [
              {
                ip: {
                  ip: `${ip}/32`,
                },
              },
            ],
          },
        },
      );

      return response;
    } catch (error) {
      throw new CloudflareApiException(
        error instanceof Error
          ? error.message
          : "Unknown error updating access group",
        (error as any)?.status || 500,
      );
    }
  }
}
