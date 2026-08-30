import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const state = JSON.parse(await readFile(path.join(root, "assets/gitanimals/state.json"), "utf8"));
const light = await readFile(path.join(root, "assets/gitanimals/farm-light.svg"), "utf8");
const dark = await readFile(path.join(root, "assets/gitanimals/farm-dark.svg"), "utf8");
const layoutVersion = "character-behaviors-v41";
const maximumOverlapSeconds = 3;
const sampleStepSeconds = 0.05;
// Farm-wide explorers intentionally cross more ground than residents; this still limits every pet
// to a smooth multi-second traverse rather than a sub-second collision-correction jump.
const maximumWeightedSpeed = 16;
const fastMovementTypes = new Set([
  "RABBIT",
  "GALCHI_CAT",
  "SHIBA",
  "GOOSE",
  "RABBIT_TUBE",
  "HAMSTER_TUBE",
  "LITTLE_CHICK_TUBE",
]);
const farmRoamerTypes = new Set(["RABBIT", "GALCHI_CAT", "SHIBA", "GOOSE"]);
const expectedFacingPivots = {
  LITTLE_CHICK_TUBE: "16.00",
  RABBIT_TUBE: "10.00",
  HAMSTER_TUBE: "21.00",
  RABBIT: "25.51",
  HAMSTER: "21.00",
  PENGUIN: "20.75",
  PENGUIN_SUNGLASSES: "20.75",
  CAPYBARA_CARROT: "30.76",
  CAPYBARA_SWIM: "17.40",
  LITTLE_CHICK_SUNGLASSES: "14.36",
  GOOSE: "23.59",
  GALCHI_CAT: "11.75",
  SHIBA: "11.98",
  DESSERT_FOX: "26.00",
  FLAMINGO: "24.24",
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const separationRadius = (type) => {
  if (type === "CAPYBARA_SWIM") return 12;
  if (type.includes("CAPYBARA")) return 11;
  if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return 10;
  if (type === "RABBIT_TUBE" || type === "HAMSTER_TUBE") return 10;
  if (type === "LITTLE_CHICK_TUBE" || type === "DESSERT_FOX") return 9;
  if (type === "RABBIT" || type === "SHIBA") return 9;
  return 8;
};

const personaFamily = (type) => {
  if (type.startsWith("CAPYBARA")) return "CAPYBARA";
  if (type.startsWith("RABBIT")) return "RABBIT";
  if (type.startsWith("HAMSTER")) return "HAMSTER";
  if (type.startsWith("LITTLE_CHICK")) return "LITTLE_CHICK";
  return null;
};

const extractAnimation = (svg, persona) => {
  const id = String(persona.id);
  const names = [`move-${id}`, `profile-route-${id}`];
  for (const name of names) {
    const keyframesStart = svg.indexOf(`@keyframes ${name}`);
    if (keyframesStart === -1) continue;
    const bodyStart = svg.indexOf("{", keyframesStart) + 1;
    let ruleStart = svg.indexOf(`animation-name:${name}`, bodyStart);
    if (ruleStart === -1) ruleStart = svg.indexOf(`animation-name: ${name}`, bodyStart);
    assert(ruleStart !== -1, `Missing animation rule for ${persona.type} (${id}).`);
    const bodyEnd = svg.lastIndexOf("}", ruleStart);
    const points = [...svg.slice(bodyStart, bodyEnd).matchAll(
      /([\d.]+)%\s*\{transform:translate\(([-\d.]+)%,\s*([-\d.]+)%/g,
    )].map((match) => ({ percentage: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }));
    const rule = svg.slice(ruleStart, svg.indexOf("}", ruleStart));
    const duration = Number(rule.match(/animation-duration:\s*([\d.]+)s/)?.[1]);
    assert(points.length > 1, `Missing coordinated route points for ${persona.type} (${id}).`);
    assert(Number.isFinite(duration), `Missing route duration for ${persona.type} (${id}).`);
    assert(/animation-iteration-count:\s*infinite/.test(rule), `${persona.type} route must repeat forever.`);
    return { id, persona, name, points, duration };
  }
  throw new Error(`Missing route for visible ${persona.type} (${id}).`);
};

const positionAt = (animation, seconds) => {
  const percentage = ((seconds % animation.duration) / animation.duration) * 100;
  let index = 1;
  while (index < animation.points.length && animation.points[index].percentage < percentage) index += 1;
  const left = animation.points[Math.max(0, index - 1)];
  const right = animation.points[Math.min(index, animation.points.length - 1)];
  const ratio = right.percentage === left.percentage
    ? 0
    : (percentage - left.percentage) / (right.percentage - left.percentage);
  return {
    x: left.x + (right.x - left.x) * ratio,
    y: left.y + (right.y - left.y) * ratio,
  };
};

assert(light.includes(`data-profile-layout="${layoutVersion}"`), "Light SVG layout version is stale.");
assert(dark.includes(`data-profile-layout="${layoutVersion}"`), "Dark SVG layout version is stale.");

const visible = state.personas.filter((persona) => persona.visible);
const rider = visible.find((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES");
const mount = visible.find((persona) => persona.type === "CAPYBARA_SWIM");
const collisionPersonas = rider && mount
  ? visible.filter((persona) => String(persona.id) !== String(rider.id))
  : visible;
const denseLayout = collisionPersonas.length > 10;
const lightAnimations = collisionPersonas.map((persona) => extractAnimation(light, persona));
const darkAnimations = collisionPersonas.map((persona) => extractAnimation(dark, persona));
const animationFamilies = (animation) => {
  const families = new Set();
  const family = personaFamily(animation.persona.type);
  if (family) families.add(family);
  if (rider && mount && String(animation.persona.id) === String(mount.id)) {
    families.add("LITTLE_CHICK");
  }
  return families;
};
const animationsShareFamily = (left, right) => {
  const leftFamilies = animationFamilies(left);
  const rightFamilies = animationFamilies(right);
  return [...leftFamilies].some((family) => rightFamilies.has(family));
};

lightAnimations.forEach((animation, index) => {
  // Explorers cross the full 600px farm multiple times per cycle; their higher caps still limit
  // each half-second frame to a visibly continuous traverse rather than a teleport.
  const personaMaximumWeightedSpeed = fastMovementTypes.has(animation.persona.type)
    ? (denseLayout ? 72 : 84)
    : maximumWeightedSpeed;
  const darkAnimation = darkAnimations[index];
  assert(
    JSON.stringify(animation.points) === JSON.stringify(darkAnimation.points),
    `Light and dark routes differ for ${animation.persona.type} (${animation.id}).`,
  );
  const movementStart = light.indexOf(`@keyframes ${animation.name}`);
  const movementRuleStart = light.indexOf(`animation-name:${animation.name}`, movementStart) >= 0
    ? light.indexOf(`animation-name:${animation.name}`, movementStart)
    : light.indexOf(`animation-name: ${animation.name}`, movementStart);
  const movementBody = light.slice(movementStart, movementRuleStart);
  assert(!movementBody.includes("scaleX("),
    `${animation.persona.type} facing must not alter its movement transform.`);

  const facingId = `profile-facing-${animation.id}`;
  assert(light.includes(`<g id="${facingId}">`), `${animation.persona.type} is missing its facing wrapper.`);
  const levelWrapIndex = light.indexOf(`<g id="level-wrap-${animation.id}"`);
  const facingWrapperIndex = light.indexOf(`<g id="${facingId}">`);
  assert(facingWrapperIndex > levelWrapIndex,
    `${animation.persona.type} facing wrapper must exclude its level and metadata overlays.`);
  assert(light.includes(`#${facingId}{animation:profile-facing-route-${animation.id}`),
    `${animation.persona.type} is missing its independent facing animation.`);
  const facingRuleStart = light.indexOf(`#${facingId}{animation:profile-facing-route-${animation.id}`);
  const facingRuleEnd = light.indexOf("}", facingRuleStart);
  const facingRule = light.slice(facingRuleStart, facingRuleEnd);
  assert(facingRule.includes("steps(1,end)"), `${animation.persona.type} facing must use a discrete turn.`);
  assert(/transform-origin:[\d.]+px 0px/.test(facingRule) && !facingRule.includes("transform-box:fill-box"),
    `${animation.persona.type} must use its measured local sprite pivot.`);
  assert(facingRule.includes(`transform-origin:${expectedFacingPivots[animation.persona.type]}px 0px`),
    `${animation.persona.type} measured pivot changed unexpectedly.`);

  const interactionId = `profile-interaction-${animation.id}`;
  assert(light.includes(`<g id="${interactionId}">`),
    `${animation.persona.type} is missing its proximity interaction wrapper.`);
  assert(light.includes(`@keyframes profile-interaction-route-${animation.id}`),
    `${animation.persona.type} is missing continuous proximity interaction keyframes.`);

  if (animation.persona.type !== "LITTLE_CHICK_SUNGLASSES") {
    const actionId = `profile-actions-${animation.id}`;
    const actionStart = light.indexOf(`@keyframes profile-actions-route-${animation.id}`);
    const actionRuleStart = light.indexOf(`#${actionId}`, actionStart);
    assert(light.includes(`<g id="${actionId}">`) && actionStart !== -1 && actionRuleStart !== -1,
      `${animation.persona.type} is missing its alternating character actions.`);
    const actionBody = light.slice(actionStart, actionRuleStart);
    assert((actionBody.match(/transform:/g) ?? []).length >= 8,
      `${animation.persona.type} needs several alternating actions, not one repeated gesture.`);
    assert(light.includes(`<svg id="profile-shadow-${animation.id}"`)
      && light.includes(`<ellipse class="profile-ground-shadow"`),
    `${animation.persona.type} is missing its grounding shadow.`);
    assert(light.includes(`<svg id="profile-proximity-${animation.id}"`)
      && light.includes(`@keyframes profile-proximity-route-${animation.id}`),
    `${animation.persona.type} is missing its visible proximity response.`);
    assert(light.includes(`<svg id="profile-heart-${animation.id}"`)
      && light.includes(`@keyframes profile-heart-route-${animation.id}`),
    `${animation.persona.type} is missing its head-on meeting heart.`);
  }

  const facingKeyframesStart = light.indexOf(`@keyframes profile-facing-route-${animation.id}`);
  const facingKeyframesEnd = light.indexOf(`#${facingId}`, facingKeyframesStart);
  const facingBody = light.slice(facingKeyframesStart, facingKeyframesEnd);
  assert(!/\d+\.\d1%\{transform:scaleX/.test(facingBody),
    `${animation.persona.type} still contains near-zero-time paired flip frames.`);

  const reverseFlipStart = light.indexOf(`@keyframes reverse-flip-${animation.id}`);
  if (reverseFlipStart !== -1) {
    const reverseFlipRuleStart = light.indexOf(`animation-name: reverse-flip-${animation.id}`, reverseFlipStart);
    const reverseFlipBody = light.slice(reverseFlipStart, reverseFlipRuleStart);
    assert(!reverseFlipBody.includes("scaleX(-1)"),
      `${animation.persona.type} metadata must not counter-flip independently from its artwork.`);
  }
  const start = positionAt(animation, 0);
  const nearEnd = positionAt(animation, animation.duration - sampleStepSeconds);
  const seamDistance = Math.hypot((start.x - nearEnd.x) * 2, start.y - nearEnd.y);
  assert(seamDistance <= personaMaximumWeightedSpeed * sampleStepSeconds * 1.1,
    `${animation.persona.type} jumps across its loop seam (${seamDistance.toFixed(2)} units).`);

  let previous = start;
  for (let seconds = sampleStepSeconds; seconds < animation.duration; seconds += sampleStepSeconds) {
    const current = positionAt(animation, seconds);
    const speed = Math.hypot((current.x - previous.x) * 2, current.y - previous.y) / sampleStepSeconds;
    assert(speed <= personaMaximumWeightedSpeed,
      `${animation.persona.type} moves too abruptly (${speed.toFixed(2)} units/s at ${seconds.toFixed(2)}s).`);
    previous = current;
  }
});

for (const explorerType of farmRoamerTypes) {
  const explorerAnimation = lightAnimations.find((animation) => animation.persona.type === explorerType);
  if (!explorerAnimation) continue;
  const xValues = explorerAnimation.points.map((point) => point.x);
  const yValues = explorerAnimation.points.map((point) => point.y);
  const horizontalCoverage = Math.max(...xValues) - Math.min(...xValues);
  const verticalCoverage = Math.max(...yValues) - Math.min(...yValues);
  assert(horizontalCoverage >= 65,
    `${explorerType} explorer must traverse the farm horizontally (${horizontalCoverage.toFixed(2)}%).`);
  assert(verticalCoverage >= 35,
    `${explorerType} explorer must traverse the farm vertically (${verticalCoverage.toFixed(2)}%).`);

  // The cat retains its established pause-and-patrol cadence; this turn only makes the Shiba and
  // goose join the rabbit's continuously active roaming class.
  if (explorerType === "GALCHI_CAT") continue;

  let stationarySeconds = 0;
  let longestStationarySeconds = 0;
  let previousPosition = positionAt(explorerAnimation, 0);
  for (let seconds = sampleStepSeconds; seconds < explorerAnimation.duration; seconds += sampleStepSeconds) {
    const currentPosition = positionAt(explorerAnimation, seconds);
    const speed = Math.hypot(
      (currentPosition.x - previousPosition.x) * 2,
      currentPosition.y - previousPosition.y,
    ) / sampleStepSeconds;
    stationarySeconds = speed < 0.5 ? stationarySeconds + sampleStepSeconds : 0;
    longestStationarySeconds = Math.max(longestStationarySeconds, stationarySeconds);
    previousPosition = currentPosition;
  }
  assert(longestStationarySeconds <= (denseLayout ? 4.5 : 3),
    `${explorerType} explorer stays nearly still for ${longestStationarySeconds.toFixed(2)}s.`);
}

const heartEventCount = (light.match(/opacity:1;transform:translate\([^)]*\);/g) ?? []).length;
assert(heartEventCount > 0, "At least one head-on character meeting must produce a heart.");

const carrotCapybara = visible.find((persona) => persona.type === "CAPYBARA_CARROT");
if (carrotCapybara) {
  assert(light.includes(`#level-wrap-${carrotCapybara.id}{translate:0 -10px;}`),
    "Carrot capybara level label must clear the carrot.");
  assert(dark.includes(`#level-wrap-${carrotCapybara.id}{translate:0 -10px;}`),
    "Dark carrot capybara level label must clear the carrot.");
}

const rabbit = visible.find((persona) => persona.type === "RABBIT");
if (rabbit) {
  for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
    assert(svg.includes('<g id="rabbit-think-bubble" transform="translate(6, -10)">'),
      `${theme} rabbit thinking bubble must stay near its head and below the level label.`);
    const animationName = `profile-level-route-${rabbit.id}`;
    const keyframesStart = svg.indexOf(`@keyframes ${animationName}`);
    const ruleStart = svg.indexOf(`animation-name:${animationName}`, keyframesStart);
    assert(keyframesStart !== -1 && ruleStart !== -1,
      `${theme} rabbit level label must follow its facing direction.`);
    const body = svg.slice(keyframesStart, ruleStart);
    assert(body.includes("translate:0px -9px") && body.includes("translate:25px -9px"),
      `${theme} rabbit level must shift right only while facing left.`);
    const rule = svg.slice(ruleStart, svg.indexOf("}", ruleStart));
    assert(rule.includes(`animation-name:${animationName} !important`),
      `${theme} rabbit level animation must override the source metadata animation.`);
    assert(rule.includes("steps(1,end)"),
      `${theme} rabbit level offset must switch discretely with its facing direction.`);
  }
}

const flamingo = visible.find((persona) => persona.type === "FLAMINGO");
if (flamingo) {
  for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
    const animationName = `profile-level-route-${flamingo.id}`;
    const keyframesStart = svg.indexOf(`@keyframes ${animationName}`);
    const ruleStart = svg.indexOf(`animation-name:${animationName}`, keyframesStart);
    assert(keyframesStart !== -1 && ruleStart !== -1,
      `${theme} flamingo level label must follow its facing direction.`);
    const body = svg.slice(keyframesStart, ruleStart);
    assert(body.includes("translate:0px 0px") && body.includes("translate:-12px 0px"),
      `${theme} flamingo level must shift left only while facing left.`);
    const rule = svg.slice(ruleStart, svg.indexOf("}", ruleStart));
    assert(rule.includes(`animation-name:${animationName} !important`) && rule.includes("steps(1,end)"),
      `${theme} flamingo level offset must override metadata and switch with direction.`);
  }
}

const swimmingCapybara = visible.find((persona) => persona.type === "CAPYBARA_SWIM");
if (swimmingCapybara) {
  assert(light.includes(`#level-wrap-${swimmingCapybara.id}{translate:-8px 0;}`),
    "Swimming capybara level label must clear the mounted chick.");
  assert(dark.includes(`#level-wrap-${swimmingCapybara.id}{translate:-8px 0;}`),
    "Dark swimming capybara level label must clear the mounted chick.");
  for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
    assert(svg.includes("class=\"profile-water-bed\"")
      && svg.includes("class=\"profile-water-ripple-inner\"")
      && svg.includes("class=\"profile-water-ripple-outer\"")
      && svg.includes("class=\"profile-water-glints\""),
    `${theme} swimming capybara needs a layered water surface.`);
    assert(svg.includes("transform:scale(.94,.9)")
      && svg.includes("transform:scale(1.06,1.04)")
      && svg.includes("transform:translateX(-.18px)")
      && svg.includes("transform:translateX(.18px)"),
    `${theme} swimming capybara water motion must remain subtle and local.`);
  }
}

if (rider && mount) {
  const riderAnimation = extractAnimation(light, rider);
  const mountAnimation = extractAnimation(light, mount);
  assert(riderAnimation.points.length === mountAnimation.points.length, "Rider and mount routes differ in length.");
  riderAnimation.points.forEach((point, index) => {
    const mountPoint = mountAnimation.points[index];
    assert(Math.abs(point.x - mountPoint.x - 5) < 0.02, "Rider lost its horizontal mount offset.");
    assert(Math.abs(point.y - mountPoint.y + 6) < 0.02, "Rider lost its vertical mount offset.");
  });
}

let longestOverlap = 0;
let longestPair = "";
let closestSameFamilyGap = Number.POSITIVE_INFINITY;
let closestSameFamilyPair = "";
const cycleSeconds = Math.max(...lightAnimations.map((animation) => animation.duration));
for (let leftIndex = 0; leftIndex < lightAnimations.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < lightAnimations.length; rightIndex += 1) {
    const left = lightAnimations[leftIndex];
    const right = lightAnimations[rightIndex];
    const threshold = separationRadius(left.persona.type) + separationRadius(right.persona.type);
    const sameFamily = animationsShareFamily(left, right);
    const sameFamilyMinimumDistance = threshold + 10;
    let overlapStartedAt = null;
    let pairLongestOverlap = 0;
    let pairMinimumDistance = Number.POSITIVE_INFINITY;
    for (let seconds = 0; seconds <= cycleSeconds; seconds += sampleStepSeconds) {
      const leftPosition = positionAt(left, seconds);
      const rightPosition = positionAt(right, seconds);
      const distance = Math.hypot(
        (leftPosition.x - rightPosition.x) * 2,
        leftPosition.y - rightPosition.y,
      );
      pairMinimumDistance = Math.min(pairMinimumDistance, distance);
      if (distance < threshold && overlapStartedAt === null) overlapStartedAt = seconds;
      if (distance >= threshold && overlapStartedAt !== null) {
        pairLongestOverlap = Math.max(pairLongestOverlap, seconds - overlapStartedAt);
        overlapStartedAt = null;
      }
    }
    if (overlapStartedAt !== null) {
      pairLongestOverlap = Math.max(pairLongestOverlap, cycleSeconds - overlapStartedAt);
    }
    if (pairLongestOverlap > longestOverlap) {
      longestOverlap = pairLongestOverlap;
      longestPair = `${left.persona.type} / ${right.persona.type}`;
    }
    if (sameFamily) {
      assert(
        pairMinimumDistance >= sameFamilyMinimumDistance,
        `${left.persona.type} / ${right.persona.type} are duplicate-family pets but approach to `
          + `${pairMinimumDistance.toFixed(2)} units; expected >= ${sameFamilyMinimumDistance.toFixed(2)}.`,
      );
      const gap = pairMinimumDistance - threshold;
      if (gap < closestSameFamilyGap) {
        closestSameFamilyGap = gap;
        closestSameFamilyPair = `${left.persona.type} / ${right.persona.type}`;
      }
    }
  }
}

assert(
  longestOverlap <= maximumOverlapSeconds,
  `${longestPair} overlaps for ${longestOverlap.toFixed(2)}s; expected <= ${maximumOverlapSeconds}s.`,
);

console.log(
  `Verified ${lightAnimations.length} coordinated units; longest overlap ${longestOverlap.toFixed(2)}s`
  + `${longestPair ? ` (${longestPair})` : ""}`
  + `${Number.isFinite(closestSameFamilyGap)
    ? `; closest duplicate-family gap ${closestSameFamilyGap.toFixed(2)} units (${closestSameFamilyPair})`
    : ""}.`,
);
