import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const username = "oosuhada";
const root = process.cwd();
const outputDirectory = path.join(root, "assets", "gitanimals");
const statePath = path.join(outputDirectory, "state.json");
const lightPath = path.join(outputDirectory, "farm-light.svg");
const darkPath = path.join(outputDirectory, "farm-dark.svg");

const response = await fetch(`https://render.gitanimals.org/users/${username}`);
if (!response.ok) {
  throw new Error(`Unable to load GitAnimals state: ${response.status}`);
}

const state = `${JSON.stringify(await response.json(), null, 2)}\n`;
const previousState = await readFile(statePath, "utf8").catch(() => "");
const assetsExist = await Promise.all(
  [lightPath, darkPath].map((file) => readFile(file, "utf8").then(() => true).catch(() => false)),
);

if (state === previousState && assetsExist.every(Boolean) && process.env.FORCE_REFRESH !== "1") {
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

const compactUsername = (svg) =>
  svg.replace(
    '<g id="username" transform="translate(15, 15)">',
    '<g id="username" transform="translate(15, 15) scale(0.72)">',
  );

const light = compactUsername(source)
  .replace('fill="white"/>', 'fill="#FFFFFF"/>')
  .replace('stroke="#D9D9D9"', 'stroke="#D0D7DE"');

const darkThemeStyle = [
  "<style>",
  "#username path, #commit path, [id^='level-wrap-'] path { fill: #F0F6FC; }",
  "</style>",
].join("");

const dark = compactUsername(source)
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
