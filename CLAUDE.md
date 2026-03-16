# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Cloudflare Worker that provides a UniFi-compatible DDNS API to dynamically update Cloudflare DNS A/AAAA records when a UniFi device's public IP changes. Optionally updates a Cloudflare Access group with the new IP. Forked from [workerforce/unifi-ddns](https://github.com/workerforce/unifi-ddns) with the Access group feature added on top.

## Commands

- `npm run dev` — start local dev server (wrangler dev)
- `npm run deploy` — deploy to Cloudflare Workers (wrangler deploy)
- `npm test` — run tests (vitest)
- `npm run coverage` — run tests with coverage
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` via wrangler
- `npx tsc -p tsconfig.json` — typecheck

## Architecture

Single source file `src/index.ts` using the official `cloudflare` npm SDK directly (no wrapper layer). Key functions:

- `constructClientOptions` — parses Basic Auth credentials from the request
- `constructDNSRecords` — extracts IP (`ip`, `myip`, or `ip=auto` for CF-Connecting-IP), `ip6` for dual-stack, and hostnames from query params
- `update` — verifies the API token, finds the zone (must be exactly one), looks up each DNS record, and updates it preserving existing `proxied` and `comment` settings
- `updateAccessGroup` — optionally updates a Cloudflare Access group with the requester's IP (via `ACCOUNT_ID`/`ACCESS_GROUP_ID` env vars or `account`/`group` query params)

## Deployment

Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`). Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
