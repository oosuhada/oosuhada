import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const layoutVersion = "collision-aware-v9";

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

const movingPersonaIds = new Set(
  [...source.matchAll(/@keyframes move-([0-9]+)/g)].map((match) => match[1]),
);
const staticPersonaRoots = new Map();

for (const persona of stateData.personas.filter((candidate) => candidate.visible)) {
  const id = String(persona.id);
  if (movingPersonaIds.has(id)) {
    continue;
  }

  const rootMatch = source.match(
    new RegExp(`<g id="([^"]*-${id})" style="transform:translate\\([^\"]+"`),
  );
  if (rootMatch) {
    staticPersonaRoots.set(id, rootMatch[1]);
  }
}

const visiblePersonas = stateData.personas.filter((persona) => {
  const id = String(persona.id);
  return persona.visible && (movingPersonaIds.has(id) || staticPersonaRoots.has(id));
});

const distributeCharacterRoaming = (svg) => {
  if (visiblePersonas.length === 0) {
    return svg;
  }

  const columns = visiblePersonas.length <= 3
    ? visiblePersonas.length
    : Math.ceil(visiblePersonas.length / 2);
  const rows = Math.ceil(visiblePersonas.length / columns);
  const anchorBounds = { left: 15, right: 85, top: 38, bottom: 68 };
  // Keep the full distance between 5x2 home points, then add an overlapping movement halo.
  // A halo is wider than a grid cell, so characters can cross cell boundaries without piling up.
  const horizontalFreedom = 0.36;
  const verticalFreedom = 0.46;

  const anchors = Array.from({ length: rows * columns }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: columns === 1
        ? 50
        : anchorBounds.left + column * ((anchorBounds.right - anchorBounds.left) / (columns - 1)),
      y: rows === 1
        ? 55
        : anchorBounds.top + row * ((anchorBounds.bottom - anchorBounds.top) / (rows - 1)),
    };
  });

  const remainingAnchors = anchors.slice(1);
  const spreadAnchors = [anchors[0]];
  while (remainingAnchors.length > 0) {
    let bestIndex = 0;
    let bestDistance = -1;
    remainingAnchors.forEach((candidate, index) => {
      const nearestAssignedDistance = Math.min(...spreadAnchors.map((assigned) => {
        const horizontalDistance = (candidate.x - assigned.x) * 2;
        const verticalDistance = candidate.y - assigned.y;
        return horizontalDistance ** 2 + verticalDistance ** 2;
      }));
      if (nearestAssignedDistance > bestDistance) {
        bestIndex = index;
        bestDistance = nearestAssignedDistance;
      }
    });
    spreadAnchors.push(remainingAnchors.splice(bestIndex, 1)[0]);
  }

  const footprintAwareAnchors = rows === 2 && columns === 5
    ? [0, 9, 3, 7, 1, 5, 4, 6, 2, 8].map((index) => anchors[index])
    : spreadAnchors;

  const footprintPriority = (persona) => {
    const type = persona.type;
    const staticPriority = staticPersonaRoots.has(String(persona.id)) ? 100 : 0;
    if (type.includes("CAPYBARA")) return staticPriority + 5;
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return staticPriority + 4;
    if (type.includes("RABBIT") || type.includes("HAMSTER")) return staticPriority + 3;
    return staticPriority + 2;
  };

  const prioritizedPersonas = [...visiblePersonas].sort(
    (left, right) => footprintPriority(right) - footprintPriority(left),
  );
  const anchorAssignments = new Map(
    prioritizedPersonas.map((persona, index) => [String(persona.id), footprintAwareAnchors[index]]),
  );

  let result = svg.replace(
    "<svg ",
    `<svg data-profile-layout="${layoutVersion}" `,
  );

  visiblePersonas.filter((persona) => movingPersonaIds.has(String(persona.id))).forEach((persona) => {
    const id = String(persona.id);
    const { x: anchorX, y: anchorY } = anchorAssignments.get(id);
    const keyframesStart = result.indexOf(`@keyframes move-${id}`);
    const animationRuleStart = result.indexOf(`animation-name: move-${id}`, keyframesStart);

    if (keyframesStart === -1 || animationRuleStart === -1) {
      throw new Error(`Unable to locate movement keyframes for visible persona ${id}.`);
    }

    const movementKeyframes = result.slice(keyframesStart, animationRuleStart);
    let replacementCount = 0;
    let travelDistance = 0;
    let previousFrame;
    const roamingKeyframes = movementKeyframes.replace(
      /(\d+(?:\.\d+)?)%(\s*\{transform:translate\()(-?[\d.]+)%(,\s*)(-?[\d.]+)%(\)\s*rotate\([^)]*\)\s*scaleX\()(-?[\d.]+)(\);\})/g,
      (_, time, translatePrefix, x, separator, y, scalePrefix, scale, suffix) => {
        replacementCount += 1;
        const numericTime = Number(time);
        const originalX = Number(x);
        const originalY = Number(y);
        const numericScale = Number(scale);
        let roamingX = anchorX + (originalX - 50) * horizontalFreedom;
        let roamingY = anchorY + (originalY - 50) * verticalFreedom;
        roamingX = Math.max(10, Math.min(85, roamingX));
        roamingY = Math.max(28, Math.min(76, roamingY));

        const isDirectionFlip = previousFrame
          && numericTime - previousFrame.time <= 0.011
          && numericScale !== previousFrame.scale;

        if (isDirectionFlip) {
          roamingX = previousFrame.roamingX + (originalX - previousFrame.originalX);
          roamingY = previousFrame.roamingY + (originalY - previousFrame.originalY);
        } else if (previousFrame) {
          travelDistance += Math.hypot(
            (roamingX - previousFrame.roamingX) * 2,
            roamingY - previousFrame.roamingY,
          );
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
    const normalizedDuration = Math.round(Math.max(120, Math.min(240, travelDistance / 2.2)));
    result = result.replace(
      new RegExp(`animation-name:\\s*move-${id};animation-duration:\\s*[\\d.]+s;(?:animation-timing-function:linear;)?`),
      `animation-name: move-${id};animation-duration: ${normalizedDuration}s;animation-timing-function:linear;`,
    );
    result = result.replace(
      new RegExp(`(animation-name:\\s*reverse-flip-${id};animation-duration:)\\s*[\\d.]+s;`),
      `$1 ${normalizedDuration}s;`,
    );
  });

  const staticDriftStyles = visiblePersonas
    .filter((persona) => staticPersonaRoots.has(String(persona.id)))
    .map((persona, index) => {
      const id = String(persona.id);
      const rootId = staticPersonaRoots.get(id);
      const { x: anchorX, y: anchorY } = anchorAssignments.get(id);
      const direction = index % 2 === 0 ? 1 : -1;
      const duration = 118 + index * 17;
      const points = [
        [0, -8, -4],
        [20, 5, -8],
        [40, 10, 1],
        [60, 3, 8],
        [80, -9, 5],
        [100, -8, -4],
      ];
      const keyframes = points.map(([time, offsetX, offsetY]) => (
        `${time}%{transform:translate(${(anchorX + offsetX * direction).toFixed(2)}%, `
        + `${(anchorY + offsetY).toFixed(2)}%) scaleX(${direction});}`
      )).join("");
      return `@keyframes profile-drift-${id}{${keyframes}}`
        + `#${rootId}{animation-name:profile-drift-${id};animation-duration:${duration}s;`
        + `animation-delay:-${index * 13}s;animation-timing-function:linear;`
        + "animation-iteration-count:infinite;animation-fill-mode:both;}";
    })
    .join("");

  if (staticDriftStyles) {
    const rootOpeningEnd = result.indexOf(">") + 1;
    result = `${result.slice(0, rootOpeningEnd)}<style>${staticDriftStyles}</style>${result.slice(rootOpeningEnd)}`;
  }

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
