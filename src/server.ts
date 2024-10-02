import { createServer, IncomingMessage, ServerResponse } from 'http';
import { pipeline } from 'stream/promises';
import { request } from './http.js';
import { dirname, join } from 'path';
import { ensureDirExists, fileExists, getDirectoryAndFilename } from './files.js';
import { createReadStream, createWriteStream } from 'fs';
import { buildApkIndex, newPackageAdded } from './apk.js';


export const EXTERNAL_BASE_URL = "http://dl-cdn.alpinelinux.org/alpine";
export const PACKAGES_DIR = process.env.PACKAGES_DIR ?? '/packages';


async function getPackage(url: URL, res: ServerResponse) {
  const { directory, filename } = getDirectoryAndFilename(url.pathname);
  const localFilePath = join(PACKAGES_DIR, url.pathname);
  await ensureDirExists(dirname(localFilePath));

  if (await fileExists(localFilePath)) {
    // Send local file with Node streams
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Fetched-From': 'local' });
    try {
      await pipeline(createReadStream(localFilePath), res);
    } catch (err) {
      console.error('Error sending local file:', err);
      // skipping...
    }
    res.end();
  } else {
    // Fetch from external URL and store locally
    const externalUrl = EXTERNAL_BASE_URL + directory + '/' + filename;

    try {
      const externalReq = await request(externalUrl);

      if (externalReq.statusCode === 200) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Fetched-From': EXTERNAL_BASE_URL });
  
        const writeStream = createWriteStream(localFilePath);
        try {
          // Stream to both client and file
          await Promise.all([
            pipeline(externalReq, res),
            pipeline(externalReq, writeStream)
          ]);
          res.end();
        } catch (err) {
          console.error('Error fetching and storing file:', err);
          res.writeHead(500);
          res.end('Error during file handling');
          writeStream.destroy();
        }
        
        // notify we got a new package
        await newPackageAdded(directory);
      } else {
        res.writeHead(externalReq.statusCode || 500);
        res.end('Error downloading file');
      }
    } catch (err) {
      console.error('Error with external request:', err);
      res.writeHead(500);
      res.end('Error fetching file');
    }
  }
}


async function getIndex(url: URL, res: ServerResponse) {
  const { directory, filename } = getDirectoryAndFilename(url.pathname);
  const localDir = join(PACKAGES_DIR, directory);
  
  console.log("Building index for", localDir);
  if (!(await fileExists(localDir))) {
    await buildApkIndex(directory);
  }

  res.writeHead(200, "Found");
  const stream = createReadStream(join(localDir, "APKINDEX.tar.gz"));
  await pipeline(stream, res);
  res.end();
}


async function proxyUrl(url: URL, res: ServerResponse) {
  const externalUrl = EXTERNAL_BASE_URL + url.pathname;

  try {
    const externalReq = await request(externalUrl, {ignoreError: true});
    res.writeHead(externalReq.statusCode || 500, externalReq.headers);

    try {
      await pipeline(externalReq, res, {});
    } catch (err) {
      console.error('Error while proxying:', err);
      res.end();
      // ignoring
    }
  } catch (err) {
    console.error('Error fetching file:', err);
    res.writeHead(500);
    res.end(`Error fetching file: ${err}`);
  }
}


export async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(`http://localhost${request.url}`);
  const relevantUrl = url.pathname + url.search + url.hash;
  const start = new Date();
  console.log(`[${start.toISOString()}] ${request.method ?? 'no method'} ${relevantUrl}`)

  if (request.method === undefined || request.url === undefined || request.method.toUpperCase() !== 'GET') {
    response.writeHead(405, "Method not allowed");
    response.end();
    return;
  }

  try {
    if (url.pathname.endsWith('.apk')) {
      return await getPackage(url, response);
    } else if (url.pathname.endsWith('/APKINDEX.tar.gz')) {
      return await getIndex(url, response);
    } else {
      return await proxyUrl(url, response);
    }
  } catch (error: any) {
    response.writeHead(500, error?.toString() ?? 'Unknown error');
    response.end();
    return;
  } finally {
    const end = new Date();
    const ms = (end.getTime() - start.getTime()).toFixed(1);
    console.log(`[${(new Date()).toISOString()}] ${relevantUrl} <- ${response.statusCode ?? '???'} ${response.statusMessage ?? ''} -- took ${ms}ms`);
  }
}


// async function startServer() {
//   try {
//     // Your existing server code here
//     const server = createServer(handle);
//     server.listen(PORT, () => {
//       console.log(`Server running on http://localhost:${PORT}`);
//     });

//     // Handle shutdown gracefully
//     process.on('SIGINT', () => {
//       console.log('Shutting down...');
//       server.close(() => {
//         console.log('Server closed');
//         process.exit(0);
//       });
//     });
//   } catch (error) {
//     console.error('Error starting server:', error);
//     // Wait for a bit before restarting to avoid rapid crashes
//     setTimeout(startServer, 500);
//   }
// };

// // Initial server start
// process.on('uncaughtException', (err) => {
//   console.error('Uncaught Exception:', err);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// });

// startServer();
