// Real Firebase SDK 11.0.0, real local RTDB emulator, no production database access.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const namespace = "demo-wishlist-regression-default-rtdb";
const emulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(
  emulator || "",
  /^127\.0\.0\.1:\d+$/,
  "Run with the local demo emulator; refusing any other database host.",
);
const endpoint = `http://${emulator}`;
async function data(location = "", value) {
  // The emulator-only owner token seeds/inspects fixtures; browser SDK requests
  // have no token and are checked against tests/database.rules.json.
  const headers = {
    Authorization: "Bearer owner",
    "Content-Type": "application/json",
  };
  const response = await fetch(
    `${endpoint}/${location}.json?ns=${namespace}`,
    value === undefined
      ? { headers }
      : {
          method: "PUT",
          headers,
          body: JSON.stringify(value),
        },
  );
  assert.equal(response.ok, true, `Emulator ${location}: ${response.status}`);
  return response.json();
}
async function run() {
  const seed = {
    wishlists: {
      Andreas: [
        { title: "Test1", url: null },
        { title: "Test2", url: "https://example.com/gift" },
        { title: "Test3", url: null, note: { size: "M", color: "blue" } },
      ],
      Pappa: [{ title: "En annan persons önskning", url: null }],
    },
  };
  await data("", seed);
  const source = await fs.readFile(
    process.env.WISHLIST_TEST_APP || path.join(root, "app.js"),
    "utf8",
  );
  assert(
    source.includes(
      "database = sdk.getDatabase(appModule.initializeApp(firebaseConfig));",
    ),
  );
  // Instrument only the served test copy. Production app.js is never altered.
  const testSource = source
    .replace(
      "https://familj-wishlist-default-rtdb.europe-west1.firebasedatabase.app",
      `https://${namespace}.firebaseio.com`,
    )
    .replace(
      'projectId: "familj-wishlist"',
      'projectId: "demo-wishlist-regression"',
    )
    .replace(
      "database = sdk.getDatabase(appModule.initializeApp(firebaseConfig));",
      `database = sdk.getDatabase(appModule.initializeApp(firebaseConfig)); sdk.connectDatabaseEmulator(database, "127.0.0.1", ${Number(emulator.split(":")[1])});`,
    );
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const body =
        pathname === "/app.js" ? testSource : await fs.readFile(file);
      const type = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[path.extname(file)];
      res
        .writeHead(200, { "Content-Type": type || "application/octet-stream" })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      headless: true,
    });
    const context = await browser.newContext();
    let forbiddenRequests = 0;
    await context.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === "127.0.0.1" || host === "www.gstatic.com")
        return route.continue();
      forbiddenRequests++;
      return route.abort();
    });
    const page = await context.newPage();
    async function open() {
      await page.goto(url);
      await page.locator(".person-card").first().waitFor();
      await page.locator("#person-select").selectOption("Andreas");
    }
    async function saved(message) {
      await page.waitForFunction(
        () =>
          document.getElementById("workspace").getAttribute("aria-busy") ===
          "false",
        null,
        { timeout: 10000 },
      );
      assert.match(
        await page.locator("#feedback").textContent(),
        new RegExp(message),
      );
    }
    async function remove(title) {
      await page
        .getByRole("button", { name: `Ta bort ${title}`, exact: true })
        .click();
      await page.locator("#delete-confirm").click();
      await saved("Önskningen är borttagen");
    }
    await open();
    assert.equal(await page.locator(".wish-title").count(), 3);
    // The first write after a fresh read must delete only the selected item.
    await remove("Test1");
    assert.deepEqual(await page.locator(".wish-title").allTextContents(), [
      "Test2",
      "Test3",
    ]);
    assert.deepEqual(
      (await data("wishlists/Andreas")).map((item) => item.title),
      ["Test2", "Test3"],
    );
    await open();
    assert.equal(await page.locator(".wish-title").count(), 2);
    // A cold-cache edit preserves unknown fields and does not report a false conflict.
    await page
      .getByRole("button", { name: "Redigera Test3", exact: true })
      .click();
    await page.locator("#wish-title").fill("Test3 ändrad");
    await page.locator("#save-wish").click();
    await saved("Ändringen är sparad");
    assert.deepEqual((await data("wishlists/Andreas"))[1].note, {
      size: "M",
      color: "blue",
    });
    // null URL fields disappear in Firebase; immediate edit/delete must still match.
    await page.locator("#wish-title").fill("Utan länk");
    await page.locator("#save-wish").click();
    await saved("Önskningen är sparad");
    await page
      .getByRole("button", { name: "Redigera Utan länk", exact: true })
      .click();
    await page.locator("#wish-title").fill("Utan länk ändrad");
    await page.locator("#save-wish").click();
    await saved("Ändringen är sparad");
    await remove("Utan länk ändrad");
    assert.equal((await data("wishlists/Andreas")).length, 2);
    // A real concurrent change must be refused and the actual server list shown.
    await page
      .getByRole("button", { name: "Ta bort Test2", exact: true })
      .click();
    const concurrent = await data("wishlists/Andreas");
    concurrent[0].title = "Ändrad av en annan klient";
    await data("wishlists/Andreas", concurrent);
    await page.locator("#delete-confirm").click();
    await saved("Listan har ändrats");
    assert.deepEqual(await page.locator(".wish-title").allTextContents(), [
      "Ändrad av en annan klient",
      "Test3 ändrad",
    ]);
    assert.equal((await data("wishlists/Andreas")).length, 2);
    await page.locator("#delete-cancel").click();
    // Removing the last item is a legitimate null server value, unlike an abort.
    await remove("Ändrad av en annan klient");
    await remove("Test3 ändrad");
    assert.equal(await data("wishlists/Andreas"), null);
    await open();
    assert.equal(
      await page.getByText("Inga önskningar ännu.", { exact: true }).count(),
      1,
    );
    await page.locator("#wish-title").fill("Ny önskning efter tom lista");
    await page.locator("#save-wish").click();
    await saved("Önskningen är sparad");
    await open();
    assert.deepEqual(await page.locator(".wish-title").allTextContents(), [
      "Ny önskning efter tom lista",
    ]);
    assert.deepEqual(await data("wishlists/Pappa"), [
      { title: "En annan persons önskning" },
    ]);
    assert.equal(forbiddenRequests, 0);
    console.log(
      "PASS real Firebase SDK + local emulator: cold-cache delete/edit, null URL round trip, preserved metadata, real conflict, last deletion, add to empty list, persistence after reload, other members unchanged. No production database access.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
