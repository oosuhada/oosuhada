import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const layoutVersion = "character-behaviors-v19";

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

  const keyframeBody = (animationName) => {
    const keyframesStart = result.indexOf(`@keyframes ${animationName}`);
    const bodyStart = result.indexOf("{", keyframesStart) + 1;
    const animationRuleStart = result.indexOf(`animation-name: ${animationName}`, bodyStart);
    const bodyEnd = result.lastIndexOf("}", animationRuleStart);
    if (keyframesStart === -1 || bodyStart === 0 || animationRuleStart === -1 || bodyEnd < bodyStart) {
      throw new Error(`Unable to read ${animationName} keyframes.`);
    }
    return { body: result.slice(bodyStart, bodyEnd), bodyStart, bodyEnd };
  };

  const replaceKeyframeBody = (animationName, body) => {
    const bounds = keyframeBody(animationName);
    result = `${result.slice(0, bounds.bodyStart)}${body}${result.slice(bounds.bodyEnd)}`;
  };

  const configureAnimation = (animationName, duration, iterationCount = "1", direction) => {
    const ruleStart = result.indexOf(`animation-name: ${animationName}`);
    const ruleEnd = result.indexOf("}", ruleStart);
    if (ruleStart === -1 || ruleEnd === -1) {
      throw new Error(`Unable to configure ${animationName}.`);
    }
    let rule = result.slice(ruleStart, ruleEnd);
    rule = rule
      .replace(/animation-duration:\s*[\d.]+s;/, `animation-duration: ${duration}s;`)
      .replace(/animation-iteration-count:\s*[^;]+;/, `animation-iteration-count: ${iterationCount};`)
      .replace(/animation-fill-mode:\s*[^;]+;/, "animation-fill-mode: both;");
    if (!rule.includes("animation-timing-function:")) {
      rule = rule.replace(
        /animation-duration:\s*[\d.]+s;/,
        (durationProperty) => `${durationProperty}animation-timing-function:linear;`,
      );
    }
    if (direction && !rule.includes("animation-direction:")) {
      rule += `animation-direction:${direction};`;
    }
    result = `${result.slice(0, ruleStart)}${rule}${result.slice(ruleEnd)}`;
  };

  const wrapGroupContents = (rootId, wrapperId) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootOpeningEnd = result.indexOf(">", rootStart) + 1;
    if (rootStart === -1 || rootOpeningEnd === 0) {
      throw new Error(`Unable to locate ${rootId}.`);
    }

    const groupTag = /<\/?g\b[^>]*>/g;
    groupTag.lastIndex = rootStart;
    let depth = 0;
    let rootClosingStart = -1;
    for (let match = groupTag.exec(result); match; match = groupTag.exec(result)) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        rootClosingStart = match.index;
        break;
      }
    }
    if (rootClosingStart === -1) {
      throw new Error(`Unable to find the closing tag for ${rootId}.`);
    }

    result = `${result.slice(0, rootOpeningEnd)}<g id="${wrapperId}">`
      + `${result.slice(rootOpeningEnd, rootClosingStart)}</g>${result.slice(rootClosingStart)}`;
  };

  const explorer = visiblePersonas.find((persona) => persona.type === "RABBIT");
  if (explorer && movingPersonaIds.has(String(explorer.id))) {
    const id = String(explorer.id);
    const explorerMovement = [
      "0%{transform:translate(20%, 25%) rotate(0deg) scaleX(1);}",
      "18%{transform:translate(40%, 28%) rotate(-2deg) scaleX(1);}",
      "36%{transform:translate(85%, 40%) rotate(2deg) scaleX(1);}",
      "36.01%{transform:translate(90%, 40%) rotate(2deg) scaleX(-1);}",
      "55%{transform:translate(68%, 67%) rotate(-2deg) scaleX(-1);}",
      "76%{transform:translate(20%, 62%) rotate(1deg) scaleX(-1);}",
      "99.99%{transform:translate(15%, 25%) rotate(0deg) scaleX(-1);}",
      "100%{transform:translate(20%, 25%) rotate(0deg) scaleX(1);}",
    ].join("");
    const explorerCounterFlip = [
      "0%{transform-origin:10px 0;transform:scaleX(1);}",
      "36%{transform-origin:10px 0;transform:scaleX(1);}",
      "36.01%{transform-origin:10px 0;transform:scaleX(-1);}",
      "99.99%{transform-origin:10px 0;transform:scaleX(-1);}",
      "100%{transform-origin:10px 0;transform:scaleX(1);}",
    ].join("");
    replaceKeyframeBody(`move-${id}`, explorerMovement);
    replaceKeyframeBody(`reverse-flip-${id}`, explorerCounterFlip);
    configureAnimation(`move-${id}`, 72, "infinite");
    configureAnimation(`reverse-flip-${id}`, 72, "infinite");
  }

  const rider = visiblePersonas.find((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES");
  const mount = visiblePersonas.find((persona) => persona.type === "CAPYBARA_SWIM");
  let riderActionStyles = "";
  if (rider && mount && movingPersonaIds.has(String(rider.id)) && movingPersonaIds.has(String(mount.id))) {
    const riderId = String(rider.id);
    const mountId = String(mount.id);
    const mountDuration = 300;
    const mountedMovement = keyframeBody(`move-${mountId}`).body.replace(
      /(translate\()(-?[\d.]+)%(,\s*)(-?[\d.]+)%/g,
      (_, translate, x, separator, y) => (
        `${translate}${(Number(x) + 5).toFixed(2)}%${separator}${(Number(y) - 6).toFixed(2)}%`
      ),
    );
    const mountCounterFlip = keyframeBody(`reverse-flip-${mountId}`).body;
    replaceKeyframeBody(`move-${riderId}`, mountedMovement);
    replaceKeyframeBody(`reverse-flip-${riderId}`, mountCounterFlip);
    configureAnimation(`move-${mountId}`, mountDuration, "infinite", "alternate");
    configureAnimation(`reverse-flip-${mountId}`, mountDuration, "infinite", "alternate");
    configureAnimation(`move-${riderId}`, mountDuration, "infinite", "alternate");
    configureAnimation(`reverse-flip-${riderId}`, mountDuration, "infinite", "alternate");

    const riderRootId = `little-chick-${riderId}`;
    const riderNeutralizerId = `profile-rider-neutralizer-${riderId}`;
    const riderActionId = `profile-rider-action-${riderId}`;
    wrapGroupContents(riderRootId, riderNeutralizerId);
    wrapGroupContents(riderNeutralizerId, riderActionId);
    riderActionStyles = `@keyframes chick-adventure-${riderId}{`
      + "0%,20%{transform:translate(0,0) rotate(0deg);}"
      + "24%{transform:translate(3px,-12px) rotate(4deg);}"
      + "30%{transform:translate(16px,10px) rotate(2deg);}"
      + "38%{transform:translate(34px,43px) rotate(0deg);}"
      + "45%{transform:translate(20px,43px) rotate(-2deg);}"
      + "52%{transform:translate(7px,18px) rotate(-5deg);}"
      + "58%{transform:translate(2px,-11px) rotate(4deg);}"
      + "64%,88%{transform:translate(0,0) rotate(0deg);}"
      + "92%{transform:translate(2px,-8px) rotate(4deg);}"
      + "96%,100%{transform:translate(0,0) rotate(0deg);}}"
      + `@keyframes chick-facing-${riderId}{`
      + "0%,11.99%{transform:scaleX(1);}12%,15.99%{transform:scaleX(-1);}"
      + "16%,37.99%{transform:scaleX(1);}38%,63.99%{transform:scaleX(-1);}"
      + "64%,77.99%{transform:scaleX(1);}78%,81.99%{transform:scaleX(-1);}"
      + "82%,100%{transform:scaleX(1);}}"
      + `#${riderActionId}{animation:chick-adventure-${riderId} 36s `
      + "cubic-bezier(.45,.05,.55,.95) infinite both;transform-box:fill-box;transform-origin:center;}"
      + `#${riderActionId}>svg{animation:chick-facing-${riderId} 36s steps(1,end) infinite both;`
      + "transform-box:fill-box;transform-origin:center;}";
  }

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

  const profileBehaviorStyles = `${staticDriftStyles}${riderActionStyles}`;
  if (profileBehaviorStyles) {
    const rootOpeningEnd = result.indexOf(">") + 1;
    result = `${result.slice(0, rootOpeningEnd)}<style>${profileBehaviorStyles}</style>${result.slice(rootOpeningEnd)}`;
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
