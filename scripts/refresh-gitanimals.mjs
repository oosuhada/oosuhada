import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const layoutVersion = "character-behaviors-v23";
const previousState = await readFile(statePath, "utf8").catch(() => "");
const existingAssets = await Promise.all(
  [lightPath, darkPath].map((file) => readFile(file, "utf8").catch(() => "")),
);
const assetsUseCurrentLayout = existingAssets.every((asset) =>
  asset.includes(`data-profile-layout="${layoutVersion}"`),
);
const pollAttempts = Math.max(1, Number.parseInt(process.env.GITANIMALS_POLL_ATTEMPTS ?? "4", 10));
const pollIntervalMs = Math.max(0, Number.parseInt(process.env.GITANIMALS_POLL_INTERVAL_MS ?? "2000", 10));

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const fetchFarm = async (phase) => {
  const response = await fetch(
    `https://render.gitanimals.org/farms/${username}?profile-refresh=${Date.now()}-${phase}`,
  );
  if (!response.ok) {
    throw new Error(`Unable to load GitAnimals farm during ${phase}: ${response.status}`);
  }
  return response.text();
};

const fetchState = async () => {
  const response = await fetch(
    `https://render.gitanimals.org/users/${username}?profile-refresh=${Date.now()}`,
  );
  if (!response.ok) {
    throw new Error(`Unable to load GitAnimals state: ${response.status}`);
  }
  return response.json();
};

await fetchFarm("trigger");
console.log("Triggered GitAnimals refresh through the farm endpoint.");

let stateData;
let state;
for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
  if (attempt > 1 && pollIntervalMs > 0) {
    await wait(pollIntervalMs);
  }

  stateData = await fetchState();
  state = `${JSON.stringify(stateData, null, 2)}\n`;

  if (previousState === "" || state !== previousState || attempt === pollAttempts) {
    break;
  }

  console.log(
    `GitAnimals users state is unchanged after check ${attempt}/${pollAttempts}; waiting for async refresh.`,
  );
}

console.log("Loaded the latest GitAnimals users state.");

const source = await fetchFarm("latest");
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

  const rider = visiblePersonas.find((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES");
  const mount = visiblePersonas.find((persona) => persona.type === "CAPYBARA_SWIM");
  const hasMountedPair = Boolean(
    rider
    && mount
    && movingPersonaIds.has(String(rider.id))
    && movingPersonaIds.has(String(mount.id)),
  );
  // The chick rides the swimming capybara, so they are one spatial unit. Counting the rider as a
  // separate resident left a phantom occupied slot and pushed other pets into the mount's corridor.
  const placementPersonas = hasMountedPair
    ? visiblePersonas.filter((persona) => String(persona.id) !== String(rider.id))
    : visiblePersonas;
  const columns = placementPersonas.length <= 3
    ? placementPersonas.length
    : Math.ceil(placementPersonas.length / 2);
  const rows = Math.ceil(placementPersonas.length / columns);
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
    ? (hasMountedPair && placementPersonas.length === 9
      // Leave the top-centre slot empty: its roaming halo intersects the mounted pair at top-right.
      ? [0, 9, 3, 7, 1, 5, 4, 6, 8].map((index) => anchors[index])
      : [0, 9, 3, 7, 1, 5, 4, 6, 2, 8].map((index) => anchors[index]))
    : spreadAnchors;

  const footprintPriority = (persona) => {
    const type = persona.type;
    const staticPriority = staticPersonaRoots.has(String(persona.id)) ? 100 : 0;
    if (type.includes("CAPYBARA")) return staticPriority + 5;
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return staticPriority + 4;
    if (type.includes("RABBIT") || type.includes("HAMSTER")) return staticPriority + 3;
    return staticPriority + 2;
  };

  const prioritizedPersonas = [...placementPersonas].sort(
    (left, right) => footprintPriority(right) - footprintPriority(left),
  );
  const anchorAssignments = new Map(
    prioritizedPersonas.map((persona, index) => [String(persona.id), footprintAwareAnchors[index]]),
  );
  if (hasMountedPair) {
    anchorAssignments.set(String(rider.id), anchorAssignments.get(String(mount.id)));
  }

  let result = svg.replace(
    "<svg ",
    `<svg data-profile-layout="${layoutVersion}" `,
  );

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
    if (direction) {
      rule = rule.includes("animation-direction:")
        ? rule.replace(/animation-direction:\s*[^;]+;/, `animation-direction:${direction};`)
        : `${rule}animation-direction:${direction};`;
    }
    result = `${result.slice(0, ruleStart)}${rule}${result.slice(ruleEnd)}`;
  };

  const configureTimingFunction = (animationName, timingFunction) => {
    const ruleStart = result.indexOf(`animation-name: ${animationName}`);
    const ruleEnd = result.indexOf("}", ruleStart);
    if (ruleStart === -1 || ruleEnd === -1) {
      throw new Error(`Unable to configure timing for ${animationName}.`);
    }
    let rule = result.slice(ruleStart, ruleEnd);
    rule = rule.includes("animation-timing-function:")
      ? rule.replace(/animation-timing-function:\s*[^;]+;/, `animation-timing-function:${timingFunction};`)
      : `${rule}animation-timing-function:${timingFunction};`;
    result = `${result.slice(0, ruleStart)}${rule}${result.slice(ruleEnd)}`;
  };

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
    configureAnimation(`move-${id}`, normalizedDuration, "infinite", "alternate");
    configureAnimation(`reverse-flip-${id}`, normalizedDuration, "infinite", "alternate");
  });

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

  const groupClosingStart = (rootStart) => {
    const groupTag = /<\/?g\b[^>]*>/g;
    groupTag.lastIndex = rootStart;
    let depth = 0;
    for (let match = groupTag.exec(result); match; match = groupTag.exec(result)) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return match.index;
    }
    return -1;
  };

  const wrapArtworkContents = (rootId, wrapperId, personaId) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootClosingStart = groupClosingStart(rootStart);
    const levelWrapStart = result.indexOf(`<g id="level-wrap-${personaId}"`, rootStart);
    const levelWrapClosingStart = groupClosingStart(levelWrapStart);
    const levelWrapClosingEnd = result.indexOf(">", levelWrapClosingStart) + 1;
    const artworkStart = result.indexOf("<svg", levelWrapClosingEnd);
    if (
      rootStart === -1
      || rootClosingStart === -1
      || levelWrapStart === -1
      || levelWrapClosingStart === -1
      || artworkStart === -1
      || artworkStart >= rootClosingStart
    ) {
      throw new Error(`Unable to isolate artwork for ${rootId}.`);
    }
    result = `${result.slice(0, artworkStart)}<g id="${wrapperId}">`
      + `${result.slice(artworkStart, rootClosingStart)}</g>${result.slice(rootClosingStart)}`;
  };

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

  const routeDuration = 120;
  const routeSampleSeconds = 0.5;
  // Begin the gentle turn before sprites visibly overlap. The extra runway lets the temporal
  // smoother separate them without a sudden correction at the collision boundary.
  const routeSafetyMargin = 10.5;
  const routeSampleCount = routeDuration / routeSampleSeconds;
  const routeUnits = prioritizedPersonas.map((persona, index) => ({
    persona,
    index,
    anchor: anchorAssignments.get(String(persona.id)),
    members: hasMountedPair && String(persona.id) === String(mount.id)
      ? [mount, rider]
      : [persona],
  }));

  const movementProfile = (persona, index) => {
    const type = persona.type;
    if (type === "RABBIT") return { amplitudeX: 28, amplitudeY: 18, frequencyX: 3, frequencyY: 2 };
    if (type === "CAPYBARA_SWIM") return { amplitudeX: 15, amplitudeY: 9, frequencyX: 1, frequencyY: 1 };
    if (type.includes("CAPYBARA")) return { amplitudeX: 17, amplitudeY: 11, frequencyX: 1, frequencyY: 2 };
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) {
      return { amplitudeX: 20, amplitudeY: 13, frequencyX: 2, frequencyY: 1 };
    }
    return {
      amplitudeX: 18 + (index % 3) * 2,
      amplitudeY: 11 + (index % 2) * 2,
      frequencyX: 1 + (index % 2),
      frequencyY: 1 + ((index + 1) % 2),
    };
  };

  const preferredPosition = (unit, progress) => {
    const profile = movementProfile(unit.persona, unit.index);
    const phase = unit.index / routeUnits.length;
    const secondaryPhase = ((unit.index * 3) % routeUnits.length) / routeUnits.length;
    const xWave = 0.68 * Math.sin(2 * Math.PI * (profile.frequencyX * progress + phase))
      + 0.32 * Math.sin(2 * Math.PI * ((profile.frequencyX + 1) * progress + secondaryPhase));
    const yWave = 0.7 * Math.sin(2 * Math.PI * (profile.frequencyY * progress + secondaryPhase))
      + 0.3 * Math.cos(2 * Math.PI * ((profile.frequencyY + 1) * progress + phase));
    return {
      x: Math.max(10, Math.min(85, unit.anchor.x + profile.amplitudeX * xWave)),
      y: Math.max(28, Math.min(76, unit.anchor.y + profile.amplitudeY * yWave)),
    };
  };

  const separationRadius = (persona) => {
    const type = persona.type;
    if (type === "CAPYBARA_SWIM") return 12;
    if (type.includes("CAPYBARA")) return 11;
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return 10;
    if (type === "RABBIT" || type === "SHIBA") return 9;
    return 8;
  };

  const clampPosition = (position) => {
    position.x = Math.max(10, Math.min(85, position.x));
    position.y = Math.max(28, Math.min(76, position.y));
  };

  // Build one continuous periodic route instead of resolving every timestamp independently.
  // Independent resolution kept characters apart, but could move a large pet several cells between
  // adjacent keyframes. The browser interpolated that in under a second, which looked like teleporting.
  const preferredSamples = Array.from({ length: routeSampleCount }, (_, sampleIndex) => {
    const progress = sampleIndex / routeSampleCount;
    return routeUnits.map((unit) => preferredPosition(unit, progress));
  });
  let periodicSamples = preferredSamples.map((sample) => sample.map((position) => ({ ...position })));

  // Collision forces are deliberately soft and are smoothed across neighbouring timestamps. Pets may
  // meet, but a sustained overlap creates a gradual steering force that sends them apart naturally.
  for (let iteration = 0; iteration < 240; iteration += 1) {
    const forces = periodicSamples.map((sample) => sample.map(() => ({ x: 0, y: 0 })));
    periodicSamples.forEach((positions, sampleIndex) => {
      for (let leftIndex = 0; leftIndex < routeUnits.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < routeUnits.length; rightIndex += 1) {
          const left = positions[leftIndex];
          const right = positions[rightIndex];
          let weightedX = (left.x - right.x) * 2;
          let weightedY = left.y - right.y;
          let distance = Math.hypot(weightedX, weightedY);
          const steeringDistance = separationRadius(routeUnits[leftIndex].persona)
            + separationRadius(routeUnits[rightIndex].persona)
            + routeSafetyMargin;
          if (distance >= steeringDistance) continue;
          if (distance < 0.001) {
            const angle = ((leftIndex + 1) * (rightIndex + 3) * 47 * Math.PI) / 180;
            weightedX = Math.cos(angle);
            weightedY = Math.sin(angle);
            distance = 1;
          }
          const strength = (steeringDistance - distance) * 0.09;
          const forceX = (weightedX / distance) * strength;
          const forceY = (weightedY / distance) * strength;
          forces[sampleIndex][leftIndex].x += forceX / 2;
          forces[sampleIndex][rightIndex].x -= forceX / 2;
          forces[sampleIndex][leftIndex].y += forceY;
          forces[sampleIndex][rightIndex].y -= forceY;
        }
      }
    });

    periodicSamples = periodicSamples.map((sample, sampleIndex) => sample.map((position, unitIndex) => {
      const previous = periodicSamples[(sampleIndex - 1 + routeSampleCount) % routeSampleCount][unitIndex];
      const next = periodicSamples[(sampleIndex + 1) % routeSampleCount][unitIndex];
      const preferred = preferredSamples[sampleIndex][unitIndex];
      const force = forces[sampleIndex][unitIndex];
      const smoothed = {
        x: position.x * 0.56 + previous.x * 0.2 + next.x * 0.2 + preferred.x * 0.04 + force.x,
        y: position.y * 0.56 + previous.y * 0.2 + next.y * 0.2 + preferred.y * 0.04 + force.y,
      };
      clampPosition(smoothed);
      return smoothed;
    }));
  }

  // Duplicate the first frame only at 100%, guaranteeing an identical loop seam with no jump.
  const routeSamples = [
    ...periodicSamples,
    periodicSamples[0].map((position) => ({ ...position })),
  ];

  // Decide facing from a sustained look-ahead displacement, not one noisy half-second delta.
  // This removes rapid flip-flopping near a turning point while still turning before a pet appears
  // to walk backwards. The final duplicated loop frame is excluded from the circular lookup.
  const periodicSampleCount = routeSamples.length - 1;
  const directionLookAheadSamples = 4;
  const directionDisplacementThreshold = 0.55;
  const facingDirections = routeUnits.map((_, unitIndex) => {
    const desiredDirections = Array.from({ length: periodicSampleCount }, (_, sampleIndex) => {
      const current = routeSamples[sampleIndex][unitIndex];
      const future = routeSamples[
        (sampleIndex + directionLookAheadSamples) % periodicSampleCount
      ][unitIndex];
      const displacement = future.x - current.x;
      if (displacement > directionDisplacementThreshold) return 1;
      if (displacement < -directionDisplacementThreshold) return -1;
      return 0;
    });
    const initialDirection = desiredDirections.find((direction) => direction !== 0) ?? 1;
    const directions = [];
    let direction = initialDirection;
    for (let passIndex = 0; passIndex < periodicSampleCount * 2; passIndex += 1) {
      const sampleIndex = passIndex % periodicSampleCount;
      if (desiredDirections[sampleIndex] !== 0) direction = desiredDirections[sampleIndex];
      if (passIndex >= periodicSampleCount) directions[sampleIndex] = direction;
    }
    directions.push(directions[0]);
    return directions;
  });

  const directionFor = (unitIndex, sampleIndex) => facingDirections[unitIndex][sampleIndex];

  const routeKeyframes = (unitIndex, offsetX = 0, offsetY = 0) => {
    const frames = [];
    routeSamples.forEach((sample, sampleIndex) => {
      const percentage = (sampleIndex / (routeSamples.length - 1)) * 100;
      const position = sample[unitIndex];
      const nextIndex = sampleIndex === routeSamples.length - 1 ? 1 : sampleIndex + 1;
      const rotation = Math.max(-2, Math.min(2, routeSamples[nextIndex][unitIndex].y - position.y));
      frames.push(
        `${percentage.toFixed(2)}%{transform:translate(${(position.x + offsetX).toFixed(2)}%,`
        + `${(position.y + offsetY).toFixed(2)}%) rotate(${rotation.toFixed(1)}deg);}`,
      );
    });
    return frames.join("");
  };

  const facingKeyframes = (unitIndex) => {
    const frames = [];
    routeSamples.forEach((_, sampleIndex) => {
      const percentage = (sampleIndex / (routeSamples.length - 1)) * 100;
      const direction = directionFor(unitIndex, sampleIndex);
      frames.push(`${percentage.toFixed(2)}%{transform:scaleX(${direction});}`);
    });
    return frames.join("");
  };

  let coordinatedRouteStyles = "";
  routeUnits.forEach((unit, unitIndex) => {
    unit.members.forEach((persona) => {
      const id = String(persona.id);
      const isRider = hasMountedPair && id === String(rider.id);
      const movement = routeKeyframes(unitIndex, isRider ? 5 : 0, isRider ? -6 : 0);
      const facing = facingKeyframes(unitIndex);
      let rootId;
      if (movingPersonaIds.has(id)) {
        const animationRuleStart = result.indexOf(`animation-name: move-${id}`);
        const selectorStart = result.lastIndexOf("#", animationRuleStart);
        rootId = result.slice(selectorStart + 1, result.indexOf(" ", selectorStart));
        if (!rootId) throw new Error(`Unable to locate movement root for ${persona.type} (${id}).`);
        replaceKeyframeBody(`move-${id}`, movement);
        // Labels are siblings of the facing wrapper, so the old counter-flip must stay neutral.
        replaceKeyframeBody(`reverse-flip-${id}`, "0%,100%{transform:scaleX(1);}");
        configureAnimation(`move-${id}`, routeDuration, "infinite", "normal");
        configureAnimation(`reverse-flip-${id}`, routeDuration, "infinite", "normal");
        configureTimingFunction(`reverse-flip-${id}`, "steps(1,end)");
      } else {
        rootId = staticPersonaRoots.get(id);
        coordinatedRouteStyles += `@keyframes profile-route-${id}{${movement}}`
          + `#${rootId}{animation-name:profile-route-${id};animation-duration:${routeDuration}s;`
          + "animation-timing-function:linear;animation-iteration-count:infinite;"
          + "animation-direction:normal;animation-fill-mode:both;}";
      }

      const facingWrapperId = `profile-facing-${id}`;
      wrapArtworkContents(rootId, facingWrapperId, id);
      coordinatedRouteStyles += `@keyframes profile-facing-route-${id}{${facing}}`
        + `#${facingWrapperId}{animation:profile-facing-route-${id} ${routeDuration}s steps(1,end) infinite both;`
        + "transform-box:fill-box;transform-origin:center;}";
    });
  });

  const profileBehaviorStyles = `${coordinatedRouteStyles}${riderActionStyles}`;
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

if (
  state === previousState
  && assetsUseCurrentLayout
  && process.env.FORCE_REFRESH !== "1"
) {
  console.log("GitAnimals users state is unchanged; keeping the existing themed artwork.");
  process.exit(0);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(lightPath, light),
  writeFile(darkPath, dark),
  writeFile(statePath, state),
]);

console.log("Refreshed light and dark GitAnimals artwork.");
