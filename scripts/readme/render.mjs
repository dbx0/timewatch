// Renders the README media (docs/assets) from the real UI running in a demo harness.
//   pnpm readme:assets            everything
//   pnpm readme:assets week day   only these scenes (plus nothing else)
//   pnpm readme:assets cover      only the cover
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ASSETS, OUT, Pointer, encodeMaster, ffmpeg, kb, launch, newPage, poster, record, sleep, startServer, toGif, typeText,
} from "./lib.mjs";

const NOTCH_CROP = { x: 240, y: 0, w: 800, h: 500 };
const REPORT_CROP = { x: 40, y: 36, w: 1200, h: 750 };
const SETTINGS_CROP = { x: 100, y: 0, w: 1080, h: 675 };
const ONBOARD_CROP = { x: 100, y: 0, w: 1024, h: 640 };

const notch = (page) => page.frameLocator("#notch-frame");
const win = (page, kind) => page.frameLocator(`#win-${kind}`);

/** Pointer near the left ear of the pill (the notch is the middle 185 px). */
const PILL = { x: 520, y: 16 };

const scenes = {
  // Hover intent opens the panel; search and switch; the panel closes when the pointer leaves.
  hero: {
    desktop: "notch",
    crop: NOTCH_CROP,
    poster: 4.2,
    async run({ page, p }) {
      const n = notch(page);
      await p.set(820, 430);
      await sleep(1400);
      await p.glide(PILL.x, PILL.y + 2, 1000);
      await sleep(1900);
      await p.to(n.getByRole("option", { name: /Migration/ }), { ms: 700, anchor: "left" });
      await sleep(500);
      await p.to(n.getByRole("option", { name: /Support/ }), { ms: 450, anchor: "left" });
      await sleep(600);
      await p.clickOn(n.getByRole("combobox"), { ms: 600, anchor: "left" });
      await sleep(350);
      await typeText(page, "migr", 110);
      await sleep(700);
      await page.keyboard.press("Enter");
      await sleep(2200);
      // A click elsewhere takes the keyboard back: the pinned panel folds into the pill.
      await p.glide(760, 470, 900);
      await sleep(250);
      await p.click();
      await sleep(2600);
    },
  },

  // Global shortcut, create a project from the search, recents on 1-4, Esc.
  notch: {
    desktop: "notch",
    crop: NOTCH_CROP,
    poster: 6.2,
    async run({ page, p }) {
      const n = notch(page);
      await p.set(860, 440);
      await sleep(1100);
      await page.evaluate(() => window.__demo.shortcut());
      await sleep(1100);
      await typeText(page, "Roadmap", 110);
      await sleep(800);
      await page.keyboard.press("Enter");
      await sleep(1000);
      await p.clickOn(n.getByRole("button", { name: "Acme Corp" }), { ms: 800 });
      await sleep(400);
      await p.clickOn(n.getByRole("radio").nth(5), { ms: 500 });
      await sleep(400);
      await p.clickOn(n.getByRole("button", { name: "Create and start" }), { ms: 600 });
      await sleep(1800);
      await page.evaluate(() => window.__demo.keys(["esc"], 900));
      await page.keyboard.press("Escape");
      await sleep(400);
      await p.glide(830, 420, 700);
      await sleep(1200);
      await p.glide(PILL.x, PILL.y + 2, 900);
      await sleep(1100);
      // A click on the panel (not the search) gives it the keyboard: 1-4 switch, space pauses.
      await p.clickOn(n.locator("[data-panel] .font-mono").first(), { ms: 500 });
      await sleep(500);
      await page.evaluate(() => window.__demo.keys(["2"], 900));
      await page.keyboard.press("2");
      await sleep(1800);
      await page.evaluate(() => window.__demo.keys(["esc"], 900));
      await page.keyboard.press("Escape");
      await sleep(400);
      await p.glide(840, 440, 700);
      await sleep(1800);
    },
  },

  // Back from a break: the notch opens by itself and asks; never discounts on its own.
  absence: {
    desktop: "notch",
    crop: NOTCH_CROP,
    poster: 2.2,
    async run({ page, p }) {
      const n = notch(page);
      await p.set(900, 470);
      await sleep(1000);
      await page.evaluate(() => window.__demo.absence(42));
      await sleep(2600);
      await p.to(n.getByRole("button", { name: "Discount" }), { ms: 900 });
      await sleep(500);
      await p.to(n.getByRole("button", { name: "It was lunch" }), { ms: 400 });
      await sleep(400);
      await p.clickOn(n.getByRole("button", { name: "Meetings" }), { ms: 700 });
      await sleep(1600);
      await p.glide(1000, 470, 800);
      await sleep(2400);
    },
  },

  // Pause, then "What did you do?".
  note: {
    desktop: "notch",
    crop: NOTCH_CROP,
    poster: 4.6,
    async run({ page, p }) {
      const n = notch(page);
      await p.set(860, 440);
      await sleep(900);
      await p.glide(PILL.x, PILL.y + 2, 900);
      await sleep(1300);
      await p.clickOn(n.getByRole("button", { name: "Pause (space)" }), { ms: 800 });
      await sleep(1200);
      await typeText(page, "Reviewed the pricing page with the client", 55);
      await sleep(700);
      await page.keyboard.press("Enter");
      await sleep(1200);
      await p.glide(780, 470, 800);
      await sleep(2400);
    },
  },

  // Week grid: copy a number, group by client, export.
  week: {
    desktop: "report",
    crop: REPORT_CROP,
    poster: 1.0,
    async run({ page, p }) {
      const w = win(page, "report");
      await p.set(1100, 700);
      await sleep(1200);
      await p.to(w.getByRole("button", { name: "Copy 3.25" }), { ms: 1000 });
      await sleep(900);
      await p.clickOn(w.getByRole("button", { name: "Copy 10.33" }), { ms: 600 });
      await sleep(1800);
      await p.clickOn(w.getByRole("radio", { name: "By client" }), { ms: 900 });
      await sleep(1900);
      await p.clickOn(w.getByRole("button", { name: "Copy 13.16" }), { ms: 800 });
      await sleep(1500);
      await p.clickOn(w.getByRole("button", { name: /^Export/ }), { ms: 800 });
      await sleep(900);
      await p.clickOn(w.getByRole("switch"), { ms: 600 });
      await sleep(700);
      await p.clickOn(w.getByRole("button", { name: /^CSV/ }), { ms: 600 });
      await sleep(2400);
    },
  },

  // Day view: timeline, notes, editable times.
  day: {
    desktop: "report",
    crop: REPORT_CROP,
    poster: 3.0,
    async run({ page, p }) {
      const w = win(page, "report");
      await p.set(1000, 640);
      await sleep(900);
      await p.clickOn(w.getByRole("button", { name: /Thu\s*12/ }), { ms: 900 });
      await sleep(1800);
      const running = w.locator(".group", { hasText: "now" }).first();
      await p.to(running, { ms: 800, dx: 120 });
      await sleep(500);
      await p.clickOn(running.getByRole("button", { name: "Add note" }), { ms: 600 });
      await sleep(600);
      await typeText(page, "Pricing page copy review", 60);
      await sleep(500);
      await page.keyboard.press("Enter");
      await sleep(1300);
      const startPill = w.getByText("09:00", { exact: true }).first();
      await p.clickOn(startPill, { ms: 900 });
      await sleep(800);
      const panel = w.getByTestId("timepicker-panel");
      const opt = (col, text) => panel.getByRole("listbox").nth(col).getByRole("option").filter({ hasText: new RegExp(`^${text}$`) });
      await p.clickOn(opt(0, "08"), { ms: 500 });
      await sleep(400);
      // Scroll the minute column with the wheel, like a person would.
      await p.to(panel.getByRole("listbox").nth(1), { ms: 400 });
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, 90);
        await sleep(45);
      }
      await sleep(250);
      await opt(1, "50").scrollIntoViewIfNeeded();
      await p.clickOn(opt(1, "50"), { ms: 350 });
      await sleep(2200);
      await p.glide(1060, 300, 900);
      await sleep(1200);
    },
  },

  settings: {
    desktop: "settings",
    crop: SETTINGS_CROP,
    poster: 1.0,
    async run({ page, p }) {
      const w = win(page, "settings");
      await p.set(1000, 600);
      await sleep(1100);
      await p.clickOn(w.getByRole("radio", { name: "15 min" }), { ms: 900 });
      await sleep(1300);
      await p.clickOn(w.getByRole("button", { name: "Workday and overtime" }), { ms: 800 });
      await sleep(1100);
      await p.clickOn(w.getByRole("button", { name: "Increase" }).nth(4), { ms: 800 });
      await sleep(350);
      await p.click();
      await sleep(1000);
      await p.clickOn(w.getByRole("button", { name: "Lunch" }), { ms: 800 });
      await sleep(1600);
      await p.clickOn(w.getByRole("button", { name: "Away time" }), { ms: 500 });
      await sleep(1600);
      await p.clickOn(w.getByRole("button", { name: "Projects" }), { ms: 500 });
      await sleep(2400);
    },
  },

  onboarding: {
    desktop: "onboarding",
    crop: ONBOARD_CROP,
    poster: 1.0,
    async run({ page, p }) {
      const w = win(page, "onboarding");
      await p.set(900, 560);
      await sleep(1300);
      await p.clickOn(w.getByRole("button", { name: "Set up (1 min)" }), { ms: 800 });
      await sleep(700);
      await p.clickOn(w.getByPlaceholder("Client (e.g. Acme)"), { ms: 700 });
      await typeText(page, "Acme Corp", 60);
      await page.keyboard.press("Tab");
      await typeText(page, "Website", 60);
      await page.keyboard.press("Enter");
      await sleep(400);
      await p.clickOn(w.getByPlaceholder("Client (e.g. Acme)"), { ms: 500 });
      await page.keyboard.press("ControlOrMeta+a");
      await typeText(page, "Globex", 60);
      await page.keyboard.press("Tab");
      await typeText(page, "Migration", 60);
      await page.keyboard.press("Enter");
      await sleep(900);
      await p.clickOn(w.getByRole("button", { name: "Continue" }), { ms: 800 });
      await sleep(1400);
      await p.clickOn(w.getByRole("button", { name: "Continue" }), { ms: 400 });
      await sleep(900);
      await p.clickOn(w.getByRole("radio", { name: "1h", exact: true }), { ms: 700 });
      await sleep(900);
      await p.clickOn(w.getByRole("button", { name: "Continue" }), { ms: 700 });
      await sleep(800);
      await p.clickOn(w.getByRole("radio", { name: "15 min" }), { ms: 700 });
      await sleep(1300);
      await p.clickOn(w.getByRole("button", { name: "Continue" }), { ms: 700 });
      await sleep(1000);
      await p.clickOn(w.getByRole("button", { name: "Start on Website" }), { ms: 800 });
      await sleep(900);
      await p.glide(980, 520, 800);
      await sleep(3500);
    },
  },
};

/** Order of the scenes in demo.mp4. */
const DEMO = ["hero", "absence", "note", "week", "day"];
const FEATURES = ["notch", "absence", "note", "week", "day", "settings", "onboarding"];

async function renderScene(browser, url, name) {
  const sc = scenes[name];
  console.log(`scene ${name}`);
  const page = await newPage(browser, `${url}desktop.html?scene=${sc.desktop}`);
  await page.frameLocator("#notch-frame").locator("[data-view=notch]").waitFor();
  if (sc.desktop !== "notch") await page.frameLocator(`#win-${sc.desktop}`).locator(`[data-view=${sc.desktop}]`).waitFor();
  await sleep(1200);
  const p = new Pointer(page);
  await p.set(p.x, p.y);
  const rec = await record(page, sc.crop);
  await sleep(150);
  try {
    await sc.run({ page, p });
  } catch (e) {
    await rec.stop();
    await page.screenshot({ path: path.join(OUT, `error-${name}.png`) });
    await page.context().close();
    throw e;
  }
  const frames = await rec.stop();
  await page.context().close();
  // Masters: 1440 wide for demo.mp4; the GIFs are scaled down from them.
  return encodeMaster(frames, name, sc.crop, 1440, 0.15);
}

async function renderCover(browser, url) {
  console.log("cover");
  const page = await newPage(browser, `${url}cover.html?scene=cover`, { width: 1280, height: 640 });
  await page.frameLocator("#notch-frame").locator("[data-view=notch]").waitFor();
  await sleep(600);
  await page.evaluate(() => window.__demo.expand());
  await page.frameLocator("#notch-frame").locator("[data-panel]").waitFor();
  await sleep(1500);
  const png = path.join(OUT, "cover.png");
  await page.screenshot({ path: png });
  await page.context().close();
  ffmpeg(["-i", png, "-vf", "scale=1280:-2:flags=lanczos", "-q:v", "2", path.join(ASSETS, "cover.jpg")]);
}

function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

const args = process.argv.slice(2);
const wanted = args.length ? args : ["cover", ...Object.keys(scenes)];
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ASSETS, "features"), { recursive: true });

const { server, url } = await startServer();
const browser = await launch();
try {
  if (wanted.includes("cover")) await renderCover(browser, url);
  for (const name of wanted.filter((n) => scenes[n])) {
    const master = await renderScene(browser, url, name);
    const base = name === "hero" ? path.join(ASSETS, "hero") : path.join(ASSETS, "features", name);
    if (name === "hero" || FEATURES.includes(name)) {
      toGif(master, `${base}.gif`, { fps: name === "hero" ? 18 : 14 });
      poster(master, `${base}.jpg`, scenes[name].poster);
      console.log(`  ${path.relative(ASSETS, base)}.gif ${kb(`${base}.gif`)}`);
    }
  }
  if (DEMO.every((n) => fs.existsSync(path.join(OUT, `${n}.mp4`))) && (args.length === 0 || args.includes("demo"))) {
    console.log("demo.mp4");
    // Each scene loses its idle head and tail and fades through black into the next.
    const inputs = [];
    const parts = [];
    DEMO.forEach((n, i) => {
      const file = path.join(OUT, `${n}.mp4`);
      const d = duration(file);
      const a = 0.7;
      const b = d - 0.9;
      inputs.push("-i", file);
      parts.push(
        `[${i}:v]trim=start=${a}:end=${b.toFixed(2)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.3,fade=t=out:st=${(b - a - 0.3).toFixed(2)}:d=0.3[v${i}]`,
      );
    });
    const graph = `${parts.join(";")};${DEMO.map((_, i) => `[v${i}]`).join("")}concat=n=${DEMO.length}:v=1:a=0,scale=out_range=tv,format=yuv420p[out]`;
    ffmpeg([
      ...inputs,
      "-filter_complex", graph, "-map", "[out]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-preset", "slow", "-crf", "23", "-tune", "animation", "-r", "30", "-movflags", "+faststart", "-an",
      path.join(ASSETS, "demo.mp4"),
    ]);
    console.log(`  demo.mp4 ${kb(path.join(ASSETS, "demo.mp4"))}`);
  }
} finally {
  await browser.close();
  await server.close();
}
