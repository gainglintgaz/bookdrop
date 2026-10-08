import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { MAX_FILE_BYTES } from './storage.mjs';

/** Local-only HTTP boundary. Configuration arrives in memory, never via dotenv.
 * A development proxy must preserve Host and Origin from the one allowed origin.
 * This is not the Cloudflare deployment adapter.
 */
export async function startLocalHttp({ api, origin, port }) {
  const url = new URL(origin);
  const listenPort = port ?? Number(url.port || 80);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || !Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535 || typeof api !== 'function') {
    throw new Error('LOCAL_HTTP_CONFIGURATION_REQUIRED');
  }
  const server = createServer({ requestTimeout: 20000, headersTimeout: 10000 }, async (incoming, outgoing) => {
    const reject = (code, status) => {
      outgoing.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
      outgoing.end(JSON.stringify({ code }));
    };
    try {
      if (incoming.headers.host !== url.host || !incoming.url?.startsWith('/') || incoming.url.startsWith('//') || incoming.url.includes('\\')) {
        reject('FORBIDDEN', 403); return;
      }
      const length = incoming.headers['content-length'];
      const fileUpload=/^\/api\/bookdrop\/(?:portal\/)?clients\/[0-9a-f-]{36}\/(?:requirements\/[0-9a-f-]{36}\/upload|letters\/upload)$/.test(incoming.url);
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > (fileUpload ? MAX_FILE_BYTES : 65536))) {
        reject('PAYLOAD_TOO_LARGE', 413); return;
      }
      const headers = new Headers();
      // No forwarded identity, Authorization, provider headers or arbitrary Host.
      for (const name of ['content-type','content-length','cookie','origin','sec-fetch-site','x-bookdrop-filename','x-bookdrop-year','x-bookdrop-month','x-bookdrop-label','x-bookdrop-portal']) {
        const value = incoming.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      const hasBody = !['GET', 'HEAD'].includes(incoming.method);
      const request = new Request(`${url.origin}${incoming.url}`, {
        method: incoming.method, headers,
        ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
      });
      const response = await api(request);
      for (const [name, value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name, value);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
      outgoing.writeHead(response.status);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) reject('UNAVAILABLE', 503);
      else outgoing.destroy();
    }
  });
  server.maxHeadersCount = 50;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return server;
}
