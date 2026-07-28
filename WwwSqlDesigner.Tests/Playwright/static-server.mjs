import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../WwwSqlDesigner/wwwroot", import.meta.url)));
const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".xml": "application/xml; charset=utf-8",
    ".xsl": "application/xml; charset=utf-8",
};

createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(root, "." + normalize(relativePath));
    if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) {
        response.writeHead(404);
        response.end();
        return;
    }

    response.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(response);
}).listen(4173, "127.0.0.1");
