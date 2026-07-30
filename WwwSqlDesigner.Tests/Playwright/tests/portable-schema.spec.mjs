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