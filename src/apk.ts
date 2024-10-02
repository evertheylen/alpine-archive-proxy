import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { request } from './http.js';
import { EXTERNAL_BASE_URL, PACKAGES_DIR } from './server.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { ensureDirExists } from './files.js';
import cluster from 'cluster';


const REBUILD_INDEX_AFTER_MS = 60000;


export const NEW_PACKAGE_ADDED = 'NEW_PACKAGE_ADDED' as const;
export type NewPackageAddedMessage = { type: typeof NEW_PACKAGE_ADDED, data: { path: string }};
// only for primary in cluster!
const scheduledPathsToRebuild = new Set<string>();


export async function newPackageAdded(path: string) {
  if (cluster.isPrimary) {
    if (!scheduledPathsToRebuild.has(path)) {
      scheduledPathsToRebuild.add(path);
      setTimeout(() => buildApkIndex(path), REBUILD_INDEX_AFTER_MS);
    }
  } else {
    const msg: NewPackageAddedMessage = { type: NEW_PACKAGE_ADDED, data: { path } };
    process.send!(msg);
  }
}


export async function findApkDirs(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  const apkDirs = new Set();

  for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
          const subDirApkDirs = await findApkDirs(fullPath);
          subDirApkDirs.forEach(d => apkDirs.add(d));
      } else if (entry.isFile() && entry.name.endsWith('.apk')) {
          apkDirs.add(dir);  // Add the directory if it contains .apk files
      }
  }

  return apkDirs;
}


// Function to run the apk index command
export async function buildApkIndex(abstractDir: string) {
  const arch = basename(abstractDir);
  const localDir = join(PACKAGES_DIR, abstractDir);
  await ensureDirExists(localDir);

  return new Promise<boolean>(async (resolve, reject) => {
    try {
      // Get the list of .apk files in the directory
      const files = (await readdir(localDir)).filter(file => file.endsWith('.apk')).map(file => `./${file}`);

      // Get original APKINDEX
      const req = await request(EXTERNAL_BASE_URL + abstractDir + '/APKINDEX.tar.gz');

      const writeStream = createWriteStream(localDir + '/ORIG_APKINDEX.tar.gz');
      await pipeline(req, writeStream);

      // TODO: --allow-untrusted necessary for old Alpine versions?
      const args = ['index', '--allow-untrusted', '--no-interactive', '--merge', '-x', 'ORIG_APKINDEX.tar.gz', '-o', 'APKINDEX.tar.gz', '--rewrite-arch', arch, ...files];
      const apkIndexProcess = spawn('apk', args, { cwd: localDir });

      // apkIndexProcess.stdout.on('data', (data) => {
      //   console.log(`apk stdout: ${data}`);
      // });

      apkIndexProcess.stderr.on('data', (data) => {
        for (const l of data.toString().split('\n')) {
          console.error(`apk stderr: ${l}`);
        }
      });

      apkIndexProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Successfully indexed .apk files in ${localDir} for architecture ${arch}`);
          resolve(true);
        } else {
          reject(new Error(`apk index process exited with code ${code}`));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

