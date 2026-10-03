import { expect, test, type Page } from "@playwright/test";

async function guess(page: Page, word: string, rowsAfter?: number) {
  const input = page.locator("#guess-input");
  await input.fill(word);
  await input.press("Enter");
  if (rowsAfter !== undefined) {
    await expect(page.locator("#guesses li:not(.latest)")).toHaveCount(rowsAfter);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#issue")).toContainText("No.");
});

test("loads today's clip and the empty board", async ({ page }) => {
  await expect(page.locator("#clip")).toHaveAttribute("src", /\/clip\/-?\d+/);
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(5);
  await page.screenshot({
    path: `test-results/shots/${test.info().project.name}-start.png`,
    fullPage: true,
  });
});

test("tapping the clip restarts it from the beginning", async ({ page }) => {
  const clip = page.locator("#clip");
  await page.waitForFunction(
    () => (document.getElementById("clip") as HTMLVideoElement).currentTime > 0.5,
  );
  await page.locator("#clip-tap").click();
  const t = await clip.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeLessThan(0.4);
  await expect(page.locator("#clip-tap-label")).toBeHidden();
});

test("rejects non-words and repeats without counting them", async ({ page }) => {
  await guess(page, "zzzzz");
  await expect(page.locator("#feedback")).toHaveText("Not in the word list.");
  await expect(page.locator("#guesses li")).toHaveCount(0);
  await guess(page, "crane", 1);
  await guess(page, "crane");
  await expect(page.locator("#feedback")).toHaveText("Already tried that one.");
  await expect(page.locator("#guesses li")).toHaveCount(1);
  await guess(page, "slate", 2);
  await expect(page.locator("#guesses li.latest .word")).toHaveText("slate");
  await page.screenshot({
    path: `test-results/shots/${test.info().project.name}-midgame.png`,
    fullPage: true,
  });
});

test("plays through to a solve, shows the histogram, and remembers it", async ({ page }) => {
  await guess(page, "crane", 1);
  await guess(page, "grave", 2);
  await expect(page.locator("#guesses li.latest .word")).toHaveText("grave");
  await expect(page.locator("#guesses li:not(.latest) .word")).toHaveText(["grave", "crane"]);
  await expect(page.locator("#guesses li:not(.latest) .verdict").first()).toHaveText("close");
  await guess(page, "brave", 3);
  await expect(page.locator("#guesses li.latest")).toHaveCount(0);
  await expect(page.locator("#guesses li .word")).toHaveText(["brave", "grave", "crane"]);
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText("Solved in 3.");
  await expect(page.locator("#guesses li.hit .word")).toHaveText("brave");
  await expect(page.locator("#histogram .label.mine")).toHaveText("3");
  await expect(page.locator("#next")).toContainText("Next word in");
  await page.screenshot({
    path: `test-results/shots/${test.info().project.name}-solved.png`,
    fullPage: true,
  });

  await expect(page.locator("#clip")).toHaveJSProperty("muted", false);

  await page.reload();
  await expect(page.locator("#result-title")).toHaveText("Solved in 3.");
  await expect(page.locator("#guesses li")).toHaveCount(3);
  await expect(page.locator("#guess-input")).toBeDisabled();
  await expect(page.locator("#clip")).toHaveJSProperty("muted", true);
  await page.locator("#clip-tap").click();
  await expect(page.locator("#clip")).toHaveJSProperty("muted", false);
});

test("give up appears after five misses, asks twice, and reveals the word", async ({ page }) => {
  const giveUp = page.locator("#give-up");
  await expect(giveUp).toBeHidden();
  const misses = ["crane", "grave", "slate", "trace", "plane"];
  for (const [i, w] of misses.entries()) await guess(page, w, i + 1);
  await expect(giveUp).toBeVisible();
  await expect(giveUp).toHaveText("Give up");
  await giveUp.click();
  await expect(giveUp).toHaveText("Show the answer?");
  await giveUp.click();
  await expect(page.locator("#result-title")).toBeHidden();
  await expect(page.locator(".slot")).toHaveText(["b", "r", "a", "v", "e"]);
  await expect(page.locator("#guess-input")).toBeDisabled();
  await expect(page.locator("#guesses li.hit")).toHaveCount(0);
  await expect(page.locator("#histogram .label.mine")).toHaveText("gave up");
  await expect(page.locator("#clip")).toHaveJSProperty("muted", false);
  await page.screenshot({
    path: `test-results/shots/${test.info().project.name}-gave-up.png`,
    fullPage: true,
  });

  await page.reload();
  await expect(page.locator(".slot")).toHaveText(["b", "r", "a", "v", "e"]);
  await expect(page.locator("#result-title")).toBeHidden();
  await expect(page.locator("#give-up")).toBeHidden();
  await expect(page.locator("#guess-input")).toBeDisabled();
});

test("shows yesterday's word in the footer", async ({ page }) => {
  await expect(page.locator("#yesterday")).toHaveText("Yesterday: brave");
});

test("theme toggle persists across reloads", async ({ page }) => {
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await page.locator("#theme").click();
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(after).not.toBe(before);
  await page.reload();
  const persisted = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );
  expect(persisted).toBe(after);
  await page.screenshot({
    path: `test-results/shots/${test.info().project.name}-theme.png`,
    fullPage: true,
  });
});

test("how to play opens and closes", async ({ page }) => {
  await page.locator("#how").click();
  await expect(page.locator("#how-dialog")).toBeVisible();
  await page.locator("#how-dialog button").click();
  await expect(page.locator("#how-dialog")).toBeHidden();
});

test("clip endpoint honours range requests", async ({ request, page }) => {
  const src = await page.locator("#clip").getAttribute("src");
  const res = await request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(res.status()).toBe(206);
  expect(res.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect(res.headers()["content-type"]).toBe("video/mp4");
});
