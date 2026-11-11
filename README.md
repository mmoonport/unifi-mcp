# unifi-mcp

A small [MCP](https://modelcontextprotocol.io) server for a UniFi gateway's **local** API (a UDM, UDM Pro, UCG and so on, Network 9+), written so that one person can read all of it. Nothing leaves your network. Tracked as FS-307 in the Furia Jira.

## Tools

| Tool | What it does |
|---|---|
| `unifi_info` | Network application version and sites |
| `unifi_list_port_forwards` | every port-forward rule (id, name, enabled, WAN address and port, LAN target, protocol) |
| `unifi_health` | site health by subsystem |
| `unifi_list_devices` | adopted devices (name, model, firmware, state) |
| `unifi_list_clients` | connected clients |
| `unifi_set_port_forward` | **changes the router**: enable or disable a rule, or change its LAN target (`fwd`, `fwd_port`) or WAN port (`dst_port`) |

Replies carry only chosen fields, never a whole record. There is no create or delete, and nothing for firewall, DHCP or Wi-Fi.

### How the write tool is guarded

1. **Off** unless the server starts with `UNIFI_ALLOW_WRITE=1`.
2. **Dry run by default.** It reads the rule and returns before and after; nothing is sent.
3. To apply, the call needs `dry_run=false` **and** `confirm=true`. (The tool description tells the model to do this only after the owner says to.)
4. `fwd` must be a private LAN address; ports are checked; the rule id must exist.
5. The reply carries the **previous values** and a ready `revert` call. Every applied change is logged to stderr (never the key).
6. It sends the whole rule back with only your fields changed, using the gateway's older ("legacy") `rest/portforward` endpoint, because the official integration API has no port-forward endpoints we could find. **The first real write has not been tried** (see "Status").

## Configuration (environment)

| Variable | |
|---|---|
| `UNIFI_URL` | required, e.g. `https://192.168.1.1` |
| `UNIFI_API_KEY` | required. Create it in UniFi: Settings, Control Plane, Integrations. Only ever sent as the `X-API-KEY` header |
| `UNIFI_CERT_SHA256` | recommended: pin the gateway's own certificate (its SHA-256 fingerprint). The key is not sent to any other certificate |
| `UNIFI_INSECURE` | `1` to accept the self-signed certificate without pinning |
| `UNIFI_SITE` | site name, default `default` |
| `UNIFI_ALLOW_WRITE` | `1` to enable `unifi_set_port_forward` |

Get the fingerprint: `openssl s_client -connect 192.168.1.1:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256`

## Use with Claude Code

```sh
npm ci && npm run build
claude mcp add unifi --scope user \
  -e UNIFI_URL=https://192.168.1.1 -e UNIFI_CERT_SHA256=<fingerprint> \
  -- ./scripts/run.sh
```

`scripts/run.sh` reads the key from the macOS Keychain, so it is in neither the repo nor Claude's config:

```sh
security add-generic-password -a "$USER" -s unifi-mcp -w     # asks for the key
```

Add `-e UNIFI_ALLOW_WRITE=1` only while you want changes made.

## Development

`nvm use && npm ci && npm test` (100% coverage enforced; a fake gateway and a throwaway self-signed certificate, no real router). One ticket, one branch, one PR; Conventional Commits.

## Status

Tested in simulation (fake gateway, local TLS). The read tools were exercised against a real UDM (Network 10.6.109) on 2026-11-11. **The write tool has not been run against a real gateway**; the first run should be on a harmless rule: dry run, apply a toggle, then run the `revert` it returns.
