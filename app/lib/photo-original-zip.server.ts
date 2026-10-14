import { createHash } from "node:crypto";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
export type OriginalEntry = {
  file: string;
  originalName: string;
  hash: string;
};
export function readOriginalArchive(bytes: Uint8Array) {
  let unpackedSize = 0,
    rejected = false;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      unpackedSize += entry.originalSize;
      if (
        unpackedSize > 20 * 1024 * 1024 ||
        entry.originalSize > 20 * 1024 * 1024
      ) {
        rejected = true;
        return false;
      }
      return true;
    },
  });
  if (
    rejected ||
    !files["original-manifest.json"] ||
    files["original-manifest.json"].length > 100000
  )
    throw new Error("Invalid original photo ZIP.");
  const manifest = JSON.parse(strFromU8(files["original-manifest.json"])) as {
    version: number;
    originals: OriginalEntry[];
  };
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.originals) ||
    !manifest.originals.length ||
    manifest.originals.length > 200
  )
    throw new Error("Invalid original photo manifest.");
  const hashes = new Set<string>();
  for (const entry of manifest.originals) {
    if (
      !/^originals\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(entry.file) ||
      !/^[a-f0-9]{64}$/.test(entry.hash) ||
      !files[entry.file] ||
      hashes.has(entry.hash)
    )
      throw new Error("Invalid or duplicated original photo.");
    hashes.add(entry.hash);
    const image = files[entry.file];
    const valid =
      (image[0] === 255 && image[1] === 216) ||
      (image[0] === 137 &&
        image[1] === 80 &&
        image[2] === 78 &&
        image[3] === 71) ||
      (strFromU8(image.slice(0, 4)) === "RIFF" &&
        strFromU8(image.slice(8, 12)) === "WEBP");
    if (
      !valid ||
      createHash("sha256").update(image).digest("hex") !== entry.hash
    )
      throw new Error("Original photo verification failed.");
    if (
      typeof entry.originalName !== "string" ||
      entry.originalName.length > 300
    )
      throw new Error("Invalid original filename.");
  }
  if (Object.keys(files).length !== manifest.originals.length + 1)
    throw new Error("Unexpected files in original ZIP.");
  return { files, originals: manifest.originals };
}
export function mergeOriginalArchives(archives: Uint8Array[]) {
  const files: Record<string, Uint8Array> = {},
    originals: OriginalEntry[] = [],
    seen = new Set<string>();
  for (const bytes of archives) {
    const archive = readOriginalArchive(bytes);
    for (const entry of archive.originals) {
      if (seen.has(entry.hash)) continue;
      seen.add(entry.hash);
      const extension = entry.file.split(".").pop()!;
      const file = `originals/photo-${String(originals.length + 1).padStart(3, "0")}-${entry.hash.slice(0, 12)}.${extension}`;
      files[file] = archive.files[entry.file];
      originals.push({ ...entry, file });
    }
  }
  if (!originals.length) throw new Error("No original photos are available.");
  files["original-manifest.json"] = strToU8(
    JSON.stringify({ version: 1, originals }, null, 2),
  );
  return zipSync(files, { level: 0 });
}
