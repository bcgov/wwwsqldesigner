import path from "node:path";
import { defineConfig } from "vitest/config";

const sourceRoot = path.resolve(process.cwd(), "../../WwwSqlDesigner/wwwroot/js");

export default defineConfig({
    resolve: {
        alias: {
            "@wwwsql": sourceRoot
        }
    },
    ssr: {
        noExternal: [sourceRoot]
    },
    server: {
        fs: {
            allow: [sourceRoot]
        },
        deps: {
            inline: [sourceRoot]
        }
    },
    test: {
        include: ["unit/**/*.test.mjs"],
        setupFiles: ["unit/setup.mjs"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            reportsDirectory: "./coverage",
            allowExternal: true,
            exclude: [
                "**/WwwSqlDesigner.Tests/Playwright/**"
            ],
            thresholds: {
                lines: 40,
                functions: 40,
                branches: 40,
                statements: 40
            }
        }
    }
});
