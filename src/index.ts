import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { CloudflareClient } from "./cloudflare-client";

interface Env {
  DDNS_TOKEN: string;
  ACCOUNT_ID?: string;
  ACCESS_GROUP_ID?: string;
}

class BadRequestException extends Error {
  status: number;
  statusText: string;

  constructor(reason: string) {
    super(reason);
    this.status = 400;
    this.statusText = "Bad Request";
  }
}

interface AuthCredentials {
  username?: string;
  password?: string;
}

function parseBasicAuth(request: Request): AuthCredentials {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return {};

  const [, data] = authorization?.split(" ") ?? [];
  const decoded = atob(data);
  const index = decoded.indexOf(":");

  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    throw new BadRequestException("Invalid authorization value.");
  }

  return {
    username: decoded.substring(0, index),
    password: decoded.substring(index + 1),
  };
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
    return new Response(null, { status: 204 });
  }

  if (!pathname.endsWith("/update")) {
    return new Response("Not Found.", { status: 404 });
  }

  if (!request.headers.has("Authorization") && !searchParams.has("token")) {
    return new Response("Not Found.", { status: 404 });
  }

  const { username, password } = parseBasicAuth(request);
  const token = password || searchParams.get("token");

  const hostnames = (
    searchParams.get("hostname") ||
    searchParams.get("host") ||
    searchParams.get("domains")
  )?.split(",");

  const accountId = searchParams.get("account") || env.ACCOUNT_ID;
  const accessGroupId = searchParams.get("group") || env.ACCESS_GROUP_ID;

  const ips = (
    searchParams.get("ips") ||
    searchParams.get("ip") ||
    searchParams.get("myip") ||
    request.headers.get("Cf-Connecting-Ip")
  )?.split(",");

  if (!hostnames?.length || !ips?.length) {
    throw new BadRequestException(
      "You must specify both hostname(s) and IP address(es)",
    );
  }

  const cloudflare = new CloudflareClient(token || env.DDNS_TOKEN);

  for (const ip of ips) {
    await updateDNSRecords(cloudflare, hostnames, ip.trim(), username);

    if (accountId && accessGroupId) {
      await cloudflare.updateAccessGroup(accountId, accessGroupId, ip);
    }
  }

  return new Response("good", {
    status: 200,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

async function updateDNSRecords(
  cloudflare: CloudflareClient,
  hostnames: string[],
  ip: string,
  name?: string,
): Promise<void> {
  const isIPV4 = ip.includes(".");
  const zones = new Map();

  for (const hostname of hostnames) {
    const domainName =
      name && hostname.endsWith(name)
        ? name
        : hostname.replace(/.*?([^.]+\.[^.]+)$/, "$1");

    if (!zones.has(domainName)) {
      zones.set(domainName, await cloudflare.findZone(domainName));
    }

    const zone = zones.get(domainName);
    const record = await cloudflare.findRecord(zone, hostname, isIPV4);
    await cloudflare.updateRecord(record, ip);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err: any) {
      console.error(err);
      const message = err.reason || err.message || "Unknown Error";
      return new Response(message, {
        status: err.status || 500,
        statusText: err.statusText || "Internal Server Error",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};
