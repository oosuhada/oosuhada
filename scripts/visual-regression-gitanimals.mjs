import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const outputDirectory = path.join(root, "artifacts", "gitanimals-visual-regression");
const themes = ["light", "dark"];
const state = JSON.parse(await readFile(path.join(root, "assets", "gitanimals", "state.json"), "utf8"));
const lightSvg = await readFile(path.join(root, "assets", "gitanimals", "farm-light.svg"), "utf8");
const firstHeartRoute = lightSvg.indexOf("@keyframes profile-heart-route-");
const firstVisibleHeart = firstHeartRoute === -1
  ? null
  : lightSvg.slice(firstHeartRoute).match(/([\d.]+)%\{opacity:1;/);
const heartSnapshotSecond = firstVisibleHeart
  ? Number(((Number(firstVisibleHeart[1]) / 100) * 120 + 0.1).toFixed(2))
  : 2;
const snapshots = [...new Set([0, heartSnapshotSecond, 22, 30, 60, 90])].sort((left, right) => left - right);
const visiblePersonas = state.personas.filter((persona) => persona.visible);
const hasMountedPair = visiblePersonas.some((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES")
  && visiblePersonas.some((persona) => persona.type === "CAPYBARA_SWIM");
const expectedInteractionCount = visiblePersonas.length;
const expectedActionCount = visiblePersonas.length - (hasMountedPair ? 1 : 0);
const closeShadowTypes = new Set(["RABBIT_TUBE", "HAMSTER_TUBE", "LITTLE_CHICK_TUBE", "DESSERT_FOX"]);
const closeShadowIds = new Set(
  visiblePersonas.filter((persona) => closeShadowTypes.has(persona.type)).map((persona) => String(persona.id)),
);

const contentType = (filePath) => filePath.endsWith(".svg")
  ? "image/svg+xml"
  : "application/octet-stream";

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = pathname.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const manifest = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await mkdir(outputDirectory, { recursive: true });
  for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: 640, height: 340 }, colorScheme: theme });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/assets/gitanimals/farm-${theme}.svg`, {
      waitUntil: "load",
    });

    for (const seconds of snapshots) {
      await page.evaluate((time) => {
        document.getAnimations({ subtree: true }).forEach((animation) => {
          animation.currentTime = time * 1000;
          animation.pause();
        });
      }, seconds);
      await page.waitForTimeout(50);

      const geometry = await page.evaluate(() => {
        const rootSvg = document.querySelector("svg[data-profile-layout]");
        const rootRect = rootSvg.getBoundingClientRect();
        const rectFor = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Number((rect.x - rootRect.x).toFixed(2)),
            y: Number((rect.y - rootRect.y).toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
          };
        };
        return {
          layout: rootSvg.dataset.profileLayout,
          root: rectFor(rootSvg),
          levels: [...document.querySelectorAll("[id^='level-wrap-']")].map((element) => ({
            id: element.id,
            ...rectFor(element),
          })),
          shadows: [...document.querySelectorAll("svg[id^='profile-shadow-']")].map((element) => ({
            id: element.id,
            ...rectFor(element),
          })),
          grounding: [...document.querySelectorAll("svg[id^='profile-shadow-']")].map((element) => {
            const id = element.id.replace("profile-shadow-", "");
            const artwork = document.querySelector(`#profile-facing-${id}`);
            const ellipse = element.querySelector(".profile-ground-shadow");
            return artwork && ellipse ? {
              id,
              artwork: rectFor(artwork),
              shadow: rectFor(ellipse),
            } : null;
          }).filter(Boolean),
          actions: document.querySelectorAll("[id^='profile-actions-']").length,
          interactions: document.querySelectorAll("[id^='profile-interaction-']").length,
          visibleProximity: [...document.querySelectorAll("svg[id^='profile-proximity-']")]
            .filter((element) => Number(getComputedStyle(element).opacity) > 0.5)
            .map((element) => element.id),
          visibleHearts: [...document.querySelectorAll("svg[id^='profile-heart-']")]
            .filter((element) => Number(getComputedStyle(element).opacity) > 0.5)
            .map((element) => element.id),
          rabbitThought: (() => {
            const bubble = document.querySelector("#rabbit-think-bubble");
            const emotion = document.querySelector("#rabbit-829259874410923324-emo-4");
            const level = document.querySelector("#level-wrap-829259874410923324");
            return bubble && emotion && level ? {
              visible: getComputedStyle(emotion).visibility !== "hidden"
                && getComputedStyle(emotion).display !== "none"
                && Number(getComputedStyle(emotion).opacity) > 0,
              bubble: rectFor(bubble),
              level: rectFor(level),
            } : null;
          })(),
        };
      });

      assert(geometry.layout === "character-behaviors-v43", `${theme} ${seconds}s uses a stale layout.`);
      assert(geometry.root.width === 600 && geometry.root.height === 300,
        `${theme} ${seconds}s changed the SVG canvas size.`);
      assert(geometry.actions === expectedActionCount, `${theme} ${seconds}s lost character action wrappers.`);
      assert(geometry.interactions === expectedInteractionCount,
        `${theme} ${seconds}s lost proximity interaction wrappers.`);
      assert(geometry.shadows.length === expectedActionCount, `${theme} ${seconds}s lost grounding shadows.`);
      geometry.grounding
        .filter((entry) => closeShadowIds.has(entry.id))
        .forEach((entry) => {
          const artworkBottom = entry.artwork.y + entry.artwork.height;
          const shadowCenter = entry.shadow.y + entry.shadow.height / 2;
          const footGap = shadowCenter - artworkBottom;
          assert(Math.abs(footGap) <= 8,
            `${theme} ${seconds}s leaves ${entry.id} floating ${footGap.toFixed(2)}px above its shadow.`);
        });
      if (seconds === heartSnapshotSecond) {
        assert(geometry.visibleHearts.length > 0,
          `${theme} ${heartSnapshotSecond}s must exercise a stable head-on meeting heart.`);
      }
      geometry.levels.forEach((level) => {
        assert(level.width > 0 && level.height > 0, `${theme} ${seconds}s hides ${level.id}.`);
        assert(level.x > -45 && level.x + level.width < 645 && level.y > -25 && level.y < 300,
          `${theme} ${seconds}s moves ${level.id} outside the farm.`);
      });
      if (seconds === 22) {
        assert(geometry.rabbitThought?.visible,
          `${theme} 22s must exercise the rabbit thinking-bubble state.`);
        assert(
          geometry.rabbitThought.bubble.y >= geometry.rabbitThought.level.y
            + geometry.rabbitThought.level.height,
          `${theme} rabbit thinking bubble must sit below its level label.`,
        );
      }
      assert(errors.length === 0, `${theme} SVG raised browser errors: ${errors.join("; ")}`);

      const fileName = `${theme}-${String(seconds).padStart(3, "0")}s.png`;
      await page.locator("svg[data-profile-layout]").screenshot({
        path: path.join(outputDirectory, fileName),
      });
      manifest.push({ theme, seconds, fileName, ...geometry });
    }
    await page.close();
  }
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Captured ${manifest.length} deterministic GitAnimals visual-regression frames.`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
