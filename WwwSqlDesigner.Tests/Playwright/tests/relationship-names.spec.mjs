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
    await expect(input).not.toHaveAttribute("placeholder", "+");
    await expect(input).toHaveCSS("position", "absolute");
    await expect(input).toHaveCSS("z-index", "2");
    await expect(input).toHaveCSS("width", "24px");
    await expect(input).toHaveCSS("height", "24px");
    const handle = page.locator("svg .relation-handle");
    await expect(handle).toHaveCSS("width", "10px");
    await expect(handle).toHaveCSS("height", "10px");
    await expect(handle).toHaveAttribute("rx", "5");
    await expect(handle).toHaveAttribute("ry", "5");
    await expect(handle).toHaveAttribute("x");
    await expect(handle).toHaveAttribute("y");

    const inputBounds = await input.boundingBox();
    const handleBounds = await handle.boundingBox();
    expect(inputBounds).not.toBeNull();
    expect(handleBounds).not.toBeNull();
    const inputCenter = {
        x: inputBounds.x + inputBounds.width / 2,
        y: inputBounds.y + inputBounds.height / 2,
    };
    const handleCenter = {
        x: handleBounds.x + handleBounds.width / 2,
        y: handleBounds.y + handleBounds.height / 2,
    };
    expect(Math.abs(inputCenter.x - handleCenter.x)).toBeLessThan(1);
    expect(Math.abs(inputCenter.y - handleCenter.y)).toBeLessThan(1);

    await input.hover();
    await expect(handle).toHaveClass(/relation-control-transitioning/);
    await expect(input).toHaveClass(/relation-control-transitioning/);
    await expect(handle).toHaveCSS("transition-property", /border-radius.*rx.*ry/);
    await expect(handle).toHaveCSS("width", "16px");
    await expect(handle).toHaveCSS("height", "16px");
    await expect(input).toHaveCSS("width", "24px");
    await expect(input).toHaveCSS("height", "24px");
    await expect(handle).toHaveAttribute("rx", "6");
    await expect(handle).toHaveAttribute("ry", "6");

    await input.click();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS("width", "24px");
    await expect(handle).toHaveAttribute("rx", "6");
    await expect(handle).toHaveAttribute("ry", "6");
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
    expect(await input.evaluate((element) => (
        element.selectionStart === 0 && element.selectionEnd === element.value.length
    ))).toBe(true);
    await input.press("Escape");

    await input.dblclick();
    await expect(input).toHaveValue("has <img src=x>");
    expect(await input.evaluate((element) => (
        element.selectionStart === 0 && element.selectionEnd === element.value.length
    ))).toBe(true);
    await input.press("Enter");
    await expect(input).not.toBeFocused();
    await expect(input).toHaveAttribute("readonly", "");
    expect(await input.evaluate((element) => element.selectionStart === element.selectionEnd)).toBe(true);

    await input.click();
    await page.locator("svg").click({ position: { x: 900, y: 900 } });
    await expect(input).not.toBeFocused();
    await expect(input).toHaveAttribute("readonly", "");
    expect(await input.evaluate((element) => element.selectionStart === element.selectionEnd)).toBe(true);

    await input.click();
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
    const unnamedSql = await page.evaluate(() => d.io.getExportXml("mssql").xml);
    const unnamedEf = await page.evaluate(() => d.io.getExportXml("ef").xml);

    await loadModel(page, unnamedModel.replace('row="Id" />', 'row="Id" name="has" />'));
    const namedSql = await page.evaluate(() => d.io.getExportXml("mssql").xml);
    const namedEf = await page.evaluate(() => d.io.getExportXml("ef").xml);
    expect(namedSql.replace(' name="has"', "")).toBe(unnamedSql);
    expect(namedEf.replace(' name="has"', "")).toBe(unnamedEf);

    await page.evaluate(() => d.setOption("vector", ""));
    await page.reload();
    await loadModel(page, unnamedModel);
    const nonVectorInput = page.locator("#area input.relation-name-input");
    const nonVectorHandle = page.locator("#area .relation-handle");
    await expect(nonVectorInput).toHaveCSS("width", "24px");
    await expect(nonVectorInput).toHaveCSS("height", "24px");
    await expect(nonVectorHandle).toHaveCSS("border-radius", "50%");
    await nonVectorInput.hover();
    await expect(nonVectorHandle).toHaveCSS("transition-property", /border-radius.*rx.*ry/);
    await expect(nonVectorHandle).not.toHaveCSS("border-radius", "50%");

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
