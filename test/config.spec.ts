import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const OK = { UNIFI_URL: 'https://192.168.1.1', UNIFI_API_KEY: 'k' };

describe('loadConfig', () => {
  it('reads the environment; writes are off by default', () => {
    expect(loadConfig(OK)).toEqual({ udm: { baseUrl: 'https://192.168.1.1', apiKey: 'k', site: 'default', insecure: false, certSha256: undefined }, server: { allowWrite: false } });
  });
  it('reads the options', () => {
    const fp = 'ab:'.repeat(31) + 'ab';
    const c = loadConfig({ ...OK, UNIFI_SITE: 's', UNIFI_INSECURE: '1', UNIFI_ALLOW_WRITE: '1', UNIFI_CERT_SHA256: fp });
    expect(c.udm).toMatchObject({ site: 's', insecure: true, certSha256: fp });
    expect(c.server.allowWrite).toBe(true);
  });
  it('refuses what is missing or malformed, without echoing the key', () => {
    expect(() => loadConfig({ UNIFI_API_KEY: 'k' })).toThrow(ConfigError);
    expect(() => loadConfig({ UNIFI_URL: 'https://x' })).toThrow('UNIFI_API_KEY');
    expect(() => loadConfig({ ...OK, UNIFI_URL: 'nonsense' })).toThrow('not a URL');
    expect(() => loadConfig({ ...OK, UNIFI_CERT_SHA256: 'zz' })).toThrow('SHA-256');
  });
});
