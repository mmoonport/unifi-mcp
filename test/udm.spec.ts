import { afterEach, describe, expect, it } from 'vitest';
import { Udm, UdmError } from '../src/udm.js';
import { fakeUdm } from './fake-udm.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

describe('Udm', () => {
  it('sends the key in X-API-KEY only, and reads JSON', async () => {
    const fake = await fakeUdm(); close = fake.close;
    const udm = new Udm({ baseUrl: fake.url, apiKey: 'k-123' });
    expect(await udm.get('/proxy/network/integration/v1/info')).toEqual({ applicationVersion: '10.6.109' });
    expect(fake.seen[0]).toMatchObject({ method: 'GET', key: 'k-123', url: '/proxy/network/integration/v1/info' });
    expect(fake.seen[0]!.url).not.toContain('k-123');
  });

  it('PUTs a JSON body, uses the site in legacy paths', async () => {
    const fake = await fakeUdm(); close = fake.close;
    const udm = new Udm({ baseUrl: fake.url, apiKey: 'k', site: 'default' });
    expect(udm.legacy('x')).toBe('/proxy/network/api/s/default/x');
    expect(new Udm({ baseUrl: fake.url, apiKey: 'k' }).site).toBe('default');
    await udm.put(udm.legacy('rest/portforward/aaaaaaaaaaaaaaaaaaaaaaaa'), { a: 1 });
    expect(fake.seen[0]).toMatchObject({ method: 'PUT', body: '{"a":1}' });
  });

  it('errors without the key or the body of the answer', async () => {
    const fake = await fakeUdm({ 'GET /nope': () => ({ status: 401, body: 'echo k-123' }), 'GET /text': () => ({ status: 200, body: 'not json' }), 'GET /blank': () => ({ status: 200 }) });
    close = fake.close;
    const udm = new Udm({ baseUrl: fake.url, apiKey: 'k-123' });
    await expect(udm.get('/nope')).rejects.toThrow('answered 401 to GET /nope.');
    await expect(udm.get('/nope')).rejects.not.toThrow(/k-123/);
    await expect(udm.get('/text')).rejects.toBeInstanceOf(UdmError);
    expect(await udm.get('/blank')).toBeNull();
  });

  it('reports an unreachable gateway and a timeout', async () => {
    await expect(new Udm({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k' }).get('/')).rejects.toThrow('Could not reach the gateway');
    const fake = await fakeUdm(); close = fake.close;
    fake.server.removeAllListeners('request');
    fake.server.on('request', () => undefined);
    await expect(new Udm({ baseUrl: fake.url, apiKey: 'k', timeoutMs: 50 }).get('/')).rejects.toThrow('timed out');
  });
});
