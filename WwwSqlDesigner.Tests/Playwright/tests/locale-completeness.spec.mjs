import { test, expect } from "@playwright/test";

test("includes HTTP response strings in every supported locale", async ({ page }) => {
    await page.goto("/");
    const locales = await page.evaluate(() => CONFIG.AVAILABLE_LOCALES);
    const requiredKeys = ["http201", "http400", "http404", "http409", "http500", "http501", "http503"];
    const localeKeys = await page.evaluate(async (availableLocales) => {
        const entries = await Promise.all(availableLocales.map(async (locale) => {
            const response = await fetch(`/locale/${locale}.xml`);
            const xml = new DOMParser().parseFromString(await response.text(), "text/xml");
            return {
                locale,
                keys: Array.from(xml.querySelectorAll("string")).map((string) => string.getAttribute("name")),
            };
        }));
        return entries;
    }, locales);

    for (const locale of localeKeys) {
        for (const key of requiredKeys) {
            expect(locale.keys, `${locale.locale} locale`).toContain(key);
        }
    }
});
