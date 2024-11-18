import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { request } from './http.js';
import { EXTERNAL_BASE_URL, LOCAL_PACKAGES_DIR, PRIV_KEY_PATH, PROXIED_PACKAGES_DIR } from './constants.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { ensureDirExists, maybeStat, safeJoin, streamFile } from './files.js';
import cluster from 'cluster';
import { ServerResponse } from 'http';


const REBUILD_INDEX_AFTER_MS = 60000;


export const NEW_PACKAGE_ADDED = 'NEW_PACKAGE_ADDED' as const;
export type NewPackageAddedMessage = { type: typeof NEW_PACKAGE_ADDED, data: { path: string }};
// only for primary in cluster!
const scheduledPathsToRebuild = new Set<string>();


export async function newPackageAdded(path: string) {
  if (cluster.isPrimary) {
    if (!scheduledPathsToRebuild.has(path)) {
      scheduledPathsToRebuild.add(path);
      setTimeout(() => buildProxiedApkIndex(path), REBUILD_INDEX_AFTER_MS);
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


function runCommand(cmdline: string[], options?: SpawnOptionsWithoutStdio) {
  return new Promise<boolean>((resolve, reject) => {
    const process = spawn(cmdline[0]!, cmdline.slice(1), options);

    process.stderr.on('data', (data) => {
      for (const l of data.toString().split('\n')) {
        console.error(`${cmdline[0]} stderr: ${l}`);
      }
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`${cmdline[0]} index process exited with code ${code}`));
      }
    });
  });
}


// Function to run the apk index command
export async function buildProxiedApkIndex(abstractDir: string) {
  const arch = basename(abstractDir);
  const localDir = safeJoin(PROXIED_PACKAGES_DIR, abstractDir);
  await ensureDirExists(localDir);

  // Get the list of .apk files in the directory
  const files = (await readdir(localDir)).filter(file => file.endsWith('.apk')).map(file => `./${file}`);

  // Get original APKINDEX
  const req = await request(EXTERNAL_BASE_URL + abstractDir + '/APKINDEX.tar.gz');

  const writeStream = createWriteStream(localDir + '/ORIG_APKINDEX.tar.gz');
  await pipeline(req, writeStream);

  await runCommand(
    ['apk', 'index', '--no-interactive', '--merge', '-x', 'ORIG_APKINDEX.tar.gz', '-o', 'APKINDEX.tar.gz', '--rewrite-arch', arch, ...files],
    { cwd: localDir }
  );
  console.log(`Successfully indexed .apk files in ${localDir} for architecture ${arch}`);

  await runCommand(
    ['abuild-sign', '-k', PRIV_KEY_PATH, `${localDir}/APKINDEX.tar.gz`]
  );
  console.log(`Successfully signed APKINDEX in ${localDir} for architecture ${arch}`);
}


export async function buildLocalApkIndex(abstractDir: string) {
  const arch = basename(abstractDir);
  const localDir = safeJoin(LOCAL_PACKAGES_DIR, abstractDir);
  
  const files = (await readdir(localDir)).filter(file => file.endsWith('.apk')).map(file => `./${file}`);

  await runCommand(
    ['apk', 'index', '--allow-untrusted', '--no-interactive', '-o', 'APKINDEX.tar.gz', '--rewrite-arch', arch, ...files],
    { cwd: localDir }
  );
  console.log(`Successfully indexed .apk files in ${localDir} for architecture ${arch}`);

  await runCommand(
    ['abuild-sign', '-k', PRIV_KEY_PATH, `${localDir}/APKINDEX.tar.gz`]
  );
  console.log(`Successfully signed APKINDEX in ${localDir} for architecture ${arch}`);
}


export async function getIndex(abstractDir: string, res: ServerResponse, type: 'local' | 'proxied') {
  const baseDir = type === 'local' ? LOCAL_PACKAGES_DIR : PROXIED_PACKAGES_DIR;
  const localDir = safeJoin(baseDir, abstractDir);
  const localIndexPath = safeJoin(localDir, "APKINDEX.tar.gz");
  const pathInfo = await maybeStat(localDir);
  if (pathInfo === null) {
    // if (type === 'local') {
    //   res.writeHead(404, 'Not Found');
    //   res.end();
    //   return;
    // }
    await ensureDirExists(localDir);
  } else if (!pathInfo.isDirectory) {
    res.writeHead(500, "Need a directory to build index");
    return;
  }

  let indexInfo = await maybeStat(localIndexPath);

  const rebuild = async () => {
    await (type === 'local' ? buildLocalApkIndex : buildProxiedApkIndex)(abstractDir);
    indexInfo = await stat(localIndexPath);
  }

  if (indexInfo === null) {
    await rebuild();
  } else if (!indexInfo.isFile) {
    throw new Error("APKINDEX is not a file?");
  } else {
    const apks = (await readdir(localDir)).filter(file => file.endsWith('.apk'));
    const apkStats = await Promise.all(apks.map((fn) => stat(join(localDir, fn))));
    const shouldRebuild = apkStats.some(s => s.mtimeMs > indexInfo!.mtimeMs);
    if (shouldRebuild) {
      await rebuild();
    }
  }

  await streamFile(localIndexPath, res, {
    'content-length': indexInfo!.size,
    'content-type': 'application/octet-stream'
  });
}
