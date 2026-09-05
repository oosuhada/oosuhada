import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const state = JSON.parse(await readFile(path.join(root, "assets/gitanimals/state.json"), "utf8"));
const light = await readFile(path.join(root, "assets/gitanimals/farm-light.svg"), "utf8");
const dark = await readFile(path.join(root, "assets/gitanimals/farm-dark.svg"), "utf8");
const layoutVersion = "character-behaviors-v78";
const frogAsset = await readFile(path.join(root, "assets/gitanimals/custom/frog-pixel.svg"), "utf8");
const venomothAsset = await readFile(path.join(root, "assets/gitanimals/custom/venomoth-butterfly.svg"), "utf8");
const beeAsset = await readFile(path.join(root, "assets/gitanimals/custom/bee-svgrepo-com.svg"), "utf8");
const terminalAsset = await readFile(path.join(root, "assets/gitanimals/custom/oosu-terminal-cutout.svg"), "utf8");
// The route is cyclic. The previous 3.0s check split one cross-seam interaction into two shorter
// segments, so rotating the scene exposed the real 3.2s duration. Keep a narrow 0.05s margin above
// that phase-invariant duration instead of depending on where the loop happens to begin.
const maximumOverlapSeconds = 6;
const sampleStepSeconds = 0.05;
// Farm-wide explorers intentionally cross more ground than residents; this still limits every pet
// to a smooth multi-second traverse rather than a sub-second collision-correction jump.
const maximumWeightedSpeed = 22;
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
  LITTLE_CHICK: "16.00",
  LITTLE_CHICK_SUNGLASSES: "14.36",
  GOOSE: "23.59",
  GALCHI_CAT: "11.75",
  QUOKKA: "0.00",
  SHIBA: "11.98",
  DESSERT_FOX: "26.00",
  FLAMINGO: "24.24",
  SLOTH: "7.00",
};
const terminalQuokkaIds = new Set(["842652512849367039"]);
const beeQuokkaIds = new Set(["839316493969798500"]);
const venomothQuokkaIds = new Set(["839316523686430921"]);
const frogChickIds = new Set(["835719307358968503"]);
const flyingQuokkaIds = new Set([...beeQuokkaIds, ...venomothQuokkaIds]);
const clawdSlothIds = new Set(["843727410376082595"]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(frogAsset.includes('viewBox="0 0 21 16"'),
  "Frog custom asset should stay on the coarser 21x16 pixel grid.");
assert(frogAsset.includes("M6 1h2v1h-2Z") && frogAsset.includes("M13 1h2v1h-2Z")
  && frogAsset.includes("M6 2h2v1h-2Z") && frogAsset.includes("M13 2h2v1h-2Z"),
"Frog custom asset must preserve both dark pupils instead of dropping the left eye.");
assert(!/<image\b|data:image|href=["'](?:https?:|data:)/i.test(frogAsset),
  "Frog custom asset must remain pure inline vector artwork.");
assert(venomothAsset.includes('viewBox="0 0 20 21"'),
  "Venomoth custom asset should stay on the coarser 20x21 pixel grid.");
assert(!/<image\b|data:image|href=["'](?:https?:|data:)/i.test(venomothAsset),
  "Venomoth custom asset must remain pure inline vector artwork.");
assert(!/<(?:linear|radial)Gradient\b|url\(#|\bopacity=/i.test(venomothAsset),
  "Venomoth custom asset should stay flat: no gradients or translucent shading.");
assert(new Set([...venomothAsset.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1])).size <= 5,
  "Venomoth custom asset should keep a compact flat-color palette instead of pseudo-gradient shading.");
assert(venomothAsset.includes('#C8AED6') && venomothAsset.includes('#8D778F')
  && venomothAsset.includes('#B7AFB8'),
  "Venomoth should keep the softer reference-derived lavender, mauve, and gray body palette.");
assert(!venomothAsset.includes('#241B2B') && !venomothAsset.includes('#101010')
  && !venomothAsset.includes('#000000'),
  "Venomoth must not restore the heavy black outer contour.");
assert(venomothAsset.includes('id="venomoth-eye-left"') && venomothAsset.includes('id="venomoth-eye-right"')
  && venomothAsset.includes('id="venomoth-pupil-left"') && venomothAsset.includes('id="venomoth-pupil-right"'),
  "Venomoth must preserve two separately addressable oversized eyes and two pupils.");
assert(venomothAsset.includes('d="M8 9h2v1h-2Z"') && venomothAsset.includes('d="M14 9h2v1h-2Z"'),
  "Venomoth pupils should stay small and centered inside the oversized eyes.");
assert(beeAsset.includes('viewBox="0 0 18 14"') && beeAsset.includes('shape-rendering="crispEdges"'),
  "Bee should stay on the compact GitAnimals-style 18x14 crisp pixel grid.");
assert(!/<image\b|data:image|href=["'](?:https?:|data:)/i.test(beeAsset)
  && !/<(?:linear|radial)Gradient\b|url\(#|\bopacity=/i.test(beeAsset),
  "Bee custom asset should remain flat pure vector artwork with no raster refs, gradients, or translucent shading.");
assert(new Set([...beeAsset.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1])).size <= 5,
  "Bee should keep a compact GitAnimals-style flat palette.");
assert(beeAsset.includes('id="bee-eye"') && beeAsset.includes('id="bee-pupil"')
  && !beeAsset.includes('#070000') && !beeAsset.includes('#000000'),
  "Bee should use a friendly readable eye and avoid the old heavy black SVGRepo styling.");
assert(beeAsset.includes('d="M13 6h3v3h-3Z"') && beeAsset.includes('d="M14 7h1v1h-1Z"'),
  "Bee pupil should remain centered in a larger friendly pixel eye.");
assert(!/<(?:linear|radial)Gradient\b|url\(#|\bopacity=/i.test(terminalAsset),
  "Terminal mascot should stay flat: no gradients or translucent highlight/shadow layers.");
assert(terminalAsset.includes('shape-rendering="crispEdges"'),
  "Terminal mascot should use crisp pixel rendering instead of antialiased geometric precision.");
assert(new Set([...terminalAsset.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1])).size <= 4,
  "Terminal mascot should keep a compact flat-color palette.");
assert(terminalAsset.includes('#3A83F6'),
  "Terminal mascot body should use the darker blue sampled from the provided reference button.");

const assertSvgTagBalance = (svg, label) => {
  const stack = [];
  for (const match of svg.matchAll(/<\/?(svg|g|style)\b[^>]*>/g)) {
    const tag = match[0];
    const name = match[1];
    if (tag.startsWith("</")) {
      const previous = stack.pop();
      assert(
        previous === name,
        `${label} SVG has mismatched closing tag ${tag} near byte ${match.index}; expected </${previous ?? "none"}>.`,
      );
    } else if (!tag.endsWith("/>")) {
      stack.push(name);
    }
  }
  assert(stack.length === 0, `${label} SVG has unclosed tags: ${stack.join(", ")}.`);
};

const groupMarkupById = (svg, groupId) => {
  const escapedGroupId = groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<g\\s+id\\s*=\\s*[\"']${escapedGroupId}[\"'][^>]*>`).exec(svg);
  assert(match, `Missing SVG group ${groupId}.`);
  const groupTag = /<\/?g\b[^>]*>/g;
  groupTag.lastIndex = match.index;
  let depth = 0;
  for (let tagMatch = groupTag.exec(svg); tagMatch; tagMatch = groupTag.exec(svg)) {
    const tag = tagMatch[0];
    depth += tag.startsWith("</") ? -1 : 1;
    if (depth === 0) return svg.slice(match.index, tagMatch.index + tag.length);
  }
  throw new Error(`SVG group ${groupId} is not closed.`);
};

const separationRadius = (type) => {
  if (type === "CAPYBARA_SWIM") return 9;
  if (type === "RABBIT_TUBE" || type === "HAMSTER_TUBE") return 6;
  if (type === "LITTLE_CHICK_TUBE") return 5;
  if (type === "GOOSE" || type === "FLAMINGO") return 6;
  if (type.includes("CAPYBARA")) return 11;
  if (type.includes("PENGUIN") || type.includes("FLAMINGO")) return 10;
  if (type === "DESSERT_FOX") return 9;
  if (type === "QUOKKA") return 4.5;
  if (type === "SLOTH") return 8;
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

const characterScale = (type) => ({
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
})[type] ?? 1;

const isSwimZoneType = (type) => type.includes("_SWIM") || type.includes("_TUBE")
  || type === "GOOSE" || type === "FLAMINGO";
const isSwimZonePersona = (persona) => frogChickIds.has(String(persona.id)) || isSwimZoneType(persona.type);
const swimZoneBounds = { left: 8, right: 43 };
const swimZoneBoundsFor = (type) => ({
  CAPYBARA_SWIM: { left: 8.5, right: 28 },
  LITTLE_CHICK_TUBE: { left: 8, right: 27 },
  RABBIT_TUBE: { left: 8, right: 42.5 },
  HAMSTER_TUBE: { left: 8, right: 41.5 },
  GOOSE: { left: 13.5, right: 35.5 },
  FLAMINGO: { left: 2.5, right: 9.5 },
})[type] ?? swimZoneBounds;
const landZoneBounds = { left: 53.3, right: 85 };
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
assertSvgTagBalance(light, "Light");
assertSvgTagBalance(dark, "Dark");
assert(!light.includes("data:image") && !dark.includes("data:image"),
  "Farm SVG must not embed raster data URIs; GitHub README image rendering can drop them.");
assert(light.includes('data-profile-zone-split="50"'), "Light SVG is missing the half-width swim/land zone split.");
assert(dark.includes('data-profile-zone-split="50"'), "Dark SVG is missing the half-width swim/land zone split.");
assert(light.includes('<g id="profile-swim-zone"'), "Light SVG is missing the visible swim zone.");
assert(dark.includes('<g id="profile-swim-zone"'), "Dark SVG is missing the visible swim zone.");
assert(light.includes('<rect id="profile-swim-water" x="8" y="44" width="292" height="218"'),
  "Light SVG swim water must leave the header/footer text lanes clear.");
assert(dark.includes('<rect id="profile-swim-water" x="8" y="44" width="292" height="218"'),
  "Dark SVG swim water must leave the header/footer text lanes clear.");
assert(/data-profile-scene-phase="[\d.]+"/.test(light), "Light SVG is missing its natural scene phase.");
assert(/data-profile-scene-phase="[\d.]+"/.test(dark), "Dark SVG is missing its natural scene phase.");

const visible = state.personas.filter((persona) => persona.visible);
const isBeePersona = (persona) => beeQuokkaIds.has(String(persona.id));
const isVenomothPersona = (persona) => venomothQuokkaIds.has(String(persona.id));
const isFlyingPersona = (persona) => flyingQuokkaIds.has(String(persona.id));
const isOverlayPersona = (persona) => isFlyingPersona(persona) || frogChickIds.has(String(persona.id));
const stripedTubePrefixes = {
  LITTLE_CHICK_TUBE: "little-chick",
  RABBIT_TUBE: "rabbit",
  HAMSTER_TUBE: "hamster",
};
visible
  .filter((persona) => stripedTubePrefixes[persona.type])
  .forEach((persona) => {
    const groupId = `${stripedTubePrefixes[persona.type]}-${persona.id}-tube`;
    for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
      const tubeMarkup = groupMarkupById(svg, groupId);
      assert(!/#(?:F8F8F8|FBB3BE|FF99E7|6DB33F)\b/.test(tubeMarkup),
        `${theme} ${persona.type} tube still contains white or alternating stripe colors.`);
      assert((tubeMarkup.match(/fill="#5FC4FF"/g) ?? []).length >= 14,
        `${theme} ${persona.type} tube should be simplified into a solid sky-blue float.`);
    }
  });
const rider = visible.find((persona) => persona.type === "LITTLE_CHICK_SUNGLASSES");
const mount = visible.find((persona) => persona.type === "CAPYBARA_SWIM");
const collisionPersonas = rider && mount
  ? visible.filter((persona) => String(persona.id) !== String(rider.id) && !isOverlayPersona(persona))
  : visible.filter((persona) => !isOverlayPersona(persona));
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

const startPositions = lightAnimations.map((animation) => positionAt(animation, 0));
const startPairCount = Math.max(1, (startPositions.length * (startPositions.length - 1)) / 2);
let startAlignmentScore = 0;
for (let leftIndex = 0; leftIndex < startPositions.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < startPositions.length; rightIndex += 1) {
    const left = startPositions[leftIndex];
    const right = startPositions[rightIndex];
    const horizontalGap = Math.abs(left.x - right.x);
    const verticalGap = Math.abs(left.y - right.y);
    startAlignmentScore += Math.exp(-(verticalGap ** 2) / (2 * 1.7 ** 2)) * 3;
    startAlignmentScore += Math.exp(-(horizontalGap ** 2) / (2 * 2.8 ** 2)) * 1.7;
    if (verticalGap < 1.2) startAlignmentScore += 3;
    if (horizontalGap < 2) startAlignmentScore += 1.5;
  }
}
startPositions.forEach((position) => {
  if (position.y < 29 || position.y > 75) startAlignmentScore += 0.6;
  if (position.x < 11 || position.x > 84) startAlignmentScore += 0.3;
});
assert(
  startAlignmentScore / startPairCount <= 0.7,
  `Initial GitAnimals composition still looks too aligned (${(startAlignmentScore / startPairCount).toFixed(2)}).`,
);

lightAnimations.forEach((animation, index) => {
  // Explorers cross the full 600px farm multiple times per cycle; their higher caps still limit
  // each half-second frame to a visibly continuous traverse rather than a teleport.
  const personaMaximumWeightedSpeed = isBeePersona(animation.persona)
    ? 180
    : fastMovementTypes.has(animation.persona.type)
    ? (denseLayout ? 72 : 84)
    : maximumWeightedSpeed;
  const darkAnimation = darkAnimations[index];
  assert(
    JSON.stringify(animation.points) === JSON.stringify(darkAnimation.points),
    `Light and dark routes differ for ${animation.persona.type} (${animation.id}).`,
  );
  const zoneBounds = isSwimZonePersona(animation.persona)
    ? swimZoneBoundsFor(animation.persona.type)
    : { ...landZoneBounds, left: landShorelineAnchorLeft(animation.persona.type) };
  animation.points.forEach((point) => {
    assert(point.x >= zoneBounds.left - 0.01 && point.x <= zoneBounds.right + 0.01,
      `${animation.persona.type} leaves its ${isSwimZonePersona(animation.persona) ? "swim" : "land"} zone at x=${point.x.toFixed(2)}.`);
  });
  if (!isSwimZonePersona(animation.persona)) {
    const xValues = animation.points.map((point) => point.x);
    assert(Math.min(...xValues) <= landShorelineAnchorLeft(animation.persona.type) + 3.5,
      `${animation.persona.type} no longer has access to the shoreline side (${Math.min(...xValues).toFixed(2)}%).`);
    assert(Math.max(...xValues) >= 60,
      `${animation.persona.type} no longer uses the right side of the land habitat (${Math.max(...xValues).toFixed(2)}%).`);
  }
  if (animation.persona.type === "QUOKKA" && terminalQuokkaIds.has(String(animation.id))) {
    assert(light.includes(`profile-custom-terminal-${animation.id}`),
      "QUOKKA should render the custom Oosu terminal mascot sprite.");
    assert(!/[#]73A8FF|[#]3F75E8|[#]2451B7|[#]224FAE/.test(light + dark),
      "The custom Oosu terminal mascot should not use the old saturated blue palette.");
    assert(!light.includes(`quokka-${animation.id}-body`),
      "QUOKKA original sprite body should be replaced by the Oosu terminal mascot.");
  }
  if (animation.persona.type === "SLOTH" && clawdSlothIds.has(String(animation.id))) {
    assert(light.includes(`profile-custom-clawd-${animation.id}`),
      "SLOTH should render the custom Clawd painting sprite.");
    assert(new RegExp(`profile-custom-clawd-${animation.id}[^>]*width=\"62\" height=\"62\"`).test(light),
      "SLOTH Clawd painting sprite must render at the requested 62x62 size.");
    assert(light.includes(`#level-wrap-${animation.id}{translate:-14px -2px;}`)
      && dark.includes(`#level-wrap-${animation.id}{translate:-14px -2px;}`),
    "SLOTH Clawd level label should move right while staying above the enlarged sprite.");
    assert(!light.includes(`sloth-${animation.id}-body`),
      "SLOTH original sprite body should be replaced by Clawd.");
  }
  if (animation.persona.type === "SLOTH" && !clawdSlothIds.has(String(animation.id))) {
    const levelRouteStart = light.indexOf(`@keyframes profile-level-route-${animation.id}`);
    const levelRouteEnd = light.indexOf(`#level-wrap-${animation.id}`, levelRouteStart);
    const levelRoute = light.slice(levelRouteStart, levelRouteEnd);
    assert(levelRouteStart >= 0 && levelRoute.includes("translate:-18px 0px") && levelRoute.includes("translate:0px 0px"),
      `SLOTH ${animation.id} level should shift left only while facing left and preserve right-facing placement.`);
  }
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

  const requestedScale = characterScale(animation.persona.type);
  const sizeId = `profile-size-${animation.id}`;
  assert(light.includes(`<g id="${sizeId}">`),
    `${animation.persona.type} is missing its independent size wrapper.`);
  assert(dark.includes(`<g id="${sizeId}">`),
    `Dark ${animation.persona.type} is missing its independent size wrapper.`);
  assert(light.includes(`#${sizeId}{transform:scale(${requestedScale.toFixed(2)});`),
    `${animation.persona.type} is missing its requested ${requestedScale.toFixed(2)}x scale.`);
  assert(dark.includes(`#${sizeId}{transform:scale(${requestedScale.toFixed(2)});`),
    `Dark ${animation.persona.type} is missing its requested ${requestedScale.toFixed(2)}x scale.`);

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

for (const persona of visible.filter(isBeePersona)) {
  const id = String(persona.id);
  assert(light.includes(`profile-custom-bee-${id}`) && dark.includes(`profile-custom-bee-${id}`),
    `Bee Quokka ${id} should render the custom bee sprite in both themes.`);
  assert(!light.includes(`quokka-${id}-body`) && !dark.includes(`quokka-${id}-body`),
    `Bee Quokka ${id} original body should be replaced by the bee sprite.`);
  assert(!light.includes(`@keyframes profile-bee-buzz-${id}`),
    `Bee Quokka ${id} should not keep a local buzz/jitter animation.`);
  assert(!light.includes(`<svg id="profile-shadow-${id}"`),
    `Bee Quokka ${id} should fly without a ground shadow.`);
  assert(light.includes(`#profile-facing-${id}{animation:profile-facing-route-${id} 60s steps(1,end) infinite both;transform-origin:1.50px 0px;`),
    `Bee Quokka ${id} should turn around its visual center on the same 60s flight cycle.`);
  const beeFacingStart = light.indexOf(`@keyframes profile-facing-route-${id}`);
  const beeFacingEnd = light.indexOf(`#profile-facing-${id}`, beeFacingStart);
  const beeFacingBody = light.slice(beeFacingStart, beeFacingEnd);
  assert(beeFacingBody.includes("scaleX(-1)") && beeFacingBody.includes("scaleX(1)"),
    `Bee Quokka ${id} should face left while flying left and right while flying right.`);
  assert(light.includes(`#level-wrap-${id}{translate:-5px 12px;}`)
    && dark.includes(`#level-wrap-${id}{translate:-5px 12px;}`),
  `Bee Quokka ${id} level should sit lower and slightly left of the fast-flying sprite.`);
  const lightBee = extractAnimation(light, persona);
  const darkBee = extractAnimation(dark, persona);
  assert(JSON.stringify(lightBee.points) === JSON.stringify(darkBee.points),
    `Bee Quokka ${id} light and dark flight paths differ.`);
  const xValues = lightBee.points.map((point) => point.x);
  const yValues = lightBee.points.map((point) => point.y);
  assert(Math.min(...xValues) <= 8.5 && Math.max(...xValues) >= 91.5,
    `Bee Quokka ${id} should sweep across both water and land (${Math.min(...xValues).toFixed(2)}-${Math.max(...xValues).toFixed(2)}%).`);
  assert(Math.max(...yValues) - Math.min(...yValues) >= 50,
    `Bee Quokka ${id} should fly through a tall looping path.`);
  const start = positionAt(lightBee, 0);
  const nearEnd = positionAt(lightBee, lightBee.duration - sampleStepSeconds);
  const seamDistance = Math.hypot((start.x - nearEnd.x) * 2, start.y - nearEnd.y);
  assert(seamDistance <= 3,
    `Bee Quokka ${id} jumps across its loop seam (${seamDistance.toFixed(2)} units).`);
  let maximumSpeed = 0;
  let weightedDistance = 0;
  let previous = start;
  for (let seconds = sampleStepSeconds; seconds < lightBee.duration; seconds += sampleStepSeconds) {
    const current = positionAt(lightBee, seconds);
    const distance = Math.hypot((current.x - previous.x) * 2, current.y - previous.y);
    weightedDistance += distance;
    maximumSpeed = Math.max(maximumSpeed, distance / sampleStepSeconds);
    previous = current;
  }
  const averageSpeed = weightedDistance / lightBee.duration;
  assert(lightBee.duration >= 56 && lightBee.duration <= 64 && darkBee.duration >= 56 && darkBee.duration <= 64,
    `Bee Quokka ${id} should loop in about 60s, roughly 2x faster than the base route.`);
  assert(averageSpeed >= 8.5,
    `Bee Quokka ${id} should keep a fast broad full-farm flight; average ${averageSpeed.toFixed(2)} units/s.`);
  assert(maximumSpeed <= 90,
    `Bee Quokka ${id} moves too abruptly (${maximumSpeed.toFixed(2)} units/s).`);
}

for (const persona of visible.filter(isVenomothPersona)) {
  const id = String(persona.id);
  assert(light.includes(`profile-custom-venomoth-${id}`) && dark.includes(`profile-custom-venomoth-${id}`),
    `Venomoth Quokka ${id} should render the vectorized butterfly sprite in both themes.`);
  assert(!light.includes(`quokka-${id}-body`) && !dark.includes(`quokka-${id}-body`),
    `Venomoth Quokka ${id} original body should be replaced.`);
  assert(!light.includes(`<svg id="profile-shadow-${id}"`) && !dark.includes(`<svg id="profile-shadow-${id}"`),
    `Venomoth Quokka ${id} should fly without a ground shadow.`);
  assert(light.includes(`#profile-facing-${id}{animation:profile-facing-route-${id} 60s steps(1,end) infinite both;transform-box:fill-box;transform-origin:center center;`),
    `Venomoth Quokka ${id} should flip around its own artwork center on the same 60s cycle as the bee.`);
  const venomothFacingStart = light.indexOf(`@keyframes profile-facing-route-${id}`);
  const venomothFacingEnd = light.indexOf(`#profile-facing-${id}`, venomothFacingStart);
  const venomothFacingBody = light.slice(venomothFacingStart, venomothFacingEnd);
  assert(venomothFacingBody.includes("scaleX(-1)") && venomothFacingBody.includes("scaleX(1)"),
    `Venomoth Quokka ${id} must face left while flying left and right while flying right.`);
  assert(light.includes(`#level-wrap-${id}{translate:-10px 2px;}`)
    && dark.includes(`#level-wrap-${id}{translate:-10px 2px;}`),
  `Venomoth Quokka ${id} level should clear its large wings.`);
  const flight = extractAnimation(light, persona);
  const darkFlight = extractAnimation(dark, persona);
  assert(JSON.stringify(flight.points) === JSON.stringify(darkFlight.points),
    `Venomoth Quokka ${id} light and dark flight paths differ.`);
  const xValues = flight.points.map((point) => point.x);
  const yValues = flight.points.map((point) => point.y);
  assert(Math.min(...xValues) <= 8.5 && Math.max(...xValues) >= 91.5,
    `Venomoth Quokka ${id} should sweep across water and land.`);
  assert(Math.max(...yValues) - Math.min(...yValues) >= 50,
    `Venomoth Quokka ${id} should use the full-height flying route.`);
  assert(flight.duration === 60 && darkFlight.duration === 60,
    `Venomoth Quokka ${id} must take 60s, exactly matching the bee cycle.`);
}

for (const persona of visible.filter((candidate) => frogChickIds.has(String(candidate.id)))) {
  const id = String(persona.id);
  assert(light.includes(`profile-custom-frog-${id}`) && dark.includes(`profile-custom-frog-${id}`),
    `Frog Little Chick ${id} should render the isolated pixel frog in both themes.`);
  assert(!light.includes(`little-chick-${id}-body`) && !dark.includes(`little-chick-${id}-body`),
    `Frog Little Chick ${id} original chick body should be replaced.`);
  assert(light.includes(`#level-wrap-${id}{translate:-6px -10px;}`)
    && dark.includes(`#level-wrap-${id}{translate:-6px -10px;}`),
  `Frog Little Chick ${id} level should stay above the frog.`);
  assert(light.includes(`#profile-size-${id}{transform:scale(1.00);`)
    && dark.includes(`#profile-size-${id}{transform:scale(1.00);`),
  `Frog Little Chick ${id} should render at native 1x size.`);
  const frogJumpStart = light.indexOf(`@keyframes profile-actions-route-${id}`);
  const frogJumpEnd = light.indexOf(`#profile-actions-${id}`, frogJumpStart);
  const frogJumpBody = light.slice(frogJumpStart, frogJumpEnd);
  assert(frogJumpBody.includes("translate(0,-12px)")
    && !/translate\((?:-|[1-9])[^,]*px,/.test(frogJumpBody),
  `Frog Little Chick ${id} should intermittently jump straight up in place without horizontal drift.`);
  assert(light.includes(`#profile-actions-${id}{animation:profile-actions-route-${id} 32s ease-in-out infinite both;`),
    `Frog Little Chick ${id} jump should use the quicker intermittent 32s cycle.`);
  assert(light.includes(`@keyframes profile-frog-pant-${id}`)
    && light.includes(`#profile-custom-frog-${id}{animation:profile-frog-pant-${id} 1.25s ease-in-out infinite;`)
    && dark.includes(`@keyframes profile-frog-pant-${id}`),
  `Frog Little Chick ${id} should keep a continuous visible pant/breath idle motion.`);
  const frogShadowStart = light.indexOf(`@keyframes profile-shadow-route-${id}`);
  const frogShadowEnd = light.indexOf(`#profile-shadow-shape-${id}`, frogShadowStart);
  const frogShadowBody = light.slice(frogShadowStart, frogShadowEnd);
  assert(frogShadowBody.includes("scaleX(.54);opacity:.07"),
    `Frog Little Chick ${id} shadow should tighten and fade at the jump apex.`);
  assert(light.includes('#3E7F3C') && light.includes('#73B84D')
    && dark.includes('#3E7F3C') && dark.includes('#73B84D'),
  `Frog Little Chick ${id} should use the brighter tree-frog palette.`);
  const frog = extractAnimation(light, persona);
  const xValues = frog.points.map((point) => point.x);
  const yValues = frog.points.map((point) => point.y);
  assert(Math.min(...xValues) >= swimZoneBounds.left - 0.01 && Math.max(...xValues) <= swimZoneBounds.right + 0.01,
    `Frog Little Chick ${id} must remain inside the water habitat.`);
  assert(Math.min(...xValues) >= 38.9 && Math.max(...xValues) <= 41.10,
    `Frog Little Chick ${id} should stay in the lower-right shoreline pocket (${Math.min(...xValues).toFixed(2)}-${Math.max(...xValues).toFixed(2)}%).`);
  assert(Math.min(...yValues) >= 67.5 && Math.max(...yValues) <= 74.1,
    `Frog Little Chick ${id} should stay low in the water (${Math.min(...yValues).toFixed(2)}-${Math.max(...yValues).toFixed(2)}%).`);
  assert(Math.max(...xValues) - Math.min(...xValues) <= 2.2
    && Math.max(...yValues) - Math.min(...yValues) <= 6.7,
  `Frog Little Chick ${id} should keep a compact flamingo-like resident route.`);
  const shadowStart = light.indexOf(`<svg id="profile-shadow-${id}"`);
  const shadowEnd = light.indexOf("</svg>", shadowStart);
  const waterMarkup = light.slice(shadowStart, shadowEnd);
  assert(shadowStart !== -1 && waterMarkup.includes('class="profile-bird-ripple"')
    && waterMarkup.includes('class="profile-bird-wake"'),
  `Frog Little Chick ${id} should carry a small water ripple/wake.`);
}

// These four are intentionally the most visibly active members of their two families. Guard both
// coverage and average travel speed so later visual/layout changes cannot silently turn them back
// into short local idles while still passing the generic maximum-speed checks.
const activeMovementContracts = {
  // Full-screen roaming is now intentionally split into two habitats. Preserve the fast cadence
  // inside each habitat instead of requiring these runners to cross the shoreline.
  RABBIT: { horizontalCoverage: 29, averageWeightedSpeed: 6.3 },
  RABBIT_TUBE: { horizontalCoverage: 20, averageWeightedSpeed: 6.2 },
  HAMSTER: { horizontalCoverage: 28, averageWeightedSpeed: 6.2 },
  HAMSTER_TUBE: { horizontalCoverage: 19, averageWeightedSpeed: 6.2 },
  GOOSE: { horizontalCoverage: 18, averageWeightedSpeed: 3.0 },
};
for (const [type, contract] of Object.entries(activeMovementContracts)) {
  const animation = lightAnimations.find((entry) => entry.persona.type === type);
  if (!animation) continue;
  const xValues = animation.points.map((point) => point.x);
  const horizontalCoverage = Math.max(...xValues) - Math.min(...xValues);
  let weightedDistance = 0;
  for (let index = 1; index < animation.points.length; index += 1) {
    const previous = animation.points[index - 1];
    const current = animation.points[index];
    weightedDistance += Math.hypot((current.x - previous.x) * 2, current.y - previous.y);
  }
  const averageWeightedSpeed = weightedDistance / animation.duration;
  assert(horizontalCoverage >= contract.horizontalCoverage,
    `${type} active patrol covers only ${horizontalCoverage.toFixed(2)}%; expected >= ${contract.horizontalCoverage}%.`);
  assert(averageWeightedSpeed >= contract.averageWeightedSpeed,
    `${type} active patrol averages ${averageWeightedSpeed.toFixed(2)} units/s; expected >= ${contract.averageWeightedSpeed}.`);
}

for (const explorerType of farmRoamerTypes) {
  const explorerAnimation = lightAnimations.find((animation) => animation.persona.type === explorerType);
  if (!explorerAnimation) continue;
  const xValues = explorerAnimation.points.map((point) => point.x);
  const yValues = explorerAnimation.points.map((point) => point.y);
  const horizontalCoverage = Math.max(...xValues) - Math.min(...xValues);
  const verticalCoverage = Math.max(...yValues) - Math.min(...yValues);
  const minimumHorizontalCoverage = isSwimZoneType(explorerType)
    ? (explorerType === "GOOSE" ? 18 : 19)
    : explorerType.startsWith("HAMSTER") ? 28 : 30;
  assert(horizontalCoverage >= minimumHorizontalCoverage,
    `${explorerType} explorer must traverse the farm horizontally (${horizontalCoverage.toFixed(2)}%).`);
  assert(verticalCoverage >= (explorerType === "GOOSE" ? 28 : 35),
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
  assert(longestStationarySeconds <= (denseLayout ? 10.5 : 3),
    `${explorerType} explorer stays nearly still for ${longestStationarySeconds.toFixed(2)}s.`);
}

const heartEventCount = (light.match(/opacity:1;transform:translate\([^)]*\);/g) ?? []).length;
assert(heartEventCount > 0, "At least one head-on character meeting must produce a heart.");

const carrotCapybara = visible.find((persona) => persona.type === "CAPYBARA_CARROT");
if (carrotCapybara) {
  assert(light.includes(`#level-wrap-${carrotCapybara.id}{translate:0 -18px;}`),
    "Carrot capybara level label must clear the carrot.");
  assert(dark.includes(`#level-wrap-${carrotCapybara.id}{translate:0 -18px;}`),
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
    assert(body.includes("translate:0px 3px") && body.includes("translate:25px 3px"),
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
  assert(light.includes(`#level-wrap-${swimmingCapybara.id}{translate:-8px -6px;}`),
    "Swimming capybara level label must clear the mounted chick.");
  assert(dark.includes(`#level-wrap-${swimmingCapybara.id}{translate:-8px -6px;}`),
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

const hamster = visible.find((persona) => persona.type === "HAMSTER");
if (hamster) {
  assert(light.includes(`#level-wrap-${hamster.id}{translate:0 17px;}`)
    && dark.includes(`#level-wrap-${hamster.id}{translate:0 17px;}`),
  "Hamster level label must keep a small gap above its 0.6x artwork.");
}

const hamsterTube = visible.find((persona) => persona.type === "HAMSTER_TUBE");
if (hamsterTube) {
  assert(light.includes(`#level-wrap-${hamsterTube.id}{translate:0 4px;}`)
    && dark.includes(`#level-wrap-${hamsterTube.id}{translate:0 4px;}`),
  "Hamster Tube level label must float above its 0.7x artwork.");
}

const rabbitTube = visible.find((persona) => persona.type === "RABBIT_TUBE");
if (rabbitTube) {
  assert(light.includes(`#level-wrap-${rabbitTube.id}{translate:0 9px;}`)
    && dark.includes(`#level-wrap-${rabbitTube.id}{translate:0 9px;}`),
  "Rabbit Tube level label must float above its visible float.");
}

const chickTube = visible.find((persona) => persona.type === "LITTLE_CHICK_TUBE");
if (chickTube) {
  assert(light.includes(`#level-wrap-${chickTube.id}{translate:0 -7px;}`)
    && dark.includes(`#level-wrap-${chickTube.id}{translate:0 -7px;}`),
  "Little Chick Tube level label must float above its artwork.");
}

const dessertFox = visible.find((persona) => persona.type === "DESSERT_FOX");
if (dessertFox) {
  assert(light.includes(`#level-wrap-${dessertFox.id}{translate:0 1px;}`)
    && dark.includes(`#level-wrap-${dessertFox.id}{translate:0 1px;}`),
  "Dessert Fox level label must move slightly closer to its artwork.");
}

const galchiCat = visible.find((persona) => persona.type === "GALCHI_CAT");
if (galchiCat) {
  assert(light.includes(`#level-wrap-${galchiCat.id}{translate:0 8px;}`)
    && dark.includes(`#level-wrap-${galchiCat.id}{translate:0 8px;}`),
  "Galchi Cat level label must sit closer to its ears.");
}

const simpleTubeTypes = ["LITTLE_CHICK_TUBE", "RABBIT_TUBE", "HAMSTER_TUBE"];
const tubeRippleMaximumRx = {
  LITTLE_CHICK_TUBE: 6.1,
  RABBIT_TUBE: 6.1,
};
for (const type of simpleTubeTypes) {
  const persona = visible.find((candidate) => candidate.type === type);
  if (!persona) continue;
  for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
    const shadowStart = svg.indexOf(`<svg id="profile-shadow-${persona.id}"`);
    const shadowEnd = svg.indexOf("</svg>", shadowStart);
    const shadowMarkup = svg.slice(shadowStart, shadowEnd);
    assert(shadowStart !== -1 && shadowMarkup.includes('class="profile-tube-ripple"')
      && shadowMarkup.includes('class="profile-tube-wake"'),
    `${theme} ${type} must keep its simplified water ripple.`);
    const rippleRx = Number(shadowMarkup.match(/class="profile-tube-ripple"[^>]*\brx="([\d.]+)"/)?.[1]);
    const rippleCx = Number(shadowMarkup.match(/class="profile-tube-ripple"[^>]*\bcx="([\d.]+)"/)?.[1]);
    if (tubeRippleMaximumRx[type] !== undefined) {
      assert(Number.isFinite(rippleRx) && rippleRx <= tubeRippleMaximumRx[type],
        `${theme} ${type} water ripple grew too large (${rippleRx}).`);
    }
    if (type === "RABBIT_TUBE") {
      assert(Math.abs(rippleCx - 6.5) < 0.01,
        `${theme} Rabbit Tube ripple must stay left-shifted under the float (cx=${rippleCx}).`);
    }
  }
}

const birdRippleCy = { GOOSE: 14, FLAMINGO: 25.5 };
for (const type of ["GOOSE", "FLAMINGO"]) {
  const persona = visible.find((candidate) => candidate.type === type);
  if (!persona) continue;
  for (const [theme, svg] of [["Light", light], ["Dark", dark]]) {
    const shadowStart = svg.indexOf(`<svg id="profile-shadow-${persona.id}"`);
    const shadowEnd = svg.indexOf("</svg>", shadowStart);
    const shadowMarkup = svg.slice(shadowStart, shadowEnd);
    assert(shadowStart !== -1 && shadowMarkup.includes('class="profile-bird-ripple"')
      && shadowMarkup.includes('class="profile-bird-wake"'),
    `${theme} ${type} must render as a water bird inside the expanded swim habitat.`);
    const rippleCy = Number(shadowMarkup.match(/class="profile-bird-ripple"[^>]*\bcy="([\d.]+)"/)?.[1]);
    const rippleRx = Number(shadowMarkup.match(/class="profile-bird-ripple"[^>]*\brx="([\d.]+)"/)?.[1]);
    assert(Math.abs(rippleCy - birdRippleCy[type]) < 0.01,
      `${theme} ${type} waterline moved to ${rippleCy}; expected ${birdRippleCy[type]}.`);
    if (type === "FLAMINGO") {
      assert(Number.isFinite(rippleRx) && rippleRx <= 4.6,
        `${theme} Flamingo water ripple should stay compact under its legs (rx=${rippleRx}).`);
    }
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
    const sameZone = isSwimZonePersona(left.persona) === isSwimZonePersona(right.persona);
    // Cross-shore pairs cannot collide: the rendered-water containment regression below is the
    // source of truth for that boundary. Treating their movement anchors as one shared floor was
    // what recreated an unnecessary empty strip beside the shoreline.
    if (!sameZone) continue;
    const threshold = separationRadius(left.persona.type) + separationRadius(right.persona.type);
    const sameFamily = animationsShareFamily(left, right);
    const sameFamilyMinimumDistance = threshold + (sameFamily && isSwimZonePersona(left.persona) ? 2 : 10);
    let pairMinimumDistance = Number.POSITIVE_INFINITY;
    const overlapSamples = [];
    for (let seconds = 0; seconds < cycleSeconds; seconds += sampleStepSeconds) {
      const leftPosition = positionAt(left, seconds);
      const rightPosition = positionAt(right, seconds);
      const distance = Math.hypot(
        (leftPosition.x - rightPosition.x) * 2,
        leftPosition.y - rightPosition.y,
      );
      pairMinimumDistance = Math.min(pairMinimumDistance, distance);
      overlapSamples.push(distance < threshold);
    }
    let pairLongestOverlapSamples = 0;
    if (overlapSamples.every(Boolean)) {
      pairLongestOverlapSamples = overlapSamples.length;
    } else {
      let currentOverlapSamples = 0;
      for (let index = 0; index < overlapSamples.length * 2; index += 1) {
        if (overlapSamples[index % overlapSamples.length]) {
          currentOverlapSamples += 1;
          pairLongestOverlapSamples = Math.max(pairLongestOverlapSamples, currentOverlapSamples);
          pairLongestOverlapSamples = Math.min(pairLongestOverlapSamples, overlapSamples.length);
        } else {
          currentOverlapSamples = 0;
        }
      }
    }
    const pairLongestOverlap = pairLongestOverlapSamples * sampleStepSeconds;
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
