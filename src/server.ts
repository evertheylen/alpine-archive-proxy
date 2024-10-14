import { IncomingMessage, ServerResponse } from 'http';
import { maybeStreamFile } from './files.js';
import { getProxiedIndex, getProxiedPackage, proxyUrl } from './proxy_repo.js';
import { getLocalIndex, getLocalPackage } from './local_repo.js';
import { logins } from './index.js';
import { PUB_KEY_PATH } from './constants.js';


const APKINDEX = '/APKINDEX.tar.gz';


export function isValidLogin(authorizationHeader: string | undefined, response: ServerResponse): boolean {
  if (logins === null) {
    return true;
  }

  if (authorizationHeader === undefined) {
    response.writeHead(401, "Provide authn details");
    return false;
  }

  const [basic, encodedToken] = authorizationHeader.split(/\s+/);
  if (basic === undefined || basic?.toLowerCase() !== 'basic' || encodedToken === undefined) {
    response.writeHead(401, "Wrong authn type");
    return false;
  }

  const token = Buffer.from(encodedToken, 'base64').toString();

  if (logins.has(token)) {
    return true;
  } else {
    response.writeHead(401, "Wrong user:password combo");
    return false;
  }
}


export async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(`http://localhost${request.url}`);
  const relevantUrl = url.pathname + url.search + url.hash;
  const start = new Date();
  console.log(`[${process.pid} :: ${start.toISOString()}] ${request.method ?? 'no method'} ${relevantUrl}`)

  try {
    if (request.method === undefined || request.url === undefined || request.method.toUpperCase() !== 'GET') {
      response.writeHead(405, "Method not allowed");
      return;
    }
  
    if (!isValidLogin(request.headers['authorization'], response)) {
      return;
    }


    // routing!
    if (url.pathname === '/' || url.pathname === '') {
      // --- INDEX ---
      response.writeHead(200, 'OK', {'content-type': 'text/html'});
      response.end(
        '<html><head><title>alpine-archive-proxy</title></head>'
        + '<body>This server is running <a href="https://github.com/evertheylen/alpine-archive-proxy">alpine-archive-proxy</a>.<br/>'
        + `Interesting URLs may be <a href="/proxied/">/proxied/</a>, <a href="/local/">/local/</a>, and <a href="${PUB_KEY_PATH}">${PUB_KEY_PATH}</a>.`
        + '</body></html>'
      );
    } else if (url.pathname === PUB_KEY_PATH) {
      // --- PUBLIC KEY ---
      await maybeStreamFile(PUB_KEY_PATH, response);

    } else if (url.pathname.startsWith('/proxied')) {
      const path = url.pathname.slice('/proxied'.length);

      // --- PROXIED REPOs ---
      if (path.endsWith('.apk')) {
        return await getProxiedPackage(path, response);
      } else if (path.endsWith(APKINDEX)) {
        return await getProxiedIndex(path.slice(0, -APKINDEX.length), response);
      } else {
        return await proxyUrl(path, response);
      }

    } else if (url.pathname.startsWith('/local')) {
      const path = url.pathname.slice('/local'.length);

      // --- LOCAL REPOS ---
      if (url.pathname.endsWith('.apk')) {
        return await getLocalPackage(path, response);
      } else if (url.pathname.endsWith(APKINDEX)) {
        return await getLocalIndex(path.slice(0, -APKINDEX.length), response);
      } else {
        response.writeHead(404, "Wrong filetype");
        response.end();
        return;
      }
    }
  } catch (error: any) {
    if (response.headersSent) {
      console.error(`ERROR for ${url} (after headers were sent):`, error);
    } else {
      response.writeHead(500, error?.toString() ?? 'Unknown error');
      response.end();
      console.error(`ERROR for ${url}:`, error);
    }
    console.error("STACK:", error.stack);
    
    return;
  } finally {
    response.end();

    const end = new Date();
    const ms = (end.getTime() - start.getTime()).toFixed(1);
    console.log(`[${process.pid} :: ${(new Date()).toISOString()}] ${relevantUrl} <- ${response.statusCode ?? '???'} ${response.statusMessage ?? ''} -- took ${ms}ms`);
  }
}
