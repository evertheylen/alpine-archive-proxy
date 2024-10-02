import { access, mkdir } from "fs/promises";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
