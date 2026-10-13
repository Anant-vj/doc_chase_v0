// MongoDB's Windows ZIP includes large debugging symbols. Local development
// needs only the signed mongod executable. Retrieve that exact official entry.
import { mkdir, access, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync, crc32 } from "node:zlib";
import { randomUUID } from "node:crypto";

export const mongoVersion = "8.0.20";
export async function mongoBinaryOptions() {
  const directory = path.resolve(".cache/mongodb-binaries");
  const options = { version: mongoVersion, downloadDir: directory };
  if (process.platform !== "win32") return options;
  const target = path.join(directory, `mongod-${mongoVersion}.exe`);
  try {
    await access(target);
    return { ...options, systemBinary: target };
  } catch {
    /* First run. */
  }
  await mkdir(directory, { recursive: true });
  const url = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${mongoVersion}.zip`;
  async function range(value) {
    const response = await fetch(url, {
      headers: { Range: `bytes=${value}` },
      signal: AbortSignal.timeout(180000),
    });
    if (response.status !== 206)
      throw new Error(
        "The official MongoDB CDN did not support a partial download.",
      );
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentRange: response.headers.get("content-range"),
    };
  }
  console.log(
    "Preparing official MongoDB runtime (excluding unused debug symbols)…",
  );
  const tail = await range("-65536");
  let eocd = -1;
  for (let i = tail.buffer.length - 22; i >= 0; i--)
    if (tail.buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Invalid official MongoDB ZIP directory.");
  const directorySize = tail.buffer.readUInt32LE(eocd + 12),
    directoryStart = tail.buffer.readUInt32LE(eocd + 16);
  if (directorySize > 10 * 1024 * 1024)
    throw new Error("Unexpected ZIP directory size.");
  const central = (
    await range(`${directoryStart}-${directoryStart + directorySize - 1}`)
  ).buffer;
  let entry;
  for (let offset = 0; offset + 46 <= central.length;) {
    if (central.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Invalid official ZIP entry.");
    const nameLength = central.readUInt16LE(offset + 28),
      extraLength = central.readUInt16LE(offset + 30),
      commentLength = central.readUInt16LE(offset + 32),
      name = central.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name.endsWith("/bin/mongod.exe"))
      entry = {
        method: central.readUInt16LE(offset + 10),
        crc: central.readUInt32LE(offset + 16),
        compressed: central.readUInt32LE(offset + 20),
        size: central.readUInt32LE(offset + 24),
        local: central.readUInt32LE(offset + 42),
      };
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (
    !entry ||
    entry.size > 256 * 1024 * 1024 ||
    entry.compressed > 128 * 1024 * 1024
  )
    throw new Error(
      "MongoDB runtime entry is missing or exceeds expected limits.",
    );
  const header = (await range(`${entry.local}-${entry.local + 1023}`)).buffer;
  if (header.readUInt32LE(0) !== 0x04034b50)
    throw new Error("Invalid runtime ZIP header.");
  const start =
      entry.local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28),
    compressed = (await range(`${start}-${start + entry.compressed - 1}`))
      .buffer;
  const executable =
    entry.method === 8
      ? inflateRawSync(compressed, { maxOutputLength: entry.size })
      : compressed;
  if (executable.length !== entry.size || crc32(executable) !== entry.crc)
    throw new Error("MongoDB runtime integrity check failed.");
  const temporary = path.join(directory, `${randomUUID()}.download`);
  await writeFile(temporary, executable);
  await rename(temporary, target);
  console.log("Official MongoDB runtime is ready.");
  return { ...options, systemBinary: target };
}
