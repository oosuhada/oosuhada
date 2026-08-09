import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const layoutVersion = "free-roam-v3";

const response = await fetch(`https://render.gitanimals.org/users/${username}`);
if (!response.ok) {
  throw new Error(`Unable to load GitAnimals state: ${response.status}`);
}

const stateData = await response.json();
const state = `${JSON.stringify(stateData, null, 2)}\n`;
const previousState = await readFile(statePath, "utf8").catch(() => "");
const existingAssets = await Promise.all(
  [lightPath, darkPath].map((file) => readFile(file, "utf8").catch(() => "")),
);
const assetsUseCurrentLayout = existingAssets.every((asset) =>
  asset.includes(`data-profile-layout="${layoutVersion}"`),
);

if (state === previousState && assetsUseCurrentLayout && process.env.FORCE_REFRESH !== "1") {
  console.log("GitAnimals state is unchanged; keeping the existing themed artwork.");
  process.exit(0);
}

const farmResponse = await fetch(
  `https://render.gitanimals.org/farms/${username}?profile-refresh=${Date.now()}`,
);
if (!farmResponse.ok) {
  throw new Error(`Unable to load GitAnimals farm: ${farmResponse.status}`);
}

const source = await farmResponse.text();
if (!source.startsWith("<svg") || !source.includes('<g id="username"')) {
  throw new Error("GitAnimals returned an unexpected SVG structure.");
}

const renderedPersonaIds = new Set(
  [...source.matchAll(/@keyframes move-([0-9]+)/g)].map((match) => match[1]),
);
const visiblePersonaIds = stateData.personas
  .filter((persona) => persona.visible && renderedPersonaIds.has(String(persona.id)))
  .map((persona) => String(persona.id));

const distributeCharacterRoaming = (svg) => {
  if (visiblePersonaIds.length === 0) {
    return svg;
  }

  const columns = visiblePersonaIds.length <= 3
    ? visiblePersonaIds.length
    : Math.ceil(visiblePersonaIds.length / 2);
  const rows = Math.ceil(visiblePersonaIds.length / columns);
  const anchorBounds = { left: 12, right: 88, top: 34, bottom: 76 };
  const roamingFreedom = 0.64;

  let result = svg.replace(
    "<svg ",
    `<svg data-profile-layout="${layoutVersion}" `,
  );

  visiblePersonaIds.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const anchorX = columns === 1
      ? 50
      : anchorBounds.left + column * ((anchorBounds.right - anchorBounds.left) / (columns - 1));
    const anchorY = rows === 1
      ? 55
      : anchorBounds.top + row * ((anchorBounds.bottom - anchorBounds.top) / (rows - 1));
    const keyframesStart = result.indexOf(`@keyframes move-${id}`);
    const animationRuleStart = result.indexOf(`animation-name: move-${id}`, keyframesStart);

    if (keyframesStart === -1 || animationRuleStart === -1) {
      throw new Error(`Unable to locate movement keyframes for visible persona ${id}.`);
    }

    const movementKeyframes = result.slice(keyframesStart, animationRuleStart);
    let replacementCount = 0;
    let previousFrame;
    const roamingKeyframes = movementKeyframes.replace(
      /(\d+(?:\.\d+)?)%(\s*\{transform:translate\()(-?[\d.]+)%(,\s*)(-?[\d.]+)%(\)\s*rotate\([^)]*\)\s*scaleX\()(-?[\d.]+)(\);\})/g,
      (_, time, translatePrefix, x, separator, y, scalePrefix, scale, suffix) => {
        replacementCount += 1;
        const numericTime = Number(time);
        const originalX = Number(x);
        const originalY = Number(y);
        const numericScale = Number(scale);
        let roamingX = originalX * roamingFreedom + anchorX * (1 - roamingFreedom);
        let roamingY = originalY * roamingFreedom + anchorY * (1 - roamingFreedom);

        const isDirectionFlip = previousFrame
          && numericTime - previousFrame.time <= 0.011
          && numericScale !== previousFrame.scale;

        if (isDirectionFlip) {
          roamingX = previousFrame.roamingX + (originalX - previousFrame.originalX);
          roamingY = previousFrame.roamingY + (originalY - previousFrame.originalY);
        }

        previousFrame = {
          time: numericTime,
          originalX,
          originalY,
          roamingX,
          roamingY,
          scale: numericScale,
        };

        return `${time}%${translatePrefix}${roamingX.toFixed(2)}%${separator}${roamingY.toFixed(2)}%${scalePrefix}${scale}${suffix}`;
      },
    );

    if (replacementCount === 0) {
      throw new Error(`No movement coordinates found for visible persona ${id}.`);
    }

    result = `${result.slice(0, keyframesStart)}${roamingKeyframes}${result.slice(animationRuleStart)}`;
    result = result.replace(
      new RegExp(`(animation-name:\\s*move-${id};animation-duration:\\s*[\\d.]+s;)`),
      "$1animation-timing-function:linear;",
    );
  });

  return result;
};

const compactUsername = (svg) =>
  svg.replace(
    '<g id="username" transform="translate(15, 15)">',
    '<g id="username" transform="translate(15, 15) scale(0.72)">',
  );

const freeRoamSource = distributeCharacterRoaming(source);

const light = compactUsername(freeRoamSource)
  .replace('fill="white"/>', 'fill="#FFFFFF"/>')
  .replace('stroke="#D9D9D9"', 'stroke="#D0D7DE"');

const darkThemeStyle = [
  "<style>",
  "#username path, #commit path, [id^='level-wrap-'] path { fill: #F0F6FC; }",
  "</style>",
].join("");

const dark = compactUsername(freeRoamSource)
  .replace(
    'xmlns="http://www.w3.org/2000/svg">',
    `xmlns="http://www.w3.org/2000/svg">${darkThemeStyle}`,
  )
  .replace('fill="white"/>', 'fill="#0D1117"/>')
  .replace('stroke="#D9D9D9"', 'stroke="#30363D"');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(lightPath, light),
  writeFile(darkPath, dark),
  writeFile(statePath, state),
]);

console.log("Refreshed light and dark GitAnimals artwork.");
