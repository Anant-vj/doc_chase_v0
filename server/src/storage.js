import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { Document, UploadAllowance } from "./models.js";

export function createStorage(config) {
  let initialization;
  async function reserveUpload(bytes) {
    if (bytes > config.MAX_FILE_SIZE_MB * 1024 * 1024)
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        `Choose a file no larger than ${config.MAX_FILE_SIZE_MB} MB.`,
      );
    initialization ??= (async () => {
      if (await UploadAllowance.exists({ _id: "application" })) return;
      // Adopt existing documents once when adding the guard to an older database.
      const [existing] = await Document.aggregate([
        { $group: { _id: null, bytes: { $sum: "$size" } } },
      ]);
      try {
        await UploadAllowance.create({
          _id: "application",
          consumedBytes: existing?.bytes || 0,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    })();
    try {
      await initialization;
    } catch (error) {
      initialization = undefined;
      throw error;
    }
    const allowance = await UploadAllowance.findOneAndUpdate(
      {
        _id: "application",
        consumedBytes: { $lte: config.UPLOAD_BUDGET_MB * 1024 * 1024 - bytes },
      },
      { $inc: { consumedBytes: bytes } },
      { returnDocument: "after" },
    );
    if (!allowance)
      throw new AppError(
        413,
        "UPLOAD_BUDGET_REACHED",
        "This prototype has reached its upload allowance. Existing documents remain available. Contact the project owner.",
      );
    // Cumulative, deliberately not refunded on deletion or ambiguous provider
    // failures. Repeated uploads cannot bypass the prototype's byte allowance.
  }
  function localPath(key) {
    if (!/^[a-f0-9-]+\.(pdf|jpg|png|webp)$/.test(key))
      throw new AppError(400, "INVALID_FILE", "Invalid storage reference.");
    return path.join(config.UPLOAD_DIR, key);
  }
  async function request(method, key, body, mimeType) {
    const bucket = encodeURIComponent(config.SUPABASE_BUCKET);
    const url = `${config.SUPABASE_URL}/storage/v1/object/${method === "GET" ? "authenticated/" : ""}${bucket}${method === "DELETE" ? "" : `/${encodeURIComponent(key)}`}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        ...(method === "DELETE"
          ? { "Content-Type": "application/json" }
          : mimeType
            ? { "Content-Type": mimeType }
            : {}),
      },
      body: method === "DELETE" ? JSON.stringify({ prefixes: [key] }) : body,
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
      await reserveUpload(buffer.length);
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
