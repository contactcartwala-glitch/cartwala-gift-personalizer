// Validate the specific uncompressed ZIP format emitted by the Cartwala Album editor.
// The public app proxy must not become a general-purpose ZIP hosting endpoint.
const MAX_BYTES = 9 * 1024 * 1024;
const decoder = new TextDecoder("utf-8");
const albumName = /^(?:\d{3}-(?:front-cover|back-cover|page)\.jpg|album-manifest\.json)$/;

export async function validateAlbumPrintArchive(file: File): Promise<boolean> {
  if (!/\.zip$/i.test(file.name) || file.size < 100 || file.size > MAX_BYTES ||
      !["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(file.type))
    return false;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 100 || bytes.length > MAX_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22; // The storefront writer emits no ZIP comments.
  if (view.getUint32(eocd, true) !== 0x06054b50 ||
      view.getUint16(eocd + 20, true) !== 0 ||
      view.getUint16(eocd + 4, true) !== 0 ||
      view.getUint16(eocd + 6, true) !== 0) return false;

  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryStart = view.getUint32(eocd + 16, true);
  if (!count || count > 100 || count !== view.getUint16(eocd + 8, true) ||
      directoryStart < 30 || directoryStart + directorySize !== eocd) return false;

  const entries = new Map<string, { offset: number; size: number }>();
  let offset = 0, pictures = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 30 > directoryStart || view.getUint32(offset, true) !== 0x04034b50)
      return false;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const size = view.getUint32(offset + 22, true);
    const nameSize = view.getUint16(offset + 26, true);
    const extraSize = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + nameSize + extraSize;
    if ((flags & 0x08) !== 0 || method !== 0 || compressed !== size ||
        nameSize === 0 || nameSize > 128 || size === 0 ||
        dataStart + size > directoryStart) return false;
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameSize));
    if (!albumName.test(name) || entries.has(name)) return false;
    if (name.endsWith(".jpg")) {
      if (size < 100 || bytes[dataStart] !== 0xff ||
          bytes[dataStart + 1] !== 0xd8 || bytes[dataStart + 2] !== 0xff) return false;
      pictures += 1;
    }
    entries.set(name, { offset, size });
    offset = dataStart + size;
  }
  if (!pictures || offset !== directoryStart) return false;

  offset = directoryStart;
  const centralNames = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50 ||
        view.getUint16(offset + 10, true) !== 0) return false;
    const nameSize = view.getUint16(offset + 28, true);
    const extraSize = view.getUint16(offset + 30, true);
    const commentSize = view.getUint16(offset + 32, true);
    const compressed = view.getUint32(offset + 20, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameSize + extraSize + commentSize;
    if (end > eocd || nameSize === 0 || nameSize > 128) return false;
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameSize));
    const local = entries.get(name);
    if (!local || centralNames.has(name) || local.size !== compressed ||
        local.offset !== localOffset) return false;
    centralNames.add(name);
    offset = end;
  }
  return offset === eocd && centralNames.size === entries.size;
}
