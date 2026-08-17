import fs from "node:fs/promises";
import path from "node:path";
import { getMediaRoot } from "@/lib/media/catalog";

let prepared: Promise<string> | null = null;

export function getAppDataRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.APP_DATA_ROOT?.trim() || path.join(/* turbopackIgnore: true */ getMediaRoot(), ".constants-hub"));
}

export function ensureAppDataRoot() {
  prepared ??= (async () => {
    const destination = getAppDataRoot();
    const legacy = path.join(/* turbopackIgnore: true */ getMediaRoot(), ".constants-hub");
    await fs.mkdir(destination, { recursive: true });
    if (path.resolve(/* turbopackIgnore: true */ destination) !== path.resolve(/* turbopackIgnore: true */ legacy)) {
      const entries = await fs.readdir(/* turbopackIgnore: true */ destination).catch(() => []);
      if (entries.length === 0) {
        await fs.cp(/* turbopackIgnore: true */ legacy, destination, { recursive: true, force: false, errorOnExist: false }).catch(() => undefined);
      }
    }
    return destination;
  })();
  return prepared;
}
