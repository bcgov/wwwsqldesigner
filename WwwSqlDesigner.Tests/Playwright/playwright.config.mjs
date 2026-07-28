import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    timeout: 30_000,
    fullyParallel: false,
    use: {
        baseURL: "http://127.0.0.1:4173",
        browserName: "chromium",
        headless: true,
    },
    webServer: {
        command: "node static-server.mjs",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
    },
});
