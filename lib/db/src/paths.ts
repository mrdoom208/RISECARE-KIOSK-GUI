import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

export function findWorkspaceRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    const parent = resolve(currentDir, "..");
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return resolve(__dirname, "..", "..");
}

export const workspaceRoot = findWorkspaceRoot();
