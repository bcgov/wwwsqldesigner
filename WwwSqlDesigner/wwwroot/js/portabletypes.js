/* Canonical, persisted column types. Dialect adapters are import/export only. */
SQL.PortableTypes = {
    format: "portable-v1",
    tokens: ["integer", "decimal", "float", "string", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary", "uuid", "json", "xml"],
    sourceAdapters: {
        mssql: { tinyint:"integer", smallint:"integer", int:"integer", bigint:"integer", money:"decimal", smallmoney:"decimal", decimal:"decimal", numeric:"decimal", real:"float", float:"float", char:"string", varchar:"string", nchar:"string", nvarchar:"string", text:"text", ntext:"text", bit:"boolean", date:"date", time:"time", datetime:"datetime", datetime2:"datetime", smalldatetime:"datetime", datetimeoffset:"datetime-with-time-zone", binary:"binary", varbinary:"binary", image:"binary", uniqueidentifier:"uuid", xml:"xml", json:"json" },
        postgresql: { smallint:"integer", integer:"integer", bigint:"integer", serial:"integer", bigserial:"integer", decimal:"decimal", numeric:"decimal", real:"float", float:"float", "double precision":"float", char:"string", varchar:"string", text:"text", boolean:"boolean", date:"date", time:"time", "time without time zone":"time", timestamp:"datetime", "timestamp without time zone":"datetime", "timestamp with time zone":"datetime-with-time-zone", bytea:"binary", uuid:"uuid", json:"json", jsonb:"json", xml:"xml" },
        mysql: { tinyint:"integer", smallint:"integer", mediumint:"integer", int:"integer", integer:"integer", bigint:"integer", decimal:"decimal", numeric:"decimal", float:"float", double:"float", char:"string", varchar:"string", text:"text", blob:"binary", date:"date", time:"time", datetime:"datetime", timestamp:"datetime", boolean:"boolean", json:"json" },
        sqlite: { integer:"integer", int:"integer", tinyint:"integer", smallint:"integer", bigint:"integer", real:"float", double:"float", float:"float", numeric:"decimal", decimal:"decimal", text:"text", varchar:"string", char:"string", blob:"binary", boolean:"boolean", date:"date", time:"time", datetime:"datetime" },
        oracle: { number:"decimal", binary_float:"float", binary_double:"float", varchar2:"string", nvarchar2:"string", char:"string", nchar:"string", clob:"text", nclob:"text", blob:"binary", raw:"binary", date:"datetime", timestamp:"datetime", "timestamp with time zone":"datetime-with-time-zone", boolean:"boolean", xmltype:"xml", json:"json" },
        cubrid: { short:"integer", integer:"integer", bigint:"integer", numeric:"decimal", decimal:"decimal", float:"float", double:"float", char:"string", varchar:"string", string:"string", date:"date", time:"time", timestamp:"datetime", datetime:"datetime", blob:"binary", clob:"text" },
        vfp9: { character:"string", varchar:"string", memo:"text", integer:"integer", numeric:"decimal", float:"float", double:"float", logical:"boolean", date:"date", datetime:"datetime", blob:"binary" },
        sqlalchemy: { "sa.integer":"integer", "sa.biginteger":"integer", "sa.numeric":"decimal", "sa.float":"float", "sa.string":"string", "sa.text":"text", "sa.boolean":"boolean", "sa.date":"date", "sa.time":"time", "sa.datetime":"datetime", "sa.binary":"binary", "sa.largebinary":"binary", "sa.uuid":"uuid", "sa.json":"json" },
        web2py: { string:"string", text:"text", integer:"integer", double:"float", decimal:"decimal", boolean:"boolean", date:"date", time:"time", datetime:"datetime", blob:"binary", reference:"integer", id:"integer" }
    },
    targetAdapters: {
        mssql: { integer:"int", decimal:"decimal", float:"float", string:"nvarchar", text:"nvarchar(max)", boolean:"bit", date:"date", time:"time", datetime:"datetime2", "datetime-with-time-zone":"datetimeoffset", binary:"varbinary", uuid:"uniqueidentifier", json:"nvarchar(max)", xml:"xml" },
        postgresql: { integer:"integer", decimal:"numeric", float:"double precision", string:"varchar", text:"text", boolean:"boolean", date:"date", time:"time", datetime:"timestamp", "datetime-with-time-zone":"timestamp with time zone", binary:"bytea", uuid:"uuid", json:"jsonb", xml:"xml" },
        mysql: { integer:"int", decimal:"decimal", float:"double", string:"varchar", text:"text", boolean:"boolean", date:"date", time:"time", datetime:"datetime", "datetime-with-time-zone":"datetime", binary:"blob", uuid:"char(36)", json:"json", xml:"text" },
        sqlite: { integer:"integer", decimal:"numeric", float:"real", string:"text", text:"text", boolean:"integer", date:"text", time:"text", datetime:"text", "datetime-with-time-zone":"text", binary:"blob", uuid:"text", json:"text", xml:"text" },
        oracle: { integer:"number", decimal:"number", float:"binary_double", string:"varchar2", text:"clob", boolean:"number(1)", date:"date", time:"timestamp", datetime:"timestamp", "datetime-with-time-zone":"timestamp with time zone", binary:"blob", json:"clob", xml:"xmltype" },
        cubrid: { integer:"integer", decimal:"numeric", float:"double", string:"varchar", text:"string", date:"date", time:"time", datetime:"datetime", binary:"blob" },
        vfp9: { integer:"integer", decimal:"numeric", float:"double", string:"character", text:"memo", boolean:"logical", date:"date", datetime:"datetime", binary:"blob" },
        sqlalchemy: { integer:"sa.Integer", decimal:"sa.Numeric", float:"sa.Float", string:"sa.String", text:"sa.Text", boolean:"sa.Boolean", date:"sa.Date", time:"sa.Time", datetime:"sa.DateTime", "datetime-with-time-zone":"sa.DateTime(timezone=True)", binary:"sa.LargeBinary", uuid:"sa.Uuid", json:"sa.JSON", xml:"sa.Text" },
        web2py: { integer:"integer", decimal:"decimal", float:"double", string:"string", text:"text", boolean:"boolean", date:"date", time:"time", datetime:"datetime", binary:"blob", uuid:"string", json:"json", xml:"text" },
        ef: { integer:"int", decimal:"decimal", float:"double", string:"string", text:"string", boolean:"bool", date:"date", time:"time", datetime:"datetime", "datetime-with-time-zone":"datetimeoffset", binary:"binary", uuid:"uuid", json:"string", xml:"string" }
    },
    registry: function () {
        const groups = [["Numeric", "integer decimal float"], ["Text", "string text json xml"], ["Date and Time", "date time datetime datetime-with-time-zone"], ["Other", "boolean binary uuid"]];
        let xml = '<datatypes db="portable">';
        groups.forEach(function (group) { xml += '<group label="' + group[0] + '" color="#eeeeaa">'; group[1].split(" ").forEach(function (token) { xml += '<type label="' + token + '" length="' + (/^(decimal|string|binary)$/.test(token) ? "1" : "0") + '" sql="' + token + '" quote="' + (/^(string|text|json|xml|binary)$/.test(token) ? "&apos;" : "") + '" />'; }); xml += "</group>"; });
        return new DOMParser().parseFromString(xml + "</datatypes>", "text/xml").documentElement;
    },
    split: function (value) { const match = (value || "").trim().match(/^([^()]+?)(?:\((.*)\))?$/); return { name: match ? match[1].trim() : "", facets: match && match[2] ? match[2].trim() : "" }; },
    source: function (dialect, value) {
        const parsed = this.split(value); const kind = (this.sourceAdapters[(dialect || "").toLowerCase()] || {})[parsed.name.toLowerCase().replace(/\s+/g, " ")];
        if (kind === "string" && parsed.facets.toLowerCase() === "max") { return { kind: "text", facets: "", diagnostics: [value + " was imported as unlimited text."] }; }
        return kind ? { kind: kind, facets: parsed.facets, diagnostics: [] } : null;
    },
    canonical: function (value) { const parsed = this.split(value); const kind = parsed.name.toLowerCase(); return this.tokens.indexOf(kind) !== -1 ? { kind: kind, facets: parsed.facets } : null; },
    formatToken: function (type) { return type.kind + (type.facets ? "(" + type.facets + ")" : ""); },
    map: function (type, target) {
        const dialect = (target || "").toLowerCase(); const result = { type: "", diagnostics: [], safe: true }; result.type = (this.targetAdapters[dialect] || {})[type.kind];
        if (!result.type) { result.diagnostics.push(this.formatToken(type) + " cannot be represented by " + dialect + "."); result.safe = false; return result; }
        if (type.facets && /^(decimal|string)$/.test(type.kind) && !/\(/.test(result.type)) { result.type += "(" + type.facets + ")"; }
        if (type.kind === "binary" && type.facets) {
            if (["mssql", "sqlalchemy"].indexOf(dialect) !== -1 && !/\(/.test(result.type)) { result.type += "(" + type.facets + ")"; }
            else if (["mssql", "sqlalchemy"].indexOf(dialect) === -1) { result.diagnostics.push("Binary length " + type.facets + " is not enforced by " + dialect + "."); }
        }
        if (type.kind === "decimal" && type.facets && ["sqlite", "vfp9"].indexOf(dialect) !== -1) { result.diagnostics.push("Precision and scale are not enforced by " + dialect + "."); }
        if (type.kind === "datetime-with-time-zone" && ["mssql", "postgresql", "oracle", "sqlalchemy", "ef"].indexOf(dialect) === -1) { result.diagnostics.push("Time-zone semantics are not preserved by " + dialect + "."); }
        return result;
    }
};
