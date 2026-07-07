import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export default function setup() {
  const serverDir = path.join(__dirname, "..");
  // Start from a fresh, empty test database on every run.
  fs.rmSync(path.join(serverDir, "prisma", "test.db"), { force: true });
  execSync("npx prisma db push --skip-generate", {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
