import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Seen { method: string; url: string; key: string | undefined; body: string }

export const RULE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
export const rules = () => [
  { _id: RULE_ID, name: 'Furia Stream Port 443', enabled: true, pfwd_interface: 'wan', destination_ip: '203.0.113.7', dst_port: '443', fwd: '192.168.50.206', fwd_port: '8443', proto: 'tcp_udp', src: 'any', log: false, site_id: 'secret-extra' },
];

// A pretend gateway: records every request and answers like the UDM's two APIs do.
export async function fakeUdm(overrides: Record<string, (req: IncomingMessage) => { status: number; body?: string }> = {}): Promise<{ url: string; seen: Seen[]; server: Server; close: () => Promise<void> }> {
  const seen: Seen[] = [];
  const state = rules();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const key = req.headers['x-api-key'];
      seen.push({ method: req.method ?? '', url: req.url ?? '', key: Array.isArray(key) ? key[0] : key, body });
      const path = `${req.method} ${req.url}`;
      const override = overrides[path];
      const send = (status: number, payload: string) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(payload);
      if (override) {
        const answer = override(req);
        return send(answer.status, answer.body ?? '');
      }
      const legacy = '/proxy/network/api/s/default/';
      if (path === 'GET /proxy/network/integration/v1/info') return send(200, '{"applicationVersion":"10.6.109"}');
      if (path === 'GET /proxy/network/integration/v1/sites') return send(200, '{"data":[{"name":"Default"}]}');
      if (path === `GET ${legacy}rest/portforward`) return send(200, JSON.stringify({ meta: { rc: 'ok' }, data: state }));
      if (path === `PUT ${legacy}rest/portforward/${RULE_ID}`) return send(200, JSON.stringify({ meta: { rc: 'ok' }, data: [JSON.parse(body)] }));
      if (path === `GET ${legacy}stat/health`) return send(200, '{"data":[{"subsystem":"wan","status":"ok","wan_ip":"203.0.113.7","secret":"x"}]}');
      if (path === `GET ${legacy}stat/device`) return send(200, '{"data":[{"name":"UDM","model":"UDMPRO","type":"udm","adopt_url":"x"}]}');
      if (path === `GET ${legacy}stat/sta`) return send(200, '{"data":[{"hostname":"pc","ip":"192.168.50.223","mac":"aa","icon_filename":"x"}]}');
      if (path === `GET ${legacy}empty`) return send(200, '{"meta":{"rc":"ok"}}');
      return send(404, '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return { url, seen, server, close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
