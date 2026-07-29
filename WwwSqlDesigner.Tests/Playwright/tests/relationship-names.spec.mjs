import { test, expect } from "@playwright/test";

const unnamedModel = `<sql>
  <table x="20" y="20" name="Parent"><row name="Id" null="0"><datatype>int</datatype></row><key type="PRIMARY"><part>Id</part></key></table>
  <table x="360" y="120" name="Child"><row name="ParentId" null="0"><datatype>int</datatype><relation table="Parent" row="Id" /></row></table>
</sql>`;

async function loadModel(page, xml) {
    await page.evaluate(async (model) => {
        const datatypes = await fetch("db/mssql/datatypes.xml").then((response) => response.text());
        window.DATATYPES = new DOMParser().parseFromString(datatypes, "text/xml").documentElement;
        d.fromXML(new DOMParser().parseFromString(model, "text/xml").documentElement);
    }, xml);
}

test("names, persists, clears, and safely renders a relationship label", async ({ page }) => {
    await page.goto("/");
    await loadModel(page, unnamedModel);

    const input = page.locator("input.relation-name-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(page.locator("svg .relation-handle")).toHaveCSS("width", "16px");
    await expect(page.locator("svg .relation-handle")).toHaveCSS("height", "16px");

    await input.click();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS("width", "24px");
    await input.fill("  has <img src=x>  ");
    await input.press("Enter");
    await expect(input).not.toBeFocused();

    await expect(input).toHaveValue("has <img src=x>");
    await expect(page.locator("svg rect.relation-handle")).toHaveCount(1);
    await expect(page.locator(".relation-name-input img")).toHaveCount(0);

    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain('name="has &lt;img src=x&gt;"');

    await loadModel(page, saved);
    await expect(input).toHaveValue("has <img src=x>");

    await input.click();
    await expect(input).toHaveValue("has <img src=x>");
    await input.press("Escape");
    await expect(input).toHaveValue("has <img src=x>");

    await input.click();
    await input.fill("saved on click away");
    await page.locator("svg").click({ position: { x: 900, y: 900 } });
    await expect(input).not.toBeFocused();
    await expect(input).toHaveValue("saved on click away");

    await input.click();
    await input.fill("   ");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(page.locator("svg .relation-handle")).toHaveCSS("width", "16px");
    await expect(page.locator("svg .relation-handle")).toHaveCSS("height", "16px");

    await page.evaluate(() => d.relations[0].hide());
    await expect(page.locator("svg .relation-handle")).toBeHidden();
    await expect(input).toBeHidden();
    await page.evaluate(() => d.relations[0].show());
    await expect(page.locator("svg .relation-handle")).toBeVisible();
    await expect(input).toBeVisible();
    await page.evaluate(() => d.removeRelation(d.relations[0]));
    await expect(page.locator("svg .relation-handle, input.relation-name-input")).toHaveCount(0);
});

test("relationship labels render in non-SVG mode and do not affect exports", async ({ page }) => {
    await page.goto("/");
    await loadModel(page, unnamedModel);
    const unnamedSql = await page.evaluate(async () => {
        d.io.clientsql();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return d.io.dom.ta.value;
    });
    const unnamedEf = await page.evaluate(async () => {
        d.io.clientef();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return d.io.dom.ta.value;
    });

    await loadModel(page, unnamedModel.replace('row="Id" />', 'row="Id" name="has" />'));
    const namedSql = await page.evaluate(async () => {
        d.io.clientsql();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return d.io.dom.ta.value;
    });
    const namedEf = await page.evaluate(async () => {
        d.io.clientef();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return d.io.dom.ta.value;
    });
    expect(namedSql).toBe(unnamedSql);
    expect(namedEf).toBe(unnamedEf);

    await page.evaluate(() => d.setOption("vector", false));
    await page.reload();
    await loadModel(page, unnamedModel.replace('row="Id" />', 'row="Id" name="has" />'));
    await expect(page.locator("#area .relation-handle")).toBeVisible();
    await expect(page.locator("#area input.relation-name-input")).toHaveValue("has");
});

test("each relationship handle edits only its own relationship", async ({ page }) => {
    await page.goto("/");
    await loadModel(page, `<sql>
      <table x="20" y="20" name="Left"><row name="Id" null="0"><datatype>int</datatype></row><key type="PRIMARY"><part>Id</part></key></table>
      <table x="500" y="20" name="Right"><row name="Id" null="0"><datatype>int</datatype></row><key type="PRIMARY"><part>Id</part></key></table>
      <table x="260" y="220" name="Child"><row name="ForeignId" null="0"><datatype>int</datatype><relation table="Left" row="Id" /><relation table="Right" row="Id" /></row></table>
    </sql>`);

    const handles = page.locator("svg .relation-handle");
    const inputs = page.locator("input.relation-name-input");
    const activeInput = page.locator("input.relation-name-input:not([readonly])");
    await expect(handles).toHaveCount(2);
    await inputs.nth(0).click();
    await activeInput.fill("left relationship");
    await activeInput.press("Enter");
    await inputs.nth(1).click();
    await activeInput.fill("right relationship");
    await activeInput.press("Enter");

    expect(await page.evaluate(() => d.relations.map((relation) => relation.name))).toEqual([
        "left relationship",
        "right relationship",
    ]);
});
