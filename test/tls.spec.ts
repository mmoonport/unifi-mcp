import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Udm } from '../src/udm.js';

let dir: string; let server: Server; let url: string; let fingerprint: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'unifi-mcp-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=udm.test'], { stdio: 'ignore' });
  const cert = readFileSync(join(dir, 'c.pem'));
  fingerprint = new X509Certificate(cert).fingerprint256;
  server = createServer({ key: readFileSync(join(dir, 'k.pem')), cert }, (_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); });

describe('a self-signed gateway certificate', () => {
  it('is refused by default', async () => {
    await expect(new Udm({ baseUrl: url, apiKey: 'k' }).get('/')).rejects.toThrow('Could not reach the gateway');
  });
  it('is accepted with insecure', async () => {
    expect(await new Udm({ baseUrl: url, apiKey: 'k', insecure: true }).get('/')).toEqual({ ok: true });
  });
  it('is accepted when pinned to its fingerprint (colons or not, any case)', async () => {
    expect(await new Udm({ baseUrl: url, apiKey: 'k', certSha256: fingerprint }).get('/')).toEqual({ ok: true });
    expect(await new Udm({ baseUrl: url, apiKey: 'k', certSha256: fingerprint.replaceAll(':', '').toLowerCase() }).get('/')).toEqual({ ok: true });
  });
  it('reports a pinned gateway that cannot be reached', async () => {
    await expect(new Udm({ baseUrl: 'https://127.0.0.1:1', apiKey: 'k', certSha256: fingerprint }).get('/')).rejects.toThrow('Could not reach the gateway');
  });
  it('a pinned URL with no port goes to 443, not 80', async () => {
    await expect(new Udm({ baseUrl: 'https://127.0.0.1', apiKey: 'k', certSha256: fingerprint }).get('/')).rejects.toThrow(/ECONNREFUSED|EACCES|reset|certificate|Could not reach/);
    await expect(new Udm({ baseUrl: 'https://127.0.0.1', apiKey: 'k', certSha256: fingerprint }).get('/')).rejects.not.toThrow('wrong version number');
  });
  it('is refused when the pin is for a different certificate, even with insecure', async () => {
    await expect(new Udm({ baseUrl: url, apiKey: 'k', insecure: true, certSha256: 'AA:'.repeat(31) + 'AA' }).get('/')).rejects.toThrow('does not match the pinned fingerprint');
  });
});
