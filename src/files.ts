import { createReadStream, Stats } from "fs";
import { stat, mkdir } from "fs/promises";
import { ServerResponse, OutgoingHttpHeaders } from "http";
import { join, normalize } from "path";
import { pipeline } from "stream/promises";

export async function maybeStat(filePath: string): Promise<Stats | null> {
  try {
    return await stat(filePath);
  } catch (e: any) {
    if (e.code === 'ENOENT' || e.code === 'ENOACCESS') {
      return null;
    } else {
      throw e;
    }
  }
}

// Prevent directory traversal by checking if the result is in basePath
export function safeJoin(basePath: string, ...paths: string[]) {
  const normBaseDir = normalize(basePath);
  const res = join(basePath, ...paths);
  if (!res.startsWith(normBaseDir)) {
    throw Error('no access outside basePath');
  }
  return res;
}

// Ensure the directory exists
export async function ensureDirExists(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

export function getDirectoryAndFilename(path: string) {
	const parts = path.split('/');
	const directory = parts.slice(0, -1).join('/');
	const filename = parts[parts.length-1];
  if (filename === undefined) {
    throw new Error("No filename");
  }
	return { directory, filename };
}

export async function streamFile(filePath: string, res: ServerResponse, headers?: OutgoingHttpHeaders) {
  const stream = createReadStream(filePath);
  res.writeHead(200, headers);
  await pipeline(stream, res);
  res.end();
}

export async function maybeStreamFile(filePath: string, res: ServerResponse) {
  const fileInfo = await maybeStat(filePath);
  if (fileInfo === null || !fileInfo.isFile) {
    console.error("File not found:", filePath);
    res.writeHead(404, "Not Found");
    res.end();
  } else {
    return await streamFile(filePath, res, { 'content-length': fileInfo.size });
  }
}

