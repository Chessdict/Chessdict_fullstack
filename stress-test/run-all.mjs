/**
 * Run all stress tests in sequence, or a specific one.
 *
 * Usage:
 *   node stress-test/run-all.mjs          # runs all tests
 *   node stress-test/run-all.mjs 01       # runs only the connection test
 *   node stress-test/run-all.mjs 06       # runs only the full load test
 *
 * Environment:
 *   STRESS_SERVER_URL=http://localhost:8080  (default)
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || null;

const testFiles = readdirSync(__dirname)
  .filter((f) => /^\d{2}-.+\.mjs$/.test(f))
  .sort();

if (testFiles.length === 0) {
  console.error("No test files found in stress-test/");
  process.exit(1);
}

const filtered = filter
  ? testFiles.filter((f) => f.startsWith(filter))
  : testFiles;

if (filtered.length === 0) {
  console.error(`No test file matching "${filter}"`);
  process.exit(1);
}

console.log(`\nStress test suite — ${filtered.length} test(s) to run`);
console.log(`Server: ${process.env.STRESS_SERVER_URL || "http://localhost:8080"}\n`);

let passed = 0;
let failed = 0;

for (const file of filtered) {
  const path = join(__dirname, file);
  console.log(`\n${"▓".repeat(60)}`);
  console.log(`  Running: ${file}`);
  console.log(`${"▓".repeat(60)}\n`);

  try {
    execSync(`node "${path}"`, {
      stdio: "inherit",
      env: { ...process.env },
      timeout: 300000, // 5 minute max per test
    });
    passed++;
  } catch (err) {
    failed++;
    console.error(`\n⚠ ${file} exited with error`);
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log(`  SUITE RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
