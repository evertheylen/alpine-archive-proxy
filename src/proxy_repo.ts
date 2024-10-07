import { createWriteStream } from 'fs';
import { ServerResponse } from 'http';
import { dirname } from 'path/posix';
import { pipeline } from 'stream/promises';
import { buildProxiedApkIndex, getIndex, newPackageAdded } from './apk.js';
import { getDirectoryAndFilename, safeJoin, ensureDirExists, maybeStat } from './files.js';
import { request } from './http.js';
import { PROXIED_PACKAGES_DIR, EXTERNAL_BASE_URL } from './constants.js';
import { streamFile } from './files.js';


export async function getProxiedPackage(path: string, res: ServerResponse) {
  const { directory, filename } = getDirectoryAndFilename(path);
  const localFilePath = safeJoin(PROXIED_PACKAGES_DIR, path);
  await ensureDirExists(dirname(localFilePath));

  const fileInfo = await maybeStat(localFilePath);

  if (fileInfo !== null && fileInfo.isFile()) {
    // Send local file with Node streams
    await streamFile(filename, res, {
      'content-type': 'application/octet-stream',
      'content-length': fileInfo.size,
      'x-fetched-from': 'local',
    });
  } else {
    // Fetch from external URL and store locally
    const externalUrl = EXTERNAL_BASE_URL + directory + '/' + filename;

    try {
      const externalReq = await request(externalUrl);

      if (externalReq.statusCode === 200) {
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': externalReq.headers['content-length'],
          'x-fetched-from': EXTERNAL_BASE_URL
        });

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


export async function getProxiedIndex(abstractDir: string, res: ServerResponse) {
  await getIndex(abstractDir, res, 'proxied');
}


export async function proxyUrl(path: string, res: ServerResponse) {
  const externalUrl = EXTERNAL_BASE_URL + path;

  try {
    const externalReq = await request(externalUrl, { ignoreError: true });
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

