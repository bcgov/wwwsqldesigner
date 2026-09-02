import { test, expect } from "@playwright/test";

async function load(page, xml) {
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate((value) => d.fromXML(new DOMParser().parseFromString(value, "text/xml").documentElement), xml);
}

const tokens = ["integer", "decimal(10,2)", "float", "string(100)", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary(16)", "uuid", "json", "xml"];

test("round-trips legacy schemas and resolves same names by schema", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><datatypes db="portable"/>
      <table name="Item"><row name="Id" null="0"><datatype>integer</datatype></row></table>
      <table name="Item" schema=" archive "><row name="Id" null="0"><datatype>integer</datatype></row></table>
      <table name="Link"><row name="ItemId" null="0"><datatype>integer</datatype><relation table="Item" schema="archive" row="Id"/></row></table>
    </sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain('name="Item" schema="dbo"');
    expect(saved).toContain('name="Item" schema="archive"');
    expect(saved).toContain('table="Item" schema="archive" row="Id"');
    expect(await page.evaluate(() => d.relations[0].row1.owner.getSchema())).toBe("archive");
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("rejects duplicate and unresolved schema identities transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><datatypes db="portable"/><table name="Keep"><row name="Id" null="0"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const cases = [
        `<sql><table name=" Orders " schema="Sales"/><table name="orders" schema=" sales "/></sql>`,
        `<sql><table name="Source"><row name="Id"><datatype>integer</datatype><relation table="Missing" row="Id"/></row></table></sql>`,
        `<sql><table name="Target"><row name="Id"><datatype>integer</datatype></row></table><table name="Source"><row name="Id"><datatype>integer</datatype><relation table="Target" row="Missing"/></row></table></sql>`,
    ];
    for (const xml of cases) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("validates exact row names and key parts transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const cases = [
        `<sql><table name="T"><row name=""><datatype>integer</datatype></row></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><row name="Id"><datatype>integer</datatype></row></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"/></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part></part></key></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>id</part></key></table></sql>`,
        `<sql><table name="T"><row name=" Id "><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part></key></table></sql>`,
        `<sql><table name="Target"><row name="Id"><datatype>integer</datatype></row><row name="Id"><datatype>integer</datatype></row></table><table name="Source"><row name="Id"><datatype>integer</datatype><relation table="Target" row="Id"/></row></table></sql>`,
    ];
    for (const xml of cases) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("preserves exact row names and composite key order", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Exact"><row name=" Id "><datatype>integer</datatype></row><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part><part> Id </part></key></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    const names = await page.evaluate((xml) => {
        const table = new DOMParser().parseFromString(xml, "text/xml").querySelector("table");
        return {
            rows: Array.from(table.children).filter((child) => child.tagName === "row").map((row) => row.getAttribute("name")),
            parts: Array.from(table.querySelector("key").children).map((part) => part.textContent),
        };
    }, saved);
    expect(names).toEqual({ rows: [" Id ", "Id"], parts: ["Id", " Id "] });
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("rejects misplaced and duplicate known elements without changing the diagram", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const cases = [
        `<unknown/>`,
        `<sql><table name="Outer"><table name="Nested"/></table></sql>`,
        `<sql><table name="T"><row name="A"><datatype>integer</datatype><row name="Nested"/></row></table></sql>`,
        `<sql><table name="T"><row name="A"><datatype>integer</datatype><key type="PRIMARY"/></row></table></sql>`,
        `<sql><table name="T"><row name="A"><datatype>integer</datatype><datatype>text</datatype></row></table></sql>`,
        `<sql><legend/><legend/></sql>`,
    ];
    for (const xml of cases) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("new table cancel and Escape discard only the transient table", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const create = async () => {
        await page.locator("#addtable").click();
        await page.locator("#area").click({ position: { x: 300, y: 200 } });
    };
    await create();
    await page.locator("#windowcancel").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Keep"]);
    await create();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Keep"]);
    await create();
    await page.locator("#tablename").fill("Saved");
    await page.locator("#windowok").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Keep", "Saved"]);
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await page.locator("#windowcancel").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Keep", "Saved"]);
});

test("warns once when MSSQL omits FULLTEXT keys without mutating XML", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Search"><row name="Text"><datatype>text</datatype></row><key type="FULLTEXT" name="A"><part>Text</part></key><key type="FULLTEXT" name="B"><part>Text</part></key></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    expect(await page.evaluate(() => d.io.getSafeExportXml("mssql"))).not.toBeNull();
    await expect(page.locator("#iostatus li")).toHaveCount(1);
    await expect(page.locator("#iostatus")).toContainText("omits portable FULLTEXT keys");
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("table editor validates schema identity and defaults blanks to dbo", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="One" schema="sales"><row name="Id"><datatype>integer</datatype></row></table><table name="Two" schema="dbo"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await expect(page.getByLabel("Schema")).toHaveValue("sales");
    await page.locator("#tablename").fill("Two");
    await page.locator("#tableschema").fill("DBO");
    expect(await page.evaluate(() => d.tableManager.save())).toBe(false);
    expect(await page.evaluate(() => [d.tables[0].getTitle(), d.tables[0].getSchema()])).toEqual(["One", "sales"]);
    await page.locator("#tablename").fill("One");
    await page.locator("#tableschema").fill(" ");
    expect(await page.evaluate(() => d.tableManager.save())).toBeUndefined();
    expect(await page.evaluate(() => d.tables[0].getSchema())).toBe("dbo");
});

test("metadata diagnostics and EF ZIP splitting preserve canonical XML", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Item" schema="sales"><row name="Id"><datatype>integer</datatype><comment>{ public class Fake { } }</comment></row><comment>description</comment></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    await page.evaluate(() => d.io.getSafeExportXml("sqlite"));
    await expect(page.locator("#iostatus")).toContainText("schema metadata");
    await expect(page.locator("#iostatus")).toContainText("descriptions");
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
    const files = await page.evaluate(() => d.io.createEfZipFiles(
        `namespace N\n{\npublic class Item { public string Text { get; set; } = "{ public class Fake { } }"; }\npublic class Context { /* } */ }\n}`, "Context", 1));
    expect(files.map((file) => file.name)).toEqual(["Context.cs", "Item.cs"]);
});

test("counts SQL Server nvarchar description bytes by UTF-16 code unit", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => [
        SQL.IO.nvarcharByteLength("A".repeat(3750)),
        SQL.IO.nvarcharByteLength("\u{1F600}".repeat(1875)),
        SQL.IO.nvarcharByteLength("A\u{1F600}"),
    ])).toEqual([7500, 7500, 6]);
});

test("blocks oversized SQL Server descriptions without mutating canonical XML", async ({ page }) => {
    await page.goto("/");
    const safe = "A".repeat(3750);
    const unsafeTable = "A".repeat(3751);
    const unsafeColumn = "\u{1F600}".repeat(1876);
    await load(page, `<sql><table name="Item" schema="sales"><row name="Safe"><datatype>text</datatype><comment>${safe}</comment></row><row name="Details"><datatype>text</datatype><comment>${unsafeColumn}</comment></row><comment>${unsafeTable}</comment></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    for (const target of ["mssql", "ef"]) {
        const result = await page.evaluate((value) => ({
            export: d.io.getSafeExportXml(value),
            messages: Array.from(d.io.dom.status.querySelectorAll("li"), (item) => item.textContent),
        }), target);
        expect(result.export).toBeNull();
        expect(result.messages).toEqual([
            "sales.Item description is 7502 bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the description.",
            "sales.Item.Details description is 7504 bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the description.",
        ]);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("accepts descriptions at the SQL Server limit for MSSQL and EF", async ({ page }) => {
    await page.goto("/");
    const boundary = "A".repeat(3750);
    await load(page, `<sql><table name="Item"><row name="Details"><datatype>text</datatype><comment>${boundary}</comment></row><comment>${boundary}</comment></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    for (const target of ["mssql", "ef"]) {
        expect(await page.evaluate((value) => d.io.getSafeExportXml(value), target)).not.toBeNull();
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("separates schema and description export support", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Item" schema="sales"><row name="Details"><datatype>text</datatype><comment>column</comment></row><comment>table</comment></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    for (const target of ["postgresql", "oracle"]) {
        const diagnostics = await page.evaluate((value) => d.io.getExportXml(value).diagnostics, target);
        expect(diagnostics).toEqual([`${target} export omits non-default schema metadata.`]);
    }
    expect(await page.evaluate(() => d.io.getExportXml("sqlite").diagnostics)).toEqual([
        "sqlite export omits non-default schema metadata.",
        "sqlite export omits table and column descriptions.",
    ]);
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

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
    await page.evaluate(() => d.io.click());
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
    await expect(page.locator("#iostatus")).toContainText("Export warnings");
    await expect(page.locator("#iostatus")).toContainText("Time-zone semantics are not preserved by sqlite.");
    expect(await page.evaluate(() => d.io.getSafeExportXml("unsupported"))).toBeNull();
    await expect(page.locator("#iostatus")).toContainText("no download was created");
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
        "",
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
    await expect(page.locator("#clientsql")).toHaveValue("Export");
    expect(await page.evaluate(() => d.getOption("lastExportTarget"))).toBe("postgresql");
    await page.evaluate(() => d.io.click());
    await expect(page.locator("#exporttarget")).toHaveValue("");
    expect(await page.evaluate(() => d.getOption("lastExportTarget"))).toBe("postgresql");
    expect(await page.evaluate(() => d.io.getExportXml("postgresql").xml)).toContain("varchar(20)");
});

test("round-trips XML through Client browser storage", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="ClientModel"><row name="Id" null="0"><datatype>integer</datatype></row></table></sql>');
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    await page.locator("#serverloadname").fill("Client round trip");
    await page.locator("#iosave").click();
    await expect(page.locator('#serverloadmodel option[value="Client round trip"]')).toHaveCount(1);
    await page.evaluate(() => d.io.fromXMLText("<sql />"));
    await page.locator("#saveload").click();
    await page.locator('[data-source="browser"]').click();
    await page.locator("#serverloadmodel").selectOption("Client round trip");
    await page.locator("#ioload").click();
    await expect.poll(() => page.evaluate(() => d.toXML().replace(/created="[^"]*" modified="[^"]*"/, 'created="" modified=""'))).toBe(original);
});

test("keeps Client and Server model choices isolated", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    await page.evaluate(() => {
        d.io._clientModelNames = ["Client only"];
        d.io._serverModels = [{ keyword: "Server only", version: 1, ownerId: "owner" }];
        d.io.dom.iotype.value = "browser";
        d.io.updateIoType();
    });
    await expect(page.locator('#serverloadmodel option[value="Client only"]')).toHaveCount(1);
    await expect(page.locator('#serverloadmodel option[value="Server only"]')).toHaveCount(0);
    await page.locator('[data-source="server"]').click();
    await expect(page.locator('#serverloadmodel option[value="Server only"]')).toHaveCount(1);
    await expect(page.locator('#serverloadmodel option[value="Client only"]')).toHaveCount(0);
    await page.locator('[data-source="browser"]').click();
    await expect(page.locator('#serverloadmodel option[value="Client only"]')).toHaveCount(1);
    await expect(page.locator('#serverloadmodel option[value="Server only"]')).toHaveCount(0);
});

test("keeps the IO modal reachable on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await page.locator("#saveload").click();
    const bounds = await page.locator("#windowpanel").evaluate((panel) => {
        const rect = panel.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(360);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(640);
    await expect(page.locator("#serverimport")).toBeVisible();
    await page.setViewportSize({ width: 900, height: 800 });
    const resized = await page.locator("#windowpanel").evaluate((panel) => {
        const rect = panel.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
    });
    expect(resized.width).toBeGreaterThan(0);
    expect(resized.left).toBeGreaterThanOrEqual(0);
    expect(resized.right).toBeLessThanOrEqual(900);
});

test("exposes owner-only sharing controls for server models", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    await expect(page.locator("#servershare")).toHaveValue("Share");
    await expect(page.locator("#servershare")).toBeDisabled();
    await expect(page.locator("#servergrantid")).toHaveCount(1);
    await expect(page.locator("#servergrantgroup")).toHaveCount(1);
    await expect(page.locator("#servergrantid")).toBeDisabled();
    await expect(page.locator("#servergrantgroup")).toBeDisabled();
    await expect(page.locator("#serverknownuser")).toBeDisabled();
    await expect(page.locator("#serverknowngroup")).toBeDisabled();
    await expect(page.locator("#servercopyid")).toHaveText("Copy");
    await expect(page.locator("#serverlist")).toHaveCSS("box-shadow", "none");
    await expect(page.locator("#servercopyid")).toHaveCSS("border-top-width", "0px");
    expect(await page.locator("#serverloadname").getAttribute("placeholder")).toBeNull();
    await expect(page.locator("#serverloadmodel")).toHaveValue("");
    await expect(page.locator("#serverowner")).toHaveValue("");
    await expect(page.locator("#serverloadversion")).toHaveValue("");
    await expect(page.locator("#servergrantgroup")).toHaveValue("");
    await page.evaluate(() => {
        d.io._currentOwnerId = "owner-id";
        d.io._serverModelState = "owned";
        d.io._currentGroups = ["finance"];
        d.io._serverGrants = [
            { targetType: "User", targetId: "existing-user" },
            { targetType: "Group", targetId: "existing-group" },
        ];
        d.io.refreshGrantChoices();
        d.io.updateServerModelControls();
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async () => {} },
        });
    });
    await page.locator("#servercopyid").click();
    await expect(page.locator("#servercopyid")).toHaveText("Copied");
    await expect(page.locator("#servercopyid")).toHaveText("Copy", { timeout: 3000 });
    await expect(page.locator("#servergrantid")).toBeEnabled();
    await expect(page.locator("#servergrantgroup")).toBeEnabled();
    await expect(page.locator("#serverknownuser")).toBeEnabled();
    await expect(page.locator("#serverknowngroup")).toBeEnabled();
    await expect(page.locator("#servershare")).toHaveCSS("box-shadow", "none");
    await expect(page.locator("#servershare")).toHaveCSS("cursor", "not-allowed");
    expect(await page.evaluate(() => {
        d.io._serverModelState = "copyable";
        d.io.updateServerModelControls();
        return {
            saveDisabled: d.io.dom.iosave.disabled,
            shareDisabled: d.io.dom.servershare.disabled,
        };
    })).toEqual({
        saveDisabled: true,
        shareDisabled: true,
    });
    expect(await page.evaluate(() => typeof d.io.servershare)).toBe("function");
    expect(await page.evaluate(() => {
        d.io.dom.servergrantgroup.add(new Option("finance", "finance"));
        d.io.dom.servergrantgroup.value = "finance";
        return d.io.getShareRecipient();
    })).toEqual({ targetType: "Group", targetId: "finance" });
    expect(await page.evaluate(() => {
        d.io.dom.serverknownuser.add(new Option("user-id", "user-id"));
        d.io.dom.serverknownuser.value = "user-id";
        d.io.dom.serverknownuser.dispatchEvent(new Event("change"));
        return d.io.getShareRecipient();
    })).toEqual({ targetType: "User", targetId: "user-id" });
    expect(await page.evaluate(() => {
        d.io.dom.servergrantgroup.value = "finance";
        d.io.dom.servergrantgroup.dispatchEvent(new Event("change"));
        return d.io.dom.servergrantid.value;
    })).toBe("");
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
        d.io._name = "Saved";
        d.io._csrfToken = "token";
        d.io._serverModelState = "owned";
        d.io.updateServerModelControls();
        d.io.dom.serverknownuser.add(new Option("user-id", "user-id"));
        d.io.dom.serverknownuser.value = "user-id";
        d.io.dom.serverknownuser.dispatchEvent(new Event("change"));
    });
    await page.locator("#servershare").click();
    await expect.poll(() => request && request.headers()["content-type"]).toBe("application/json");
    expect(request.postData()).toBe(JSON.stringify({ targetType: "User", targetId: "user-id", permission: "View" }));
});

test("sends sharing revokes through the Unshare control", async ({ page }) => {
    await page.goto("/");
    await page.locator("#saveload").click();
    let request;
    await page.route("**/backend/netcore-ef/access/grant/**", async (route) => {
        request = route.request();
        await route.fulfill({ status: 204 });
    });
    await page.evaluate(() => {
        d.io._name = "Saved";
        d.io._csrfToken = "token";
        d.io._serverModelState = "owned";
        d.io.updateServerModelControls();
        d.io.dom.serverknownuser.add(new Option("user-id", "user-id"));
        d.io.dom.serverknownuser.value = "user-id";
        d.io.dom.serverknownuser.dispatchEvent(new Event("change"));
    });
    await page.locator('[data-source="server"]').click();
    await page.locator("#serverunshare").click();
    await expect.poll(() => request && request.method()).toBe("DELETE");
    await expect.poll(() => request && request.url()).toContain("targetType=User");
    await expect.poll(() => request && request.url()).toContain("targetId=user-id");
});

test("falls back to MSSQL when the saved export target is unavailable", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate(() => d.setOption("lastExportTarget", "removed-target"));
    await page.locator("#saveload").click();
    await expect(page.locator("#exporttarget")).toHaveValue("");
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
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                models: [
                    { keyword: "Shared", version: 2, ownerId: "owner" },
                    { keyword: "Shared", version: 1, ownerId: "owner" },
                ],
                currentOwnerId: "owner",
                currentOwnerLabel: "Owner",
                groups: [],
            }),
        });
    });
    await page.evaluate(() => d.io.serverlist());
    await page.locator('[data-source="server"]').click();
    await page.locator("#serverlist").click();
    await expect(page.locator("#serverlist")).toHaveText("Refreshed");
    await expect(page.locator("#serverlist")).toHaveText("Refresh", { timeout: 3000 });
    await expect(page.locator("#serverloadmodel option")).toHaveCount(2);
    await page.locator("#serverloadmodel").selectOption("Shared");
    await expect(page.locator('#serverloadversion option[value=""]')).toHaveText("Latest");
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("keyword=Shared");
    await expect.poll(() => loadRequest && loadRequest.url()).not.toContain("version=");

    loadRequest = null;
    await page.locator("#saveload").click();
    await page.locator("#serverloadmodel").selectOption("Shared");
    await page.locator("#serverloadversion").selectOption("2");
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("keyword=Shared");
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("version=2");
});

test("does not load a save name when the server catalogue is empty", async ({ page }) => {
    let loadRequests = 0;
    await page.route("**/backend/netcore-ef/load/**", async (route) => {
        loadRequests++;
        await route.abort();
    });
    await page.goto("/");
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    await page.evaluate(() => {
        d.io._serverModels = [];
        d.io.dom.serverloadname.value = "Save only";
        d.io.updateServerModelChoices();
        d.io.updateIoType();
    });
    await expect(page.locator("#iosave")).toBeEnabled();
    await expect(page.locator("#ioload")).toBeDisabled();
    await page.locator("#ioload").click({ force: true });
    expect(loadRequests).toBe(0);
});

test("prefers the current owner and isolates versions for duplicate server model names", async ({ page }) => {
    let loadRequest;
    await page.route("**/backend/netcore-ef/load/**", async (route) => {
        loadRequest = route.request();
        await route.fulfill({ status: 200, contentType: "text/xml", body: '<sql><datatypes db="mssql" /></sql>' });
    });
    await page.goto("/");
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    await page.evaluate(() => {
        d.io._currentOwnerId = "current-owner";
        d.io._currentOwnerLabel = "Current owner";
        d.io._serverModels = [
            { keyword: "Duplicate", version: 3, ownerId: "other-owner" },
            { keyword: "Duplicate", version: 2, ownerId: "current-owner" },
            { keyword: "Duplicate", version: 1, ownerId: "current-owner" },
        ];
        d.io.updateServerModelChoices();
    });
    await page.locator("#serverloadmodel").selectOption("Duplicate");
    await expect(page.locator("#serverowner")).toHaveValue("current-owner");
    await expect(page.locator("#serverloadversion option")).toHaveText(["Latest", "v2", "v1"]);
    await page.locator("#serverowner").selectOption("other-owner");
    await expect(page.locator("#serverloadversion option")).toHaveText(["Latest", "v3"]);
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("ownerId=other-owner");
});

test("preserves the server catalogue and diagram when refresh fails", async ({ page }) => {
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({ status: 503, body: "Unavailable" });
    });
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="StillHere" /></sql>');
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    await page.evaluate(() => {
        d.io._serverModels = [{ keyword: "Existing", version: 1, ownerId: "owner" }];
        d.io.updateServerModelChoices();
    });
    await page.locator("#serverlist").click();
    await expect(page.locator('#serverloadmodel option[value="Existing"]')).toHaveCount(1);
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("preserves the current diagram after failed or malformed server loads", async ({ page }) => {
    let response = {
        status: 429,
        body: '<sql format="portable-v1"><datatypes db="portable" /><table name="Replacement" /></sql>',
    };
    let loadRequests = 0;
    await page.route("**/backend/netcore-ef/load/**", async (route) => {
        loadRequests++;
        await route.fulfill({ ...response, contentType: "text/xml" });
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="StillHere" /></sql>');
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    await page.evaluate(() => {
        d.io._serverModels = [{ keyword: "Broken", version: 1, ownerId: "owner" }];
        d.io.updateServerModelChoices();
    });
    await page.locator("#serverloadmodel").selectOption("Broken");
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequests).toBe(1);
    await expect.poll(() => page.evaluate(() => d.window.dom.throbber.style.visibility)).toBe("hidden");
    expect(await page.evaluate(() => d.toXML())).toBe(original);
    response = { status: 200, body: "<sql>" };
    await page.locator("#serverloadmodel").selectOption("Broken");
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequests).toBe(2);
    expect(await page.evaluate(() => d.toXML())).toBe(original);
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