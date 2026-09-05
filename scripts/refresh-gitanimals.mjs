import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");
const oosuTerminalMascotPath = path.join(outputDirectory, "custom", "oosu-terminal-cutout.svg");
const clawdPaintingPath = path.join(outputDirectory, "custom", "clawd-painting.svg");
const beeMascotPath = path.join(outputDirectory, "custom", "bee-svgrepo-com.svg");
const venomothMascotPath = path.join(outputDirectory, "custom", "venomoth-butterfly.svg");
const frogMascotPath = path.join(outputDirectory, "custom", "frog-pixel.svg");
const readmePath = path.join(root, "README.md");
const layoutVersion = "character-behaviors-v75";
const previousState = await readFile(statePath, "utf8").catch(() => "");
const previousStateData = previousState === "" ? null : JSON.parse(previousState);
const previousContributionTotal = Number(previousStateData?.totalContributions ?? 0);
const existingAssets = await Promise.all(
  [lightPath, darkPath].map((file) => readFile(file, "utf8").catch(() => "")),
);
const oosuTerminalMascotSource = (await readFile(oosuTerminalMascotPath, "utf8").catch(() => "")).trim();
const clawdPaintingSource = (await readFile(clawdPaintingPath, "utf8").catch(() => "")).trim();
const beeMascotSource = (await readFile(beeMascotPath, "utf8").catch(() => "")).trim();
const venomothMascotSource = (await readFile(venomothMascotPath, "utf8").catch(() => "")).trim();
const frogMascotSource = (await readFile(frogMascotPath, "utf8").catch(() => "")).trim();
const terminalQuokkaIds = new Set(["842652512849367039"]);
const beeQuokkaIds = new Set(["839316493969798500"]);
const venomothQuokkaIds = new Set(["839316523686430921"]);
const frogChickIds = new Set(["835719307358968503"]);
const flyingQuokkaIds = new Set([...beeQuokkaIds, ...venomothQuokkaIds]);
const clawdSlothIds = new Set(["843727410376082595"]);
const assetsUseCurrentLayout = existingAssets.every((asset) =>
  asset.includes(`data-profile-layout="${layoutVersion}"`),
);
const pollAttempts = Math.max(1, Number.parseInt(process.env.GITANIMALS_POLL_ATTEMPTS ?? "4", 10));
const pollIntervalMs = Math.max(0, Number.parseInt(process.env.GITANIMALS_POLL_INTERVAL_MS ?? "2000", 10));
const githubContributionToleranceRatio = 0.05;
const githubContributionToleranceFloor = 250;
// GitAnimals lost its historical contribution rows on 2026-09-03, changing 10231 -> 7219 while
// GitHub's cumulative calendar remained ~10.1k. Keep that incident as a temporary anchor so new
// upstream increments can still advance the displayed lifetime total while the historical rows are
// missing. Once GitAnimals returns a cumulative value again, the normal cross-check takes over.
const contributionRecoveryAnchor = Object.freeze({
  upstreamTotal: 7219,
  confirmedTotal: 10231,
});

const commitDigitGlyphs = Object.freeze({
  0: "M2.25 0.375H8.75V2H10.375V13.375H8.75V15H2.25V13.375H0.625V2H2.25V0.375ZM5.5 8.5V11.75H3.875V13.375H7.125V6.875H5.5V3.625H7.125V2H3.875V8.5H5.5Z",
  1: "M5.5 0.375H8.75V15H5.5V5.25H0.625V3.625H3.875V2H5.5V0.375Z",
  2: "M5.5 6.875H7.125V2H3.875V5.25H0.625V2H2.25V0.375H8.75V2H10.375V6.875H8.75V8.5H7.125V10.125H5.5V11.75H3.875V13.375H10.375V15H0.625V11.75H2.25V10.125H3.875V8.5H5.5V6.875Z",
  3: "M3.875 13.375H7.125V8.5H3.875V6.875H7.125V2H3.875V5.25H0.625V2H2.25V0.375H8.75V2H10.375V6.875H8.75V8.5H10.375V13.375H8.75V15H2.25V13.375H0.625V10.125H3.875V13.375Z",
  4: "M2.25 0.375H5.5V8.5H3.875V10.125H7.125V3.625H10.375V10.125H12V11.75H10.375V15H7.125V11.75H0.625V8.5H2.25V0.375Z",
  5: "M5.5 11.75H7.125V8.5H0.625V0.375H10.375V2H3.875V6.875H8.75V8.5H10.375V11.75H8.75V13.375H7.125V15H0.625V13.375H5.5V11.75Z",
  6: "M2.25 3.625H3.875V0.375H8.75V2H7.125V3.625H5.5V5.25H8.75V6.875H10.375V13.375H8.75V15H2.25V13.375H0.625V5.25H2.25V3.625ZM7.125 13.375V6.875H3.875V13.375H7.125Z",
  7: "M2.25 10.125H3.875V6.875H5.5V3.625H7.125V2H0.625V0.375H10.375V3.625H8.75V6.875H7.125V10.125H5.5V15H2.25V10.125Z",
  8: "M2.25 6.875H0.625V2H2.25V0.375H8.75V2H10.375V6.875H8.75V8.5H10.375V13.375H8.75V15H2.25V13.375H0.625V8.5H2.25V6.875ZM3.875 2V5.25H5.5V6.875H7.125V2H3.875ZM5.5 10.125V8.5H3.875V13.375H7.125V10.125H5.5Z",
  9: "M3.875 11.75H5.5V10.125H2.25V8.5H0.625V2H2.25V0.375H8.75V2H10.375V10.125H8.75V11.75H7.125V15H2.25V13.375H3.875V11.75ZM7.125 8.5V2H3.875V8.5H7.125Z",
});
const commitDigitAdvance = (digit) => (digit === "1" ? 13 : 15);

const balancedGroupBounds = (svg, start) => {
  const tags = svg.slice(start).matchAll(/<\/?g\b[^>]*>/g);
  let depth = 0;
  for (const match of tags) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return { start, end: start + match.index + tag.length };
      }
      if (depth < 0) return null;
    } else if (!tag.endsWith("/>")) {
      depth += 1;
    }
  }
  return null;
};

const rewriteCommitTotal = (svg, total) => {
  const commitStart = svg.indexOf('<g id="commit"');
  const digitsMarker = '<g transform="translate(0, 2.5)">\n';
  const digitsMarkerStart = svg.indexOf(digitsMarker, commitStart);
  if (commitStart === -1 || digitsMarkerStart === -1) {
    throw new Error("GitAnimals commit total artwork is missing.");
  }
  const digitsGroupBounds = balancedGroupBounds(svg, digitsMarkerStart);
  const digitsGroupClosing = "</g>";
  const digitsStart = svg.indexOf(">", digitsMarkerStart) + 1;
  const digitsEnd = digitsGroupBounds?.end - digitsGroupClosing.length;
  if (!digitsGroupBounds || digitsStart === 0 || digitsEnd <= digitsStart) {
    throw new Error("GitAnimals commit total digit group is malformed.");
  }

  let x = 260;
  const digitMarkup = String(total).split("").map((digit, index) => {
    const glyph = commitDigitGlyphs[digit];
    if (!glyph) throw new Error(`Unsupported GitAnimals contribution digit: ${digit}`);
    const markup = `${index === 0 ? "  " : ""}<g id="commit${digit}" transform="translate(${x.toFixed(1)}, 0)">`
      + `<path d="${glyph}" fill="black"/>\n</g>`;
    x += commitDigitAdvance(digit);
    return markup;
  }).join("");

  return `${svg.slice(0, digitsStart)}${digitMarkup}${svg.slice(digitsEnd)}`;
};

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const fetchFarm = async (phase) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(
        `https://render.gitanimals.org/farms/${username}?profile-refresh=${Date.now()}-${phase}-${attempt}`,
      );
      if (!response.ok) {
        throw new Error(`Unable to load GitAnimals farm during ${phase}: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(600 * attempt);
    }
  }
  throw lastError;
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

let githubContributionTotalPromise;
const fetchGithubContributionTotal = async () => {
  githubContributionTotalPromise ??= (async () => {
    const profileResponse = await fetch(`https://api.github.com/users/${username}`, {
      headers: { "User-Agent": "oosuhada-profile-gitanimals-refresh" },
    });
    if (!profileResponse.ok) {
      throw new Error(`Unable to load GitHub profile metadata: ${profileResponse.status}`);
    }
    const profile = await profileResponse.json();
    const createdYear = new Date(profile.created_at).getUTCFullYear();
    const currentYear = new Date().getUTCFullYear();
    if (!Number.isInteger(createdYear) || createdYear > currentYear) {
      throw new Error(`GitHub returned an invalid account creation date: ${profile.created_at}`);
    }

    const years = Array.from({ length: currentYear - createdYear + 1 }, (_, index) => createdYear + index);
    const yearlyTotals = await Promise.all(years.map(async (year) => {
      const response = await fetch(
        `https://github.com/users/${username}/contributions?from=${year}-01-01&to=${year}-12-31`,
        { headers: { "User-Agent": "oosuhada-profile-gitanimals-refresh" } },
      );
      if (!response.ok) {
        throw new Error(`Unable to load GitHub contribution calendar for ${year}: ${response.status}`);
      }

      const calendar = await response.text();
      const dailyCounts = [...calendar.matchAll(/>(No|[\d,]+) contributions? on [^<]+<\/tool-tip>/g)]
        .map((match) => (match[1] === "No" ? 0 : Number(match[1].replaceAll(",", ""))));
      if (dailyCounts.length === 0) {
        throw new Error(`GitHub contribution calendar for ${year} did not contain daily counts.`);
      }
      return dailyCounts.reduce((total, count) => total + count, 0);
    }));

    const total = yearlyTotals.reduce((sum, count) => sum + count, 0);
    console.log(
      `GitHub cumulative contribution cross-check (${createdYear}-${currentYear}): ${total} `
      + `[${yearlyTotals.map((count, index) => `${years[index]}=${count}`).join(", ")}].`,
    );
    return total;
  })();
  return githubContributionTotalPromise;
};

await fetchFarm("trigger");
console.log("Triggered GitAnimals refresh through the farm endpoint.");

let stateData;
let state;
let latestStateWasStale = false;
for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
  if (attempt > 1 && pollIntervalMs > 0) {
    await wait(pollIntervalMs);
  }

  stateData = await fetchState();
  const fetchedContributionTotal = Number(stateData.totalContributions ?? 0);
  latestStateWasStale = fetchedContributionTotal < previousContributionTotal;
  if (fetchedContributionTotal < previousContributionTotal) {
    let githubContributionTotal;
    try {
      githubContributionTotal = await fetchGithubContributionTotal();
    } catch (error) {
      console.log(`Unable to cross-check GitHub contributions: ${error.message}`);
    }

    const tolerance = githubContributionTotal === undefined
      ? 0
      : Math.max(
        githubContributionToleranceFloor,
        Math.round(githubContributionTotal * githubContributionToleranceRatio),
      );
    const fetchedGithubDistance = githubContributionTotal === undefined
      ? Number.POSITIVE_INFINITY
      : Math.abs(fetchedContributionTotal - githubContributionTotal);
    const previousGithubDistance = githubContributionTotal === undefined
      ? Number.POSITIVE_INFINITY
      : Math.abs(previousContributionTotal - githubContributionTotal);
    // A total is cumulative and should normally be monotonic. Only accept a decrease when GitHub's
    // all-years calendar says the old value itself is no longer credible and the new value is.
    // This prevents a current-year-only GitAnimals reset from replacing a valid lifetime total.
    const agreesWithGithub = githubContributionTotal !== undefined
      && fetchedGithubDistance <= tolerance
      && previousGithubDistance > tolerance;

    if (agreesWithGithub) {
      latestStateWasStale = false;
      console.log(
        `Accepted a lower GitAnimals contribution total (${fetchedContributionTotal} < `
        + `${previousContributionTotal}) because GitHub's cumulative calendar reports ${githubContributionTotal}.`,
      );
    } else {
      const githubContext = githubContributionTotal === undefined
        ? "GitHub cross-check unavailable"
        : `GitHub cumulative calendar reports ${githubContributionTotal}`;
      const anchoredTotal = githubContributionTotal !== undefined
        && fetchedGithubDistance > tolerance
        && fetchedContributionTotal >= contributionRecoveryAnchor.upstreamTotal
        ? contributionRecoveryAnchor.confirmedTotal
          + (fetchedContributionTotal - contributionRecoveryAnchor.upstreamTotal)
        : previousContributionTotal;
      const protectedTotal = Math.max(previousContributionTotal, anchoredTotal);
      console.log(
        `GitAnimals returned an unconfirmed lower contribution total (${fetchedContributionTotal} < `
        + `${previousContributionTotal}; ${githubContext}); protecting cumulative total ${protectedTotal}.`,
      );
      if (attempt < pollAttempts) continue;
      stateData.totalContributions = String(protectedTotal);
    }
  }
  state = `${JSON.stringify(stateData, null, 2)}\n`;

  if (previousState === "" || state !== previousState || attempt === pollAttempts) {
    break;
  }

  console.log(
    `GitAnimals users state is unchanged after check ${attempt}/${pollAttempts}; waiting for async refresh.`,
  );
}

console.log("Loaded the latest GitAnimals users state.");

let source = await fetchFarm("latest");
if (!source.startsWith("<svg") || !source.includes('<g id="username"')) {
  throw new Error("GitAnimals returned an unexpected SVG structure.");
}

// Keep the SVG number synchronized with the protected state even while the upstream farm still
// renders its reset total. The glyphs are the same pixel paths GitAnimals uses for commit digits.
source = rewriteCommitTotal(source, stateData.totalContributions);

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

const personaArchetype = (type) => {
  if (type.startsWith("RABBIT")) return "RABBIT";
  if (type.startsWith("HAMSTER")) return "HAMSTER";
  if (type.startsWith("PENGUIN")) return "PENGUIN";
  if (type.startsWith("LITTLE_CHICK")) return "LITTLE_CHICK";
  return type;
};

const personaFamily = (type) => {
  if (type.startsWith("CAPYBARA")) return "CAPYBARA";
  if (type.startsWith("RABBIT")) return "RABBIT";
  if (type.startsWith("HAMSTER")) return "HAMSTER";
  if (type.startsWith("LITTLE_CHICK")) return "LITTLE_CHICK";
  return null;
};

const characterScale = (persona) => {
  if (frogChickIds.has(String(persona.id))) return 1;
  return ({
  CAPYBARA_CARROT: 1.1,
  CAPYBARA_SWIM: 1.1,
  QUOKKA: 1,
  SLOTH: 1,
  RABBIT: 0.8,
  RABBIT_TUBE: 0.9,
  GALCHI_CAT: 0.8,
  HAMSTER: 0.6,
  HAMSTER_TUBE: 0.7,
  DESSERT_FOX: 0.6,
  PENGUIN: 0.9,
  PENGUIN_SUNGLASSES: 0.9,
  })[persona.type] ?? 1;
};

const isSwimZonePersona = (persona) => (
  frogChickIds.has(String(persona.id))
  || persona.type.includes("_SWIM")
  || persona.type.includes("_TUBE")
  || persona.type === "GOOSE"
  || persona.type === "FLAMINGO"
);

const isFlyingMascotPersona = (persona) => (
  persona.type === "QUOKKA" && flyingQuokkaIds.has(String(persona.id))
);

const swimZoneSplitPercent = 50;
// The water now occupies exactly the left half of the 600px farm (x=8..300). Per-sprite bounds keep
// the full rendered artwork inside that rectangle while giving the six water residents more room.
const swimZoneBounds = { left: 8, right: 43, top: 28, bottom: 76 };
const swimZoneBoundsFor = (type) => ({
  CAPYBARA_SWIM: { left: 8.5, right: 28, top: 29, bottom: 43 },
  LITTLE_CHICK_TUBE: { left: 8, right: 27, top: 64, bottom: 75 },
  RABBIT_TUBE: { left: 8, right: 42.5, top: 29, bottom: 72 },
  HAMSTER_TUBE: { left: 8, right: 41.5, top: 29, bottom: 72 },
  GOOSE: { left: 13.5, right: 35.5, top: 40, bottom: 68.5 },
  FLAMINGO: { left: 2.5, right: 9.5, top: 35, bottom: 53 },
})[type] ?? swimZoneBounds;
// The shoreline moves from 253px to 300px, so land movement floors move right by roughly 7.8
// route units. Land pets retain the same slight border overlap and still roam through the far right.
const landZoneBounds = { left: 53.3, right: 85, top: 28, bottom: 76 };
// Different sprites have very different local pivots/widths. Give the main land roamers their own
// movement-anchor floor so the rendered body, rather than the abstract anchor, can approach within
// a couple of pixels of the shoreline without crossing into the water.
const landShorelineAnchorLeft = (type) => ({
  RABBIT: 51.1,
  HAMSTER: 49.05,
  GALCHI_CAT: 52.4,
  SHIBA: 52.5,
  QUOKKA: 51.2,
  SLOTH: 52.4,
  PENGUIN: 49.95,
  PENGUIN_SUNGLASSES: 49.95,
  DESSERT_FOX: 51.45,
  CAPYBARA_CARROT: 53.35,
})[type] ?? landZoneBounds.left;
const movementZoneBounds = (persona) => {
  if (isFlyingMascotPersona(persona)) {
    return { left: 4, right: 96, top: 13, bottom: 84 };
  }
  if (frogChickIds.has(String(persona.id))) {
    // Keep the frog in its compact lower-right shoreline pocket. Its custom sprite is back at the
    // native 1x scale, so no extra scale-aware horizontal inset is needed here.
    return { left: 34, right: 46, top: 67.5, bottom: 75 };
  }
  return isSwimZonePersona(persona)
    ? swimZoneBoundsFor(persona.type)
    : { ...landZoneBounds, left: landShorelineAnchorLeft(persona.type) };
};

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
  const denseLayout = placementPersonas.length > 10;
  // The left side is a dedicated water zone for SWIM/TUBE characters. Land characters live on the
  // right. Both sides still use overlapping movement halos, but no route is allowed to cross the
  // shoreline, so a later speed/layout tweak cannot silently mix the two populations again.
  const horizontalFreedom = denseLayout ? 0.24 : 0.36;
  const verticalFreedom = denseLayout ? 0.30 : 0.46;
  const swimAnchors = [
    { x: 10, y: 34 }, { x: 35, y: 39 }, { x: 20, y: 49 }, { x: 40, y: 58 },
    { x: 11, y: 68 }, { x: 31, y: 72 }, { x: 24, y: 61 },
  ];
  const airAnchors = [{ x: 50, y: 52 }, { x: 50, y: 48 }];
  const landAnchors = [
    { x: 53.3, y: 31 }, { x: 62, y: 35 }, { x: 73, y: 30 }, { x: 85, y: 37 },
    { x: 55, y: 46 }, { x: 67, y: 49 }, { x: 79, y: 47 },
    { x: 53.3, y: 61 }, { x: 62, y: 65 }, { x: 74, y: 60 }, { x: 85, y: 64 },
    { x: 55, y: 73 }, { x: 68, y: 71 }, { x: 82, y: 74 },
  ];
  const airCount = placementPersonas.filter(isFlyingMascotPersona).length;
  const swimCount = placementPersonas.filter((persona) => !isFlyingMascotPersona(persona) && isSwimZonePersona(persona)).length;
  const landCount = placementPersonas.length - swimCount - airCount;
  if (swimCount > swimAnchors.length || landCount > landAnchors.length || airCount > airAnchors.length) {
    throw new Error(
      `The zoned farm supports ${swimAnchors.length} swim, ${landAnchors.length} land, and ${airAnchors.length} air units; `
      + `received ${swimCount} swim, ${landCount} land, and ${airCount} air units.`,
    );
  }

  const footprintPriority = (persona) => {
    const type = persona.type;
    const staticPriority = staticPersonaRoots.has(String(persona.id)) ? 100 : 0;
    if (type.includes("CAPYBARA")) return staticPriority + 5;
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return staticPriority + 4;
    if (type.includes("TUBE") || type === "DESSERT_FOX") return staticPriority + 4;
    if (type.includes("RABBIT") || type.includes("HAMSTER")) return staticPriority + 3;
    return staticPriority + 2;
  };

  const prioritizedPersonas = [...placementPersonas].sort(
    (left, right) => footprintPriority(right) - footprintPriority(left),
  );
  const placementFamilies = (persona) => {
    const families = new Set();
    const primaryFamily = personaFamily(persona.type);
    if (primaryFamily) families.add(primaryFamily);
    if (hasMountedPair && String(persona.id) === String(mount.id)) {
      families.add("LITTLE_CHICK");
    }
    return families;
  };
  const weightedAnchorDistance = (left, right) => Math.hypot(
    (left.x - right.x) * 2,
    left.y - right.y,
  );
  const sharesAnyFamily = (leftFamilies, rightFamilies) =>
    [...leftFamilies].some((family) => rightFamilies.has(family));
  const anchorAssignments = new Map();
  const assignedAnchors = [];
  const availableAnchorsByZone = {
    swim: [...swimAnchors],
    land: [...landAnchors],
    air: [...airAnchors],
  };

  prioritizedPersonas.forEach((persona) => {
    const families = placementFamilies(persona);
    const zone = isFlyingMascotPersona(persona) ? "air" : (isSwimZonePersona(persona) ? "swim" : "land");
    const availableAnchors = availableAnchorsByZone[zone];
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    availableAnchors.forEach((candidate, index) => {
      const sameFamilyAssignments = assignedAnchors.filter((assigned) =>
        sharesAnyFamily(families, assigned.families));
      const sameFamilyDistance = sameFamilyAssignments.length === 0
        ? 0
        : Math.min(...sameFamilyAssignments.map((assigned) =>
          weightedAnchorDistance(candidate, assigned.anchor)));
      const sameZoneAssignments = assignedAnchors.filter((assigned) => assigned.zone === zone);
      const overallDistance = sameZoneAssignments.length === 0
        ? 0
        : Math.min(...sameZoneAssignments.map((assigned) =>
          weightedAnchorDistance(candidate, assigned.anchor)));
      // Duplicate species get first choice of the farthest remaining home point. This keeps their
      // patrol centres apart before collision steering has to do any work.
      const score = (sameFamilyAssignments.length > 0 ? 10000 + sameFamilyDistance * 100 : 0)
        + overallDistance;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const [anchor] = availableAnchors.splice(bestIndex, 1);
    anchorAssignments.set(String(persona.id), anchor);
    assignedAnchors.push({ persona, families, anchor, zone });
  });
  if (hasMountedPair) {
    anchorAssignments.set(String(rider.id), anchorAssignments.get(String(mount.id)));
  }

  let result = svg.replace(
    "<svg ",
    `<svg data-profile-layout="${layoutVersion}" data-profile-zone-split="${swimZoneSplitPercent}" `,
  );

  const swimZoneMarkup = '<g id="profile-swim-zone" pointer-events="none">'
    + '<rect id="profile-swim-water" x="8" y="44" width="292" height="218" rx="18" fill="#58A6FF" opacity=".105"/>'
    + '<path d="M15 78 C52 63 91 90 130 75 S225 63 290 81" fill="none" stroke="#58A6FF" '
    + 'stroke-width="2.2" stroke-linecap="round" opacity=".28"/>'
    + '<path d="M13 128 C50 113 88 140 127 125 S222 113 287 131" fill="none" stroke="#79C0FF" '
    + 'stroke-width="1.8" stroke-linecap="round" opacity=".24"/>'
    + '<path d="M16 181 C54 166 92 193 131 178 S225 166 289 184" fill="none" stroke="#58A6FF" '
    + 'stroke-width="2" stroke-linecap="round" opacity=".23"/>'
    + '<path d="M14 232 C51 217 89 244 128 229 S223 217 288 235" fill="none" stroke="#79C0FF" '
    + 'stroke-width="1.7" stroke-linecap="round" opacity=".22"/>'
    + '<path d="M298 49 C292 86 304 118 297 151 S305 220 298 257" fill="none" stroke="#58A6FF" '
    + 'stroke-width="1.5" stroke-dasharray="5 7" opacity=".26"/>'
    + '</g>';
  result = result.replace(
    /(<rect x="0\.5" y="0\.5" width="599" height="299" rx="4\.5" fill="(?:white|#[A-Fa-f0-9]+)"\/>)/,
    `$1${swimZoneMarkup}`,
  );

  // Keep the rabbit's thinking bubble close to its head. The upstream offset places the bubble
  // above the level label after the sprite is mirrored, making the dots look detached.
  result = result.replace(
    '<g id="rabbit-think-bubble" transform="translate(12, -18)">',
    '<g id="rabbit-think-bubble" transform="translate(6, -10)">',
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

  const insertAtRootStart = (rootId, markup) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootOpeningEnd = result.indexOf(">", rootStart) + 1;
    if (rootStart === -1 || rootOpeningEnd === 0) {
      throw new Error(`Unable to insert a leading layer into ${rootId}.`);
    }
    result = `${result.slice(0, rootOpeningEnd)}${markup}${result.slice(rootOpeningEnd)}`;
  };

  const insertAtRootEnd = (rootId, markup) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootClosingStart = groupClosingStart(rootStart);
    if (rootStart === -1 || rootClosingStart === -1) {
      throw new Error(`Unable to insert a trailing layer into ${rootId}.`);
    }
    result = `${result.slice(0, rootClosingStart)}${markup}${result.slice(rootClosingStart)}`;
  };

  const replaceGroupContents = (rootId, markup) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootOpeningEnd = result.indexOf(">", rootStart) + 1;
    const rootClosingStart = groupClosingStart(rootStart);
    if (rootStart === -1 || rootOpeningEnd === 0 || rootClosingStart === -1) {
      throw new Error(`Unable to replace the contents of ${rootId}.`);
    }
    result = `${result.slice(0, rootOpeningEnd)}${markup}${result.slice(rootClosingStart)}`;
  };

  const groupStartById = (groupId) => {
    const escapedGroupId = groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`<g\\s+id\\s*=\\s*[\"']${escapedGroupId}[\"'][^>]*>`).exec(result);
    return match?.index ?? -1;
  };

  const simplifyStripedTube = (persona) => {
    const tubePrefix = ({
      LITTLE_CHICK_TUBE: "little-chick",
      RABBIT_TUBE: "rabbit",
      HAMSTER_TUBE: "hamster",
    })[persona.type];
    if (!tubePrefix) return;
    const tubeGroupId = `${tubePrefix}-${persona.id}-tube`;
    const tubeStart = groupStartById(tubeGroupId);
    const tubeClosingStart = groupClosingStart(tubeStart);
    if (tubeStart === -1 || tubeClosingStart === -1) {
      throw new Error(`Unable to simplify striped tube for ${persona.type} (${persona.id}).`);
    }
    const tubeClosingEnd = result.indexOf(">", tubeClosingStart) + 1;
    const tubeMarkup = result.slice(tubeStart, tubeClosingEnd)
      .replace(/fill="#(?:F8F8F8|FBB3BE|FF99E7|6DB33F)"/g, 'fill="#5FC4FF"')
      .replace(/fill="black" fill-opacity="0\.1"/g, 'fill="#0059FF" fill-opacity="0.08"');
    result = `${result.slice(0, tubeStart)}${tubeMarkup}${result.slice(tubeClosingEnd)}`;
  };

  visiblePersonas.forEach(simplifyStripedTube);

  const moveRootToFront = (rootId) => {
    const rootStart = result.indexOf(`<g id="${rootId}"`);
    const rootClosingStart = groupClosingStart(rootStart);
    if (rootStart === -1 || rootClosingStart === -1) {
      throw new Error(`Unable to move ${rootId} to the front.`);
    }
    const rootClosingEnd = result.indexOf(">", rootClosingStart) + 1;
    const rootMarkup = result.slice(rootStart, rootClosingEnd);
    result = `${result.slice(0, rootStart)}${result.slice(rootClosingEnd)}`;
    const outerSvgClosingStart = result.lastIndexOf("</svg>");
    if (outerSvgClosingStart === -1) {
      throw new Error("Unable to find the farm SVG closing tag.");
    }
    result = `${result.slice(0, outerSvgClosingStart)}${rootMarkup}${result.slice(outerSvgClosingStart)}`;
  };

  const oosuTerminalMascotSprite = (personaId) => {
    if (oosuTerminalMascotSource === "") {
      throw new Error("Missing assets/gitanimals/custom/oosu-terminal-cutout.svg.");
    }
    return oosuTerminalMascotSource.replace(
      /<svg\b/,
      `<svg id="profile-custom-terminal-${personaId}" class="profile-custom-terminal" x="-7" y="-22" width="28" height="34"`,
    );
  };

  const clawdPaintingSprite = (personaId) => {
    if (clawdPaintingSource === "") {
      throw new Error("Missing assets/gitanimals/custom/clawd-painting.svg.");
    }
    return clawdPaintingSource.replace(
      /<svg\b/,
      `<svg id="profile-custom-clawd-${personaId}" class="profile-custom-clawd" x="-24" y="-37" width="62" height="62"`,
    );
  };

  const beeMascotSprite = (personaId) => {
    if (beeMascotSource === "") {
      throw new Error("Missing assets/gitanimals/custom/bee-svgrepo-com.svg.");
    }
    return beeMascotSource
      .replace(/<\?xml[^>]*>\s*/i, "")
      .replace(/<!DOCTYPE[^>]*>\s*/i, "")
      .replace(/<svg\b/, `<svg id="profile-custom-bee-${personaId}" class="profile-custom-bee" x="-10" y="-10" width="23" height="23"`);
  };

  const venomothMascotSprite = (personaId) => {
    if (venomothMascotSource === "") {
      throw new Error("Missing assets/gitanimals/custom/venomoth-butterfly.svg.");
    }
    return venomothMascotSource.replace(
      /<svg\b/,
      `<svg id="profile-custom-venomoth-${personaId}" class="profile-custom-venomoth" x="-12" y="-16" width="28" height="29"`,
    );
  };

  const frogMascotSprite = (personaId) => {
    if (frogMascotSource === "") {
      throw new Error("Missing assets/gitanimals/custom/frog-pixel.svg.");
    }
    return frogMascotSource.replace(
      /<svg\b/,
      `<svg id="profile-custom-frog-${personaId}" class="profile-custom-frog" x="-5" y="-8" width="24" height="20"`,
    );
  };

  let riderActionStyles = "";
  let riderNeutralizerId = "";
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
    riderNeutralizerId = `profile-rider-neutralizer-${riderId}`;
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
  const beeRouteDuration = 60;
  const venomothRouteDuration = 60;
  const routeSampleSeconds = 0.5;
  // Begin the gentle turn before sprites visibly overlap. The extra runway lets the temporal
  // smoother separate them without a sudden correction at the collision boundary.
  const routeSafetyMargin = denseLayout ? 12 : 10.5;
  const routeSampleCount = routeDuration / routeSampleSeconds;
  const routeUnits = prioritizedPersonas.map((persona, index) => {
    const members = hasMountedPair && String(persona.id) === String(mount.id)
      ? [mount, rider]
      : [persona];
    const families = new Set(
      members.map((member) => personaFamily(member.type)).filter(Boolean),
    );
    return {
      persona,
      index,
      anchor: anchorAssignments.get(String(persona.id)),
      members,
      families,
      zone: isFlyingMascotPersona(persona) ? "air" : (isSwimZonePersona(persona) ? "swim" : "land"),
    };
  });
  const unitsShareFamily = (leftIndex, rightIndex) =>
    [...routeUnits[leftIndex].families].some((family) => routeUnits[rightIndex].families.has(family));
  const isFlyingUnit = (unitIndex) => isFlyingMascotPersona(routeUnits[unitIndex].persona);
  const isFrogUnit = (unitIndex) => frogChickIds.has(String(routeUnits[unitIndex].persona.id));
  const isOverlayUnit = (unitIndex) => isFlyingUnit(unitIndex) || isFrogUnit(unitIndex);
  const unitsShareZone = (leftIndex, rightIndex) => {
    if (isOverlayUnit(leftIndex) || isOverlayUnit(rightIndex)) return false;
    return routeUnits[leftIndex].zone === routeUnits[rightIndex].zone;
  };

  // Keep the established fast movers, and explicitly make the rabbit/hamster family feel like the
  // active runners of their zone. Land Rabbit/Hamster stay fast on the right, while their TUBE
  // variants stay fast inside the water zone on the left. Speed survives the zone split instead of
  // silently collapsing back into short resident loops.
  const fastMovementTypes = new Set([
    "RABBIT",
    "HAMSTER",
    "GALCHI_CAT",
    "SHIBA",
    "GOOSE",
    "PENGUIN",
    "PENGUIN_SUNGLASSES",
    "RABBIT_TUBE",
    "HAMSTER_TUBE",
    "LITTLE_CHICK_TUBE",
  ]);
  const farmRoamerTypes = new Set([
    "RABBIT",
    "RABBIT_TUBE",
    "HAMSTER",
    "HAMSTER_TUBE",
    "GALCHI_CAT",
    "SHIBA",
    "GOOSE",
  ]);

  const movementProfile = (persona, index) => {
    const type = persona.type;
    if (denseLayout) {
      if (type === "CAPYBARA_SWIM") return { amplitudeX: 9, amplitudeY: 5, frequencyX: 1, frequencyY: 1 };
      if (type.includes("CAPYBARA")) return { amplitudeX: 10, amplitudeY: 6, frequencyX: 1, frequencyY: 2 };
      if (type.includes("TUBE")) {
        const fast = fastMovementTypes.has(type);
        return {
          amplitudeX: fast ? 16 : 8,
          amplitudeY: fast ? 9 : 5,
          frequencyX: fast ? 3 : 1,
          frequencyY: fast ? 3 : 1,
        };
      }
      if (type === "DESSERT_FOX") return { amplitudeX: 12, amplitudeY: 6, frequencyX: 2, frequencyY: 1 };
      if (type.includes("PENGUIN") || type.includes("FLAMINGO")) {
        return { amplitudeX: 10, amplitudeY: 6, frequencyX: 1, frequencyY: 1 };
      }
      return {
        amplitudeX: 9 + (index % 3),
        amplitudeY: 5 + (index % 2),
        frequencyX: 1 + (index % 2),
        frequencyY: 1 + ((index + 1) % 2),
      };
    }
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

  const landRunnerWaypoints = [
    { x: landShorelineAnchorLeft("RABBIT"), y: 58 }, { x: 55, y: 44 }, { x: 66, y: 30 },
    { x: 83, y: 36 }, { x: 84, y: 59 }, { x: 64, y: 70 }, { x: 52, y: 65 },
  ];
  const capybaraSwimWaypoints = [
    { x: 9.5, y: 34 }, { x: 13, y: 30 }, { x: 20, y: 32 },
    { x: 27, y: 37 }, { x: 22, y: 42 }, { x: 15, y: 41 }, { x: 9.5, y: 38 },
  ];
  const chickTubeSwimWaypoints = [
    { x: 9.5, y: 67 }, { x: 13, y: 73 }, { x: 20, y: 72 },
    { x: 26, y: 68 }, { x: 22, y: 65 }, { x: 15, y: 65 }, { x: 9.5, y: 67 },
  ];
  const frogSwimWaypoints = [
    // Large frog resident: stay in a compact lower-right water pocket, close to the shoreline.
    { x: 39.2, y: 70.0 }, { x: 40.2, y: 68.5 }, { x: 41.0, y: 70.2 },
    { x: 40.8, y: 73.2 }, { x: 39.8, y: 74.0 }, { x: 39.0, y: 72.0 },
  ];
  const swimRunnerWaypoints = [
    { x: 10, y: 52 }, { x: 17, y: 32 }, { x: 32, y: 31 },
    { x: 41, y: 58 }, { x: 33, y: 69 }, { x: 18, y: 70 }, { x: 9, y: 60 },
  ];
  const landHamsterWaypoints = [
    { x: landShorelineAnchorLeft("HAMSTER"), y: 42 }, { x: 56, y: 31 }, { x: 82, y: 38 },
    { x: 84, y: 61 }, { x: 67, y: 72 }, { x: 54, y: 65 }, { x: 50, y: 53 },
  ];
  const swimHamsterWaypoints = [
    { x: 40, y: 62 }, { x: 34, y: 69 }, { x: 18, y: 69 }, { x: 9, y: 58 },
    { x: 13, y: 46 }, { x: 27, y: 31 }, { x: 36, y: 36 }, { x: 40, y: 51 },
  ];
  const gooseSwimWaypoints = [
    { x: 14.5, y: 48 }, { x: 20, y: 40.5 }, { x: 29.5, y: 43 },
    { x: 35, y: 53 }, { x: 32.5, y: 66 }, { x: 24, y: 68 },
    { x: 15, y: 60 },
  ];
  const flamingoSwimWaypoints = [
    { x: 3.2, y: 39 }, { x: 5.1, y: 35.5 }, { x: 8.6, y: 38 },
    { x: 9.1, y: 45 }, { x: 7.2, y: 52 }, { x: 4.0, y: 49 },
  ];
  const remapToLandZone = (waypoints, type) => {
    const left = landShorelineAnchorLeft(type);
    return waypoints.map(({ x, y }) => ({
      x: left + ((x - 10) / 78) * (landZoneBounds.right - left),
      y,
    }));
  };
  const catExplorerWaypoints = remapToLandZone([
    { x: 84, y: 31 }, { x: 55, y: 35 }, { x: 10, y: 43 },
    { x: 28, y: 69 }, { x: 58, y: 72 }, { x: 86, y: 55 },
  ], "GALCHI_CAT");
  const shibaExplorerWaypoints = remapToLandZone([
    { x: 10, y: 30 }, { x: 45, y: 34 }, { x: 83, y: 28 }, { x: 88, y: 52 },
    { x: 72, y: 74 }, { x: 36, y: 68 }, { x: 24, y: 58 },
  ], "SHIBA");
  const gooseExplorerWaypoints = remapToLandZone([
    { x: 86, y: 66 }, { x: 54, y: 72 }, { x: 24, y: 65 }, { x: 10, y: 45 },
    { x: 30, y: 29 }, { x: 66, y: 32 }, { x: 88, y: 46 },
  ], "GOOSE");
  const beeFarmPosition = (progress) => {
    const angle = 2 * Math.PI * progress;
    // A single smooth full-farm orbit. Keep the bee lively without local zigzag/buzzing jitter.
    return {
      x: 50 + Math.cos(angle) * 42,
      y: 52 + Math.sin(angle) * 25.2,
    };
  };
  const catExplorerPhase = Number.parseFloat(process.env.GITANIMALS_CAT_PHASE ?? "0.24");
  const shibaExplorerPhase = Number.parseFloat(process.env.GITANIMALS_SHIBA_PHASE ?? "0.04");
  const residentWideRoutePhase = (type) => ({
    CAPYBARA_CARROT: 0.08,
    QUOKKA: 0.19,
    SLOTH: 0.72,
    PENGUIN: 0.32,
    PENGUIN_SUNGLASSES: 0.32,
    DESSERT_FOX: 0.58,
    FLAMINGO: 0.82,
  })[type];
  const interpolateClosedRoute = (waypoints, progress) => {
    const scaled = (((progress % 1) + 1) % 1) * waypoints.length;
    const index = Math.floor(scaled) % waypoints.length;
    const t = scaled - Math.floor(scaled);
    const point = (offset) => waypoints[(index + offset + waypoints.length) % waypoints.length];
    const p0 = point(-1);
    const p1 = point(0);
    const p2 = point(1);
    const p3 = point(2);
    const interpolate = (a, b, c, d) => 0.5 * (
      (2 * b)
      + (-a + c) * t
      + (2 * a - 5 * b + 4 * c - d) * t ** 2
      + (-a + 3 * b - 3 * c + d) * t ** 3
    );
    return { x: interpolate(p0.x, p1.x, p2.x, p3.x), y: interpolate(p0.y, p1.y, p2.y, p3.y) };
  };

  const preferredPosition = (unit, progress) => {
    if (beeQuokkaIds.has(String(unit.persona.id))) {
      return beeFarmPosition(0.63 + progress * 2);
    }
    if (venomothQuokkaIds.has(String(unit.persona.id))) {
      // Same broad flight grammar and duration as the bee so both flying mascots move at the same
      // actual speed while remaining out of phase and visually independent.
      return beeFarmPosition(0.11 + progress * 2);
    }
    if (frogChickIds.has(String(unit.persona.id))) {
      // One slow compact loop per farm cycle, matching the flamingo's resident-like cadence rather
      // than roaming across the whole water habitat.
      return interpolateClosedRoute(frogSwimWaypoints, 0.37 + progress);
    }
    if (terminalQuokkaIds.has(String(unit.persona.id))) {
      return interpolateClosedRoute([
        { x: landShorelineAnchorLeft("QUOKKA"), y: 51 },
        { x: 58, y: 45 },
        { x: 72, y: 44 },
        { x: 82, y: 51 },
        { x: 76, y: 60 },
        { x: 60, y: 59 },
      ], 0.17 + progress);
    }
    if (unit.persona.type === "CAPYBARA_SWIM") {
      return interpolateClosedRoute(capybaraSwimWaypoints, progress);
    }
    if (unit.persona.type === "LITTLE_CHICK_TUBE") {
      return interpolateClosedRoute(chickTubeSwimWaypoints, 0.18 + progress * 2);
    }
    if (unit.persona.type === "RABBIT") {
      return interpolateClosedRoute(landRunnerWaypoints, progress * (denseLayout ? 5 : 7));
    }
    if (unit.persona.type === "RABBIT_TUBE") {
      return interpolateClosedRoute(swimRunnerWaypoints, 0.12 + progress * (denseLayout ? 6 : 8));
    }
    if (unit.persona.type === "HAMSTER") {
      return interpolateClosedRoute(landHamsterWaypoints, progress * (denseLayout ? 6 : 8));
    }
    if (unit.persona.type === "HAMSTER_TUBE") {
      return interpolateClosedRoute(swimHamsterWaypoints, 0.63 + progress * (denseLayout ? 7 : 9));
    }
    if (unit.persona.type === "GOOSE") {
      return interpolateClosedRoute(gooseSwimWaypoints, 0.35 - progress * 4);
    }
    if (unit.persona.type === "FLAMINGO") {
      return interpolateClosedRoute(flamingoSwimWaypoints, 0.72 + progress);
    }
    if (unit.persona.type === "GALCHI_CAT") {
      return interpolateClosedRoute(catExplorerWaypoints, catExplorerPhase - progress * (denseLayout ? 2 : 4));
    }
    if (unit.persona.type === "SHIBA") {
      return interpolateClosedRoute(
        shibaExplorerWaypoints,
        shibaExplorerPhase + progress * (denseLayout ? 4 : 6),
      );
    }
    const residentPhase = residentWideRoutePhase(unit.persona.type);
    if (unit.zone === "land" && residentPhase !== undefined) {
      const left = landShorelineAnchorLeft(unit.persona.type);
      const homeX = unit.anchor.x;
      const homeY = unit.anchor.y;
      const y = (offset) => Math.max(29, Math.min(74, homeY + offset));
      const middleX = Math.max(59, Math.min(72, homeX));
      const farRightX = Math.max(74, Math.min(84, homeX + 12));
      const residentWaypoints = [
        { x: left, y: y(-3) },
        { x: 56, y: y(7) },
        { x: middleX, y: y(3) },
        { x: farRightX, y: y(-6) },
        { x: Math.max(68, homeX), y: y(8) },
        { x: 60, y: y(10) },
      ];
      return interpolateClosedRoute(residentWaypoints, residentPhase + progress);
    }
    const profile = movementProfile(unit.persona, unit.index);
    const phase = unit.index / routeUnits.length;
    const secondaryPhase = ((unit.index * 3) % routeUnits.length) / routeUnits.length;
    const xWave = 0.68 * Math.sin(2 * Math.PI * (profile.frequencyX * progress + phase))
      + 0.32 * Math.sin(2 * Math.PI * ((profile.frequencyX + 1) * progress + secondaryPhase));
    const yWave = 0.7 * Math.sin(2 * Math.PI * (profile.frequencyY * progress + secondaryPhase))
      + 0.3 * Math.cos(2 * Math.PI * ((profile.frequencyY + 1) * progress + phase));
    const zoneBounds = movementZoneBounds(unit.persona);
    const horizontalInset = Math.max(0, characterScale(unit.persona) - 1) * 5;
    return {
      x: Math.max(
        zoneBounds.left + horizontalInset,
        Math.min(zoneBounds.right - horizontalInset, unit.anchor.x + profile.amplitudeX * xWave),
      ),
      y: Math.max(zoneBounds.top, Math.min(zoneBounds.bottom, unit.anchor.y + profile.amplitudeY * yWave)),
    };
  };

  const separationRadius = (persona) => {
    const type = persona.type;
    if (type === "CAPYBARA_SWIM") return 9;
    if (type === "RABBIT_TUBE" || type === "HAMSTER_TUBE") return 6;
    if (type === "LITTLE_CHICK_TUBE") return 5;
    if (type === "GOOSE" || type === "FLAMINGO") return 6;
    if (type.includes("CAPYBARA")) return 11;
    if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return 10;
    if (type === "DESSERT_FOX") return 9;
    if (type === "QUOKKA") return 4.5;
    if (type === "RABBIT" || type === "SHIBA") return 9;
    return 8;
  };

  const clampPosition = (position, persona) => {
    const zoneBounds = movementZoneBounds(persona);
    const horizontalInset = Math.max(0, characterScale(persona) - 1) * 5;
    position.x = Math.max(
      zoneBounds.left + horizontalInset,
      Math.min(zoneBounds.right - horizontalInset, position.x),
    );
    position.y = Math.max(zoneBounds.top, Math.min(zoneBounds.bottom, position.y));
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
  for (let iteration = 0; iteration < (denseLayout ? 520 : 300); iteration += 1) {
    const forces = periodicSamples.map((sample) => sample.map(() => ({ x: 0, y: 0 })));
    periodicSamples.forEach((positions, sampleIndex) => {
      for (let leftIndex = 0; leftIndex < routeUnits.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < routeUnits.length; rightIndex += 1) {
          if (!unitsShareZone(leftIndex, rightIndex)) continue;
          const left = positions[leftIndex];
          const right = positions[rightIndex];
          let weightedX = (left.x - right.x) * 2;
          let weightedY = left.y - right.y;
          let distance = Math.hypot(weightedX, weightedY);
          const isRoamer = (unitIndex) => farmRoamerTypes.has(routeUnits[unitIndex].persona.type);
          const involvesExplorer = isRoamer(leftIndex) || isRoamer(rightIndex);
          const sameFamily = unitsShareFamily(leftIndex, rightIndex);
          const bothSwim = routeUnits[leftIndex].zone === "swim" && routeUnits[rightIndex].zone === "swim";
          const steeringDistance = separationRadius(routeUnits[leftIndex].persona)
            + separationRadius(routeUnits[rightIndex].persona)
            + (sameFamily
              ? (bothSwim ? 4 : (denseLayout ? 30 : 24))
              : (bothSwim ? 5 : (involvesExplorer ? (denseLayout ? 18 : 13.5) : routeSafetyMargin)));
          if (distance >= steeringDistance) continue;
          if (distance < 0.001) {
            const angle = ((leftIndex + 1) * (rightIndex + 3) * 47 * Math.PI) / 180;
            weightedX = Math.cos(angle);
            weightedY = Math.sin(angle);
            distance = 1;
          }
          const strength = (steeringDistance - distance)
            * (sameFamily
              ? (bothSwim ? 0.12 : (denseLayout ? 0.19 : 0.16))
              : bothSwim ? 0.075
                : involvesExplorer ? (denseLayout ? 0.12 : 0.10) : (denseLayout ? 0.11 : 0.09));
          const forceX = (weightedX / distance) * strength;
          const forceY = (weightedY / distance) * strength;
          const leftIsExplorer = isRoamer(leftIndex);
          const rightIsExplorer = isRoamer(rightIndex);
          const leftIsFast = fastMovementTypes.has(routeUnits[leftIndex].persona.type);
          const rightIsFast = fastMovementTypes.has(routeUnits[rightIndex].persona.type);
          const leftShare = denseLayout && leftIsFast !== rightIsFast
            ? (leftIsFast ? 0.85 : 0.15)
            : leftIsExplorer === rightIsExplorer ? 0.5 : (leftIsExplorer ? 0.8 : 0.2);
          const rightShare = denseLayout && leftIsFast !== rightIsFast
            ? (rightIsFast ? 0.85 : 0.15)
            : leftIsExplorer === rightIsExplorer ? 0.5 : (rightIsExplorer ? 0.8 : 0.2);
          // Roaming characters yield most of the way. Resident characters keep their calm local
          // paths instead of being shoved across a cell whenever the explorer passes nearby.
          forces[sampleIndex][leftIndex].x += forceX * leftShare;
          forces[sampleIndex][rightIndex].x -= forceX * rightShare;
          forces[sampleIndex][leftIndex].y += forceY * leftShare * 2;
          forces[sampleIndex][rightIndex].y -= forceY * rightShare * 2;
        }
      }
    });

    periodicSamples = periodicSamples.map((sample, sampleIndex) => sample.map((position, unitIndex) => {
      if (isOverlayUnit(unitIndex)) {
        return { ...preferredSamples[sampleIndex][unitIndex] };
      }
      const previous = periodicSamples[(sampleIndex - 1 + routeSampleCount) % routeSampleCount][unitIndex];
      const next = periodicSamples[(sampleIndex + 1) % routeSampleCount][unitIndex];
      const preferred = preferredSamples[sampleIndex][unitIndex];
      const previousForce = forces[(sampleIndex - 1 + routeSampleCount) % routeSampleCount][unitIndex];
      const currentForce = forces[sampleIndex][unitIndex];
      const nextForce = forces[(sampleIndex + 1) % routeSampleCount][unitIndex];
      const force = {
        x: currentForce.x * 0.5 + previousForce.x * 0.25 + nextForce.x * 0.25,
        y: currentForce.y * 0.5 + previousForce.y * 0.25 + nextForce.y * 0.25,
      };
      const smoothed = {
        x: position.x * 0.56 + previous.x * 0.2 + next.x * 0.2 + preferred.x * 0.04 + force.x,
        y: position.y * 0.56 + previous.y * 0.2 + next.y * 0.2 + preferred.y * 0.04 + force.y,
      };
      clampPosition(smoothed, routeUnits[unitIndex].persona);
      return smoothed;
    }));
  }

  // Choose the most natural-looking global start frame without changing any relative character
  // timing. Rotating every unit by the same amount preserves collision recovery, same-family
  // separation, speed, and interactions, but avoids presenting the farm at a grid-like instant.
  const sceneNaturalnessScore = (sample) => {
    let score = 0;
    for (let leftIndex = 0; leftIndex < sample.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sample.length; rightIndex += 1) {
        if (isOverlayUnit(leftIndex) || isOverlayUnit(rightIndex)) continue;
        const left = sample[leftIndex];
        const right = sample[rightIndex];
        const horizontalGap = Math.abs(left.x - right.x);
        const verticalGap = Math.abs(left.y - right.y);
        score += Math.exp(-(verticalGap ** 2) / (2 * 1.7 ** 2)) * 3;
        score += Math.exp(-(horizontalGap ** 2) / (2 * 2.8 ** 2)) * 1.7;
        if (verticalGap < 1.2) score += 3;
        if (horizontalGap < 2) score += 1.5;
      }
    }
    sample.forEach((position, unitIndex) => {
      if (isOverlayUnit(unitIndex)) return;
      if (position.y < 29 || position.y > 75) score += 0.6;
      if (position.x < 11 || position.x > 84) score += 0.3;
    });
    // Keep the opening composition distributed across the whole land habitat. Shoreline access is
    // provided by route range, not by selecting a frame where everybody happens to be near water.
    const landPositions = sample.filter((_, unitIndex) => routeUnits[unitIndex].zone === "land");
    const shorelineSideCount = landPositions.filter((position) => position.x < 43).length;
    const farRightCount = landPositions.filter((position) => position.x > 62).length;
    if (shorelineSideCount > 3) score += (shorelineSideCount - 3) * 7;
    if (farRightCount < 3) score += (3 - farRightCount) * 8;
    return score;
  };

  let naturalStartIndex = 0;
  let naturalStartScore = Number.POSITIVE_INFINITY;
  periodicSamples.forEach((sample, sampleIndex) => {
    const score = sceneNaturalnessScore(sample);
    if (score < naturalStartScore) {
      naturalStartScore = score;
      naturalStartIndex = sampleIndex;
    }
  });
  periodicSamples = [
    ...periodicSamples.slice(naturalStartIndex),
    ...periodicSamples.slice(0, naturalStartIndex),
  ];
  const scenePhaseSeconds = naturalStartIndex * routeSampleSeconds;
  result = result.replace(
    `data-profile-layout="${layoutVersion}"`,
    `data-profile-layout="${layoutVersion}" data-profile-scene-phase="${scenePhaseSeconds.toFixed(1)}"`,
  );
  console.log(
    `Selected natural GitAnimals scene phase ${scenePhaseSeconds.toFixed(1)}s `
      + `(alignment score ${naturalStartScore.toFixed(2)}).`,
  );

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
  const facingDirections = routeUnits.map((_, unitIndex) => {
    const directionDisplacementThreshold = ["GOOSE", "FLAMINGO"].includes(routeUnits[unitIndex].persona.type)
      ? 0.16
      : 0.55;
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

  // Measured from paired +1/-1 renders of each sprite at the same animation timestamp. These local
  // pivots keep the visible artwork centre fixed even when hidden emotion states enlarge its SVG box.
  const facingPivot = (persona) => ({
    QUOKKA: 0.00,
    SLOTH: 7.00,
    RABBIT_TUBE: 10.00,
    HAMSTER_TUBE: 21.00,
    LITTLE_CHICK_TUBE: 16.00,
    PENGUIN_SUNGLASSES: 20.75,
    DESSERT_FOX: 26.00,
    RABBIT: 25.51,
    HAMSTER: 21.00,
    PENGUIN: 20.75,
    CAPYBARA_CARROT: 30.76,
    CAPYBARA_SWIM: 17.40,
    LITTLE_CHICK_SUNGLASSES: 14.36,
    GOOSE: 23.59,
    GALCHI_CAT: 11.75,
    SHIBA: 11.98,
    FLAMINGO: 24.24,
  })[persona.type] ?? ({
    RABBIT: 25.51,
    HAMSTER: 21.00,
    PENGUIN: 20.75,
    LITTLE_CHICK: 16.00,
  })[personaArchetype(persona.type)] ?? 0;

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

  const directionalLevelKeyframes = (unitIndex, leftOffsetX, offsetY) => {
    const frames = [];
    routeSamples.forEach((_, sampleIndex) => {
      const percentage = (sampleIndex / (routeSamples.length - 1)) * 100;
      const direction = directionFor(unitIndex, sampleIndex);
      const offsetX = direction === -1 ? leftOffsetX : 0;
      frames.push(`${percentage.toFixed(2)}%{translate:${offsetX}px ${offsetY}px;}`);
    });
    return frames.join("");
  };

  const actionProfile = (persona, index) => {
    if (frogChickIds.has(String(persona.id))) {
      const profile = {
        duration: 32,
        // Continuous breathing is handled on the frog sprite below. This action layer adds one
        // quick vertical hop per cycle without introducing any horizontal drift.
        body: "0%,58%,63%,100%{transform:translate(0,0) rotate(0deg);}"
          + "59%{transform:translate(0,-4px) rotate(0deg);}"
          + "60.25%{transform:translate(0,-10px) rotate(0deg);}"
          + "60.75%{transform:translate(0,-12px) rotate(0deg);}"
          + "61.25%{transform:translate(0,-10px) rotate(0deg);}"
          + "62%{transform:translate(0,-4px) rotate(0deg);}",
      };
      return { ...profile, delay: -((index * 7) % profile.duration) };
    }
    const profiles = {
      RABBIT: {
        duration: 52,
        body: "0%,8%,18%,30%,46%,64%,82%,100%{transform:translate(0,0) rotate(0deg);}"
          + "10%{transform:translate(0,1px) rotate(-1deg);}12%{transform:translate(2px,-4px) rotate(3deg);}"
          + "14%{transform:translate(4px,0) rotate(0deg);}34%{transform:translate(0,-1px) rotate(-4deg);}"
          + "38%{transform:translate(0,0) rotate(3deg);}50%{transform:translate(0,-3px) rotate(-2deg);}"
          + "54%{transform:translate(2px,0) rotate(1deg);}68%{transform:translate(0,1px) rotate(0deg);}"
          + "72%{transform:translate(-1px,-2px) rotate(-3deg);}86%{transform:translate(0,0) rotate(4deg);}"
          + "90%{transform:translate(0,0) rotate(-3deg);}",
      },
      HAMSTER: {
        duration: 61,
        body: "0%,12%,26%,42%,58%,76%,100%{transform:translate(0,0) rotate(0deg);}"
          + "15%{transform:translate(0,-1px) rotate(-3deg);}18%{transform:translate(0,0) rotate(3deg);}"
          + "30%{transform:translate(1px,0) rotate(5deg);}34%{transform:translate(-1px,0) rotate(-4deg);}"
          + "46%{transform:translate(0,-2px) rotate(0deg);}49%{transform:translate(0,0) rotate(0deg);}"
          + "62%{transform:translate(0,1px) rotate(-2deg);}66%{transform:translate(0,-1px) rotate(2deg);}"
          + "80%{transform:translate(1px,0) rotate(4deg);}86%{transform:translate(0,0) rotate(-2deg);}",
      },
      PENGUIN: {
        duration: 58,
        body: "0%,10%,24%,40%,56%,74%,90%,100%{transform:translate(0,0) rotate(0deg);}"
          + "13%{transform:translate(-1px,0) rotate(-4deg);}17%{transform:translate(1px,0) rotate(4deg);}"
          + "28%{transform:translate(3px,1px) rotate(3deg);}33%{transform:translate(5px,1px) rotate(-2deg);}"
          + "44%{transform:translate(0,-2px) rotate(-3deg);}48%{transform:translate(1px,0) rotate(2deg);}"
          + "60%{transform:translate(-1px,0) rotate(-5deg);}65%{transform:translate(1px,0) rotate(5deg);}"
          + "78%{transform:translate(4px,1px) rotate(2deg);}84%{transform:translate(0,0) rotate(-2deg);}",
      },
      CAPYBARA_CARROT: {
        duration: 72,
        body: "0%,16%,34%,52%,70%,88%,100%{transform:translate(0,0) rotate(0deg);}"
          + "20%{transform:translate(0,1px) rotate(1deg);}24%{transform:translate(0,0) rotate(-1deg);}"
          + "38%{transform:translate(-1px,0) rotate(-2deg);}42%{transform:translate(0,-1px) rotate(2deg);}"
          + "56%{transform:translate(1px,0) rotate(3deg);}61%{transform:translate(0,0) rotate(-2deg);}"
          + "74%{transform:translate(0,1px) rotate(0deg);}79%{transform:translate(0,-1px) rotate(0deg);}"
          + "92%{transform:translate(-1px,0) rotate(-2deg);}96%{transform:translate(0,0) rotate(1deg);}",
      },
      CAPYBARA_SWIM: {
        duration: 68,
        body: "0%,14%,30%,46%,62%,78%,94%,100%{transform:translate(0,0) rotate(0deg);}"
          + "18%{transform:translate(0,-1px) rotate(-1deg);}22%{transform:translate(1px,0) rotate(1deg);}"
          + "34%{transform:translate(-1px,1px) rotate(-1deg);}38%{transform:translate(0,0) rotate(1deg);}"
          + "50%{transform:translate(1px,-1px) rotate(1deg);}54%{transform:translate(0,0) rotate(-1deg);}"
          + "66%{transform:translate(0,1px) rotate(0deg);}70%{transform:translate(1px,-1px) rotate(1deg);}"
          + "82%{transform:translate(-1px,0) rotate(-1deg);}87%{transform:translate(0,-1px) rotate(1deg);}",
      },
      GOOSE: {
        duration: 57,
        body: "0%,12%,28%,44%,60%,78%,94%,100%{transform:translate(0,0) rotate(0deg);}"
          + "15%{transform:translate(1px,1px) rotate(5deg);}19%{transform:translate(2px,0) rotate(-3deg);}"
          + "32%{transform:translate(0,-2px) rotate(-4deg);}36%{transform:translate(1px,0) rotate(4deg);}"
          + "48%{transform:translate(-1px,1px) rotate(6deg);}52%{transform:translate(0,0) rotate(-4deg);}"
          + "64%{transform:translate(2px,0) rotate(3deg);}69%{transform:translate(-1px,0) rotate(-3deg);}"
          + "82%{transform:translate(0,-2px) rotate(4deg);}87%{transform:translate(1px,0) rotate(-2deg);}",
      },
      GALCHI_CAT: {
        duration: 66,
        body: "0%,14%,30%,48%,64%,82%,100%{transform:translate(0,0) rotate(0deg);}"
          + "18%{transform:translate(0,1px) rotate(-3deg);}22%{transform:translate(0,0) rotate(3deg);}"
          + "34%{transform:translate(1px,-1px) rotate(5deg);}39%{transform:translate(-1px,0) rotate(-4deg);}"
          + "52%{transform:translate(0,-2px) rotate(0deg);}56%{transform:translate(0,0) rotate(2deg);}"
          + "68%{transform:translate(-1px,0) rotate(-5deg);}73%{transform:translate(1px,0) rotate(4deg);}"
          + "86%{transform:translate(0,1px) rotate(3deg);}92%{transform:translate(0,0) rotate(-2deg);}",
      },
      SHIBA: {
        duration: 63,
        body: "0%,10%,26%,42%,58%,76%,92%,100%{transform:translate(0,0) rotate(0deg);}"
          + "14%{transform:translate(0,-2px) rotate(3deg);}18%{transform:translate(1px,0) rotate(-2deg);}"
          + "30%{transform:translate(-1px,0) rotate(-6deg);}35%{transform:translate(1px,0) rotate(5deg);}"
          + "46%{transform:translate(2px,-1px) rotate(2deg);}51%{transform:translate(0,0) rotate(-2deg);}"
          + "62%{transform:translate(0,1px) rotate(4deg);}67%{transform:translate(0,-1px) rotate(-3deg);}"
          + "80%{transform:translate(1px,-2px) rotate(4deg);}86%{transform:translate(-1px,0) rotate(-3deg);}",
      },
      SLOTH: {
        duration: 78,
        body: "0%,18%,38%,58%,78%,100%{transform:translate(0,0) rotate(0deg);}"
          + "22%{transform:translate(0,-.8px) rotate(-1deg);}27%{transform:translate(.4px,0) rotate(1deg);}"
          + "44%{transform:translate(-.5px,.3px) rotate(-1deg);}50%{transform:translate(0,0) rotate(1deg);}"
          + "64%{transform:translate(.5px,-.6px) rotate(1deg);}70%{transform:translate(0,.2px) rotate(-1deg);}"
          + "84%{transform:translate(-.4px,0) rotate(-1deg);}90%{transform:translate(0,-.5px) rotate(1deg);}",
      },
      FLAMINGO: {
        duration: 70,
        body: "0%,14%,30%,46%,62%,78%,94%,100%{transform:translate(0,0) rotate(0deg);}"
          + "18%{transform:translate(0,1px) rotate(-3deg);}22%{transform:translate(0,-1px) rotate(3deg);}"
          + "34%{transform:translate(1px,0) rotate(5deg);}38%{transform:translate(-1px,0) rotate(-4deg);}"
          + "50%{transform:translate(0,-2px) rotate(-2deg);}54%{transform:translate(1px,0) rotate(3deg);}"
          + "66%{transform:translate(-1px,1px) rotate(-5deg);}71%{transform:translate(0,0) rotate(4deg);}"
          + "82%{transform:translate(2px,-1px) rotate(3deg);}88%{transform:translate(0,0) rotate(-3deg);}",
      },
      LITTLE_CHICK: {
        duration: 54,
        body: "0%,12%,28%,44%,60%,76%,92%,100%{transform:translate(0,0) rotate(0deg);}"
          + "16%{transform:translate(0,-2px) rotate(-3deg);}20%{transform:translate(1px,0) rotate(3deg);}"
          + "32%{transform:translate(-1px,0) rotate(-4deg);}36%{transform:translate(1px,-1px) rotate(4deg);}"
          + "48%{transform:translate(0,-2px) rotate(2deg);}52%{transform:translate(0,0) rotate(-2deg);}"
          + "64%{transform:translate(1px,0) rotate(4deg);}68%{transform:translate(-1px,0) rotate(-3deg);}"
          + "80%{transform:translate(0,-2px) rotate(-2deg);}86%{transform:translate(1px,0) rotate(3deg);}",
      },
      DESSERT_FOX: {
        duration: 64,
        body: "0%,12%,28%,44%,60%,76%,92%,100%{transform:translate(0,0) rotate(0deg);}"
          + "16%{transform:translate(2px,0) rotate(4deg);}20%{transform:translate(0,-1px) rotate(-3deg);}"
          + "32%{transform:translate(-2px,0) rotate(-5deg);}36%{transform:translate(1px,-2px) rotate(4deg);}"
          + "48%{transform:translate(2px,0) rotate(5deg);}52%{transform:translate(0,0) rotate(-4deg);}"
          + "64%{transform:translate(-1px,-1px) rotate(-5deg);}68%{transform:translate(1px,0) rotate(4deg);}"
          + "80%{transform:translate(2px,-1px) rotate(3deg);}86%{transform:translate(0,0) rotate(-3deg);}",
      },
    };
    const profile = profiles[personaArchetype(persona.type)] ?? profiles.SHIBA;
    return { ...profile, delay: -((index * 7) % profile.duration) };
  };

  const groundGeometry = (persona) => ({
    // These newer sprites sit higher inside their upstream SVG boxes. Keep the established action
    // pivot, but paint the shadow at the visible feet instead of leaving a large floating gap.
    RABBIT_TUBE: { cx: 10, cy: 13, rx: 8, actionCy: 18 },
    HAMSTER_TUBE: { cx: 10, cy: 11, rx: 8, actionCy: 18 },
    LITTLE_CHICK_TUBE: { cx: 8, cy: 10, rx: 7, actionCy: 17 },
    DESSERT_FOX: { cx: 10, cy: 14.5, rx: 7, actionCy: 18 },
    RABBIT: { cx: 8.5, cy: 11, rx: 5 },
    HAMSTER: { cx: 7, cy: 12, rx: 5 },
    PENGUIN: { cx: 7, cy: 17, rx: 6 },
    CAPYBARA_CARROT: { cx: 10, cy: 20, rx: 8 },
    CAPYBARA_SWIM: { cx: 10, cy: 18, rx: 11 },
    GOOSE: { cx: 8, cy: 17, rx: 7 },
    GALCHI_CAT: { cx: 5, cy: 14, rx: 5 },
    QUOKKA: terminalQuokkaIds.has(String(persona.id))
      ? { cx: 3.2, cy: 5.25, rx: 3.9, actionCy: 5.25 }
      : { cx: 7, cy: 10.8, rx: 4.6, actionCy: 10.8 },
    SHIBA: { cx: 5, cy: 12, rx: 5 },
    SLOTH: clawdSlothIds.has(String(persona.id))
      ? { cx: 3.9, cy: 8.4, rx: 3.8, actionCy: 8.4 }
      : { cx: 2.4, cy: 21.8, rx: 6.2, actionCy: 15.5 },
    LITTLE_CHICK: frogChickIds.has(String(persona.id))
      // Nested custom-SVG dimensions render in viewport pixels while the grounding layer uses the
      // farm's 200x100 viewBox (3 rendered px per unit). Convert the frog's optical foot centre
      // back into farm-viewBox units so the ripple/shadow hugs the sprite instead of trailing below.
      ? { cx: 2.35, cy: 5.0, rx: 3.6, actionCy: 5.0 }
      : { cx: 6, cy: 13, rx: 5 },
    FLAMINGO: { cx: 8, cy: 24, rx: 6 },
  })[persona.type] ?? ({
    RABBIT: { cx: 8.5, cy: 11, rx: 5 },
    HAMSTER: { cx: 7, cy: 12, rx: 5 },
    PENGUIN: { cx: 7, cy: 17, rx: 6 },
    LITTLE_CHICK: { cx: 6, cy: 13, rx: 5 },
  })[personaArchetype(persona.type)] ?? { cx: 7, cy: 16, rx: 5 };

  const proximityAt = (unitIndex, sampleIndex) => {
    const current = routeSamples[sampleIndex][unitIndex];
    let nearest;
    routeUnits.forEach((otherUnit, otherIndex) => {
      if (otherIndex === unitIndex) return;
      if (!unitsShareZone(unitIndex, otherIndex)) return;
      if (unitsShareFamily(unitIndex, otherIndex)) return;
      const other = routeSamples[sampleIndex][otherIndex];
      const weightedX = (current.x - other.x) * 2;
      const weightedY = current.y - other.y;
      const distance = Math.hypot(weightedX, weightedY);
      const threshold = separationRadius(routeUnits[unitIndex].persona)
        + separationRadius(otherUnit.persona) + 5;
      if (distance < threshold && (!nearest || distance < nearest.distance)) {
        nearest = { distance, side: weightedX >= 0 ? 1 : -1, otherIndex };
      }
    });
    return nearest;
  };

  const interactionKeyframes = (unitIndex, opacityOnly = false) => routeSamples.map((_, sampleIndex) => {
    const percentage = (sampleIndex / (routeSamples.length - 1)) * 100;
    const proximity = proximityAt(unitIndex, sampleIndex);
    if (opacityOnly) {
      return `${percentage.toFixed(2)}%{opacity:${proximity ? 1 : 0};}`;
    }
    if (!proximity) {
      return `${percentage.toFixed(2)}%{transform:translate(0,0) rotate(0deg);}`;
    }
    return `${percentage.toFixed(2)}%{transform:translate(${(proximity.side * 1.25).toFixed(2)}px,-0.75px)`
      + ` rotate(${(proximity.side * 1.2).toFixed(2)}deg);}`;
  }).join("");

  const headOnMeetingAt = (unitIndex, sampleIndex) => {
    const current = routeSamples[sampleIndex][unitIndex];
    let meeting;
    routeUnits.forEach((otherUnit, otherIndex) => {
      // One heart per pair: the lower-index unit owns the shared effect.
      if (otherIndex <= unitIndex) return;
      if (!unitsShareZone(unitIndex, otherIndex)) return;
      if (unitsShareFamily(unitIndex, otherIndex)) return;
      const other = routeSamples[sampleIndex][otherIndex];
      const weightedX = (current.x - other.x) * 2;
      const weightedY = current.y - other.y;
      const distance = Math.hypot(weightedX, weightedY);
      const meetingDistance = separationRadius(routeUnits[unitIndex].persona)
        + separationRadius(otherUnit.persona) + 10;
      if (distance >= meetingDistance) return;
      const currentDirection = directionFor(unitIndex, sampleIndex);
      const otherDirection = directionFor(otherIndex, sampleIndex);
      const faceEachOther = current.x <= other.x
        ? currentDirection === 1 && otherDirection === -1
        : currentDirection === -1 && otherDirection === 1;
      if (faceEachOther && (!meeting || distance < meeting.distance)) {
        meeting = { distance, side: weightedX >= 0 ? 1 : -1 };
      }
    });
    return meeting;
  };

  const heartKeyframes = (unitIndex, reach) => routeSamples.map((_, sampleIndex) => {
    const percentage = (sampleIndex / (routeSamples.length - 1)) * 100;
    const meeting = headOnMeetingAt(unitIndex, sampleIndex);
    const stableMeeting = meeting && [-2, -1, 1, 2].every((offset) => {
      const nearbyIndex = (sampleIndex + offset + routeSamples.length - 1) % (routeSamples.length - 1);
      return headOnMeetingAt(unitIndex, nearbyIndex)?.side === meeting.side;
    }) ? meeting : null;
    const towardOther = stableMeeting ? -stableMeeting.side * reach : 0;
    return `${percentage.toFixed(2)}%{opacity:${stableMeeting ? 1 : 0};`
      + `transform:translate(${towardOther}px,${stableMeeting ? -1 : 0}px);}`;
  }).join("");

  let coordinatedRouteStyles = "";
  const frontRootIds = [];
  routeUnits.forEach((unit, unitIndex) => {
    unit.members.forEach((persona) => {
      const id = String(persona.id);
      const isRider = hasMountedPair && id === String(rider.id);
      const isCustomTerminalQuokka = persona.type === "QUOKKA" && terminalQuokkaIds.has(id);
      const isCustomFlyingBee = persona.type === "QUOKKA" && beeQuokkaIds.has(id);
      const isCustomFlyingVenomoth = persona.type === "QUOKKA" && venomothQuokkaIds.has(id);
      const isCustomFlyingMascot = isCustomFlyingBee || isCustomFlyingVenomoth;
      const isCustomWaterFrog = persona.type === "LITTLE_CHICK" && frogChickIds.has(id);
      const isCustomPaintingSloth = persona.type === "SLOTH" && clawdSlothIds.has(id);
      const hasCustomArtwork = isCustomTerminalQuokka || isCustomFlyingMascot || isCustomWaterFrog || isCustomPaintingSloth;
      const personaRouteDuration = isCustomFlyingBee
        ? beeRouteDuration
        : isCustomFlyingVenomoth ? venomothRouteDuration : routeDuration;
      const movement = routeKeyframes(unitIndex, isRider ? 5 : 0, isRider ? -6 : 0);
      const facing = isCustomFlyingMascot
        ? facingKeyframes(unitIndex)
        : hasCustomArtwork ? "0%,100%{transform:scaleX(1);}" : facingKeyframes(unitIndex);
      let rootId;
      if (movingPersonaIds.has(id)) {
        const animationRuleStart = result.indexOf(`animation-name: move-${id}`);
        const selectorStart = result.lastIndexOf("#", animationRuleStart);
        rootId = result.slice(selectorStart + 1, result.indexOf(" ", selectorStart));
        if (!rootId) throw new Error(`Unable to locate movement root for ${persona.type} (${id}).`);
        replaceKeyframeBody(`move-${id}`, movement);
        // Labels are siblings of the facing wrapper, so the old counter-flip must stay neutral.
        replaceKeyframeBody(`reverse-flip-${id}`, "0%,100%{transform:scaleX(1);}");
        configureAnimation(`move-${id}`, personaRouteDuration, "infinite", "normal");
        configureAnimation(`reverse-flip-${id}`, personaRouteDuration, "infinite", "normal");
        configureTimingFunction(`reverse-flip-${id}`, "steps(1,end)");
      } else {
        rootId = staticPersonaRoots.get(id);
        coordinatedRouteStyles += `@keyframes profile-route-${id}{${movement}}`
          + `#${rootId}{animation-name:profile-route-${id};animation-duration:${personaRouteDuration}s;`
          + "animation-timing-function:linear;animation-iteration-count:infinite;"
          + "animation-direction:normal;animation-fill-mode:both;}";
      }

      const actionWrapperId = `profile-actions-${id}`;
      if (!isRider) {
        wrapGroupContents(rootId, actionWrapperId);
      }
      const interactionWrapperId = `profile-interaction-${id}`;
      wrapGroupContents(rootId, interactionWrapperId);

      const facingWrapperId = `profile-facing-${id}`;
      const pivot = isCustomFlyingMascot ? 1.5 : facingPivot(persona);
      const geometry = groundGeometry(persona);
      const scale = characterScale(persona);
      wrapArtworkContents(rootId, facingWrapperId, id);
      const sizeWrapperId = `profile-size-${id}`;
      wrapGroupContents(facingWrapperId, sizeWrapperId);
      if (isCustomTerminalQuokka) {
        replaceGroupContents(sizeWrapperId, oosuTerminalMascotSprite(id));
      } else if (isCustomFlyingBee) {
        replaceGroupContents(sizeWrapperId, beeMascotSprite(id));
        frontRootIds.push(rootId);
      } else if (isCustomFlyingVenomoth) {
        replaceGroupContents(sizeWrapperId, venomothMascotSprite(id));
        frontRootIds.unshift(rootId);
      } else if (isCustomWaterFrog) {
        replaceGroupContents(sizeWrapperId, frogMascotSprite(id));
      } else if (isCustomPaintingSloth) {
        replaceGroupContents(sizeWrapperId, clawdPaintingSprite(id));
      }
      const facingOriginStyle = isCustomFlyingVenomoth
        ? "transform-box:fill-box;transform-origin:center center;"
        : `transform-origin:${pivot.toFixed(2)}px 0px;`;
      coordinatedRouteStyles += `@keyframes profile-facing-route-${id}{${facing}}`
        + `#${facingWrapperId}{animation:profile-facing-route-${id} ${personaRouteDuration}s steps(1,end) infinite both;`
        + `${facingOriginStyle}}`
        + `#${sizeWrapperId}{transform:scale(${scale.toFixed(2)});`
        + `transform-origin:${(geometry.cx * 3).toFixed(2)}px ${(geometry.cy * 3).toFixed(2)}px;}`;
      if (isCustomWaterFrog) {
        coordinatedRouteStyles += `@keyframes profile-frog-pant-${id}{`
          + "0%,100%{transform:translateY(0) scale(1,1);}"
          + "45%,55%{transform:translateY(.8px) scale(1.025,.955);}}"
          + `#profile-custom-frog-${id}{animation:profile-frog-pant-${id} 1.25s ease-in-out infinite;`
          + "transform-box:fill-box;transform-origin:center bottom;}";
      }

      coordinatedRouteStyles += `@keyframes profile-interaction-route-${id}{${interactionKeyframes(unitIndex)}}`
        + `#${interactionWrapperId}{animation:profile-interaction-route-${id} ${personaRouteDuration}s linear infinite both;`
        + `transform-origin:${pivot.toFixed(2)}px 36px;}`;

      if (!isRider && !isCustomFlyingMascot) {
        const profile = actionProfile(persona, unitIndex);
        const scaledShadowRx = geometry.rx * scale;
        const scaledShadowRy = 1.15 * Math.sqrt(scale);
        const hasSimpleTubeWater = ["LITTLE_CHICK_TUBE", "RABBIT_TUBE", "HAMSTER_TUBE"].includes(persona.type);
        const hasBirdWater = ["GOOSE", "FLAMINGO"].includes(persona.type) || isCustomWaterFrog;
        const tubeRippleScale = ["LITTLE_CHICK_TUBE", "RABBIT_TUBE"].includes(persona.type) ? 0.72 : 1;
        const tubeRippleRx = (scaledShadowRx + 1.2 * scale) * tubeRippleScale;
        const tubeRippleRy = (1.75 * Math.sqrt(scale)) * (tubeRippleScale === 1 ? 1 : 0.78);
        const tubeWakeScale = ["LITTLE_CHICK_TUBE", "RABBIT_TUBE"].includes(persona.type) ? 0.72 : 1;
        // Keep each water effect optically attached to the part of the sprite that touches the water.
        // The flamingo ripple sits under its long legs, while the rabbit float is visually weighted
        // left of the source SVG's root pivot.
        const tubeRippleCx = geometry.cx + (persona.type === "RABBIT_TUBE" ? -3.5 : 0);
        const tubeWakeCx = geometry.cx + (persona.type === "RABBIT_TUBE" ? -3.5 : 0);
        // One SVG viewBox unit renders as 3px in the README farm. Move only the flamingo
        // waterline two units downward from v59 (= exactly 6 rendered px).
        const birdRippleCy = geometry.cy + (persona.type === "FLAMINGO" ? 1.5 : isCustomWaterFrog ? 0.2 : -3.0);
        const birdRippleScale = persona.type === "FLAMINGO" ? 0.58 : isCustomWaterFrog ? 0.72 : 1;
        const birdRippleRx = (scaledShadowRx + 1.8 * scale) * birdRippleScale;
        const birdRippleRy = (1.8 * Math.sqrt(scale)) * birdRippleScale;
        const birdWakeScale = persona.type === "FLAMINGO" ? 0.58 : isCustomWaterFrog ? 0.72 : 1;
        const actionSelectors = persona.type === "CAPYBARA_SWIM" && riderNeutralizerId
          ? `#${actionWrapperId},#${riderNeutralizerId}`
          : `#${actionWrapperId}`;
        const shadowRouteBody = isCustomWaterFrog
          ? "0%,58%,63%,100%{transform:scaleX(1);opacity:.18;}"
            + "59%,62%{transform:scaleX(.82);opacity:.13;}"
            + "60.25%,61.25%{transform:scaleX(.66);opacity:.09;}"
            + "60.75%{transform:scaleX(.54);opacity:.07;}"
          : "0%,14%,32%,50%,68%,86%,100%{transform:scaleX(1);opacity:.18;}"
            + "18%,54%,90%{transform:scaleX(.78);opacity:.11;}"
            + "24%,42%,76%{transform:scaleX(1.12);opacity:.21;}";
        coordinatedRouteStyles += `@keyframes profile-actions-route-${id}{${profile.body}}`
          + `${actionSelectors}{animation:profile-actions-route-${id} ${profile.duration}s ease-in-out infinite both;`
          + `animation-delay:${profile.delay}s;transform-origin:${pivot.toFixed(2)}px ${((geometry.actionCy ?? geometry.cy) * 3).toFixed(2)}px;}`
          + `@keyframes profile-shadow-route-${id}{${shadowRouteBody}}`
          + `#profile-shadow-shape-${id}{animation:profile-shadow-route-${id} ${profile.duration}s ease-in-out infinite both;`
          + `animation-delay:${profile.delay}s;transform-origin:${geometry.cx}px ${geometry.cy}px;}`;

        const shadowMarkup = `<svg id="profile-shadow-${id}" class="profile-ground-layer" width="600" height="300" `
          + `viewBox="0 0 200 100" fill="none" overflow="visible" aria-hidden="true">`
          + `<g id="profile-shadow-shape-${id}"><ellipse class="profile-ground-shadow" cx="${geometry.cx}" `
          + `cy="${geometry.cy}" rx="${scaledShadowRx.toFixed(2)}" ry="${scaledShadowRy.toFixed(2)}" `
          + `fill="#57606A" opacity=".18"/></g>`
          + (persona.type === "CAPYBARA_SWIM"
            ? `<ellipse class="profile-water-bed" cx="${geometry.cx}" cy="${geometry.cy - 0.15}" `
              + `rx="${(scaledShadowRx + 0.5 * scale).toFixed(2)}" ry="${(2.6 * Math.sqrt(scale)).toFixed(2)}" `
              + `fill="#58A6FF" opacity=".12"/>`
              + `<ellipse class="profile-water-ripple-inner" cx="${geometry.cx}" cy="${geometry.cy - 0.1}" `
              + `rx="${(scaledShadowRx + 1.5 * scale).toFixed(2)}" ry="${(2.05 * Math.sqrt(scale)).toFixed(2)}" `
              + `stroke="#79C0FF" stroke-width=".55" opacity=".42"/>`
              + `<ellipse class="profile-water-ripple-outer" cx="${geometry.cx}" cy="${geometry.cy}" `
              + `rx="${(scaledShadowRx + 4 * scale).toFixed(2)}" ry="${(2.8 * Math.sqrt(scale)).toFixed(2)}" `
              + `stroke="#58A6FF" stroke-width=".4" opacity=".24"/>`
              + `<g class="profile-water-glints" fill="none" stroke="#B6E3FF" stroke-width=".65" `
              + `stroke-linecap="round" opacity=".58">`
              + `<path d="M${geometry.cx - 14 * scale} ${geometry.cy - 0.7} `
              + `Q${geometry.cx - 10 * scale} ${geometry.cy - 2.15} ${geometry.cx - 6 * scale} ${geometry.cy - 0.85}"/>`
              + `<path d="M${geometry.cx + 6 * scale} ${geometry.cy - 0.85} `
              + `Q${geometry.cx + 10 * scale} ${geometry.cy - 2.15} ${geometry.cx + 14 * scale} ${geometry.cy - 0.7}"/></g>`
            : hasSimpleTubeWater
              ? `<ellipse class="profile-tube-ripple" cx="${tubeRippleCx.toFixed(2)}" cy="${geometry.cy - 0.1}" `
                + `rx="${tubeRippleRx.toFixed(2)}" ry="${tubeRippleRy.toFixed(2)}" `
                + `fill="none" stroke="#79C0FF" stroke-width=".45" opacity=".28"/>`
                + `<path class="profile-tube-wake" d="M${(tubeWakeCx - (scaledShadowRx + 1.4) * tubeWakeScale).toFixed(2)} ${(geometry.cy - 0.65).toFixed(2)} `
                + `Q${(tubeWakeCx - (scaledShadowRx + 0.2) * tubeWakeScale).toFixed(2)} ${(geometry.cy - 1.35).toFixed(2)} `
                + `${(tubeWakeCx - Math.max(0.8, (scaledShadowRx - 1.2) * tubeWakeScale)).toFixed(2)} ${(geometry.cy - 0.7).toFixed(2)}" `
                + `fill="none" stroke="#B6E3FF" stroke-width=".5" stroke-linecap="round" opacity=".38"/>`
            : hasBirdWater
              ? `<ellipse class="profile-bird-ripple" cx="${geometry.cx}" cy="${birdRippleCy.toFixed(2)}" `
                + `rx="${birdRippleRx.toFixed(2)}" ry="${birdRippleRy.toFixed(2)}" `
                + `fill="none" stroke="#79C0FF" stroke-width=".45" opacity=".3"/>`
                + `<path class="profile-bird-wake" d="M${(geometry.cx - (scaledShadowRx + 1.8) * birdWakeScale).toFixed(2)} ${(birdRippleCy - 0.45).toFixed(2)} `
                + `Q${(geometry.cx - (scaledShadowRx + 0.4) * birdWakeScale).toFixed(2)} ${(birdRippleCy - 1.25).toFixed(2)} `
                + `${(geometry.cx - Math.max(0.8, (scaledShadowRx - 1.3) * birdWakeScale)).toFixed(2)} ${(birdRippleCy - 0.5).toFixed(2)}" `
                + `fill="none" stroke="#B6E3FF" stroke-width=".5" stroke-linecap="round" opacity=".4"/>`
            : "")
          + "</svg>";
        insertAtRootStart(rootId, shadowMarkup);

        coordinatedRouteStyles += `@keyframes profile-proximity-route-${id}{${interactionKeyframes(unitIndex, true)}}`
          + `#profile-proximity-${id}{animation:profile-proximity-route-${id} ${routeDuration}s steps(1,end) infinite both;}`;
        const sparkX = geometry.cx + scaledShadowRx * 0.65;
        const sparkY = Math.max(1, geometry.cy - 10);
        const proximityMarkup = `<svg id="profile-proximity-${id}" class="profile-proximity-layer" width="600" height="300" `
          + `viewBox="0 0 200 100" fill="none" overflow="visible" aria-hidden="true">`
          + `<rect x="${sparkX.toFixed(2)}" y="${sparkY.toFixed(2)}" width="1" height="1" fill="#FFD33D"/>`
          + `<rect x="${(sparkX + 2).toFixed(2)}" y="${(sparkY - 2).toFixed(2)}" width=".7" height=".7" fill="#FF9E64"/>`
          + "</svg>";
        insertAtRootEnd(rootId, proximityMarkup);

        const heartId = `profile-heart-${id}`;
        // CSS translate uses rendered pixels while geometry is expressed in the 200x100 viewBox.
        // Convert by the farm's 3x scale so the heart clears even a wide capybara body.
        coordinatedRouteStyles += `@keyframes profile-heart-route-${id}{${heartKeyframes(unitIndex, (scaledShadowRx + 5) * 3)}}`
          + `#${heartId}{animation:profile-heart-route-${id} ${routeDuration}s steps(1,end) infinite both;}`;
        const heartX = geometry.cx - 2.45;
        const heartY = Math.max(1, geometry.cy - 15);
        const heartMarkup = `<svg id="${heartId}" class="profile-heart-layer" width="600" height="300" `
          + `viewBox="0 0 200 100" fill="none" overflow="visible" aria-hidden="true">`
          + `<g class="profile-heart-shape"><path d="M0 1H1V0H3V1H4V0H6V1H7V4H6V5H5V6H4V7H3V6H2V5H1V4H0Z" `
          + `transform="translate(${heartX.toFixed(2)} ${heartY.toFixed(2)}) scale(.7)" fill="#FF6B9A"/>`
          + `</g></svg>`;
        insertAtRootEnd(rootId, heartMarkup);
      }

      // Emotion artwork can extend above the normal sprite bounds. Keep the label above that
      // artwork instead of letting the rabbit's ! / ... state or the capybara's carrot cover it.
      if (isCustomFlyingBee) {
        // The bee flies through the full farm and sits visually above the route anchor. Keep the
        // level close to its body without covering the wings.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:-5px 12px;}`;
      } else if (isCustomFlyingVenomoth) {
        // The wider butterfly has tall wings around the route anchor, so keep metadata just above
        // the body while leaving the full wing silhouette readable.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:-10px 2px;}`;
      } else if (isCustomWaterFrog) {
        // At native 1x, keep the label close to the frog while preserving a little air above both eyes.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:-6px -10px;}`;
      } else if (persona.type === "RABBIT") {
        // The rabbit artwork's visual centre moves substantially inside its wide emotion-state
        // canvas when mirrored. Keep the horizontal optical correction, but bring the label down
        // close to the visible ears instead of leaving the large source-art gap above the rabbit.
        coordinatedRouteStyles += `@keyframes profile-level-route-${id}{${directionalLevelKeyframes(unitIndex, 25, 3)}}`
          + `#level-wrap-${id}{animation-name:profile-level-route-${id} !important;animation-duration:${routeDuration}s;`
          + "animation-timing-function:steps(1,end);animation-iteration-count:infinite;"
          + "animation-direction:normal;animation-fill-mode:both;}";
      } else if (persona.type === "FLAMINGO") {
        // Its head and neck sit left of the root anchor when facing left, so the label follows.
        coordinatedRouteStyles += `@keyframes profile-level-route-${id}{${directionalLevelKeyframes(unitIndex, -12, 0)}}`
          + `#level-wrap-${id}{animation-name:profile-level-route-${id} !important;animation-duration:${routeDuration}s;`
          + "animation-timing-function:steps(1,end);animation-iteration-count:infinite;"
          + "animation-direction:normal;animation-fill-mode:both;}";
      } else if (persona.type === "CAPYBARA_SWIM") {
        // The 1.1x body grows upward from its waterline, so lift the label enough to preserve the
        // original head clearance while retaining the horizontal offset for the mounted chick.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:-8px -6px;}`;
      } else if (persona.type === "CAPYBARA_CARROT") {
        // The carrot is part of the scaled artwork. Move the level with the new 1.1x silhouette.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 -18px;}`;
      } else if (persona.type === "RABBIT_TUBE") {
        // Tube labels should float clearly above the water toys rather than touching their ears.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 9px;}`;
      } else if (persona.type === "LITTLE_CHICK_TUBE") {
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 -7px;}`;
      } else if (persona.type === "DESSERT_FOX") {
        // The 0.6x fox only needs a small correction: closer than upstream, but still visibly more
        // breathing room than the rabbit labels.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 1px;}`;
      } else if (persona.type === "HAMSTER") {
        // Give the small 0.6x hamster a little more air above its head than before.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 17px;}`;
      } else if (persona.type === "HAMSTER_TUBE") {
        // Keep more air over the tube hamster than the land hamster.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 4px;}`;
      } else if (persona.type === "GALCHI_CAT") {
        // The cat's upstream metadata sits conspicuously high over its ears at 0.8x.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:0 8px;}`;
      } else if (isCustomPaintingSloth) {
        // Clawd's canvas includes paint/palette space to its left, so the label tracks that wider silhouette.
        coordinatedRouteStyles += `#level-wrap-${id}{translate:-14px -2px;}`;
      } else if (persona.type === "SLOTH") {
        // Upstream Sloth's visible body shifts left inside its source canvas when mirrored. Preserve
        // the right-facing label exactly, and compensate only while it is facing left.
        coordinatedRouteStyles += `@keyframes profile-level-route-${id}{${directionalLevelKeyframes(unitIndex, -18, 0)}}`
          + `#level-wrap-${id}{animation-name:profile-level-route-${id} !important;animation-duration:${routeDuration}s;`
          + "animation-timing-function:steps(1,end);animation-iteration-count:infinite;"
          + "animation-direction:normal;animation-fill-mode:both;}";
      }
    });
  });

  frontRootIds.forEach(moveRootToFront);

  const ambientBehaviorStyles = "@keyframes profile-water-bed{"
    + "0%,100%{transform:scale(.985,.97);opacity:.1;}50%{transform:scale(1.015,1.03);opacity:.18;}}"
    + "@keyframes profile-water-ripple-inner{"
    + "0%{transform:scale(.94,.9);opacity:0;}28%{opacity:.44;}72%{opacity:.24;}"
    + "100%{transform:scale(1.06,1.04);opacity:0;}}"
    + "@keyframes profile-water-ripple-outer{"
    + "0%{transform:scale(.92,.88);opacity:0;}34%{opacity:.28;}78%{opacity:.14;}"
    + "100%{transform:scale(1.08,1.06);opacity:0;}}"
    + "@keyframes profile-water-glints{"
    + "0%,100%{transform:translateX(-.18px);opacity:.28;}50%{transform:translateX(.18px);opacity:.62;}}"
    + "@keyframes profile-heart-pop{0%,100%{transform:translateY(0) scale(.88);}"
    + "50%{transform:translateY(-1.2px) scale(1.08);}}"
    + ".profile-ground-layer,.profile-proximity-layer,.profile-heart-layer{pointer-events:none;}"
    + ".profile-heart-shape{animation:profile-heart-pop 1.1s ease-in-out infinite;"
    + "transform-box:fill-box;transform-origin:center;}"
    + ".profile-water-bed,.profile-water-ripple-inner,.profile-water-ripple-outer{"
    + "transform-box:fill-box;transform-origin:center;}"
    + ".profile-tube-ripple{animation:profile-tube-ripple 4.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}"
    + ".profile-tube-wake{animation:profile-tube-wake 3.6s ease-in-out infinite;}"
    + "@keyframes profile-tube-ripple{0%,100%{transform:scale(.96,.9);opacity:.16;}50%{transform:scale(1.04,1.06);opacity:.34;}}"
    + "@keyframes profile-tube-wake{0%,100%{transform:translateX(-.12px);opacity:.22;}50%{transform:translateX(.18px);opacity:.46;}}"
    + ".profile-bird-ripple{animation:profile-bird-ripple 5.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}"
    + ".profile-bird-wake{animation:profile-bird-wake 4.4s ease-in-out infinite;}"
    + "@keyframes profile-bird-ripple{0%,100%{transform:scale(.97,.92);opacity:.18;}50%{transform:scale(1.05,1.08);opacity:.36;}}"
    + "@keyframes profile-bird-wake{0%,100%{transform:translateX(-.15px);opacity:.2;}50%{transform:translateX(.2px);opacity:.48;}}"
    + ".profile-water-bed{animation:profile-water-bed 5.6s ease-in-out infinite;}"
    + ".profile-water-ripple-inner{animation:profile-water-ripple-inner 4.8s ease-out infinite;}"
    + ".profile-water-ripple-outer{animation:profile-water-ripple-outer 6.4s ease-out -2.35s infinite;}"
    + ".profile-water-glints{animation:profile-water-glints 3.6s ease-in-out infinite;transform-box:fill-box;"
    + "transform-origin:center;}"
    + "@media (prefers-reduced-motion:reduce){"
    + "[id^='profile-actions-'],[id^='profile-interaction-'],[id^='profile-proximity-'],"
    + "[id^='profile-shadow-shape-'],[id^='profile-heart-'],.profile-heart-shape,"
    + ".profile-water-bed,.profile-water-ripple-inner,"
    + ".profile-water-ripple-outer,.profile-water-glints,.profile-tube-ripple,.profile-tube-wake,"
    + ".profile-bird-ripple,.profile-bird-wake{animation-duration:240s!important;}}";
  const profileBehaviorStyles = `${coordinatedRouteStyles}${riderActionStyles}${ambientBehaviorStyles}`;
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
  .replace('stroke="#D9D9D9"', 'stroke="#D0D7DE"')
  .replace(/[ \t]+\n/g, "\n");

const darkThemeStyle = [
  "<style>",
  "#username path, #commit path, [id^='level-wrap-'] path { fill: #F0F6FC; }",
  ".profile-ground-shadow { fill: #C9D1D9; opacity: .34; }",
  "</style>",
].join("");

const dark = compactUsername(freeRoamSource)
  .replace(
    'xmlns="http://www.w3.org/2000/svg">',
    `xmlns="http://www.w3.org/2000/svg">${darkThemeStyle}`,
  )
  .replace('fill="white"/>', 'fill="#0D1117"/>')
  .replace('stroke="#D9D9D9"', 'stroke="#30363D"')
  .replace(/[ \t]+\n/g, "\n");

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

const readme = await readFile(readmePath, "utf8");
const cacheVersion = Date.now();
const refreshedReadme = readme.replace(
  /(assets\/gitanimals\/farm-(?:dark|light)\.svg\?v=)[^"')\s]+/g,
  `$1${cacheVersion}`,
);
if (refreshedReadme === readme) {
  throw new Error("Unable to update the GitAnimals README cache-busting version.");
}
await writeFile(readmePath, refreshedReadme);

console.log(`Refreshed light and dark GitAnimals artwork and README cache key (${cacheVersion}).`);
