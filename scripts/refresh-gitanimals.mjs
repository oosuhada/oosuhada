import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const layoutVersion = "zoned-farm-v1";

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

const spreadCharacters = (svg) => {
  if (visiblePersonaIds.length === 0) {
    return svg;
  }

  const columns = visiblePersonaIds.length <= 3
    ? visiblePersonaIds.length
    : Math.ceil(visiblePersonaIds.length / 2);
  const rows = Math.ceil(visiblePersonaIds.length / columns);
  const bounds = { left: 8, right: 92, top: 28, bottom: 82 };
  const cellWidth = (bounds.right - bounds.left) / columns;
  const cellHeight = (bounds.bottom - bounds.top) / rows;
  const paddingX = Math.min(7, cellWidth * 0.27);
  const paddingY = rows === 1 ? Math.min(14, cellHeight * 0.32) : 6.5;

  let result = svg.replace(
    "<svg ",
    `<svg data-profile-layout="${layoutVersion}" `,
  );

  visiblePersonaIds.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const zone = {
      minX: bounds.left + column * cellWidth + paddingX,
      maxX: bounds.left + (column + 1) * cellWidth - paddingX,
      minY: bounds.top + row * cellHeight + paddingY,
      maxY: bounds.top + (row + 1) * cellHeight - paddingY,
    };
    const keyframesStart = result.indexOf(`@keyframes move-${id}`);
    const animationRuleStart = result.indexOf(`animation-name: move-${id}`, keyframesStart);

    if (keyframesStart === -1 || animationRuleStart === -1) {
      throw new Error(`Unable to locate movement keyframes for visible persona ${id}.`);
    }

    const movementKeyframes = result.slice(keyframesStart, animationRuleStart);
    let replacementCount = 0;
    const zonedKeyframes = movementKeyframes.replace(
      /translate\((-?[\d.]+)%,\s*(-?[\d.]+)%\)/g,
      (_, x, y) => {
        replacementCount += 1;
        const normalizedX = Math.max(0, Math.min(100, Number(x))) / 100;
        const normalizedY = Math.max(0, Math.min(100, Number(y))) / 100;
        const zonedX = zone.minX + normalizedX * (zone.maxX - zone.minX);
        const zonedY = zone.minY + normalizedY * (zone.maxY - zone.minY);
        return `translate(${zonedX.toFixed(2)}%, ${zonedY.toFixed(2)}%)`;
      },
    );

    if (replacementCount === 0) {
      throw new Error(`No movement coordinates found for visible persona ${id}.`);
    }

    result = `${result.slice(0, keyframesStart)}${zonedKeyframes}${result.slice(animationRuleStart)}`;
  });

  return result;
};

const compactUsername = (svg) =>
  svg.replace(
    '<g id="username" transform="translate(15, 15)">',
    '<g id="username" transform="translate(15, 15) scale(0.72)">',
  );

const zonedSource = spreadCharacters(source);

const light = compactUsername(zonedSource)
  .replace('fill="white"/>', 'fill="#FFFFFF"/>')
  .replace('stroke="#D9D9D9"', 'stroke="#D0D7DE"');

const darkThemeStyle = [
  "<style>",
  "#username path, #commit path, [id^='level-wrap-'] path { fill: #F0F6FC; }",
  "</style>",
].join("");

const dark = compactUsername(zonedSource)
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
