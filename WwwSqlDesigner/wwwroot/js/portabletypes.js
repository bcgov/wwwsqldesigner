/* Canonical, persisted column types. Dialect adapters are import/export only. */
SQL.PortableTypes = {
    format: "portable-v1",
    tokens: ["integer", "decimal", "float", "string", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary", "uuid", "json", "xml"],
    sourceAdapters: {},
    targetAdapters: {},
    registry: function () {
        const groups = [["Numeric", "integer decimal float"], ["Text", "string text json xml"], ["Date and Time", "date time datetime datetime-with-time-zone"], ["Other", "boolean binary uuid"]];
        let xml = '<datatypes db="portable">';
        groups.forEach(function (group) { xml += '<group label="' + group[0] + '" color="#eeeeaa">'; group[1].split(" ").forEach(function (token) { xml += '<type label="' + token + '" length="' + (/^(decimal|string|binary)$/.test(token) ? "1" : "0") + '" sql="' + token + '" quote="' + (/^(string|text|json|xml|binary)$/.test(token) ? "&apos;" : "") + '" />'; }); xml += "</group>"; });
        return new DOMParser().parseFromString(xml + "</datatypes>", "text/xml").documentElement;
    },
    split: function (value) { const match = (value || "").trim().match(/^([^()]+?)(?:\((.*)\))?$/); return { name: match ? match[1].trim() : "", facets: match && match[2] ? match[2].trim() : "" }; },
    source: function (dialect, value) { const parsed = this.split(value); const kind = (this.sourceAdapters[(dialect || "").toLowerCase()] || {})[parsed.name.toLowerCase().replace(/\s+/g, " ")]; return kind ? { kind: kind, facets: parsed.facets } : null; },
    canonical: function (value) { const parsed = this.split(value); const kind = parsed.name.toLowerCase(); return this.tokens.indexOf(kind) !== -1 ? { kind: kind, facets: parsed.facets } : null; },
    formatToken: function (type) { return type.kind + (type.facets ? "(" + type.facets + ")" : ""); },
    map: function (type, target) {
        const dialect = (target || "").toLowerCase(); const result = { type: "", diagnostics: [], safe: true }; result.type = (this.targetAdapters[dialect] || {})[type.kind];
        if (!result.type) { result.diagnostics.push(this.formatToken(type) + " cannot be represented by " + dialect + "."); result.safe = false; return result; }
        if (type.facets && /^(decimal|string|binary)$/.test(type.kind) && !/\(/.test(result.type)) { result.type += "(" + type.facets + ")"; }
        if (type.kind === "decimal" && type.facets && ["sqlite", "vfp9"].indexOf(dialect) !== -1) { result.diagnostics.push("Precision and scale are not enforced by " + dialect + "."); }
        if (type.kind === "datetime-with-time-zone" && ["mssql", "postgresql", "oracle", "sqlalchemy", "ef"].indexOf(dialect) === -1) { result.diagnostics.push("Time-zone semantics are not preserved by " + dialect + "."); }
        return result;
    }
};
