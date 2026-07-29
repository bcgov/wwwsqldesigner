import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    env: process.env,
    stdio: "inherit",
});

process.exit(result.status ?? 1);
