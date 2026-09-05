import { test, expect } from "@playwright/test";

async function load(page, xml) {
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.evaluate((value) => d.fromXML(new DOMParser().parseFromString(value, "text/xml").documentElement), xml);
}

const tokens = ["integer", "decimal(10,2)", "float", "string(100)", "text", "boolean", "date", "time", "datetime", "datetime-with-time-zone", "binary(16)", "uuid", "json", "xml"];

test.beforeEach(async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "X-CSRF-TOKEN": "test-token" },
            body: JSON.stringify({ enabled: true, authenticated: true }),
        });
    });
});

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

test("validates table names transactionally while preserving valid whitespace identity", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const invalid = [
        `<sql><table/></sql>`,
        `<sql><table name=""/></sql>`,
        `<sql><table name=" \t\r\n "/></sql>`,
        `<sql><table name="\u00a0"/></sql>`,
    ];
    for (const xml of invalid) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }

    await load(page, `<sql><table name=" Item " schema=" Sales "><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    expect(await page.evaluate(() => [d.tables[0].getTitle(), d.tables[0].getSchema()])).toEqual([" Item ", "Sales"]);
    const spaced = await page.evaluate(() => d.toXML());
    expect(spaced).toContain('name=" Item " schema="Sales"');

    expect(await page.evaluate((value) => d.io.fromXMLText(value),
        `<sql><table name=" Item " schema="Sales"/><table name="item" schema=" sales "/></sql>`)).toBe(false);
    expect(await page.evaluate(() => d.toXML())).toBe(spaced);
});

test("validates default node shape transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const invalid = [
        `<default><x/></default>`,
        `<default><!--x--></default>`,
        `<default><![CDATA[value]]></default>`,
        `<default>value<!--x--></default>`,
        `<default>value<x/></default>`,
        `<default><!--x--><!--y--></default>`,
    ];
    for (const value of invalid) {
        const xml = `<sql><table name="T"><row name="Value"><datatype>text</datatype>${value}</row></table></sql>`;
        expect(await page.evaluate((input) => d.io.fromXMLText(input), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("accepts absent, empty, and ordinary text defaults", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Defaults"><row name="Absent"><datatype>text</datatype></row><row name="Empty"><datatype>text</datatype><default></default></row><row name="Text"><datatype>text</datatype><default>hello</default></row></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).not.toContain('name="Absent"><datatype>text</datatype><default>');
    expect(saved).not.toContain('name="Empty"><datatype>text</datatype><default>');
    expect(saved).toContain("<default>'hello'</default>");
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
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part><!--x-->Id</part></key></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part><![CDATA[Id]]></part></key></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part><x/></part></key></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part><x/>Id</part></key></table></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>I<![CDATA[d]]></part></key></table></sql>`,
        `<sql><table name="Target"><row name="Id"><datatype>integer</datatype></row><row name="Id"><datatype>integer</datatype></row></table><table name="Source"><row name="Id"><datatype>integer</datatype><relation table="Target" row="Id"/></row></table></sql>`,
    ];
    for (const xml of cases) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("rejects nested sql roots transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const cases = [
        `<sql><sql/></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype><comment><sql/></comment></row></table></sql>`,
    ];
    for (const xml of cases) {
        expect(await page.evaluate((value) => d.io.fromXMLText(value), xml)).toBe(false);
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
});

test("rejects duplicate exact key parts transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    expect(await page.evaluate((value) => d.io.fromXMLText(value),
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part><part>Id</part></key></table></sql>`)).toBe(false);
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("preserves exact row names, key order, and row reuse across keys", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Exact"><row name=" Id "><datatype>integer</datatype></row><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part><part> Id </part></key><key type="INDEX"><part>Id</part></key></table></sql>`);
    const saved = await page.evaluate(() => d.toXML());
    const names = await page.evaluate((xml) => {
        const table = new DOMParser().parseFromString(xml, "text/xml").querySelector("table");
        return {
            rows: Array.from(table.children).filter((child) => child.tagName === "row").map((row) => row.getAttribute("name")),
            keys: Array.from(table.querySelectorAll("key")).map((key) =>
                Array.from(key.children).map((part) => part.textContent)),
        };
    }, saved);
    expect(names).toEqual({ rows: [" Id ", "Id"], keys: [["Id", " Id "], ["Id"]] });
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
    await page.evaluate(() => {
        d.rowManager.select(d.tables[1].rows[0]);
        d.tables[1].rows[0].expand();
    });
    await page.locator("#windowcancel").click();
    expect(await page.evaluate(() => ({
        tables: d.tables.map((table) => table.getTitle()),
        selectedRow: d.rowManager.selected,
    }))).toEqual({ tables: ["Keep"], selectedRow: null });
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

test("blocks projected table collisions only for schema-dropping exports", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name=" Item " schema="sales"><row name="Id"><datatype>integer</datatype></row></table><table name="item" schema="archive"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    for (const target of ["cubrid", "mysql", "oracle", "postgresql", "sqlalchemy", "sqlite", "vfp9", "web2py"]) {
        expect(await page.evaluate((value) => d.io.getSafeExportXml(value), target)).toBeNull();
        await expect(page.locator("#iostatus")).toContainText(`${target} export omits non-default schema metadata.`);
        await expect(page.locator("#iostatus")).toContainText("archive.item, sales. Item ");
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }
    for (const target of ["mssql", "ef"]) {
        expect(await page.evaluate((value) => d.io.getSafeExportXml(value), target)).not.toBeNull();
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }

    await load(page, `<sql><table name="One" schema="sales"><row name="Id"><datatype>integer</datatype></row></table><table name="Two" schema="archive"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    expect(await page.evaluate(() => d.io.getSafeExportXml("mysql"))).not.toBeNull();
    await expect(page.locator("#iostatus li")).toHaveCount(1);
    await expect(page.locator("#iostatus")).toContainText("mysql export omits non-default schema metadata.");
});

test("relation creation rejects an exact target field collision and remains pending for retry", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table x="20" y="20" name="Source"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part></key></table><table x="320" y="20" name="Target"><row name="Id_Source"><datatype>integer</datatype></row></table></sql>`);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByText("Id", { exact: true }).click();
    await page.locator("#foreigncreate").click();
    await page.getByText("Target", { exact: true }).click();
    expect(await page.evaluate(() => ({
        rows: d.tables[1].rows.map((row) => row.getTitle()),
        relations: d.relations.length,
        pending: d.rowManager.creating,
    }))).toEqual({ rows: ["Id_Source"], relations: 0, pending: true });

    await page.evaluate(() => d.tables[1].rows[0].setTitle("Existing"));
    await page.getByText("Target", { exact: true }).click();
    expect(await page.evaluate(() => ({
        rows: d.tables[1].rows.map((row) => row.getTitle()),
        relations: d.relations.length,
        pending: d.rowManager.creating,
        relation: [d.relations[0].row1.getTitle(), d.relations[0].row2.getTitle()],
    }))).toEqual({
        rows: ["Existing", "Id_Source"],
        relations: 1,
        pending: false,
        relation: ["Id", "Id_Source"],
    });
});

test("options reject an empty relationship pattern atomically and preserve the corrected value", async ({ page }) => {
        await page.goto("/");
        await page.evaluate(() => {
            const values = {
                locale: "en", efnamespace: "Original.Namespace", efcontext: "OriginalContext",
                snap: "10", pattern: "%R_%T", style: "wwwsqldesigner", hide: "",
                vector: "", showsize: "", showtype: "",
            };
            window.optionWrites = [];
            d.getOption = (name) => values[name];
            d.setOption = (name, value) => {
                optionWrites.push([name, value]);
                values[name] = value;
            };
        });
        await page.locator("#options").click();
        await page.locator("#optionefnamespace").fill("Bad..Namespace");
        await page.locator("#optionefcontext").fill("Bad-Context");
        await page.locator("#optionpattern").fill(" \t ");
        await page.locator("#windowok").click();
        await expect(page.locator("#optionefnamespace")).toBeFocused();
        await page.locator("#optionefnamespace").fill("Retried.Namespace");
        await page.locator("#windowok").click();
        await expect(page.locator("#optionefcontext")).toBeFocused();
        await page.locator("#optionefcontext").fill("RetriedContext");
        await page.locator("#windowok").click();
        await expect(page.locator("#optionpattern")).toBeFocused();
        expect(await page.evaluate(() => optionWrites)).toEqual([]);
        await page.locator("#optionpattern").fill(" %R_retry ");
        await page.locator("#windowok").click();
        expect(await page.evaluate(() => ({
            pattern: optionWrites.find(([name]) => name === "pattern")[1],
            count: optionWrites.length,
        }))).toEqual({ pattern: " %R_retry ", count: 10 });
});

test("legacy empty relationship patterns remain pending without mutation and recover", async ({ page }) => {
        await page.goto("/");
        await load(page, `<sql><table x="20" y="20" name="Source"><row name="Id"><datatype>integer</datatype></row><key type="PRIMARY"><part>Id</part></key></table><table x="320" y="20" name="Target"/></sql>`);
        await page.evaluate(() => {
            const getOption = d.getOption.bind(d);
            d.getOption = (name) => name === "pattern" ? " \t " : getOption(name);
        });
        page.on("dialog", (dialog) => dialog.accept());
        await page.getByText("Id", { exact: true }).click();
        await page.locator("#foreigncreate").click();
        await page.getByText("Target", { exact: true }).click();
        expect(await page.evaluate(() => ({
            rows: d.tables[1].rows.length, relations: d.relations.length,
            pending: d.rowManager.creating, source: d.rowManager.selected.getTitle(),
        }))).toEqual({ rows: 0, relations: 0, pending: true, source: "Id" });
        await page.evaluate(() => {
            const getOption = d.getOption;
            d.getOption = (name) => name === "pattern" ? "%R_retry" : getOption(name);
        });
        await page.getByText("Target", { exact: true }).click();
        expect(await page.evaluate(() => ({
            rows: d.tables[1].rows.map((row) => row.getTitle()),
            relations: d.relations.length, pending: d.rowManager.creating,
        }))).toEqual({ rows: ["Id_retry"], relations: 1, pending: false });
});

test("row dblclick expands only the row selected by preceding click events", async ({ page }) => {
        await page.goto("/");
        await load(page, `<sql><table name="T"><row name="One"><datatype>integer</datatype></row><row name="Two"><datatype>integer</datatype></row></table></sql>`);
        await page.getByText("One", { exact: true }).dblclick();
        await page.locator("tbody.expanded input[type=text]").first().fill("");
        await page.getByText("Two", { exact: true }).dblclick();
        expect(await page.evaluate(() => ({
            selected: d.rowManager.selected.getTitle(),
            expanded: d.tables[0].rows.map((row) => row.expanded),
        }))).toEqual({ selected: "One", expanded: [true, false] });
        await page.locator("tbody.expanded input[type=text]").first().fill("One fixed");
        await page.getByText("Two", { exact: true }).dblclick();
        expect(await page.evaluate(() => ({
            selected: d.rowManager.selected && d.rowManager.selected.getTitle(),
            expanded: d.tables[0].rows.map((row) => row.expanded),
        }))).toEqual({ selected: false, expanded: [false, false] });
        await page.getByText("Two", { exact: true }).dblclick();
        expect(await page.evaluate(() => ({
            selected: d.rowManager.selected.getTitle(),
            expanded: d.tables[0].rows.map((row) => row.expanded),
        }))).toEqual({ selected: "Two", expanded: [false, true] });
});

test("table title dblclick edits only a sole selected table", async ({ page }) => {
        await page.goto("/");
        await load(page, `<sql><table x="20" y="20" name="One"/><table x="320" y="20" name="Two"/></sql>`);
        await page.evaluate(() => {
            d.tableManager.select(d.tables[0]);
            d.tableManager.select(d.tables[1], true);
        });
        await page.getByText("One", { exact: true }).dblclick();
        await expect(page.locator("#window")).toBeHidden();
        await page.getByText("Two", { exact: true }).dblclick();
        await expect(page.locator("#window")).toBeVisible();
        await expect(page.locator("#tablename")).toHaveValue("Two");
});

test("invalid row removal is atomic and succeeds after correction", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="T"><row name="One"><datatype>integer</datatype></row><row name="Two"><datatype>integer</datatype></row></table></sql>`);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByText("One", { exact: true }).dblclick();
    const name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    await page.locator("#removerow").click();
    expect(await page.evaluate(() => ({
        rows: d.tables[0].rows.map((row) => row.getTitle()),
        selected: d.rowManager.selected.getTitle(),
        expanded: d.rowManager.selected.expanded,
    }))).toEqual({ rows: ["One", "Two"], selected: "One", expanded: true });
    await name.fill("Retried");
    await page.locator("#removerow").click();
    expect(await page.evaluate(() => d.tables[0].rows.map((row) => row.getTitle()))).toEqual(["Two"]);
});

test("single and multi-table removal validate before destruction", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table x="20" y="20" name="One"><row name="A"><datatype>integer</datatype></row></table><table x="320" y="20" name="Two"><row name="B"><datatype>integer</datatype></row></table><table x="620" y="20" name="Three"><row name="C"><datatype>integer</datatype></row></table></sql>`);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByText("A", { exact: true }).dblclick();
    const name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    await page.locator("#removetable").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["One", "Two", "Three"]);
    await name.fill("A1");
    await page.locator("#removetable").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Two", "Three"]);
    await page.evaluate(() => {
        d.tableManager.select(d.tables[0]);
        d.tableManager.select(d.tables[1], true);
    });
    await page.locator("#removetable").click();
    expect(await page.evaluate(() => d.tables.length)).toBe(0);
});

test("clear all is atomic for an invalid editor and recovers after correction", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table x="20" y="20" name="One"><row name="A"><datatype>integer</datatype></row></table><table x="320" y="20" name="Two"><row name="B"><datatype>integer</datatype></row></table></sql>`);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByText("A", { exact: true }).dblclick();
    const name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    await page.locator("#cleartables").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["One", "Two"]);
    await name.fill("A1");
    await page.locator("#cleartables").click();
    expect(await page.evaluate(() => d.tables.length)).toBe(0);
});

test("valid replacement discards an invalid editor while rejected import preserves it", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    await page.getByText("Id", { exact: true }).dblclick();
    let name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    expect(await page.evaluate((xml) => d.io.fromXMLText(xml),
        `<sql><table name="Replacement"><row name="NewId"><datatype>integer</datatype></row></table></sql>`)).toBe(true);
    expect(await page.evaluate(() => ({
        tables: d.tables.map((table) => table.getTitle()),
        selected: d.rowManager.selected,
    }))).toEqual({ tables: ["Replacement"], selected: null });

    await page.getByText("NewId", { exact: true }).dblclick();
    name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    expect(await page.evaluate((xml) => d.io.fromXMLText(xml),
        `<sql><table name="Bad"/><table name="bad"/></sql>`)).toBe(false);
    expect(await page.evaluate(() => ({
        tables: d.tables.map((table) => table.getTitle()),
        selected: d.rowManager.selected.getTitle(),
        expanded: d.rowManager.selected.expanded,
        input: d.rowManager.selected.dom.name.value,
    }))).toEqual({ tables: ["Replacement"], selected: "NewId", expanded: true, input: "" });
});

test("invalid row keeps new-table placement pending until one successful retry", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    await page.evaluate(() => {
        d.tableManager.select(d.tables[0]);
        d.rowManager.select(d.tables[0].rows[0]);
        d.tables[0].rows[0].expand();
    });
    await page.locator("tbody.expanded input[type=text]").first().fill("");
    await page.locator("#addtable").click();
    await page.evaluate(() => d.tableManager.click({ clientX: 300, clientY: 200 }));
    expect(await page.evaluate(() => ({
        adding: d.tableManager.adding,
        tables: d.tables.map((table) => table.getTitle()),
        selectedTable: d.tableManager.selection[0].getTitle(),
        selectedRow: d.rowManager.selected.getTitle(),
    }))).toEqual({ adding: true, tables: ["Keep"], selectedTable: "Keep", selectedRow: "Id" });

    await page.locator("tbody.expanded input[type=text]").first().fill("RetriedId");
    await page.evaluate(() => d.tableManager.click({ clientX: 300, clientY: 200 }));
    expect(await page.evaluate(() => ({
        adding: d.tableManager.adding,
        tables: d.tables.map((table) => table.getTitle()),
        rows: d.tables[1].rows.map((row) => row.getTitle()),
        selected: d.tableManager.selection[0] === d.tables[1],
        transient: d.tableManager.transientTable === d.tables[1],
    }))).toEqual({
        adding: false,
        tables: ["Keep", "new table"],
        rows: ["id"],
        selected: true,
        transient: true,
    });
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

test("table editor rejects empty names before mutation and permits retry or transient cancel", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name=" Keep " schema="sales"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await page.locator("#tablename").fill(" \t ");
    await page.locator("#windowok").click();
    await expect(page.locator("#window")).toBeVisible();
    await expect(page.locator("#tablename")).toBeFocused();
    expect(await page.locator("#tablename").evaluate((input) => input.validationMessage)).not.toBe("");
    expect(await page.evaluate(() => [d.tables[0].getTitle(), d.tables[0].getSchema()])).toEqual([" Keep ", "sales"]);
    await page.locator("#tablename").fill(" Retried ");
    expect(await page.locator("#tablename").evaluate((input) => input.validationMessage)).toBe("");
    await page.locator("#windowok").click();
    expect(await page.evaluate(() => d.tables[0].getTitle())).toBe(" Retried ");

    await page.locator("#addtable").click();
    await page.locator("#area").click({ position: { x: 300, y: 200 } });
    await page.locator("#tablename").fill("");
    await page.locator("#windowok").click();
    expect(await page.evaluate(() => d.tables.length)).toBe(2);
    await page.locator("#windowcancel").click();
    expect(await page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual([" Retried "]);
});

test("row editor blocks empty and exact duplicate collapse while accepting exact distinctions", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="T"><row name="One"><datatype>integer</datatype></row><row name="Two"><datatype>integer</datatype></row></table></sql>`);
    await page.evaluate(() => {
        d.tableManager.select(d.tables[0]);
        d.rowManager.select(d.tables[0].rows[0]);
        d.tables[0].rows[0].expand();
    });
    const name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");
    await page.keyboard.press("Enter");
    await expect(name).toBeFocused();
    expect(await name.evaluate((input) => input.validationMessage)).not.toBe("");
    expect(await page.evaluate(() => ({
        selected: d.rowManager.selected.getTitle(),
        expanded: d.tables[0].rows[0].expanded,
        title: d.tables[0].rows[0].getTitle(),
    }))).toEqual({ selected: "One", expanded: true, title: "One" });

    await name.fill("Two");
    await page.getByText("Two", { exact: true }).click();
    expect(await page.evaluate(() => [d.rowManager.selected.getTitle(), d.tables[0].rows[0].expanded])).toEqual(["One", true]);
    expect(await name.evaluate((input) => input.validationMessage)).not.toBe("");
    await page.locator("#addrow").click();
    expect(await page.evaluate(() => d.rowManager.selected.getTitle())).toBe("One");

    await name.fill(" two ");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => d.tables[0].rows[0].getTitle())).toBe(" two ");
    await page.evaluate(() => { d.rowManager.select(d.tables[0].rows[1]); d.tables[0].rows[1].expand(); });
    await page.locator("tbody.expanded input[type=text]").first().fill("TWO");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => d.tables[0].rows[1].getTitle())).toBe("TWO");
});

test("invalid edited rows block add, table selection, and relation actions until corrected", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql>
      <table x="20" y="20" name="Source"><row name="Id"><datatype>integer</datatype></row></table>
      <table x="320" y="320" name="Target"><row name="TargetId"><datatype>integer</datatype></row></table>
      <table x="620" y="20" name="Other"><row name="OtherId"><datatype>integer</datatype></row></table>
    </sql>`);
    await page.evaluate(() => {
        d.tableManager.select(d.tables[0]);
        d.rowManager.select(d.tables[0].rows[0]);
        d.tables[0].rows[0].expand();
        d.rowManager.foreignconnect();
    });
    const name = page.locator("tbody.expanded input[type=text]").first();
    await name.fill("");

    await page.locator("#addrow").click();
    expect(await page.evaluate(() => d.tables[0].rows.length)).toBe(1);
    await page.getByText("Other", { exact: true }).click();
    expect(await page.evaluate(() => d.tableManager.selection[0].getTitle())).toBe("Source");
    await page.getByText("TargetId", { exact: true }).click();
    expect(await page.evaluate(() => ({
        relations: d.relations.length,
        row: d.rowManager.selected.getTitle(),
        table: d.tableManager.selection[0].getTitle(),
    }))).toEqual({ relations: 0, row: "Id", table: "Source" });

    await name.fill("SourceId");
    await page.getByText("TargetId", { exact: true }).click();
    expect(await page.evaluate(() => d.relations.length)).toBe(1);
    expect(await page.evaluate(() => ({
        source: d.relations[0].row1.getTitle(),
        target: d.relations[0].row2.getTitle(),
    }))).toEqual({ source: "SourceId", target: "TargetId" });

    await page.getByText("Other", { exact: true }).click();
    expect(await page.evaluate(() => d.tableManager.selection[0].getTitle())).toBe("Other");
    await page.locator("#addrow").click();
    expect(await page.evaluate(() => d.tables[2].rows.length)).toBe(2);
});

test("key dialog purges empty additions on Cancel, Escape, and OK", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="T"><row name="Id"><datatype>integer</datatype></row></table></sql>`);
    for (const close of ["#windowcancel", "Escape", "#windowok"]) {
        await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.keyManager.open(d.tables[0]); });
        await page.locator("#keyadd").click();
        expect(await page.evaluate(() => d.tables[0].keys.length)).toBe(1);
        if (close === "Escape") {
            await page.keyboard.press(close);
        } else {
            await page.locator(close).click();
        }
        expect(await page.evaluate(() => d.tables[0].keys.length)).toBe(0);
    }
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).not.toContain("<key ");
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("removing last key fields and keyed rows leaves no empty serialized keys", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="T"><row name="One"><datatype>integer</datatype></row><row name="Two"><datatype>integer</datatype></row><key type="PRIMARY"><part>One</part></key><key type="INDEX"><part>One</part><part>Two</part></key></table></sql>`);
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.keyManager.open(d.tables[0]); });
    await page.locator("#keyfields option").first().click();
    await page.locator("#keyright").click();
    expect(await page.evaluate(() => d.tables[0].keys.length)).toBe(1);
    await page.locator("#windowok").click();

    await page.evaluate(() => { d.rowManager.select(d.tables[0].rows[0]); window.confirm = () => true; });
    await page.locator("#removerow").click();
    expect(await page.evaluate(() => ({
        rows: d.tables[0].rows.map((row) => row.getTitle()),
        keys: d.tables[0].keys.map((key) => key.rows.map((row) => row.getTitle())),
    }))).toEqual({ rows: ["Two"], keys: [["Two"]] });
    await page.locator("#removerow").click();
    expect(await page.evaluate(() => [d.tables[0].rows.length, d.tables[0].keys.length])).toEqual([0, 0]);
    const saved = await page.evaluate(() => d.toXML());
    expect(saved).not.toContain("<key ");
    await load(page, saved);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
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

test("transforms an EF description at the SQL Server boundary in Chromium", async ({ page }) => {
    await page.goto("/");
    const boundary = "A".repeat(3750);
    await load(page, `<sql><table name="Item"><row name="Id"><datatype>integer</datatype></row><comment>${boundary}</comment></table></sql>`);
    const generated = await page.evaluate(async () => {
        const stylesheet = await (await fetch("db/ef/output.xsl")).text();
        return d.io.transformEf(stylesheet, d.io.getSafeExportXml("ef"), true);
    });
    expect(generated).toContain(`HasComment("${boundary}")`);
});

test("transforms apostrophe-heavy MSSQL descriptions safely in Chromium", async ({ page }) => {
    await page.goto("/");
    const boundary = "'".repeat(3750);
    await load(page, `<sql><table name="Item"><row name="Details"><datatype>text</datatype><comment>O'Brien</comment></row><comment>${boundary}</comment></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const generated = await page.evaluate(async () => {
        const stylesheet = await (await fetch("db/mssql/output.xsl")).text();
        return d.io.transformEf(stylesheet, d.io.getSafeExportXml("mssql"), false);
    });
    expect(generated).toContain(`@value=N'${boundary.repeat(2)}'`);
    expect(generated).toContain("@value=N'O''Brien'");
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    const oversized = "'".repeat(3751);
    await load(page, `<sql><table name="Item"><row name="Id"><datatype>integer</datatype></row><comment>${oversized}</comment></table></sql>`);
    const oversizedOriginal = await page.evaluate(() => d.toXML());
    const blocked = await page.evaluate(() => d.io.getExportXml("mssql"));
    expect(blocked.safe).toBe(false);
    expect(blocked.diagnostics).toContain("dbo.Item description is 7502 bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the description.");
    expect(await page.evaluate(() => d.toXML())).toBe(oversizedOriginal);
});

test("treats only XML whitespace as an absent description", async ({ page }) => {
    await page.goto("/");
    const nbspBoundary = "\u00a0".repeat(3750);
    expect(await page.evaluate(() => [
        SQL.IO.hasXmlContent(" \t\r\n"),
        SQL.IO.hasXmlContent("\u00a0"),
    ])).toEqual([false, true]);
    await load(page, `<sql><table name="Item"><row name="Space"><datatype>text</datatype><comment> \t\r\n</comment></row></table></sql>`);
    expect((await page.evaluate(() => d.io.getExportXml("sqlite"))).diagnostics).toEqual([]);
    await load(page, `<sql><table name="Item"><row name="Nbsp"><datatype>text</datatype><comment>${nbspBoundary}</comment></row></table></sql>`);
    for (const target of ["mssql", "ef"]) {
        expect((await page.evaluate((value) => d.io.getExportXml(value), target)).safe).toBe(true);
    }
    const unsupported = await page.evaluate(() => d.io.getExportXml("sqlite"));
    expect(unsupported.safe).toBe(true);
    expect(unsupported.diagnostics).toEqual([
        "sqlite export omits table and column descriptions.",
    ]);
    await load(page, `<sql><table name="Item"><row name="Nbsp"><datatype>text</datatype><comment>${nbspBoundary}\u00a0</comment></row></table></sql>`);
    for (const target of ["mssql", "ef"]) {
        const result = await page.evaluate((value) => d.io.getExportXml(value), target);
        expect(result.safe).toBe(false);
        expect(result.diagnostics).toContain("dbo.Item.Nbsp description is 7502 bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the description.");
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
    await expect(page.locator("#serverloadmodel")).toHaveValue("Client round trip");
    await expect(page.locator("#serverloadname")).toHaveValue("Client round trip");
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

test("sends sharing grants as JSON without trimming target IDs", async ({ page }) => {
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
    });
    await page.locator("#servergrantid").fill(" user-id ");
    await page.locator("#servershare").click();
    await expect.poll(() => request && request.headers()["content-type"]).toBe("application/json");
    expect(request.postData()).toBe(JSON.stringify({ targetType: "User", targetId: " user-id ", permission: "View" }));
});

for (const [status, message] of [[400, "Bad Request"], [409, "Conflict"]]) {
    test(`surfaces HTTP ${status} sharing failures`, async ({ page }) => {
        const dialogs = [];
        page.on("dialog", async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });
        await page.goto("/");
        await page.locator("#saveload").click();
        await page.route("**/backend/netcore-ef/access/grant**", async (route) => {
            await route.fulfill({ status });
        });
        await page.evaluate(() => {
            d.io._name = "Saved";
            d.io._csrfToken = "token";
            d.io._serverModelState = "owned";
            d.io.updateServerModelControls();
        });

        await page.locator("#servergrantid").fill("user-id");
        await page.locator("#servershare").click();

        await expect.poll(() => dialogs.at(-1)).toBe(`Server response: ${message}`);
    });
}

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
    await page.locator("#serverloadname").fill("Save name");
    await page.locator("#serverloadmodel").selectOption("Shared");
    await expect(page.locator("#serverloadmodel")).toHaveValue("Shared");
    await expect(page.locator("#serverloadname")).toHaveValue("Save name");
    await expect(page.locator('#serverloadversion option[value=""]')).toHaveText("Latest");
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest && loadRequest.url()).toContain("keyword=Shared");
    await expect.poll(() => loadRequest && loadRequest.url()).not.toContain("version=");
    await expect(page.locator("#serverloadname")).toHaveValue("Shared");

    loadRequest = null;
    await page.locator("#saveload").click();
    await expect(page.locator("#serverloadname")).toHaveValue("Shared");
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
            { keyword: "Duplicate", version: 4, ownerId: "" },
            { keyword: "Duplicate", version: 0, ownerId: null },
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
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    const emptyOwnerIndex = await page.locator("#serverowner option").evaluateAll((options) =>
        options.findIndex((option, index) =>
            index > 0 && option.value === "" && option.dataset.globalOwner !== "true"));
    await page.locator("#serverowner").selectOption({ index: emptyOwnerIndex });
    await expect(page.locator("#serverloadversion option")).toHaveText(["Latest", "v4"]);
    loadRequest = null;
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest ? new URL(loadRequest.url()).searchParams.get("ownerId") : null).toBe("");
    await expect.poll(() => loadRequest ? new URL(loadRequest.url()).searchParams.has("globalOwner") : false).toBe(false);
    await page.locator("#saveload").click();
    await page.locator('[data-source="server"]').click();
    await page.locator("#serverowner").selectOption({ label: "Public models" });
    await expect(page.locator("#serverloadversion option")).toHaveText(["Latest", "v0"]);
    loadRequest = null;
    await page.locator("#ioload").click();
    await expect.poll(() => loadRequest
        ? new URL(loadRequest.url()).searchParams.get("globalOwner")
        : null).toBe("true");
});

test("loads an explicitly global duplicate-name deep link", async ({ page }) => {
    let loadRequest;
    await page.route("**/backend/netcore-ef/load/**", async (route) => {
        loadRequest = route.request();
        const parameters = new URL(loadRequest.url()).searchParams;
        const table = parameters.get("globalOwner") === "true" ? "Global" : "Ambiguous";
        await route.fulfill({
            status: 200,
            contentType: "text/xml",
            body: `<sql><datatypes db="mssql" /><table name="${table}" /></sql>`,
        });
    });

    await page.goto("/?keyword=Duplicate&ownerId=other-owner&globalOwner=true");
    await expect.poll(() => loadRequest && loadRequest.url()).toBeTruthy();
    const parameters = new URL(loadRequest.url()).searchParams;
    expect(parameters.get("keyword")).toBe("Duplicate");
    expect(parameters.get("globalOwner")).toBe("true");
    expect(parameters.has("ownerId")).toBe(false);
    await expect.poll(() => page.evaluate(() => d.tables.map((table) => table.getTitle()))).toEqual(["Global"]);
});

test("preserves the server catalogue and diagram when refresh fails", async ({ page }) => {
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({ status: 503, body: "Unavailable" });
    });
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="StillHere" /></sql>');
    const original = await page.evaluate(() => d.toXML());
    await page.locator("#saveload").click();
    await expect(page.locator('[data-source="server"]')).toBeVisible();
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

test("validates and canonicalizes portable EF facets without mutating the model", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql format="portable-v1"><datatypes db="portable"/><table name="Facets" schema="sales">
      <row name="Amount" null="1"><datatype>decimal( 00018 , 0004 )</datatype></row>
      <row name="Name" null="0"><datatype>string( 00080 )</datatype></row>
      <row name="UnlimitedName" null="0"><datatype>string(MAX)</datatype></row>
      <row name="Payload" null="1"><datatype>binary( 00032 )</datatype></row>
      <row name="UnlimitedPayload" null="1"><datatype>binary(max)</datatype></row>
      <row name="LimitAmount" null="1"><datatype>decimal(2147483647,2147483647)</datatype></row>
      <row name="LimitName" null="1"><datatype>string(2147483647)</datatype></row>
      <row name="LimitPayload" null="1"><datatype>binary(2147483647)</datatype></row>
    </table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const mapped = await page.evaluate(() => d.io.getExportXml("ef"));

    expect(mapped.safe).toBe(true);
    expect(mapped.diagnostics).toEqual([]);
    expect(mapped.xml).toContain("<datatype>decimal(18,4)</datatype>");
    expect(mapped.xml).toContain("<datatype>string(80)</datatype>");
    expect(mapped.xml).toContain("<datatype>string(max)</datatype>");
    expect(mapped.xml).toContain("<datatype>binary(32)</datatype>");
    expect(mapped.xml).toContain("<datatype>binary(max)</datatype>");
    expect(mapped.xml).toContain("<datatype>decimal(2147483647,2147483647)</datatype>");
    expect(mapped.xml).toContain("<datatype>string(2147483647)</datatype>");
    expect(mapped.xml).toContain("<datatype>binary(2147483647)</datatype>");
    expect(await page.evaluate(() => ["decimal", "string", "binary"].map((kind) =>
        SQL.PortableTypes.map({ kind, facets: "" }, "ef").type))).toEqual(["decimal", "string", "binary"]);
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("blocks invalid EF facets with column-qualified diagnostics", async ({ page }) => {
    await page.goto("/");
    const invalid = [
        ["DecimalMissingScale", "decimal(10)"],
        ["DecimalZeroPrecision", "decimal(0,0)"],
        ["DecimalScaleOverPrecision", "decimal(2,3)"],
        ["DecimalNegative", "decimal(10,-1)"],
        ["DecimalUnicodeDigits", "decimal(١٠,٢)"],
        ["DecimalOverInt32", "decimal(2147483648,0)"],
        ["StringZero", "string(0)"],
        ["StringSigned", "string(+1)"],
        ["StringFraction", "string(1.5)"],
        ["StringOverInt32", "string(2147483648)"],
        ["BinaryList", "binary(1,0)"],
        ["BinaryOverInt32", "binary(2147483648)"],
    ];
    const rows = invalid.map(([name, datatype]) =>
        `<row name="${name}" null="1"><datatype>${datatype}</datatype></row>`).join("");
    await load(page, `<sql format="portable-v1"><datatypes db="portable"/><table name="Invalid" schema="sales">${rows}</table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const result = await page.evaluate(() => d.io.getExportXml("ef"));

    expect(result.safe).toBe(false);
    expect(result.diagnostics).toHaveLength(invalid.length);
    for (const [name] of invalid) {
        expect(result.diagnostics.some((message) => message.startsWith(`sales.Invalid.${name}: `))).toBe(true);
    }
    await page.locator("#saveload").click();
    expect(await page.evaluate(() => d.io.getSafeExportXml("ef"))).toBeNull();
    await expect(page.locator("#iostatus")).toContainText("no download was created");
    expect(await page.evaluate(() => d.toXML())).toBe(original);
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

test("edits and round trips optional column classifications", async ({ page }) => {
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="People"><row name="Name" null="0"><datatype>string(20)</datatype><classification>Protected A</classification></row></table></sql>');
    await page.evaluate(() => d.tables[0].rows[0].expand());
    const select = page.getByRole("combobox", { name: "Classification" });
    await expect(select.locator("option")).toHaveText(["", "Public", "Protected A", "Protected B", "Protected C"]);
    await expect(select).toHaveValue("Protected A");
    await select.selectOption("Protected C");
    expect(await page.evaluate(() => d.tables[0].rows[0].collapse())).toBe(true);
    expect(await page.evaluate(() => d.toXML())).toContain("<classification>Protected C</classification>");
    await page.evaluate(() => d.tables[0].rows[0].expand());
    await select.selectOption("");
    expect(await page.evaluate(() => d.tables[0].rows[0].collapse())).toBe(true);
    expect(await page.evaluate(() => d.toXML())).not.toContain("<classification>");
});

test("commits column classifications atomically with row edits", async ({ page }) => {
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="People"><row name="Name"><datatype>string(20)</datatype><classification>Public</classification></row></table></sql>');
    await page.evaluate(() => d.tables[0].rows[0].expand());
    const name = page.locator("tbody.expanded input[type=text]").first();
    const classification = page.getByRole("combobox", { name: "Classification" });
    await classification.selectOption("Protected B");
    await name.fill("");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => ({
        classification: d.tables[0].rows[0].data.classification,
        expanded: d.tables[0].rows[0].expanded,
    }))).toEqual({
        classification: "Public",
        expanded: true,
    });
    expect(await page.evaluate(() => d.toXML())).toContain("<classification>Public</classification>");
    expect(await page.evaluate(() => d.toXML())).not.toContain("<classification>Protected B</classification>");

    await name.fill("DisplayName");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => ({
        classification: d.tables[0].rows[0].data.classification,
        expanded: d.tables[0].rows[0].expanded,
        name: d.tables[0].rows[0].getTitle(),
    }))).toEqual({ classification: "Protected B", expanded: false, name: "DisplayName" });
});

test("warns when exports omit column classifications without mutating the model", async ({ page }) => {
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="People" schema="dbo"><row name="Name"><datatype>string(20)</datatype><classification>Protected A</classification></row><row name="Email"><datatype>string(100)</datatype><classification>Protected B</classification></row></table></sql>');
    const original = await page.evaluate(() => d.toXML());
    const unsupported = await page.evaluate(() => d.io.getExportXml("sqlite"));
    expect(unsupported.safe).toBe(true);
    expect(unsupported.diagnostics).toEqual(["sqlite export omits column data classifications."]);
    expect(unsupported.xml).toContain("<classification>Protected A</classification>");
    expect(unsupported.xml).toContain("<classification>Protected B</classification>");
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="People" schema="sales"><row name="Id"><datatype>integer</datatype><classification>Protected A</classification></row></table><table name="People" schema="archive"><row name="Id"><datatype>integer</datatype><classification>Protected B</classification></row></table></sql>');
    const blockedOriginal = await page.evaluate(() => d.toXML());
    const blocked = await page.evaluate(() => d.io.getExportXml("sqlite"));
    expect(blocked.safe).toBe(false);
    expect(blocked.diagnostics).toContain("sqlite export omits column data classifications.");
    expect(blocked.diagnostics).toContain("sqlite export maps qualified tables archive.People, sales.People to the same unqualified table name.");
    expect(await page.evaluate(() => d.toXML())).toBe(blockedOriginal);
});

test("rejects invalid classifications transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, '<sql format="portable-v1"><datatypes db="portable" /><table name="StillHere" /></sql>');
    const original = await page.evaluate(() => d.toXML());
    for (const classification of [
        "<classification></classification>",
        "<classification> \t\r\n</classification>",
        "<classification> Public</classification>",
        "<classification>Public </classification>",
        "<classification>protected a</classification>",
        "<classification><!--x-->Public</classification>",
        "<classification><![CDATA[Public]]></classification>",
        "<classification><x/>Public</classification>",
        "<classification>Public<x/>Protected A</classification>",
        "<Classification>Public</Classification>",
        "<classification>Public</classification><classification>Protected A</classification>",
    ]) {
        const result = await page.evaluate((value) => {
            const xml = '<sql format="portable-v1"><datatypes db="portable" /><table name="Replacement"><row name="Id"><datatype>integer</datatype>' + value + "</row></table></sql>";
            try { d.fromXML(new DOMParser().parseFromString(xml, "text/xml").documentElement); return "loaded"; }
            catch (error) { return error.message; }
        }, classification);
        expect(result).not.toBe("loaded");
        expect(await page.evaluate(() => d.toXML())).toBe(original);
    }

    const misplaced = await page.evaluate(() => {
        const xml = '<sql format="portable-v1"><datatypes db="portable" /><classification>Public</classification><table name="Replacement"><row name="Id"><datatype>integer</datatype></row></table></sql>';
        try { d.fromXML(new DOMParser().parseFromString(xml, "text/xml").documentElement); return "loaded"; }
        catch (error) { return error.message; }
    });
    expect(misplaced).not.toBe("loaded");
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("edits table records schedules atomically and keeps Enter local to textareas", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="One" schema="sales"><row name="Id"><datatype>integer</datatype></row><comment>Original comment</comment><records-schedule>Original schedule</records-schedule></table><table name="Two" schema="dbo"/></sql>`);
    const original = await page.evaluate(() => d.toXML());
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    const comment = page.getByLabel("Comment");
    const recordsSchedule = page.getByLabel("Records schedule");
    await expect(recordsSchedule).toHaveValue("Original schedule");

    await comment.fill("Pending comment");
    await comment.press("Enter");
    await expect(comment).toHaveValue("Pending comment\n");
    await expect(page.locator("#window")).toBeVisible();
    await recordsSchedule.fill(" \u00a0Pending schedule");
    await recordsSchedule.press("Enter");
    await expect(recordsSchedule).toHaveValue(" \u00a0Pending schedule\n");
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    await page.locator("#tablename").fill("");
    await page.locator("#windowok").click();
    await expect(page.locator("#window")).toBeVisible();
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    await page.locator("#tablename").fill("Two");
    await page.locator("#tableschema").fill("dbo");
    await page.locator("#windowok").click();
    await expect(page.locator("#window")).toBeVisible();
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    await page.locator("#tablename").fill("Renamed");
    await page.locator("#tableschema").fill("sales");
    await page.locator("#windowok").click();
    expect(await page.evaluate(() => ({
        comment: d.tables[0].getComment(),
        name: d.tables[0].getTitle(),
        recordsSchedule: d.tables[0].getRecordsSchedule(),
    }))).toEqual({
        comment: "Pending comment\n",
        name: "Renamed",
        recordsSchedule: " \u00a0Pending schedule\n",
    });

    const saved = await page.evaluate(() => d.toXML());
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await comment.fill("Cancelled comment");
    await recordsSchedule.fill("Cancelled schedule");
    await page.locator("#windowcancel").click();
    expect(await page.evaluate(() => d.toXML())).toBe(saved);

    await page.evaluate(() => d.tableManager.edit());
    await comment.fill("Escaped comment");
    await recordsSchedule.fill("Escaped schedule");
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("round trips exact scalar metadata and normalizes only XML whitespace", async ({ page }) => {
    await page.goto("/");
    const recordsSchedule = " \tRetain \u00a0 seven years\r\n第二行 ";
    await load(page, `<sql><table name="Exact"><row name="Id"><datatype>integer</datatype><comment> \t\r\n</comment></row><records-schedule>&#32;&#9;Retain&#32;\u00a0&#32;seven years&#13;&#10;第二行&#32;</records-schedule><comment> Table&#13;&#10;comment </comment></table><table name="Blank"><comment> \t\r\n</comment><records-schedule> \t\r\n</records-schedule></table><table name="Empty"><comment/><records-schedule/></table></sql>`);
    expect(await page.evaluate(() => ({
        blankComment: d.tables[1].getComment(),
        blankSchedule: d.tables[1].getRecordsSchedule(),
        emptyComment: d.tables[2].getComment(),
        emptySchedule: d.tables[2].getRecordsSchedule(),
        rowComment: d.tables[0].rows[0].data.comment,
        schedule: d.tables[0].getRecordsSchedule(),
        tableComment: d.tables[0].getComment(),
        helpers: [SQL.hasXmlContent(" \t\r\n"), SQL.hasXmlContent("\u00a0"), SQL.IO.hasXmlContent("\u00a0")],
    }))).toEqual({
        blankComment: "",
        blankSchedule: "",
        emptyComment: "",
        emptySchedule: "",
        rowComment: "",
        schedule: recordsSchedule,
        tableComment: " Table\r\ncomment ",
        helpers: [false, true, true],
    });

    const beforeUnchangedSave = await page.evaluate(() => d.toXML());
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await expect(page.getByLabel("Comment")).toHaveValue(" Table\ncomment ");
    await expect(page.getByLabel("Records schedule")).toHaveValue(" \tRetain \u00a0 seven years\n第二行 ");
    await page.locator("#windowok").click();
    expect(await page.evaluate(() => d.toXML())).toBe(beforeUnchangedSave);

    const saved = await page.evaluate(() => d.toXML());
    const parsed = await page.evaluate((xml) => {
        const tables = new DOMParser().parseFromString(xml, "text/xml").querySelectorAll("table");
        return Array.from(tables, (table) => Array.from(table.children, (child) => child.tagName));
    }, saved);
    expect(parsed).toEqual([["row", "comment", "records-schedule"], [], []]);
    expect(saved).toContain("<records-schedule> \tRetain \u00a0 seven years&#13;\n第二行 </records-schedule>");
    await load(page, saved);
    expect(await page.evaluate(() => d.tables[0].getRecordsSchedule())).toBe(recordsSchedule);
    expect(await page.evaluate(() => d.toXML())).toBe(saved);
});

test("rejects malformed comment and records schedule scalars transactionally", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="Keep"><row name="Id"><datatype>integer</datatype><comment>row</comment></row><comment>table</comment><records-schedule>schedule</records-schedule></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    await page.evaluate(() => { d.tableManager.select(d.tables[0]); d.tableManager.edit(); });
    await page.getByLabel("Records schedule").fill("Unsaved schedule");
    const invalid = [
        `<sql><table name="T"><comment><!--x--></comment></table></sql>`,
        `<sql><table name="T"><comment><![CDATA[text]]></comment></table></sql>`,
        `<sql><table name="T"><comment><x/></comment></table></sql>`,
        `<sql><table name="T"><comment>text<!--x--></comment></table></sql>`,
        `<sql><table name="T"><comment>one</comment><comment>two</comment></table></sql>`,
        `<sql><table name="T"><Comment>text</Comment></table></sql>`,
        `<sql><comment>text</comment><table name="T"/></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype><comment><![CDATA[row]]></comment></row></table></sql>`,
        `<sql><table name="T"><records-schedule><!--x--></records-schedule></table></sql>`,
        `<sql><table name="T"><records-schedule><![CDATA[text]]></records-schedule></table></sql>`,
        `<sql><table name="T"><records-schedule><x/></records-schedule></table></sql>`,
        `<sql><table name="T"><records-schedule>text<x/></records-schedule></table></sql>`,
        `<sql><table name="T"><records-schedule>one</records-schedule><records-schedule>two</records-schedule></table></sql>`,
        `<sql><table name="T"><Records-Schedule>text</Records-Schedule></table></sql>`,
        `<sql><records-schedule>text</records-schedule><table name="T"/></sql>`,
        `<sql><table name="T"><row name="Id"><datatype>integer</datatype><records-schedule>text</records-schedule></row></table></sql>`,
    ];
    for (const xml of invalid) {
        const result = await page.evaluate((value) => {
            try {
                d.fromXML(new DOMParser().parseFromString(value, "text/xml").documentElement);
                return "loaded";
            } catch (error) {
                return error.message;
            }
        }, xml);
        expect(result).not.toBe("loaded");
        expect(await page.evaluate(() => d.toXML())).toBe(original);
        await expect(page.getByLabel("Records schedule")).toHaveValue("Unsaved schedule");
        await expect(page.locator("#window")).toBeVisible();
    }
});

test("limits MSSQL records schedules without limiting EF", async ({ page }) => {
    await page.goto("/");
    const boundary = "A".repeat(3750);
    await load(page, `<sql><table name="Item" schema="sales"><row name="Id"><datatype>integer</datatype></row><records-schedule>${boundary}</records-schedule></table></sql>`);
    expect(await page.evaluate(() => d.io.getExportXml("mssql").safe)).toBe(true);
    expect(await page.evaluate(() => d.io.getExportXml("ef").safe)).toBe(true);

    const oversized = "\u{1F600}".repeat(1876);
    await load(page, `<sql><table name="Item" schema="sales"><row name="Id"><datatype>integer</datatype></row><records-schedule>${oversized}</records-schedule></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const mssql = await page.evaluate(() => d.io.getExportXml("mssql"));
    expect(mssql.safe).toBe(false);
    expect(mssql.diagnostics).toContain("sales.Item records schedule is 7504 bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the records schedule.");
    expect(await page.evaluate(() => d.io.getSafeExportXml("mssql"))).toBeNull();
    expect(await page.evaluate(() => d.io.getSafeExportXml("ef"))).not.toBeNull();
    expect(await page.evaluate(() => d.toXML())).toBe(original);
});

test("warns once when configured exporters omit records schedules", async ({ page }) => {
    await page.goto("/");
    await load(page, `<sql><table name="One"><row name="Id"><datatype>integer</datatype></row><records-schedule>one</records-schedule></table><table name="Two"><row name="Id"><datatype>integer</datatype></row><records-schedule>two</records-schedule></table></sql>`);
    const original = await page.evaluate(() => d.toXML());
    const results = await page.evaluate(() => CONFIG.EXPORT_TARGETS
        .filter((target) => target.id !== "mssql" && target.id !== "ef")
        .map((target) => ({ id: target.id, result: d.io.getExportXml(target.id) })));
    for (const { id, result } of results) {
        expect(result.safe).toBe(true);
        expect(result.diagnostics.filter((message) => message.includes("records schedules"))).toEqual([
            `${id} export omits table records schedules.`,
        ]);
    }
    expect(await page.evaluate(() => d.toXML())).toBe(original);

    await load(page, `<sql><table name="People" schema="sales"><row name="Id"><datatype>integer</datatype></row><records-schedule>one</records-schedule></table><table name="People" schema="archive"><row name="Id"><datatype>integer</datatype></row><records-schedule>two</records-schedule></table></sql>`);
    const blockedOriginal = await page.evaluate(() => d.toXML());
    const blocked = await page.evaluate(() => d.io.getExportXml("sqlite"));
    expect(blocked.safe).toBe(false);
    expect(blocked.diagnostics).toContain("sqlite export omits table records schedules.");
    expect(blocked.diagnostics).toContain("sqlite export maps qualified tables archive.People, sales.People to the same unqualified table name.");
    expect(await page.evaluate(() => d.toXML())).toBe(blockedOriginal);
});