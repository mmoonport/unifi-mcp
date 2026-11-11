#!/bin/sh
# Starts the server with the API key from the macOS Keychain (service "unifi-mcp"), so the key is never in a file or in Claude's config.
KEY=$(security find-generic-password -a "$USER" -s unifi-mcp -w 2>/dev/null) || { echo "unifi-mcp: no key in the Keychain (service unifi-mcp)" >&2; exit 1; }
export UNIFI_API_KEY="$KEY"
exec node "$(dirname "$0")/../dist/index.js"
