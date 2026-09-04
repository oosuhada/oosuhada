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
// 32s is the deterministic shoreline-approach frame: at least one land pet should visually skim
// the water edge without actually entering it.
const snapshots = [...new Set([0, heartSnapshotSecond, 22, 30, 32, 60, 90])].sort((left, right) => left - right);
const visiblePersonas = state.personas.filter((persona) => persona.visible);
const beeQuokkaIds = new Set(["839316493969798500"]);
const beeIds = new Set(visiblePersonas.filter((persona) => beeQuokkaIds.has(String(persona.id))).map((persona) => String(persona.id)));
const hasMountedPair = visiblePersonas.some((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES")
  && visiblePersonas.some((persona) => persona.type === "CAPYBARA_SWIM");
const expectedInteractionCount = visiblePersonas.length;
const expectedActionCount = visiblePersonas.length - (hasMountedPair ? 1 : 0);
const expectedShadowCount = expectedActionCount - beeIds.size;
const swimZoneIds = new Set(
  visiblePersonas
    .filter((persona) => persona.type.includes("_SWIM") || persona.type.includes("_TUBE")
      || persona.type === "GOOSE" || persona.type === "FLAMINGO")
    .map((persona) => String(persona.id)),
);
if (hasMountedPair) {
  const rider = visiblePersonas.find((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES");
  if (rider) swimZoneIds.add(String(rider.id));
}
const landZoneIds = new Set(
  visiblePersonas.map((persona) => String(persona.id)).filter((id) => !swimZoneIds.has(id) && !beeIds.has(id)),
);
const closeShadowTypes = new Set(["RABBIT_TUBE", "HAMSTER_TUBE", "LITTLE_CHICK_TUBE", "DESSERT_FOX"]);
const closeShadowIds = new Set(
  visiblePersonas.filter((persona) => closeShadowTypes.has(persona.type)).map((persona) => String(persona.id)),
);
const simpleTubeWaterIds = new Set(
  visiblePersonas
    .filter((persona) => ["LITTLE_CHICK_TUBE", "RABBIT_TUBE", "HAMSTER_TUBE"].includes(persona.type))
    .map((persona) => String(persona.id)),
);
const birdWaterIds = new Set(
  visiblePersonas
    .filter((persona) => ["GOOSE", "FLAMINGO"].includes(persona.type))
    .map((persona) => String(persona.id)),
);
const gooseId = String(visiblePersonas.find((persona) => persona.type === "GOOSE")?.id ?? "");
const flamingoId = String(visiblePersonas.find((persona) => persona.type === "FLAMINGO")?.id ?? "");
const levelGapContractById = new Map(
  visiblePersonas
    .map((persona) => {
      const contract = ({
        RABBIT: { min: 0, max: 7 },
        RABBIT_TUBE: { min: 6, max: 17 },
        LITTLE_CHICK_TUBE: { min: 4, max: 11 },
        DESSERT_FOX: { min: 0, max: 8 },
        HAMSTER: { min: 2, max: 7 },
        HAMSTER_TUBE: { min: 5, max: 13 },
        GALCHI_CAT: { min: 3, max: 11 },
      })[persona.type];
      return contract ? [String(persona.id), { type: persona.type, ...contract }] : null;
    })
    .filter(Boolean),
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
const landShoreGaps = [];

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
        const viewBox = rootSvg.viewBox.baseVal;
        const scaleX = rootRect.width === 0 ? 1 : viewBox.width / rootRect.width;
        const scaleY = rootRect.height === 0 ? 1 : viewBox.height / rootRect.height;
        const rectFor = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Number(((rect.x - rootRect.x) * scaleX).toFixed(2)),
            y: Number(((rect.y - rootRect.y) * scaleY).toFixed(2)),
            width: Number((rect.width * scaleX).toFixed(2)),
            height: Number((rect.height * scaleY).toFixed(2)),
          };
        };
        const visibleArtworkFor = (element) => {
          const primitiveRects = [...element.querySelectorAll("path,rect,ellipse,circle,polygon,polyline,line")]
            .filter((primitive) => {
              const style = getComputedStyle(primitive);
              if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
              const rect = primitive.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map((primitive) => primitive.getBoundingClientRect());
          if (primitiveRects.length === 0) return null;
          const left = Math.min(...primitiveRects.map((rect) => rect.left));
          const top = Math.min(...primitiveRects.map((rect) => rect.top));
          const right = Math.max(...primitiveRects.map((rect) => rect.right));
          const bottom = Math.max(...primitiveRects.map((rect) => rect.bottom));
          return {
            x: Number(((left - rootRect.left) * scaleX).toFixed(2)),
            y: Number(((top - rootRect.top) * scaleY).toFixed(2)),
            width: Number(((right - left) * scaleX).toFixed(2)),
            height: Number(((bottom - top) * scaleY).toFixed(2)),
          };
        };
        return {
          layout: rootSvg.dataset.profileLayout,
          root: rectFor(rootSvg),
          swimZone: (() => {
            const zone = document.querySelector("#profile-swim-zone");
            return zone ? rectFor(zone) : null;
          })(),
          swimWater: (() => {
            const water = document.querySelector("#profile-swim-water");
            return water ? rectFor(water) : null;
          })(),
          headerText: (() => {
            const username = [...document.querySelectorAll("#username")].find((element) =>
              element.getAttribute("transform")?.startsWith("translate(15, 15)"));
            return username ? rectFor(username) : null;
          })(),
          footerText: (() => {
            const commit = document.querySelector("#commit");
            return commit ? rectFor(commit) : null;
          })(),
          characters: [...document.querySelectorAll("[id^='profile-facing-']")].map((element) => ({
            id: element.id.replace("profile-facing-", ""),
            ...rectFor(element),
            visibleArtwork: visibleArtworkFor(element),
          })),
          levels: [...document.querySelectorAll("[id^='level-wrap-']")].map((element) => ({
            id: element.id,
            ...rectFor(element),
          })),
          shadows: [...document.querySelectorAll("svg[id^='profile-shadow-']")].map((element) => ({
            id: element.id,
            ...rectFor(element),
          })),
          simpleTubeWater: [...document.querySelectorAll("svg[id^='profile-shadow-']")]
            .filter((element) => element.querySelector(".profile-tube-ripple") && element.querySelector(".profile-tube-wake"))
            .map((element) => element.id.replace("profile-shadow-", "")),
          birdWater: [...document.querySelectorAll("svg[id^='profile-shadow-']")]
            .filter((element) => element.querySelector(".profile-bird-ripple") && element.querySelector(".profile-bird-wake"))
            .map((element) => element.id.replace("profile-shadow-", "")),
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

      assert(geometry.layout === "character-behaviors-v62", `${theme} ${seconds}s uses a stale layout.`);
      assert(geometry.root.width === 600 && geometry.root.height === 300,
        `${theme} ${seconds}s changed the SVG canvas size.`);
      assert(geometry.swimZone?.width > 285 && geometry.swimZone?.width < 305,
        `${theme} ${seconds}s lost the dedicated left-side swim zone.`);
      assert(geometry.swimWater,
        `${theme} ${seconds}s lost the bounded water rectangle.`);
      assert(geometry.headerText && geometry.swimWater.y >= geometry.headerText.y + geometry.headerText.height + 4,
        `${theme} ${seconds}s lets the swim water cover the header text lane.`);
      assert(geometry.footerText
        && geometry.swimWater.y + geometry.swimWater.height <= geometry.footerText.y - 4,
      `${theme} ${seconds}s lets the swim water cover the footer text lane.`);
      geometry.characters.forEach((character) => {
        const right = character.x + character.width;
        if (swimZoneIds.has(character.id)) {
          const waterRight = geometry.swimWater.x + geometry.swimWater.width;
          const waterBottom = geometry.swimWater.y + geometry.swimWater.height;
          const characterBottom = character.y + character.height;
          assert(character.x >= geometry.swimWater.x - 1 && right <= waterRight + 1
            && character.y >= geometry.swimWater.y - 1 && characterBottom <= waterBottom + 1,
            `${theme} ${seconds}s lets swim-zone character ${character.id} leave the visible water `
              + `(character ${character.x.toFixed(2)},${character.y.toFixed(2)}-${right.toFixed(2)},${characterBottom.toFixed(2)}px; `
              + `water ${geometry.swimWater.x.toFixed(2)},${geometry.swimWater.y.toFixed(2)}-`
              + `${waterRight.toFixed(2)},${waterBottom.toFixed(2)}px).`);
        } else if (landZoneIds.has(character.id)) {
          const waterRight = geometry.swimWater.x + geometry.swimWater.width;
          const shorelineGap = character.x - waterRight;
          landShoreGaps.push({ theme, seconds, id: character.id, gap: shorelineGap });
          assert(shorelineGap >= -8,
            `${theme} ${seconds}s lets land character ${character.id} travel too deeply into the water by `
              + `${Math.abs(shorelineGap).toFixed(2)}px.`);
        }

        const levelContract = levelGapContractById.get(character.id);
        if (levelContract && character.visibleArtwork) {
          const level = geometry.levels.find((entry) => entry.id === `level-wrap-${character.id}`);
          assert(level, `${theme} ${seconds}s lost the ${levelContract.type} level label.`);
          const levelGap = character.visibleArtwork.y - (level.y + level.height);
          assert(levelGap >= levelContract.min && levelGap <= levelContract.max,
            `${theme} ${seconds}s places ${levelContract.type} level ${levelGap.toFixed(2)}px above its visible artwork; `
              + `expected ${levelContract.min}-${levelContract.max}px.`);
        }
      });
      beeIds.forEach((id) => {
        const bee = geometry.characters.find((character) => character.id === id);
        assert(bee?.visibleArtwork && bee.visibleArtwork.width > 0 && bee.visibleArtwork.height > 0,
          `${theme} ${seconds}s lost the flying bee sprite.`);
      });
      assert(geometry.actions === expectedActionCount, `${theme} ${seconds}s lost character action wrappers.`);
      assert(geometry.interactions === expectedInteractionCount,
        `${theme} ${seconds}s lost proximity interaction wrappers.`);
      assert(geometry.shadows.length === expectedShadowCount, `${theme} ${seconds}s lost grounding shadows.`);
      assert(simpleTubeWaterIds.size === geometry.simpleTubeWater.length
        && [...simpleTubeWaterIds].every((id) => geometry.simpleTubeWater.includes(id)),
      `${theme} ${seconds}s lost a simplified TUBE water ripple.`);
      assert(birdWaterIds.size === geometry.birdWater.length
        && [...birdWaterIds].every((id) => geometry.birdWater.includes(id)),
      `${theme} ${seconds}s lost a swimming-bird ripple.`);
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
    if (theme === "light") {
      const fullCycleZones = await page.evaluate(({ landIds, swimIds }) => {
        const animations = document.getAnimations({ subtree: true });
        const rootSvg = document.querySelector("svg[data-profile-layout]");
        const water = document.querySelector("#profile-swim-water");
        let minimumLandGap = Number.POSITIVE_INFINITY;
        let maximumSwimOverflow = Number.NEGATIVE_INFINITY;
        const borderSkimmingLandIds = new Set();
        const rightVisitingLandIds = new Set();
        let minimumRightSideLandPetsPerFrame = Number.POSITIVE_INFINITY;
        const swimCenterRanges = Object.fromEntries(swimIds.map((id) => [id, {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
        }]));
        let sampledFrames = 0;
        for (let seconds = 0; seconds < 120; seconds += 0.5) {
          animations.forEach((animation) => {
            animation.currentTime = seconds * 1000;
            animation.pause();
          });
          const rootRect = rootSvg.getBoundingClientRect();
          const viewBox = rootSvg.viewBox.baseVal;
          const scaleX = rootRect.width === 0 ? 1 : viewBox.width / rootRect.width;
          const scaleY = rootRect.height === 0 ? 1 : viewBox.height / rootRect.height;
          const waterRect = water.getBoundingClientRect();
          const waterLeft = (waterRect.left - rootRect.left) * scaleX;
          const waterRight = (waterRect.right - rootRect.left) * scaleX;
          const waterTop = (waterRect.top - rootRect.top) * scaleY;
          const waterBottom = (waterRect.bottom - rootRect.top) * scaleY;
          sampledFrames += 1;
          let rightSideLandPets = 0;
          landIds.forEach((id) => {
            const element = document.querySelector(`#profile-facing-${id}`);
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const gap = (rect.left - rootRect.left) * scaleX - waterRight;
            minimumLandGap = Math.min(minimumLandGap, gap);
            if (gap <= 20) borderSkimmingLandIds.add(id);
            const centerX = (rect.left - rootRect.left + rect.width / 2) * scaleX;
            if (centerX >= 360) {
              rightVisitingLandIds.add(id);
              rightSideLandPets += 1;
            }
          });
          minimumRightSideLandPetsPerFrame = Math.min(minimumRightSideLandPetsPerFrame, rightSideLandPets);
          swimIds.forEach((id) => {
            const element = document.querySelector(`#profile-facing-${id}`);
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const left = (rect.left - rootRect.left) * scaleX;
            const right = (rect.right - rootRect.left) * scaleX;
            const top = (rect.top - rootRect.top) * scaleY;
            const bottom = (rect.bottom - rootRect.top) * scaleY;
            const centerX = (left + right) / 2;
            const centerY = (top + bottom) / 2;
            const range = swimCenterRanges[id];
            range.minX = Math.min(range.minX, centerX);
            range.maxX = Math.max(range.maxX, centerX);
            range.minY = Math.min(range.minY, centerY);
            range.maxY = Math.max(range.maxY, centerY);
            maximumSwimOverflow = Math.max(
              maximumSwimOverflow,
              waterLeft - left,
              right - waterRight,
              waterTop - top,
              bottom - waterBottom,
            );
          });
        }
        return {
          minimumLandGap,
          maximumSwimOverflow,
          borderSkimmingLandIds: [...borderSkimmingLandIds],
          rightVisitingLandIds: [...rightVisitingLandIds],
          minimumRightSideLandPetsPerFrame,
          swimCenterRanges,
          sampledFrames,
        };
      }, {
        landIds: [...landZoneIds],
        swimIds: [...swimZoneIds],
      });
      assert(fullCycleZones.minimumLandGap >= -8,
        `A land pet travels too deeply into the water during the full route; minimum shoreline gap is `
          + `${fullCycleZones.minimumLandGap.toFixed(2)}px.`);
      assert(fullCycleZones.minimumLandGap <= 0.5,
        `Land movement range never reaches/overlaps the shoreline; minimum full-route gap is `
          + `${fullCycleZones.minimumLandGap.toFixed(2)}px.`);
      assert(fullCycleZones.borderSkimmingLandIds.length === landZoneIds.size,
        `Only ${fullCycleZones.borderSkimmingLandIds.length}/${landZoneIds.size} land pets can reach within 20px of the shoreline.`);
      assert(fullCycleZones.rightVisitingLandIds.length === landZoneIds.size,
        `Only ${fullCycleZones.rightVisitingLandIds.length}/${landZoneIds.size} land pets still use the right side of the habitat.`);
      assert(fullCycleZones.minimumRightSideLandPetsPerFrame >= 3,
        `Land pets bunch toward the shoreline; only ${fullCycleZones.minimumRightSideLandPetsPerFrame} `
          + `remain on the right side in at least one sampled frame.`);
      assert(fullCycleZones.maximumSwimOverflow <= 0.5,
        `A swim-zone pet leaves the visible water during the full route by `
          + `${fullCycleZones.maximumSwimOverflow.toFixed(2)}px.`);
      const freeSwimmers = Object.values(fullCycleZones.swimCenterRanges).filter((range) =>
        range.maxX - range.minX >= 120 && range.maxY - range.minY >= 100);
      assert(freeSwimmers.length >= 2,
        `Only ${freeSwimmers.length} swim pets traverse the expanded pond freely; `
          + "the water layout is collapsing back into fixed slots.");
      if (gooseId) {
        const gooseRange = fullCycleZones.swimCenterRanges[gooseId];
        assert(gooseRange && gooseRange.maxX - gooseRange.minX >= 110
          && gooseRange.maxY - gooseRange.minY >= 70,
        "Goose must visibly swim across the pond instead of idling in one small patch.");
      }
      if (flamingoId) {
        const flamingoRange = fullCycleZones.swimCenterRanges[flamingoId];
        assert(flamingoRange && flamingoRange.minX <= 50 && flamingoRange.maxX <= 110,
          "Flamingo must remain in the far-left water area.");
      }
    }
    await page.close();
  }
  const closestLandApproach = landShoreGaps.reduce(
    (closest, entry) => (entry.gap < closest.gap ? entry : closest),
    { gap: Number.POSITIVE_INFINITY },
  );
  assert(closestLandApproach.gap <= 4,
    `Land pets never approach the shoreline closely enough; nearest rendered gap is `
      + `${closestLandApproach.gap.toFixed(2)}px.`);
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Captured ${manifest.length} deterministic GitAnimals visual-regression frames.`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
