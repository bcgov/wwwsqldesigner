import fs from "node:fs";
import path from "node:path";

const coveragePath = path.resolve("coverage/lcov.info");
const lines = fs.readFileSync(coveragePath, "utf8").split(/\r?\n/);
const normalized = lines.map((line) => {
    if (!line.startsWith("SF:")) {
        return line;
    }

    const sourcePath = line.slice(3).replaceAll("\\", "/");
    return `SF:${sourcePath.replace("../../WwwSqlDesigner/", "WwwSqlDesigner/")}`;
}).join("\n");

fs.writeFileSync(coveragePath, normalized);

const files = new Map();
let currentFile = null;
for (const line of normalized.split("\n")) {
    if (line.startsWith("SF:")) {
        currentFile = line.slice(3);
        files.set(currentFile, []);
    } else if (line.startsWith("DA:") && currentFile) {
        const [lineNumber, hits] = line.slice(3).split(",");
        files.get(currentFile).push({
            lineNumber,
            covered: Number(hits) > 0
        });
    }
}

const escapeXml = (value) => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const report = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<coverage version="1">'
];
for (const [file, coveredLines] of files) {
    report.push(`  <file path="${escapeXml(file)}">`);
    for (const line of coveredLines) {
        report.push(`    <lineToCover lineNumber="${line.lineNumber}" covered="${line.covered}" />`);
    }
    report.push("  </file>");
}
report.push("</coverage>");
fs.writeFileSync(
    path.resolve("coverage/sonar-generic-coverage.xml"),
    report.join("\n") + "\n"
);
