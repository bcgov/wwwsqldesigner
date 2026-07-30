import { test, expect } from "@playwright/test";

async function load(page, xml) {
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
    await page.evaluate(() => { window.prompt = () => { throw new Error("Import must not prompt"); }; });
    await load(page, `<sql><datatypes db="mssql" /><table name="Location"><row name="Shape" null="1"><datatype>geography</datatype></row><row name="Mystery" null="1"><datatype>future_type</datatype></row></table></sql>`);
    expect(await page.evaluate(() => d.toXML())).toContain("<datatype>text</datatype>");
    await page.locator("#saveload").click();
    await expect(page.locator("#iostatus")).toBeVisible();
    await expect(page.locator("#iostatus")).toContainText("Import completed with");
    await page.locator("#iostatusdismiss").click();
    await expect(page.locator("#iostatus")).toBeHidden();
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
    await expect(page.locator("#iostatus")).toContainText("exported as text");
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});