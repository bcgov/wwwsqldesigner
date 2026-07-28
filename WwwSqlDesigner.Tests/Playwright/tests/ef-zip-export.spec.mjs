import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const JSZip = require(fileURLToPath(new URL("../../../WwwSqlDesigner/wwwroot/js/jszip-3.10.1.min.js", import.meta.url)));

const model = `
<sql>
  <table name="Order">
    <row name="Id" null="0"><datatype>int</datatype></row>
    <key type="PRIMARY"><part>Id</part></key>
  </table>
  <table name="2024 Order Item#">
    <row name="Order Id" null="0"><datatype>int</datatype><relation table="Order" row="Id" /></row>
    <row name="Description" null="1"><datatype>nvarchar(100)</datatype></row>
    <row name="Payload#" null="0"><datatype>varbinary(32)</datatype></row>
  </table>
  <table name="Order Item"><row name="Id" null="0"><datatype>int</datatype></row></table>
  <table name="Order-Item"><row name="Id" null="0"><datatype>int</datatype></row></table>
  <table name="ExampleContext"><row name="Id" null="0"><datatype>int</datatype></row></table>
</sql>`;

test("rejects invalid EF export names without persisting them", async ({ page }) => {
    await page.goto("/");
    await page.locator("#options").click();
    await page.locator("#optionefnamespace").fill("Example..Models");
    await page.locator("#windowok").click();

    await expect(page.locator("#window")).toBeVisible();
    await expect(page.locator("#optionefnamespace")).toHaveJSProperty("validationMessage", "Enter dot-separated C# identifiers for the EF namespace.");
    await expect(page.locator("#optionefnamespace")).toHaveValue("Example..Models");
    expect(await page.evaluate(() => d.getOption("efnamespace"))).toBe("WwwSqlDesigner.Data");
});

test("downloads an EF ZIP with the configured context and table sources", async ({ page }) => {
    await page.goto("/");
    await page.locator("#options").click();
    await page.locator("#optionefnamespace").fill("Example.Models");
    await page.locator("#optionefcontext").fill("ExampleContext");
    await page.locator("#windowok").click();

    await page.evaluate(async (xml) => {
        const datatypes = await fetch("db/mssql/datatypes.xml").then((response) => response.text());
        window.DATATYPES = new DOMParser().parseFromString(datatypes, "text/xml").documentElement;
        d.fromXML(new DOMParser().parseFromString(xml, "text/xml").documentElement);
    }, model);
    await page.locator("#saveload").click();

    await page.locator("#clientef").click();
    await expect(page.locator("#textarea")).toHaveValue(/public class ExampleContext : DbContext/);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#clientefzip").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("ExampleContext.zip");

    const archive = await JSZip.loadAsync(await readFile(await download.path()));
    expect(Object.keys(archive.files).sort()).toEqual([
        "ExampleContext.cs",
        "ExampleContext_2.cs",
        "Order.cs",
        "Order_Item.cs",
        "Order_Item_2.cs",
        "_2024_Order_Item_.cs",
    ]);
    await expect(await archive.file("ExampleContext.cs").async("string")).toContain("namespace Example.Models");
    await expect(await archive.file("ExampleContext.cs").async("string")).toContain("public class ExampleContext : DbContext");
    await expect(await archive.file("_2024_Order_Item_.cs").async("string")).toContain("public string? Description { get; set; }");
    await expect(await archive.file("_2024_Order_Item_.cs").async("string")).toContain("public byte[] Payload_ { get; set; } = null!;");
    await expect(await archive.file("ExampleContext.cs").async("string")).toContain("using System;");
    await expect(await archive.file("ExampleContext.cs").async("string")).toContain("HasOne<Order>().WithMany().HasForeignKey(e => e.Order_Id)");
});

test("rejects DTD-bearing XML before EF ZIP export", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(() => {
        const xml = '<!DOCTYPE sql [<!ENTITY expansion "blocked">]><sql><table name="&expansion;" /></sql>';
        try {
            d.io.transformEf("", xml);
            return "accepted";
        } catch (error) {
            return error.message;
        }
    });

    expect(result).toBe("DTD and entity declarations are not allowed.");
    expect(await page.evaluate(() => d.io.getModelTableCount("<!DOCTYPE sql><sql><table name=\"Item\" /></sql>"))).toBe(0);
});

test("clears the export throbber when the stylesheet cannot be loaded", async ({ page }) => {
    await page.route("**/db/ef/output.xsl", (route) => route.abort());
    await page.goto("/");
    await page.locator("#saveload").click();

    await page.locator("#clientef").click();
    await expect(page.locator("#throbber")).toBeHidden();
});
