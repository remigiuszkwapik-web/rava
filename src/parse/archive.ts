import { gunzipSync, strFromU8, unzip as fflateUnzip } from "fflate";

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 3 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

export function gunzip(bytes: Uint8Array): Uint8Array {
  return gunzipSync(bytes);
}

export function unzipEntries(
  bytes: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    fflateUnzip(bytes, (err, files) =>
      err ? reject(err) : resolve(files),
    );
  });
}

export function textOf(bytes: Uint8Array): string {
  return strFromU8(bytes);
}
