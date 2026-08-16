import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const state = JSON.parse(await readFile(path.join(root, "assets/gitanimals/state.json"), "utf8"));
const light = await readFile(path.join(root, "assets/gitanimals/farm-light.svg"), "utf8");
const dark = await readFile(path.join(root, "assets/gitanimals/farm-dark.svg"), "utf8");
const layoutVersion = "character-behaviors-v20";
const maximumOverlapSeconds = 2;
const sampleStepSeconds = 0.05;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const separationRadius = (type) => {
  if (type === "CAPYBARA_SWIM") return 12;
  if (type.includes("CAPYBARA")) return 11;
  if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return 10;
  if (type === "RABBIT" || type === "SHIBA") return 9;
  return 8;
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
const lightAnimations = collisionPersonas.map((persona) => extractAnimation(light, persona));
const darkAnimations = collisionPersonas.map((persona) => extractAnimation(dark, persona));

lightAnimations.forEach((animation, index) => {
  const darkAnimation = darkAnimations[index];
  assert(
    JSON.stringify(animation.points) === JSON.stringify(darkAnimation.points),
    `Light and dark routes differ for ${animation.persona.type} (${animation.id}).`,
  );
});

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
const cycleSeconds = Math.max(...lightAnimations.map((animation) => animation.duration));
for (let leftIndex = 0; leftIndex < lightAnimations.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < lightAnimations.length; rightIndex += 1) {
    const left = lightAnimations[leftIndex];
    const right = lightAnimations[rightIndex];
    const threshold = separationRadius(left.persona.type) + separationRadius(right.persona.type);
    let overlapStartedAt = null;
    let pairLongestOverlap = 0;
    for (let seconds = 0; seconds <= cycleSeconds; seconds += sampleStepSeconds) {
      const leftPosition = positionAt(left, seconds);
      const rightPosition = positionAt(right, seconds);
      const distance = Math.hypot(
        (leftPosition.x - rightPosition.x) * 2,
        leftPosition.y - rightPosition.y,
      );
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
  }
}

assert(
  longestOverlap <= maximumOverlapSeconds,
  `${longestPair} overlaps for ${longestOverlap.toFixed(2)}s; expected <= ${maximumOverlapSeconds}s.`,
);

console.log(
  `Verified ${lightAnimations.length} coordinated units; longest overlap ${longestOverlap.toFixed(2)}s`
  + `${longestPair ? ` (${longestPair})` : ""}.`,
);
