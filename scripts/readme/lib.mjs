// Shared helpers for the README asset renderer: dev server, browser, recording, pointer moves.
import { createServer } from "vite";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../..");
export const OUT = path.join(HERE, "out");
export const ASSETS = path.join(REPO, "docs/assets");
export const VIEW = { width: 1280, height: 800 };
export const DSF = 2;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer() {
  const server = await createServer({ configFile: path.join(HERE, "vite.config.mjs") });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  return { server, url };
}

export async function launch() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    // No Google Chrome installed: `npx playwright install chromium` provides the bundled one.
    return await chromium.launch({ headless: true });
  }
}

export async function newPage(browser, url, size = VIEW) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: DSF,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("  [page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("  [console]", m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__demo?.ready === true);
  return page;
}

/** The pointer, moved like a hand: eased, ~60 updates per second, mirrored to the fake cursor. */
export class Pointer {
  constructor(page) {
    this.page = page;
    this.x = -40;
    this.y = 420;
  }
  async set(x, y) {
    this.x = x;
    this.y = y;
    await this.page.mouse.move(x, y);
    await this.page.evaluate(([px, py]) => window.__demo.pointer(px, py), [x, y]);
  }
  async glide(x, y, ms = 650) {
    const x0 = this.x;
    const y0 = this.y;
    const steps = Math.max(2, Math.round(ms / 16));
    const t0 = Date.now();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // A slight arc, like a wrist.
      const arc = Math.sin(Math.PI * t) * Math.min(24, Math.hypot(x - x0, y - y0) * 0.06);
      await this.set(x0 + (x - x0) * e, y0 + (y - y0) * e - arc);
      const due = t0 + (ms * i) / steps;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
    }
  }
  async to(locator, { dx = 0, dy = 0, ms = 650, anchor = "center" } = {}) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`no box for ${locator}`);
    const x = anchor === "left" ? b.x + Math.min(24, b.width / 2) : b.x + b.width / 2;
    await this.glide(x + dx, b.y + b.height / 2 + dy, ms);
  }
  async click({ hold = 90 } = {}) {
    await this.page.evaluate(() => window.__demo.press());
    await this.page.mouse.down();
    await sleep(hold);
    await this.page.mouse.up();
  }
  async clickOn(locator, opts = {}) {
    await this.to(locator, opts);
    await sleep(opts.settle ?? 160);
    await this.click();
  }
}

export async function typeText(page, text, delay = 75) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay + Math.round((Math.random() - 0.5) * delay * 0.6));
  }
}

/**
 * Continuous device-pixel screenshots over CDP (the screencast API only delivers CSS-pixel frames).
 * Each frame keeps its capture time, so the encoder can rebuild real-time playback.
 */
export async function record(page, crop) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let on = true;
  const loop = (async () => {
    while (on) {
      const t = Date.now() / 1000;
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 93,
        optimizeForSpeed: true,
        clip: { x: crop.x, y: crop.y, width: crop.w, height: crop.h, scale: DSF },
      });
      frames.push({ data: Buffer.from(data, "base64"), t });
    }
  })();
  return {
    async stop() {
      const end = Date.now() / 1000;
      on = false;
      await loop;
      return { frames, end };
    },
  };
}

export function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

/** Frames (already cropped by `record`) -> constant-rate master video scaled to `width`. */
export function encodeMaster({ frames, end }, name, crop, width, trimStart = 0) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = frames[0].t;
  const lines = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, f.data);
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(f.t + 0.1, Math.min(end, f.t + 5));
    lines.push(`file '${file}'`, `duration ${(next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
  const height = Math.round((width * crop.h) / crop.w / 2) * 2;
  const master = path.join(OUT, `${name}.mp4`);
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-ss", String(trimStart),
    "-vf", `fps=30,scale=${width}:${height}:flags=lanczos:out_range=tv,format=yuv420p`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-crf", "12", "-preset", "medium", "-movflags", "+faststart",
    master,
  ]);
  console.log(`  ${name}: ${frames.length} frames, ${(frames.at(-1).t - t0).toFixed(1)} s`);
  return master;
}

export function toGif(master, gif, { fps = 15, width = 960, colors = 256 } = {}) {
  ffmpeg([
    "-i", master,
    "-vf",
    `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    "-loop", "0",
    gif,
  ]);
}

export function poster(master, jpg, at, width = 960) {
  ffmpeg(["-ss", String(at), "-i", master, "-frames:v", "1", "-vf", `scale=${width}:-2:flags=lanczos`, "-q:v", "3", jpg]);
}

export const kb = (file) => `${(fs.statSync(file).size / 1024).toFixed(0)} KB`;
