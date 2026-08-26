import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edits, saves, reloads, and safely renders the diagram summary", async ({ page }) => {
    await page.goto("/");

    const legend = page.locator(".diagram-legend");
    await expect(legend).toBeHidden();
    await page.locator("#maptoggle").click();
    await expect(legend).toBeVisible();
    await expect(page.locator("#maptools")).toHaveCSS("position", "fixed");
    await expect(page.locator("#maptools")).toHaveCSS("width", "190px");
    await expect(page.locator("#maptools")).toHaveCSS("bottom", "0px");
    expect(await page.locator("#maptoggle").evaluate((toggle) => {
        const bounds = toggle.getBoundingClientRect();
        return Math.round(bounds.bottom) === window.innerHeight;
    })).toBe(true);
    await expect(page.locator("#bar")).toHaveCSS("max-height", "22px");
    await expect(page.locator("#bar")).toHaveCSS("overflow", "hidden");
    await expect(page.locator("#maptools #minimap")).toBeVisible();
    await expect(page.locator("#maptools #minimap")).toHaveCSS("width", "190px");
    await expect(page.locator("#maptools #minimap")).toHaveCSS("height", "190px");
    expect(await page.locator("#minimap").evaluate((minimap) => {
        const bounds = minimap.getBoundingClientRect();
        return minimap.contains(document.elementFromPoint(bounds.left + 4, bounds.top + 4));
    })).toBe(true);
    await expect(legend.getByText("Not yet saved", { exact: true })).toHaveCount(2);
    await expect(legend.getByLabel("Diagram name")).not.toHaveAttribute("placeholder");
    expect(await legend.locator("input").evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label")))).toEqual([
        "Diagram name", "Title", "Application name", "Author",
    ]);
    await page.locator("#maptoggle").click();
    await expect(legend).toBeHidden();
    await page.locator("#maptoggle").click();
    await expect(legend).toBeVisible();

    const markup = '<img src=x data-xss="legend">';
    await legend.getByLabel("Diagram name").fill(markup);
    await legend.getByLabel("Title").fill("Contract Management System");
    await legend.getByLabel("Author").fill("Jacob Will Smith");
    await legend.getByLabel("Application name").fill("Contracts");

    const xml = await page.evaluate(() => d.toXML());
    expect(xml).toContain('<legend name="&lt;img src=x data-xss=&quot;legend&quot;&gt;"');
    expect(xml).toMatch(/created="" modified=""/);
    await expect(legend.getByLabel("Diagram name")).toHaveValue(markup);
    await expect(legend.getByLabel("Title")).toHaveValue("Contract Management System");
    expect(await legend.locator("img").count()).toBe(0);
});

test("does not update summary timestamps for exports or no-op saves", async ({ page }) => {
    await page.goto("/");
    await page.locator("#maptoggle").click();
    await page.locator(".diagram-legend").getByLabel("Title").fill("Export-safe diagram");
    await page.locator("#saveload").click();
    await page.locator('[data-source="xml"]').click();
    await page.locator("#serverloadname").fill("timestamp-test");
    const firstDownloadPromise = page.waitForEvent("download");
    await page.locator("#iosave").click();
    const firstDownload = await firstDownloadPromise;
    const firstXml = await readFile(await firstDownload.path(), "utf8");
    const created = firstXml.match(/created="([^"]*)"/)[1];
    const modified = firstXml.match(/modified="([^"]*)"/)[1];

    await page.locator("#exporttarget").selectOption("mssql");
    const exportDownloadPromise = page.waitForEvent("download");
    await page.locator("#clientsql").click();
    await exportDownloadPromise;
    await expect(page.locator("#throbber")).toBeHidden();
    const afterExport = await page.evaluate(() => d.legend.data.modified);
    expect(afterExport).toBe(modified);

    const secondDownloadPromise = page.waitForEvent("download");
    await page.locator("#iosave").click();
    const secondDownload = await secondDownloadPromise;
    const secondXml = await readFile(await secondDownload.path(), "utf8");
    expect(secondXml.match(/created="([^"]*)"/)[1]).toBe(created);
    expect(secondXml.match(/modified="([^"]*)"/)[1]).toBe(modified);

    await page.locator(".diagram-legend").getByLabel("Author").fill("Updated author");
    const changedDownloadPromise = page.waitForEvent("download");
    await page.locator("#iosave").click();
    const changedDownload = await changedDownloadPromise;
    const changedXml = await readFile(await changedDownload.path(), "utf8");
    expect(changedXml.match(/created="([^"]*)"/)[1]).toBe(created);
    expect(changedXml.match(/modified="([^"]*)"/)[1]).not.toBe(modified);
});

test("adds timestamps when an older model is first saved", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
        d.fromXML(new DOMParser().parseFromString("<sql />", "text/xml").documentElement);
    });
    const xml = await page.evaluate(() => d.toXML());
    expect(xml).toMatch(/<legend[^>]* created="" modified=""/);
});

test("preserves aspect ratio for tall diagrams in the square minimap", async ({ page }) => {
    await page.goto("/");
    const map = await page.evaluate(() => {
        d.width = 3000;
        d.height = 6000;
        d.map.sync();
        return {
            width: d.map.width,
            height: d.map.height,
            mapWidth: d.map.mapWidth,
            mapHeight: d.map.mapHeight,
            offsetX: d.map.offsetX,
            offsetY: d.map.offsetY,
        };
    });

    expect(map.mapHeight).toBeCloseTo(map.height);
    expect(map.mapWidth).toBeCloseTo(map.width / 2);
    expect(map.offsetX).toBeCloseTo(map.width / 4);
    expect(map.offsetY).toBeCloseTo(0);
});
