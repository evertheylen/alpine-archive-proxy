import { ServerResponse } from "http";
import { getIndex } from "./apk.js";
import { LOCAL_PACKAGES_DIR } from "./constants.js";
import { maybeStreamFile, safeJoin, streamFile } from "./files.js";

export async function getLocalIndex(abstractDir: string, res: ServerResponse) {
  await getIndex(abstractDir, res, 'local');
}

export async function getLocalPackage(path: string, res: ServerResponse) {
  const filePath = safeJoin(LOCAL_PACKAGES_DIR, path);
  await maybeStreamFile(filePath, res);
}
