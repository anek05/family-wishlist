// Browser regression tests. Firebase modules are intercepted: no production reads or writes.
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const seed = {
  Linnéa: [
    { title: "En varm stickad tröja", url: "https://example.com/troja" },
  ],
  Pappa: [{ title: "En riktigt bra kaffekvarn", url: null }],
  Andreas: [
    { title: "Böcker till jullovet", url: "https://example.com/bocker" },
  ],
};
const databaseMock = `
const state = window.__firebaseTest;
export const getDatabase = () => ({});
export const ref = (_, path) => path;
const read = path => path === 'wishlists' ? state.data : state.data[path.slice(10)] ?? null;
const snapshot = value => ({val: () => structuredClone(value), exists: () => value != null});
const activePaths = new Set();
export function onValue(path, callback, onError) {
  activePaths.add(path);
  state.listeners = activePaths.size;
  queueMicrotask(() => {
    if (state.failLoad) onError(Error('Permission denied'));
    else callback(snapshot(read(path)));
  });
  return () => { activePaths.delete(path); state.listeners = activePaths.size; };
}
export async function get(path) {
  if (state.failNextGet) { state.failNextGet = false; throw Error('Refresh failed'); }
  if (state.failLoad) throw Error('Permission denied');
  return snapshot(read(path));
}
export async function runTransaction(path, update) {
  state.attempts++;
  if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
  if (state.failSave) throw Error('Permission denied');
  if (!activePaths.has(path)) {
    // A one-off get() need not warm the cache used by transactions.
    const initial = update(null);
    if (initial === undefined) return {committed:false, snapshot:snapshot(null)};
  }
  const name = path.slice(10);
  if (state.concurrent) {
    state.data[name] = structuredClone(state.concurrent);
    state.concurrent = null;
  }
  const next = update(structuredClone(read(path)));
  if (next === undefined) {
    if (state.failConflictRefresh) state.failNextGet = true;
    return {committed:false, snapshot:snapshot(null)};
  }
  state.data[name] = next;
  state.writes++;
  return {committed:true, snapshot:snapshot(next)};
}`;
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};
async function run() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : decodeURIComponent(pathname)),
      );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await fs.readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((data) => {
      window.__firebaseTest = {
        data: JSON.parse(
          sessionStorage.getItem("fixture") || JSON.stringify(data),
        ),
        failLoad: sessionStorage.getItem("failLoad") === "true",
        writes: 0,
        attempts: 0,
      };
    }, seed);
    await page.route("https://www.gstatic.com/firebasejs/**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: route.request().url().includes("firebase-app.js")
          ? "export const initializeApp = config => config;"
          : databaseMock,
      }),
    );
    // Fail closed if a regression tries to access the real database directly.
    let realDatabaseRequests = 0;
    await page.route(/firebasedatabase\.app|firebaseio\.com/, (route) => {
      realDatabaseRequests++;
      return route.abort();
    });
    const open = (name) => page.locator("#person-select").selectOption(name);
    const title = page.locator("#wish-title"),
      link = page.locator("#wish-url");
    const save = page.locator("#save-wish");
    async function waitStatus(text) {
      await page.waitForFunction(
        (text) =>
          document.querySelector("#feedback").textContent.includes(text),
        text,
      );
    }
    async function axe(label) {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
        label,
      );
    }
    async function layout(width, label) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `No overflow: ${label} at ${width}`,
      );
      const small = await page
        .locator(
          "button:visible, input:visible, select:visible, nav a:visible, .wish-link:visible",
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => n.getBoundingClientRect().height < 43)
            .map((n) => n.outerHTML),
        );
      assert.deepEqual(small, [], `Touch target heights: ${label} at ${width}`);
    }
    await page.goto(url);
    await page.locator(".person-card").first().waitFor();
    assert.equal(await page.locator(".person-card").count(), 7);
    assert.equal(await page.locator(".wish-title").count(), 3);
    await axe("All lists accessibility");
    await page.screenshot({
      path: path.join(output, "desktop.png"),
      fullPage: true,
    });
    for (const width of [320, 375, 390, 430, 768, 1280])
      await layout(width, "all lists");
    await page.getByRole("button", { name: "Till min kravlista" }).click();
    assert.equal(
      await page
        .locator("#person-select")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Öppna Pappas kravlista" }).click();
    assert.equal(
      await title.evaluate((el) => el === document.activeElement),
      true,
    );
    await title.fill("Ullsockor");
    await link.fill("https://example.com/sockor");
    await save.click();
    await waitStatus("Önskningen är sparad");
    assert.equal(await page.locator(".wish-title").count(), 2);
    assert.equal(await title.inputValue(), "");
    assert.equal(
      await page.locator("a.wish-link").getAttribute("rel"),
      "noopener noreferrer",
    );
    await page
      .getByRole("button", { name: "Redigera Ullsockor", exact: true })
      .click();
    assert.equal(await title.inputValue(), "Ullsockor");
    await title.fill("Varma ullsockor");
    await link.fill("");
    await title.press("Enter");
    await waitStatus("Ändringen är sparad");
    assert.equal(
      await page.getByText("Varma ullsockor", { exact: true }).count(),
      1,
    );
    await page
      .getByRole("button", { name: "Redigera Varma ullsockor", exact: true })
      .click();
    await title.fill("Ska inte sparas");
    await page.locator("#cancel-edit").click();
    assert.equal(await title.inputValue(), "");
    assert.equal(
      await page.getByText("Varma ullsockor", { exact: true }).count(),
      1,
    );
    await page
      .getByRole("button", { name: "Ta bort Varma ullsockor", exact: true })
      .click();
    assert.equal(
      await page
        .locator("#delete-cancel")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await axe("Delete dialog accessibility");
    await page.locator("#delete-cancel").press("Tab");
    assert.equal(
      await page
        .locator("#delete-confirm")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#delete-confirm").press("Shift+Tab");
    assert.equal(
      await page
        .locator("#delete-cancel")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#delete-cancel").press("Escape");
    assert.equal(
      await page.locator("#delete-modal").evaluate((el) => el.open),
      false,
    );
    assert.equal(
      await page.getByText("Varma ullsockor", { exact: true }).count(),
      1,
    );
    await page
      .getByRole("button", { name: "Ta bort Varma ullsockor", exact: true })
      .click();
    await page.locator("#delete-confirm").click();
    await waitStatus("Önskningen är borttagen");
    assert.equal(await page.locator(".wish-title").count(), 1);
    // Empty and invalid input must not write anything.
    const writes = await page.evaluate(() => window.__firebaseTest.writes);
    await save.click();
    await title.fill("   ");
    await save.click();
    await title.fill("Farlig länk");
    await link.fill("javascript:alert(1)");
    await save.click();
    assert.equal(
      await page.evaluate(() => window.__firebaseTest.writes),
      writes,
    );
    // Save errors keep the original list and the draft, allowing a retry.
    await page.evaluate(() => {
      window.__firebaseTest.failSave = true;
    });
    await title.fill("En bok");
    await link.fill("");
    await save.click();
    await waitStatus("Ändringen kunde inte sparas");
    assert.equal(await title.inputValue(), "En bok");
    assert.equal(await page.locator(".wish-title").count(), 1);
    await page.evaluate(() => {
      window.__firebaseTest.failSave = false;
      window.__firebaseTest.delay = 250;
    });
    await save.click();
    assert.equal(await save.isDisabled(), true);
    await waitStatus("Önskningen är sparad");
    assert.equal(
      await page.evaluate(() => window.__firebaseTest.writes),
      writes + 1,
    );
    // Concurrent additions are preserved instead of being overwritten by the browser's stale list.
    await page.evaluate(() => {
      window.__firebaseTest.concurrent = [
        ...window.__firebaseTest.data.Pappa,
        { title: "Samtidigt krav", url: null },
      ];
    });
    await title.fill("Mitt nya krav");
    await save.click();
    await waitStatus("Önskningen är sparad");
    assert.equal(
      await page.getByText("Samtidigt krav", { exact: true }).count(),
      1,
    );
    // A stale edit/delete must never modify another wish after an index shifted.
    await page
      .getByRole("button", { name: "Redigera En bok", exact: true })
      .click();
    await page.evaluate(() => {
      window.__firebaseTest.concurrent = [{ title: "Flyttat krav", url: null }];
    });
    await title.fill("Inaktuell ändring");
    await save.click();
    await waitStatus("Listan har ändrats");
    assert.equal(
      await page.getByText("Flyttat krav", { exact: true }).count(),
      1,
    );
    assert.equal(await title.inputValue(), "Inaktuell ändring");
    await page.locator("#cancel-edit").click();
    await page
      .getByRole("button", { name: "Ta bort Flyttat krav", exact: true })
      .click();
    await page.evaluate(() => {
      window.__firebaseTest.failSave = true;
    });
    await page.locator("#delete-confirm").click();
    await page
      .locator("#delete-error")
      .getByText(/kunde inte sparas/)
      .waitFor();
    assert.equal(
      await page.locator("#delete-modal").evaluate((el) => el.open),
      true,
    );
    await page.locator("#delete-cancel").click();
    await page.evaluate(() => {
      window.__firebaseTest.failSave = false;
    });
    // A failed conflict refresh must not replace a visible list with the null
    // snapshot returned by an aborted transaction.
    await page
      .getByRole("button", { name: "Ta bort Flyttat krav", exact: true })
      .click();
    await page.evaluate(() => {
      window.__firebaseTest.failConflictRefresh = true;
      window.__firebaseTest.concurrent = [
        { title: "Någon annans ändring", url: null },
      ];
    });
    await page.locator("#delete-confirm").click();
    await waitStatus("Ändringen kunde inte sparas");
    assert.equal(
      await page.getByText("Flyttat krav", { exact: true }).count(),
      1,
    );
    assert.equal(await page.locator(".wish-title").count(), 1);
    assert.equal(
      await page.evaluate(() => window.__firebaseTest.writes),
      writes + 2,
    );
    assert.equal(await page.evaluate(() => window.__firebaseTest.listeners), 0);
    await page.locator("#delete-cancel").click();
    await page.evaluate(() => {
      window.__firebaseTest.failConflictRefresh = false;
    });
    // Hostile legacy text is rendered as text; unsafe links never become active.
    await page.evaluate(() => {
      window.__firebaseTest.data.Elsa = [
        { title: "<img src=x onerror=alert(1)>", url: "javascript:alert(1)" },
        {
          title: "L".repeat(500),
          url: "https://example.com/" + "a".repeat(500),
        },
      ];
      sessionStorage.setItem(
        "fixture",
        JSON.stringify(window.__firebaseTest.data),
      );
    });
    await page.reload();
    await page.locator(".person-card").first().waitFor();
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator(".wish-title img").count(), 0);
    await open("Elsa");
    assert.equal(
      await page.locator(".wish-title").nth(1).textContent(),
      "L".repeat(500),
    );
    for (const width of [320, 375, 390, 430, 768, 1280])
      await layout(width, "long content");
    // Restore simple demo fixtures for review screenshots and inspect the empty state.
    await open("Mormor");
    assert.equal(
      await page.getByText("Inga önskningar ännu.", { exact: true }).count(),
      1,
    );
    await axe("Empty list accessibility");
    await open("Linnéa");
    for (const width of [375, 390, 430]) {
      await layout(width, "selected list");
      await axe(`Selected list accessibility at ${width}`);
      await page.screenshot({
        path: path.join(output, `mobile-${width}.png`),
        fullPage: true,
      });
    }
    // Verify failed startup cannot expose editing an unloaded, apparently empty list.
    await page.evaluate(() => {
      sessionStorage.setItem("failLoad", "true");
    });
    await page.reload();
    await page.locator("#retry").waitFor();
    assert.equal(await page.locator("#workspace").isVisible(), false);
    assert.match(
      await page.locator("#load-message").textContent(),
      /tjänsten nekar åtkomst/,
    );
    await page
      .getByRole("button", { name: "Se familjens önskelistor" })
      .click();
    assert.equal(
      await page
        .locator("#load-message")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.waitForFunction(() => {
      const rect = document
        .getElementById("load-message")
        .getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await page.evaluate(() => {
      window.__firebaseTest.failLoad = false;
    });
    await page.locator("#retry").click();
    await page.locator(".person-card").first().waitFor();
    assert.equal(await page.locator(".person-card").count(), 7);
    assert.equal(realDatabaseRequests, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: all 7 lists; add/edit/cancel/delete; keyboard; validation; failed load/save/delete and retry; concurrent writes; unsafe content; 320/375/390/430/768/1280 px; touch targets; axe WCAG 2.2 AA checks. No production database requests.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
