import type { ServerOptions } from './tools.js';
import type { UdmOptions } from './udm.js';

export class ConfigError extends Error {}

// Everything comes from the environment. The key is read here and goes nowhere but the X-API-KEY header.
export function loadConfig(env: NodeJS.ProcessEnv): { udm: UdmOptions; server: ServerOptions } {
  const baseUrl = env.UNIFI_URL?.trim();
  const apiKey = env.UNIFI_API_KEY?.trim();
  if (!baseUrl) throw new ConfigError('UNIFI_URL is required, for example https://192.168.1.1.');
  if (!apiKey) throw new ConfigError('UNIFI_API_KEY is required.');
  try {
    new URL(baseUrl);
  } catch {
    throw new ConfigError('UNIFI_URL is not a URL.');
  }
  const certSha256 = env.UNIFI_CERT_SHA256?.trim() || undefined;
  if (certSha256 !== undefined && !/^([0-9a-f]{2}:?){32}$/i.test(certSha256)) throw new ConfigError('UNIFI_CERT_SHA256 must be a SHA-256 fingerprint (64 hex digits, colons optional).');
  return {
    udm: { baseUrl, apiKey, site: env.UNIFI_SITE?.trim() || 'default', insecure: env.UNIFI_INSECURE === '1', certSha256 },
    server: { allowWrite: env.UNIFI_ALLOW_WRITE === '1' },
  };
}
