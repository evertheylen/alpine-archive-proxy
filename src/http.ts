import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { IncomingMessage } from "http";


export function request(url: URL | string, opts?: {ignoreError: boolean}): Promise<IncomingMessage> {
  if (!(url instanceof URL)) url = new URL(url);

  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, (res) => {
      if (!opts?.ignoreError && (res.statusCode === undefined || res.statusCode < 100 || res.statusCode >= 300)) {
        reject(new Error(`For URL ${url}, got status ${res.statusCode}`));
      } else {
        resolve(res);
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}
