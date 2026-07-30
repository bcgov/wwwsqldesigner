import { test, expect } from "@playwright/test";

async function load(page, xml) {
    await page.evaluate((value) => d.fromXML(new DOMParser().parseFromString(value, "text/xml").documentElement), xml);
}

test("round-trips every canonical portable token and facet", async ({ page }) => {
    await page.goto("/");
    const tokens = ["integer", "decimal(10,2)", "float", "string(100)", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary(16)", "uuid", "json", "xml"];
    const rows = tokens.map((token, index) => `<row name="C${index}" null="1"><datatype>${token}</datatype><default>value</default><comment>note</comment></row>`).join("");
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="All">${rows}</table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain('<sql format="portable-v1">');
    expect(saved).toContain('<datatypes db="portable">');
    for (const token of tokens) { expect(saved).toContain(`<datatype>${token}</datatype>`); }
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toContain("<datatype>datetime-with-time-zone</datatype>");
});

test("blocks unsupported input until a portable replacement is selected", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="Existing"><row name="Id" null="0"><datatype>integer</datatype></row></table></sql>`);
    await page.evaluate(() => { window.prompt = () => null; });
    await load(page, `<sql><datatypes db="mssql" /><table name="Location"><row name="Shape" null="1"><datatype>geography</datatype></row></table></sql>`);
    expect(await page.locator(".table").count()).toBe(1);
    await page.evaluate(() => { window.prompt = () => "json"; });
    await load(page, `<sql><datatypes db="mssql" /><table name="Location"><row name="Shape" null="1"><datatype>geography</datatype></row></table></sql>`);
    expect(await page.evaluate(() => d.toXML())).toContain("<datatype>json</datatype>");
});
test("imports initial dialect adapters into canonical tokens", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><datatypes db="mssql" /><table name="Entry"><row name="Name" null="0"><datatype>nvarchar(42)</datatype></row><row name="Id" null="0"><datatype>uniqueidentifier</datatype></row></table></sql>`);
    let saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<datatype>string(42)</datatype>");
    expect(saved).toContain("<datatype>uuid</datatype>");
    await load(page, `<sql><datatypes db="postgresql" /><table name="Event"><row name="At" null="0"><datatype>timestamp with time zone</datatype></row></table></sql>`);
    saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<datatype>datetime-with-time-zone</datatype>");
    expect(await page.evaluate(() => SQL.PortableTypes.map({ kind: "datetime-with-time-zone", facets: "" }, "ef").type)).toBe("datetimeoffset");
});test("serializes portable defaults with type-aware quoting", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql format="portable-v1"><datatypes db="portable" /><table name="Defaults"><row name="Text" null="0"><datatype>string(20)</datatype><default>hello</default></row><row name="Amount" null="0"><datatype>decimal(10,2)</datatype><default>12.50</default></row><row name="Empty" null="1"><datatype>string(20)</datatype><default>NULL</default></row><row name="Created" null="0"><datatype>datetime</datatype><default>CURRENT_TIMESTAMP</default></row></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<default>'hello'</default>");
    expect(saved).toContain("<default>12.50</default>");
    expect(saved).toContain("<default>NULL</default>");
    expect(saved).toContain("<default>CURRENT_TIMESTAMP</default>");
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("maps each unsupported column independently", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { const choices = ["uuid", "json"]; window.prompt = () => choices.shift(); });
    await load(page, `<sql><datatypes db="mssql" /><table name="Legacy"><row name="Key" null="0"><datatype>geography</datatype></row><row name="Document" null="1"><datatype>hierarchyid</datatype></row></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain("<datatype>uuid</datatype>");
    expect(saved).toContain("<datatype>json</datatype>");
});
