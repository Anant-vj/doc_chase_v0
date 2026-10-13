import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";

export function createStorage(config) {
  function localPath(key) {
    if (!/^[a-f0-9-]+\.(pdf|jpg|png|webp)$/.test(key))
      throw new AppError(400, "INVALID_FILE", "Invalid storage reference.");
    return path.join(config.UPLOAD_DIR, key);
  }
  async function request(method, key, body, mimeType) {
    const url = `${config.SUPABASE_URL}/storage/v1/object/${method === "GET" ? "authenticated/" : ""}${encodeURIComponent(config.SUPABASE_BUCKET)}/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        ...(mimeType ? { "Content-Type": mimeType } : {}),
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "File storage is temporarily unavailable. Please try again.",
      );
    return response;
  }
  return {
    async put(buffer, mimeType) {
      const ext = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[mimeType];
      const key = `${randomUUID()}.${ext}`;
      if (config.STORAGE_PROVIDER === "local") {
        await mkdir(config.UPLOAD_DIR, { recursive: true });
        await writeFile(localPath(key), buffer, { flag: "wx" });
      } else await request("POST", key, buffer, mimeType);
      return key;
    },
    async get(key) {
      return config.STORAGE_PROVIDER === "local"
        ? readFile(localPath(key))
        : Buffer.from(await (await request("GET", key)).arrayBuffer());
    },
    async delete(key) {
      if (config.STORAGE_PROVIDER === "local") {
        await unlink(localPath(key)).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      } else await request("DELETE", key);
    },
  };
}
