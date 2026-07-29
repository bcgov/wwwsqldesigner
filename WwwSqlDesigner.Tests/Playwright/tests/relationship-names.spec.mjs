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

    page.once("dialog", (dialog) => dialog.accept("  has <img src=x>  "));
    await page.locator("svg .relation-handle").click();

    const label = page.locator("svg .relation-label");
    await expect(label).toHaveText("has <img src=x>");
    await expect(page.locator("svg rect.relation-handle")).toHaveCount(1);
    await expect(label.locator("img")).toHaveCount(0);
    await expect(page.locator("#area")).toContainText("has <img src=x>");
    expect(await label.getAttribute("transform")).toBeNull();
    expect(await page.evaluate(() => {
        const labelY = Number(document.querySelector("svg .relation-label").getAttribute("y"));
        const handleY = Number(document.querySelector("svg .relation-handle").getAttribute("y")) + 12;
        return labelY === handleY + 4;
    })).toBe(true);

    const saved = await page.evaluate(() => d.toXML());
    expect(saved).toContain('name="has &lt;img src=x&gt;"');

    await loadModel(page, saved);
    await expect(page.locator("svg .relation-label")).toHaveText("has <img src=x>");

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("svg .relation-handle").click();
    await expect(page.locator("svg .relation-label")).toHaveText("has <img src=x>");

    page.once("dialog", (dialog) => dialog.accept("   "));
    await page.locator("svg .relation-handle").click();
    await expect(page.locator("svg .relation-label")).toHaveText("+");

    await page.evaluate(() => d.relations[0].hide());
    await expect(page.locator("svg .relation-handle")).toBeHidden();
    await page.evaluate(() => d.relations[0].show());
    await expect(page.locator("svg .relation-handle")).toBeVisible();
    await page.evaluate(() => d.removeRelation(d.relations[0]));
    await expect(page.locator("svg .relation-handle, svg .relation-label")).toHaveCount(0);
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
    await expect(page.locator("#area .relation-label")).toHaveText("has");
});

test("each relationship handle edits only its own relationship", async ({ page }) => {
    await page.goto("/");
    await loadModel(page, `<sql>
      <table x="20" y="20" name="Left"><row name="Id" null="0"><datatype>int</datatype></row><key type="PRIMARY"><part>Id</part></key></table>
      <table x="500" y="20" name="Right"><row name="Id" null="0"><datatype>int</datatype></row><key type="PRIMARY"><part>Id</part></key></table>
      <table x="260" y="220" name="Child"><row name="ForeignId" null="0"><datatype>int</datatype><relation table="Left" row="Id" /><relation table="Right" row="Id" /></row></table>
    </sql>`);

    const handles = page.locator("svg .relation-handle");
    await expect(handles).toHaveCount(2);
    page.once("dialog", (dialog) => dialog.accept("left relationship"));
    await handles.nth(0).click();
    page.once("dialog", (dialog) => dialog.accept("right relationship"));
    await handles.nth(1).click();

    expect(await page.evaluate(() => d.relations.map((relation) => relation.name))).toEqual([
        "left relationship",
        "right relationship",
    ]);
    const labelPositions = await page.evaluate(() => d.relations.map((relation) => ({
        labelY: Number(relation.dom.label.getAttribute("y")),
        handleY: Number(relation.dom.handle.getAttribute("y")) + 12,
    })));
    expect(labelPositions[0].labelY).toBe(labelPositions[0].handleY + 4);
    expect(labelPositions[1].labelY).toBe(labelPositions[1].handleY + 4);
});
