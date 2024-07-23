export class CloudflareApiException extends Error {
  constructor(reason, status = 500) {
    super(reason);
    this.status = status;
    this.statusText = "Cloudflare API Error";
  }
}

export class Cloudflare {
  constructor(token, baseUrl = "https://api.cloudflare.com/client/v4") {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async findZone(name) {
    const { result } = await this._fetchWithToken(`zones?name=${name}`);
    if (!result?.length) {
      throw new CloudflareApiException(`Failed to find zone '${name}'`, 404);
    }
    return result[0];
  }

  async findRecord(zone, name, isIPV4 = true) {
    const rrType = isIPV4 ? "A" : "AAAA";
    const { result } = await this._fetchWithToken(
      `zones/${zone.id}/dns_records?name=${name}`,
    );
    const record = result?.find((rr) => rr.type === rrType);
    if (!record) {
      throw new CloudflareApiException(
        `Failed to find DNS record '${name}'`,
        404,
      );
    }
    return record;
  }

  async updateRecord(record, value) {
    const { result } = await this._fetchWithToken(
      `zones/${record.zone_id}/dns_records/${record.id}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...record, content: value }),
      },
    );
    return result;
  }

  async _fetchWithToken(endpoint, options = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
    });
    const body = await response.json();
    if (!body.success) {
      throw new CloudflareApiException(
        body.errors?.[0]?.message || "Unknown API error",
      );
    }
    return body;
  }

  async updateAccessGroup(account, group, ip) {
    const endpoint = `accounts/${account}/access/groups/${group}`;
    const body = {
      name: "Local IP Address",
      include: [
        {
          ip: {
            ip: `${ip}/32`,
          },
        },
      ],
    };

    const { result } = await this._fetchWithToken(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    return result;
  }
}
