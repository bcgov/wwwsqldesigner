import { beforeEach, describe, expect, it } from "vitest";
import "@wwwsql/globals.js";
import "@wwwsql/portabletypes.js";

describe("SQL global helpers", () => {
    beforeEach(() => {
        globalThis.LOCALE = {};
        globalThis.SQL._subscribers = {};
    });

    it("translates known text and falls back for missing text", () => {
        globalThis.LOCALE.greeting = "Bonjour";

        expect(globalThis._("greeting")).toBe("Bonjour");
        expect(globalThis._("missing")).toBe("missing");
    });

    it("publishes messages to subscribed listeners once", () => {
        const received = [];
        const subscriber = (message) => received.push(message);

        globalThis.SQL.subscribe("updated", subscriber);
        globalThis.SQL.subscribe("updated", subscriber);
        globalThis.SQL.publish("updated", "editor", { id: 7 });
        globalThis.SQL.unsubscribe("updated", subscriber);
        globalThis.SQL.publish("updated", "editor", { id: 8 });

        expect(received).toEqual([{ target: "editor", data: { id: 7 } }]);
    });

    it("escapes XML text and detects meaningful content", () => {
        expect(globalThis.SQL.escapeXmlText("&<\r>")).toBe("&amp;&lt;&#13;&gt;");
        expect(globalThis.SQL.hasXmlContent(" \t\r\n")).toBe(false);
        expect(globalThis.SQL.hasXmlContent(" value ")).toBe(true);
        expect(globalThis.SQL.dom.scroll()).toEqual([10, 20]);
    });
});

describe("portable type conversion", () => {
    const portable = globalThis.SQL.PortableTypes;

    it("normalizes and validates canonical types", () => {
        expect(portable.split(" decimal ( 12, 2 ) ")).toEqual({ name: "decimal", facets: "12, 2" });
        expect(portable.canonical("STRING(40)")).toEqual({ kind: "string", facets: "40" });
        expect(portable.canonical("string(<img src=x onerror=\"alert(1)\">)")).toBeNull();
        expect(portable.canonical("decimal(18,2)")).toEqual({ kind: "decimal", facets: "18,2" });
        expect(portable.canonical("unknown")).toBeNull();
        expect(portable.formatToken({ kind: "binary", facets: "16" })).toBe("binary(16)");
    });

    it("imports source dialect types and records lossy conversions", () => {
        expect(portable.source("mssql", "nvarchar(120)")).toEqual({
            kind: "string",
            facets: "120",
            diagnostics: []
        });
        expect(portable.source("postgresql", "interval")).toEqual({
            kind: "text",
            facets: "",
            diagnostics: ["PostgreSQL interval is imported as text."]
        });
        expect(portable.source("mssql", "nvarchar(max)")).toEqual({
            kind: "text",
            facets: "",
            diagnostics: ["nvarchar(max) was imported as unlimited text."]
        });
        expect(portable.source("unknown", "custom_type")).toEqual({
            kind: "text",
            facets: "",
            diagnostics: ["custom_type from unknown is imported as text."]
        });
    });

    it("maps types to dialects and reports unsupported semantics", () => {
        expect(portable.map({ kind: "string", facets: "80" }, "mssql")).toMatchObject({
            type: "nvarchar(80)",
            safe: true,
            diagnostics: []
        });
        expect(portable.map({ kind: "uuid", facets: "" }, "sqlite")).toMatchObject({
            type: "text",
            safe: true
        });
        expect(portable.map({ kind: "decimal", facets: "12,2" }, "ef")).toMatchObject({
            type: "decimal(12,2)",
            safe: true,
            diagnostics: []
        });
        expect(portable.map({ kind: "decimal", facets: "12,13" }, "ef")).toMatchObject({
            safe: false
        });
        expect(portable.map({ kind: "integer", facets: "" }, "unknown")).toEqual({
            type: "",
            diagnostics: ["integer cannot be represented by unknown."],
            safe: false
        });
        expect(portable.map({ kind: "binary", facets: "32" }, "sqlite").diagnostics).toContain(
            "Binary length 32 is not enforced by sqlite."
        );
    });

    it("creates a portable datatype registry", () => {
        const registry = portable.registry();

        expect(registry.xml).toContain('<datatypes db="portable">');
        expect(registry.xml).toContain('label="integer"');
        expect(registry.xml).toContain('label="string"');
    });
});
