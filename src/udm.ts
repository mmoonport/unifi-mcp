import { request as httpRequest } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export interface UdmOptions {
  // https://192.168.1.1 (a UDM) or http://127.0.0.1:port (tests).
  baseUrl: string;
  apiKey: string;
  site?: string;
  // A UDM's own certificate is self-signed. Accept it without checking (a LAN device you reach by address) ...
  insecure?: boolean;
  // ... or, better, pin it: the SHA-256 fingerprint of the certificate, as `openssl x509 -fingerprint -sha256` prints it (colons optional).
  certSha256?: string;
  timeoutMs?: number;
}

export class UdmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const normalise = (fingerprint: string) => fingerprint.replaceAll(':', '').toLowerCase();

// The gateway's local API (Network application): the official integration API under /proxy/network/integration/v1 and the older
// "legacy" API under /proxy/network/api/s/<site>, which the official one does not replace for port forwards. Both take the key in
// X-API-KEY. The key is only ever put in that header: it is never in a URL, an error message or a log line.
export class Udm {
  readonly site: string;

  constructor(private readonly options: UdmOptions) {
    this.site = options.site ?? 'default';
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.call<T>('GET', path);
  }

  put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.call<T>('PUT', path, body);
  }

  legacy(path: string): string {
    return `/proxy/network/api/s/${encodeURIComponent(this.site)}/${path}`;
  }

  private call<T>(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string | number> = { 'X-API-KEY': this.options.apiKey, Accept: 'application/json' };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const secure = url.protocol === 'https:';
    const options: RequestOptions = { method, headers, timeout: this.options.timeoutMs ?? 10_000 };
    if (secure) {
      const pinned = this.options.certSha256 === undefined ? undefined : normalise(this.options.certSha256);
      options.rejectUnauthorized = !(this.options.insecure || pinned);
      if (pinned !== undefined) {
        // Node does not call checkServerIdentity for a certificate it cannot chain (a UDM's own), so the pin is checked here: the request
        // is not given the socket, and so never writes the key, until the handshake is done and the fingerprint matches.
        // With its own createConnection and no agent, Node would default the port to 80: say 443 for a URL without one.
        options.port = url.port || 443;
        options.createConnection = ((connection: Parameters<typeof tlsConnect>[0], done: (error: Error | null, socket?: Socket) => void) => {
          const socket = tlsConnect(connection);
          socket.once('error', (error) => done(error));
          socket.once('secureConnect', () => {
            if (normalise(socket.getPeerCertificate().fingerprint256) === pinned) {
              socket.removeAllListeners('error');
              done(null, socket);
            } else {
              socket.destroy();
              done(new Error('The gateway certificate does not match the pinned fingerprint.'));
            }
          });
        }) as unknown as RequestOptions['createConnection'];
      }
    }
    return new Promise<T>((resolve, reject) => {
      const send = secure ? httpsRequest : httpRequest;
      const req = send(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode as number;   // always set for a client response
          if (status < 200 || status >= 300) {
            reject(new UdmError(`The gateway answered ${String(status)} to ${method} ${url.pathname}.`, status));
            return;
          }
          try {
            resolve((text === '' ? null : JSON.parse(text)) as T);
          } catch {
            reject(new UdmError(`The gateway's answer to ${method} ${url.pathname} was not JSON.`, status));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', (error) => reject(new UdmError(`Could not reach the gateway (${error.message}).`)));
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }
}
