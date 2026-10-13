import { mkdir, writeFile } from "node:fs/promises";
import { samples } from "../src/samples.js";
await mkdir("output/sample-documents", { recursive: true });
for (const sample of await samples())
  await writeFile(`output/sample-documents/${sample.name}`, sample.buffer);
console.log("Synthetic sample PDFs are in output/sample-documents.");
