import { join } from "path";


export const EXTERNAL_BASE_URL = "http://dl-cdn.alpinelinux.org/alpine";
const PACKAGES_DIR = process.env.PACKAGES_DIR ?? '/packages';
export const PROXIED_PACKAGES_DIR = join(PACKAGES_DIR, 'proxied');
export const LOCAL_PACKAGES_DIR = join(PACKAGES_DIR, 'local');
