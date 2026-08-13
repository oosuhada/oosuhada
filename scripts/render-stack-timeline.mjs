import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataPath = path.join(root, "assets", "stack", "stack-timeline.json");
const outputDirectory = path.dirname(dataPath);
const data = JSON.parse(await readFile(dataPath, "utf8"));

const WIDTH = 1200;
const PADDING = 28;
const TIMELINE_HEIGHT = 174;
const TABLE_TOP = PADDING + TIMELINE_HEIGHT + 18;
const TABLE_HEADER_HEIGHT = 48;
const LABEL_WIDTH = 224;
const ROW_PADDING_X = 18;
const ROW_PADDING_Y = 15;
const CHIP_HEIGHT = 30;
const CHIP_GAP_X = 8;
const CHIP_GAP_Y = 8;
const CHIP_FONT_SIZE = 15;
const FRAME_DURATIONS_SECONDS = data.frameDurationsSeconds;

if (!Array.isArray(FRAME_DURATIONS_SECONDS)
  || FRAME_DURATIONS_SECONDS.length !== data.milestones.length
  || FRAME_DURATIONS_SECONDS.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
  throw new Error("frameDurationsSeconds must contain one positive duration for each milestone.");
}

const CYCLE_SECONDS = FRAME_DURATIONS_SECONDS.reduce((total, duration) => total + duration, 0);
const formatPercent = (value) => Number(value.toFixed(4));

const themes = {
  light: {
    background: "#FFFFFF",
    foreground: "#17181B",
    mutedForeground: "#6B7280",
    card: "#FFFFFF",
    muted: "#F4F5F7",
    border: "#D9DCE2",
    track: "#ECEEF1",
  },
  dark: {
    background: "#0D1117",
    foreground: "#F0F6FC",
    mutedForeground: "#8B949E",
    card: "#161B22",
    muted: "#21262D",
    border: "#30363D",
    track: "#30363D",
  },
};

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const chipWidth = (label) => Math.max(58, Math.ceil(label.length * 8.25 + 25));

const layoutRows = () => {
  const chipStartX = PADDING + LABEL_WIDTH;
  const chipRight = WIDTH - PADDING - ROW_PADDING_X;
  let rowY = TABLE_TOP + TABLE_HEADER_HEIGHT;

  return data.groups.map((group) => {
    let x = chipStartX + ROW_PADDING_X;
    let y = rowY + ROW_PADDING_Y;
    let lines = 1;
    const skills = group.skills.map((skill) => {
      const width = chipWidth(skill.name);
      if (x + width > chipRight) {
        x = chipStartX + ROW_PADDING_X;
        y += CHIP_HEIGHT + CHIP_GAP_Y;
        lines += 1;
      }
      const positioned = { ...skill, x, y, width };
      x += width + CHIP_GAP_X;
      return positioned;
    });
    const height = ROW_PADDING_Y * 2 + lines * CHIP_HEIGHT + (lines - 1) * CHIP_GAP_Y;
    const row = { ...group, y: rowY, height, skills };
    rowY += height;
    return row;
  });
};

const rows = layoutRows();
const HEIGHT = rows.at(-1).y + rows.at(-1).height + PADDING;
const timelineStartX = PADDING + 30;
const timelineEndX = WIDTH - PADDING - 30;
const timelineWidth = timelineEndX - timelineStartX;

const animationCss = () => {
  const starts = FRAME_DURATIONS_SECONDS.map((_, index) => (
    FRAME_DURATIONS_SECONDS.slice(0, index).reduce((total, duration) => total + duration, 0)
      / CYCLE_SECONDS
  ) * 100);
  const ends = starts.map((start, index) => (
    start + (FRAME_DURATIONS_SECONDS[index] / CYCLE_SECONDS) * 100
  ));

  const frameRules = data.milestones.map((_, index) => {
    const start = formatPercent(starts[index]);
    const end = formatPercent(ends[index]);
    const before = index === 0 ? "" : `0%,${formatPercent(Math.max(0, start - 0.01))}%{opacity:0;}`;
    const after = index === data.milestones.length - 1 ? "" : `${end}%,100%{opacity:0;}`;
    return `@keyframes frame-${index}{${before}${start}%,${formatPercent(Math.min(100, end - 0.01))}%{opacity:1;}${after}}`
      + `.frame-${index}{animation:frame-${index} ${CYCLE_SECONDS}s steps(1,end) infinite;}`;
  }).join("");

  const activationRules = data.milestones.slice(1).map((_, index) => {
    const step = index + 1;
    const start = formatPercent(starts[step]);
    return `@keyframes activate-${step}{0%,${formatPercent(start - 0.01)}%{opacity:.13;}`
      + `${start}%,100%{opacity:1;}}`
      + `.step-${step}{animation:activate-${step} ${CYCLE_SECONDS}s steps(1,end) infinite;}`;
  }).join("");

  return `${frameRules}${activationRules}`;
};

const renderTimelineFrames = (theme) => data.milestones.map((milestone, index) => {
  const markerX = timelineStartX + (timelineWidth * index) / (data.milestones.length - 1);
  const progressWidth = markerX - timelineStartX;
  return `<g class="frame-${index}" opacity="0">`
    + `<text x="${PADDING + 24}" y="82" class="current-date">${milestone}</text>`
    + `<rect x="${timelineStartX}" y="124" width="${progressWidth}" height="8" rx="4" fill="${theme.foreground}"/>`
    + `<circle cx="${markerX}" cy="128" r="10" fill="${theme.foreground}"/>`
    + "</g>";
}).join("");

const renderMilestoneLabels = (theme) => data.milestones.map((milestone, index) => {
  const x = timelineStartX + (timelineWidth * index) / (data.milestones.length - 1);
  const anchor = index === 0 ? "start" : index === data.milestones.length - 1 ? "end" : "middle";
  return `<text x="${x}" y="158" text-anchor="${anchor}" class="milestone" fill="${theme.mutedForeground}">${milestone}</text>`;
}).join("");

const renderRows = (theme) => rows.map((row, rowIndex) => {
  const divider = rowIndex === rows.length - 1
    ? ""
    : `<line x1="${PADDING}" y1="${row.y + row.height}" x2="${WIDTH - PADDING}" y2="${row.y + row.height}" stroke="${theme.border}"/>`;
  const labelY = row.y + row.height / 2 + 5;
  const chips = row.skills.map((skill) => {
    const className = skill.step === 0 ? "chip" : `chip step-${skill.step}`;
    return `<g class="${className}">`
      + `<rect x="${skill.x}" y="${skill.y}" width="${skill.width}" height="${CHIP_HEIGHT}" rx="7" fill="${theme.muted}" stroke="${theme.border}"/>`
      + `<text x="${skill.x + skill.width / 2}" y="${skill.y + 20}" text-anchor="middle" class="chip-label">${escapeXml(skill.name)}</text>`
      + "</g>";
  }).join("");
  return `<g><text x="${PADDING + 20}" y="${labelY}" class="area-label">${escapeXml(row.label)}</text>${chips}${divider}</g>`;
}).join("");

const render = (themeName) => {
  const theme = themes[themeName];
  const tableHeight = HEIGHT - TABLE_TOP - PADDING;
  return `<svg data-stack-layout="vector-v1" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="stack-title">`
    + `<title id="stack-title">Oosu stack timeline from 2024.09 to 2026.07</title>`
    + `<style>${animationCss()}`
    + `text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:${theme.foreground};text-rendering:geometricPrecision;}`
    + `.eyebrow{font-size:14px;font-weight:650;letter-spacing:.08em;fill:${theme.mutedForeground};}`
    + ".current-date{font-size:27px;font-weight:700;font-variant-numeric:tabular-nums;}"
    + `.legend{font-size:13px;fill:${theme.mutedForeground};}`
    + `.milestone{font-size:13px;font-weight:550;font-variant-numeric:tabular-nums;}`
    + ".table-heading,.area-label{font-size:16px;font-weight:700;}"
    + `.chip-label{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${CHIP_FONT_SIZE}px;font-weight:540;}`
    + "</style>"
    + `<rect width="${WIDTH}" height="${HEIGHT}" rx="14" fill="${theme.background}"/>`
    + `<rect x="${PADDING}" y="${PADDING}" width="${WIDTH - PADDING * 2}" height="${TIMELINE_HEIGHT}" rx="14" fill="${theme.card}" stroke="${theme.border}"/>`
    + `<text x="${PADDING + 24}" y="56" class="eyebrow">STACK TIMELINE</text>`
    + `<g transform="translate(${WIDTH - PADDING - 385} 52)"><circle cx="0" cy="0" r="5" fill="${theme.foreground}"/><text x="13" y="5" class="legend">evidenced by selected time</text><circle cx="207" cy="0" r="5" fill="${theme.muted}" stroke="${theme.border}" opacity=".45"/><text x="220" y="5" class="legend">not yet seen</text></g>`
    + `<rect x="${timelineStartX}" y="124" width="${timelineWidth}" height="8" rx="4" fill="${theme.track}" stroke="${theme.border}"/>`
    + renderTimelineFrames(theme)
    + renderMilestoneLabels(theme)
    + `<rect x="${PADDING}" y="${TABLE_TOP}" width="${WIDTH - PADDING * 2}" height="${tableHeight}" rx="12" fill="${theme.card}" stroke="${theme.border}"/>`
    + `<path d="M${PADDING + 12} ${TABLE_TOP}H${WIDTH - PADDING - 12}Q${WIDTH - PADDING} ${TABLE_TOP} ${WIDTH - PADDING} ${TABLE_TOP + 12}V${TABLE_TOP + TABLE_HEADER_HEIGHT}H${PADDING}V${TABLE_TOP + 12}Q${PADDING} ${TABLE_TOP} ${PADDING + 12} ${TABLE_TOP}Z" fill="${theme.muted}"/>`
    + `<line x1="${PADDING}" y1="${TABLE_TOP + TABLE_HEADER_HEIGHT}" x2="${WIDTH - PADDING}" y2="${TABLE_TOP + TABLE_HEADER_HEIGHT}" stroke="${theme.border}"/>`
    + `<line x1="${PADDING + LABEL_WIDTH}" y1="${TABLE_TOP}" x2="${PADDING + LABEL_WIDTH}" y2="${HEIGHT - PADDING}" stroke="${theme.border}"/>`
    + `<text x="${PADDING + 20}" y="${TABLE_TOP + 30}" class="table-heading">Area</text>`
    + `<text x="${PADDING + LABEL_WIDTH + 18}" y="${TABLE_TOP + 30}" class="table-heading">Stack</text>`
    + renderRows(theme)
    + "</svg>";
};

await Promise.all(Object.keys(themes).map((themeName) => (
  writeFile(path.join(outputDirectory, `stack-timeline-${themeName}.svg`), render(themeName))
)));

console.log(`Rendered ${Object.keys(themes).length} animated stack timeline SVGs at ${WIDTH}×${HEIGHT}.`);
