import { test, expect } from "@playwright/test";

async function load(page, xml) {
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate((value) => d.fromXML(new DOMParser().parseFromString(value, "text/xml").documentElement), xml);
}

const tokens = ["integer", "decimal(10,2)", "float", "string(100)", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary(16)", "uuid", "json", "xml"];

test("round-trips every canonical portable token and facet", async ({ page }) => {
    await page.goto("/");
    const rows = tokens.map((token, index) => `<row name="C${index}" null="1"><datatype>${token}</datatype><default>value</default><comment>note</comment></row>`).join("");
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="All">${rows}</table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain('<sql format="portable-v1">');
    for (const token of tokens) { expect(saved).toContain(`<datatype>${token}</datatype>`); }
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("imports specialized and unknown legacy types without a prompt", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate(() => { window.prompt = () => { throw new Error("Import must not prompt"); }; });
    await page.locator("#saveload").click();
    const imported = await page.evaluate(() => d.io.fromXML(new DOMParser().parseFromString("<sql><datatypes db=\"mssql\" /><table name=\"Location\"><row name=\"Shape\" null=\"1\"><datatype>geography</datatype></row><row name=\"Mystery\" null=\"1\"><datatype>future_type</datatype></row><row name=\"Empty\" null=\"1\"><datatype></datatype></row></table></sql>", "text/xml")));
    expect(imported).toBe(true);
    expect(await page.evaluate(() => d.toXML())).toContain("<datatype>text</datatype>");
    await expect(page.locator("#iostatus")).toBeVisible();
    await expect(page.locator("#iostatus")).toContainText("Import reported");
    await expect(page.locator("#iostatuslist")).toContainText("(empty type)");
    await page.locator("#iostatusdismiss").click();
    await expect(page.locator("#iostatus")).toBeHidden();
    await page.evaluate(() => d.io.click());
    await expect(page.locator("#iostatus")).toBeHidden();
});

test("uses the MSSQL fallback for metadata-free legacy XML", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate(() => d.setOption("db", "mysql"));
    await load(page, '<sql><table name="Legacy"><row name="VersionStamp" null="0"><datatype>timestamp</datatype></row></table></sql>');
    expect(await page.evaluate(() => d.toXML())).toContain("<datatype>binary</datatype>");
});

test("maps every bundled source dialect deterministically", async ({ page }) => {
    await page.goto("/");
    const cases = [["mssql", "timestamp", "binary"], ["postgresql", "interval", "text"], ["mysql", "enum", "string"], ["sqlite", "none", "text"], ["oracle", "urowid", "string"], ["cubrid", "set", "text"], ["vfp9", "currency", "decimal"], ["sqlalchemy", "sa.Interval", "text"], ["web2py", "password", "string"]];
    for (const [dialect, nativeType, portable] of cases) {
        expect(await page.evaluate(([db, type]) => SQL.PortableTypes.source(db, type).kind, [dialect, nativeType])).toBe(portable);
    }
    expect(await page.evaluate(() => SQL.PortableTypes.source("postgresql", "made_up_type").kind)).toBe("text");
});

test("exports every portable type to every target without blocking or mutation", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    const rows = tokens.map((token, index) => `<row name="C${index}" null="1"><datatype>${token}</datatype></row>`).join("");
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="All">${rows}</table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    for (const target of ["mssql", "postgresql", "mysql", "sqlite", "oracle", "cubrid", "vfp9", "sqlalchemy", "web2py", "ef"]) {
        const mapped = await page.evaluate((value) => d.io.getExportXml(value), target);
        expect(mapped.safe).toBe(true);
        expect(mapped.xml).toContain(`<datatypes db="${target}"`);
    }
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("export warnings use the compact status line", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="Entry"><row name="Zone" null="0"><datatype>datetime-with-time-zone</datatype></row></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    expect(await page.evaluate(() => d.io.getSafeExportXml("sqlite"))).toContain("<datatype>text</datatype>");
    await expect(page.locator("#iostatus")).toBeVisible();
    await expect(page.locator("#iostatus")).toContainText("Export reported 1 conversion warning");
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("maps every bundled datatype registry entry to a portable token", async ({ page }) => {
    await page.goto("/");
    const dialects = ["mssql", "postgresql", "mysql", "sqlite", "oracle", "cubrid", "vfp9", "sqlalchemy", "web2py"];
    const expected = ["integer", "decimal", "float", "string", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary", "uuid", "json", "xml"];
    const registryTypes = await page.evaluate(async (values) => {
        const result = {};
        for (const dialect of values) {
            const text = await (await fetch("db/" + dialect + "/datatypes.xml")).text();
            const doc = new DOMParser().parseFromString(text, "text/xml");
            result[dialect] = Array.from(doc.querySelectorAll("type"), (type) => type.getAttribute("sql"));
        }
        return result;
    }, dialects);
    for (const dialect of dialects) {
        for (const nativeType of registryTypes[dialect]) {
            expect(expected).toContain(await page.evaluate(([db, type]) => SQL.PortableTypes.source(db, type).kind, [dialect, nativeType]));
        }
    }
});

test("preserves defaults and selected target UI behavior", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="Entry"><row name="Text" null="0"><datatype>string(20)</datatype><default>hello</default></row><row name="Amount" null="0"><datatype>decimal(10,2)</datatype><default>12.50</default></row></table></sql>');
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<default>'hello'</default>");
    expect(saved).toContain("<default>12.50</default>");
    await page.locator("#saveload").click();
    await expect(page.locator("#optiondb")).toHaveCount(0);
    await expect(page.locator("#exporttarget option")).toHaveText([
        "Microsoft SQL Server",
        "PostgreSQL",
        "MySQL",
        "SQLite",
        "Oracle",
        "CUBRID",
        "Visual FoxPro 9",
        "SQLAlchemy",
        "web2py",
        "Entity Framework 8",
    ]);
    await page.locator("#exporttarget").selectOption("postgresql");
    await expect(page.locator("#clientsql")).toHaveValue(/PostgreSQL/);
    expect(await page.evaluate(() => d.getOption("lastExportTarget"))).toBe("postgresql");
    await page.evaluate(() => d.io.click());
    await expect(page.locator("#exporttarget")).toHaveValue("postgresql");
    expect(await page.evaluate(() => d.io.getExportXml("postgresql").xml)).toContain("varchar(20)");
});

test("exposes owner-only sharing controls for server models", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    await expect(page.locator("#servershare")).toHaveValue(/Share/);
    await expect(page.locator("#serverunshare")).toHaveValue(/Remove share/);
    await expect(page.locator("#servershare")).toBeDisabled();
    await expect(page.locator("#serverunshare")).toBeDisabled();
    await expect(page.locator("#servershare")).toHaveCSS("box-shadow", "none");
    await expect(page.locator("#servershare")).toHaveCSS("cursor", "not-allowed");
    expect(await page.evaluate(() => {
        d.io._serverModelState = "copyable";
        d.io.updateServerModelControls();
        return {
            saveDisabled: d.io.dom.serversave.disabled,
            quickSaveDisabled: d.io.dom.quicksave.disabled,
            shareDisabled: d.io.dom.servershare.disabled,
            removeShareDisabled: d.io.dom.serverunshare.disabled,
        };
    })).toEqual({
        saveDisabled: false,
        quickSaveDisabled: false,
        shareDisabled: true,
        removeShareDisabled: true,
    });
    expect(await page.evaluate(() => typeof d.io.servershare)).toBe("function");
    expect(await page.evaluate(() => typeof d.io.serverunshare)).toBe("function");
    expect(await page.evaluate(() => d.io.parseShareRecipient("user:abc"))).toEqual({
        targetType: "User",
        targetId: "abc",
    });
    expect(await page.evaluate(() => d.io.parseShareRecipient("group:finance"))).toEqual({
        targetType: "Group",
        targetId: "finance",
    });
    expect(await page.evaluate(() => d.io.parseShareRecipient("finance"))).toBeNull();
});

test("sends sharing grants as JSON", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    let request;
    await page.route("**/backend/netcore-ef/access/grant**", async (route) => {
        request = route.request();
        await route.fulfill({ status: 204 });
    });
    await page.evaluate(() => {
        window.prompt = () => "user:abc";
        d.io._name = "Saved";
        d.io._csrfToken = "token";
        d.io._serverModelState = "owned";
        d.io.updateServerModelControls();
    });
    await page.locator("#servershare").click();
    await expect.poll(() => request && request.headers()["content-type"]).toBe("application/json");
    expect(request.postData()).toBe(JSON.stringify({ targetType: "User", targetId: "abc", permission: "View" }));
});

test("falls back to MSSQL when the saved export target is unavailable", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate(() => d.setOption("lastExportTarget", "removed-target"));
    await page.locator("#saveload").click();
    await expect(page.locator("#exporttarget")).toHaveValue("mssql");
});

test("runs every bundled export stylesheet against a portable model", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="Entry"><row name="Id" null="0"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part></key></table></sql>');
    const results = await page.evaluate(async () => {
        const output = {};
        for (const target of CONFIG.EXPORT_TARGETS) {
            const response = await fetch("db/" + target.id + "/output.xsl");
            if (!response.ok) {
                output[target.id] = "";
                continue;
            }
            output[target.id] = d.io.transformEf(
                await response.text(),
                d.io.getExportXml(target.id).xml,
                target.id === "ef"
            );
        }
        return output;
    });
    for (const [target, output] of Object.entries(results)) {
        expect(output, target + " stylesheet output").not.toBe("");
    }
});

test("loads the newest server model from the name and version form", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    let loadRequest;
    await page.route("**/backend/netcore-ef/load/**", async (route) => {
        loadRequest = route.request();
        await route.fulfill({
            status: 200,
            contentType: "text/xml",
            body: "<sql><datatypes db=\"mssql\" /></sql>",
        });
    });
    await page.locator("#serverload").click();
    await expect(page.locator("#serverloadform")).toBeVisible();
    await expect(page.locator("#serverloadname")).toBeFocused();
    await page.locator("#serverloadname").fill("Shared");
    await page.locator("#windowok").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("keyword=Shared");
    await expect.poll(() => loadRequest && loadRequest.url()).not.toContain("version=");

    loadRequest = null;
    await page.locator("#saveload").click();
    await page.locator("#serverload").click();
    await page.locator("#serverloadname").fill("Shared");
    await page.locator("#serverloadversion").fill("2");
    await page.locator("#windowok").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("keyword=Shared");
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("version=2");
});

test("preserves SQL NULL defaults and normalizes portable token case", async ({ page }) => {
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="Defaults"><row name="NullableText" null="1"><datatype>STRING(20)</datatype><default>NULL</default></row><row name="Id" null="0"><datatype>INTEGER</datatype></row></table></sql>');
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<datatype>string(20)</datatype>");
    expect(saved).toContain("<datatype>integer</datatype>");
    expect(saved).toContain("<default>NULL</default>");
    expect(saved).not.toContain("<default>'NULL'</default>");
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("normalizes unlimited strings and avoids invalid binary facets", async ({ page }) => {
    await page.goto("/");
    const imported = await page.evaluate(() => SQL.PortableTypes.source("mssql", "nvarchar(max)"));
    expect(imported.kind).toBe("text");
    expect(imported.facets).toBe("");
    const postgres = await page.evaluate(() => SQL.PortableTypes.map({ kind: "binary", facets: "16" }, "postgresql"));
    expect(postgres.type).toBe("bytea");
    expect(postgres.diagnostics.join(" ")).toContain("not enforced");
    expect(await page.evaluate(() => SQL.PortableTypes.map({ kind: "binary", facets: "16" }, "mssql").type)).toBe("varbinary(16)");
});

test("maps MySQL and SQLite uuid and timezone fallbacks", async ({ page }) => {
    await page.goto("/");
    const mysql = await page.evaluate(() => SQL.PortableTypes.map({ kind: "datetime-with-time-zone", facets: "" }, "mysql"));
    expect(mysql.type).toBe("datetime");
    expect(mysql.diagnostics.join(" ")).toContain("Time-zone semantics");
    expect(await page.evaluate(() => SQL.PortableTypes.map({ kind: "uuid", facets: "" }, "mysql").type)).toBe("char(36)");
    const sqlite = await page.evaluate(() => SQL.PortableTypes.map({ kind: "datetime-with-time-zone", facets: "" }, "sqlite"));
    expect(sqlite.type).toBe("text");
    expect(sqlite.diagnostics.join(" ")).toContain("Time-zone semantics");
    expect(await page.evaluate(() => SQL.PortableTypes.map({ kind: "uuid", facets: "" }, "sqlite").type)).toBe("text");
});
test("drops lossy native metadata from portable facets", async ({ page }) => {
    await page.goto("/");
    const imported = await page.evaluate(() => SQL.PortableTypes.source("mysql", "enum('a','b')"));
    expect(imported.kind).toBe("string");
    expect(imported.facets).toBe("");
    expect(imported.diagnostics.join(" ")).toContain("ignored");
});