import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN missing");
  process.exit(1);
}

const README = "README.md";
const GRAPH = "contribution-graph.svg";
const BANNER = "banner.svg";
const START = "<!--STATS:START-->";
const END = "<!--STATS:END-->";
const BANNER_START = "<!--BANNER:START-->";
const BANNER_END = "<!--BANNER:END-->";

const query = `
  query {
    viewer {
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              weekday
            }
          }
        }
      }
    }
  }
`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "rmenner-readme-stats",
  },
  body: JSON.stringify({ query }),
});

if (!res.ok) {
  console.error(`GraphQL HTTP ${res.status}:`, await res.text());
  process.exit(1);
}
const body = await res.json();
if (body.errors) {
  console.error("GraphQL errors:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const c = body.data.viewer.contributionsCollection;
const cal = c.contributionCalendar;
const today = new Date().toISOString().slice(0, 10);

const max = Math.max(
  1,
  ...cal.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
);
const level = (n) => {
  if (n === 0) return 0;
  const r = n / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
};

const LIGHT = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
const DARK = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;

const cardsH = 64;
const cardsGap = 16;
const heatmapPadLeft = 28;
const heatmapPadTop = 22;
const weeks = cal.weeks.length;
const heatmapW = heatmapPadLeft + weeks * STEP + 4;
const heatmapH = heatmapPadTop + 7 * STEP + 4;

const headerH = 20;
const width = heatmapW;
const height = cardsH + cardsGap + headerH + heatmapH;

const stats = [
  { value: c.totalCommitContributions, label: "Commits" },
  { value: c.totalPullRequestContributions, label: "Pull requests" },
  { value: c.totalPullRequestReviewContributions, label: "PR reviews" },
  { value: c.totalIssueContributions, label: "Issues" },
];

const cardGap = 10;
const cardW = (width - cardGap * (stats.length - 1)) / stats.length;
const cards = stats
  .map((s, i) => {
    const x = i * (cardW + cardGap);
    return `<g transform="translate(${x},0)">
    <rect width="${cardW}" height="${cardsH}" rx="6" ry="6" class="card" />
    <rect x="0" y="0" width="3" height="${cardsH}" rx="2" ry="2" class="card-accent" />
    <text x="14" y="28" class="stat-value">${s.value.toLocaleString()}</text>
    <text x="14" y="48" class="stat-label">${s.label}</text>
  </g>`;
  })
  .join("\n  ");

const heatmapY = cardsH + cardsGap + headerH;
const headerY = cardsH + cardsGap + 14;

const cells = [];
const monthLabels = [];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

cal.weeks.forEach((week, wi) => {
  for (const day of week.contributionDays) {
    const lvl = level(day.contributionCount);
    const x = heatmapPadLeft + wi * STEP;
    const y = heatmapPadTop + day.weekday * STEP;
    cells.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" class="lvl-${lvl}"><title>${day.contributionCount} on ${day.date}</title></rect>`
    );
  }
  // Label the week that contains the 1st of a month (any day-of-month 1..7 in the week).
  const containsFirst = week.contributionDays.find((d) => {
    const dt = new Date(d.date + "T00:00:00Z");
    return dt.getUTCDate() === 1;
  });
  if (containsFirst && wi < weeks - 1) {
    const m = new Date(containsFirst.date + "T00:00:00Z").getUTCMonth();
    monthLabels.push(
      `<text x="${heatmapPadLeft + wi * STEP}" y="${heatmapPadTop - 6}" class="label">${MONTHS[m]}</text>`
    );
  }
});

const dayLabels = [
  `<text x="0" y="${heatmapPadTop + 1 * STEP + 9}" class="label">Mon</text>`,
  `<text x="0" y="${heatmapPadTop + 3 * STEP + 9}" class="label">Wed</text>`,
  `<text x="0" y="${heatmapPadTop + 5 * STEP + 9}" class="label">Fri</text>`,
];

const style = `
  .card { fill: #f6f8fa; stroke: #d0d7de; stroke-width: 1; }
  .card-accent { fill: ${LIGHT[3]}; }
  .stat-value { font: 600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${LIGHT[4]}; }
  .stat-label { font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #57606a; }
  .header { font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #24292f; }
  .label { font: 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #57606a; }
  .lvl-0 { fill: ${LIGHT[0]}; }
  .lvl-1 { fill: ${LIGHT[1]}; }
  .lvl-2 { fill: ${LIGHT[2]}; }
  .lvl-3 { fill: ${LIGHT[3]}; }
  .lvl-4 { fill: ${LIGHT[4]}; }
  @media (prefers-color-scheme: dark) {
    .card { fill: #0d1117; stroke: #30363d; }
    .card-accent { fill: ${DARK[3]}; }
    .stat-value { fill: ${DARK[4]}; }
    .stat-label { fill: #8b949e; }
    .header { fill: #e6edf3; }
    .label { fill: #8b949e; }
    .lvl-0 { fill: ${DARK[0]}; }
    .lvl-1 { fill: ${DARK[1]}; }
    .lvl-2 { fill: ${DARK[2]}; }
    .lvl-3 { fill: ${DARK[3]}; }
    .lvl-4 { fill: ${DARK[4]}; }
  }
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="GitHub contribution stats">
  <style>${style}</style>
  ${cards}
  <text x="0" y="${headerY}" class="header">${cal.totalContributions.toLocaleString()} contributions in the last year</text>
  <g transform="translate(0,${heatmapY})">
    ${monthLabels.join("\n    ")}
    ${dayLabels.join("\n    ")}
    ${cells.join("\n    ")}
  </g>
</svg>
`;

writeFileSync(GRAPH, svg);

// ============================================================
// Banner: "DESIGN & CODE" rendered in contribution cells
// ============================================================
{
  const FONT = {
    D: ["11110","10001","10001","10001","10001","10001","11110"],
    E: ["11111","10000","10000","11110","10000","10000","11111"],
    S: ["01111","10000","10000","01110","00001","00001","11110"],
    I: ["11111","00100","00100","00100","00100","00100","11111"],
    G: ["01110","10001","10000","10011","10001","10001","01110"],
    N: ["10001","11001","10101","10011","10001","10001","10001"],
    "&": ["01100","10010","10100","01000","10101","10010","01101"],
    C: ["01110","10001","10000","10000","10000","10001","01110"],
    O: ["01110","10001","10001","10001","10001","10001","01110"],
    " ": ["00000","00000","00000","00000","00000","00000","00000"],
  };
  const text = "DESIGN & CODE";
  const BCELL = 14;
  const BGAP = 2;
  const BSTEP = BCELL + BGAP;
  const letterGap = 1;

  const glyphWidth = (ch) => (FONT[ch] ?? FONT[" "])[0].length;

  let totalCols = 0;
  for (let i = 0; i < text.length; i++) {
    totalCols += glyphWidth(text[i]);
    if (i < text.length - 1) totalCols += letterGap;
  }
  const padX = 20, padY = 20;
  const BW = totalCols * BSTEP + padX * 2;
  const BH = 7 * BSTEP + padY * 2;

  const levelFor = (col, row) => {
    const seed = (col * 31 + row * 7) % 100;
    if (seed < 25) return 2;
    if (seed < 75) return 3;
    return 4;
  };

  const bcells = [];
  let cursor = padX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = FONT[ch] ?? FONT[" "];
    const w = glyph[0].length;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < w; col++) {
        const on = glyph[row][col] === "1";
        const x = cursor + col * BSTEP;
        const y = padY + row * BSTEP;
        const lvl = on ? levelFor(cursor / BSTEP + col, row) : 0;
        bcells.push(`<rect x="${x}" y="${y}" width="${BCELL}" height="${BCELL}" rx="2" ry="2" class="lvl-${lvl}" />`);
      }
    }
    cursor += (w + letterGap) * BSTEP;
  }

  const lvlStyle = LIGHT.map((c, i) => `.lvl-${i} { fill: ${c}; }`).join(" ");
  const lvlStyleDark = DARK.map((c, i) => `.lvl-${i} { fill: ${c}; }`).join(" ");

  const bsvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW} ${BH}" width="${BW}" height="${BH}" role="img" aria-label="DESIGN &amp; CODE">
  <style>
    ${lvlStyle}
    @media (prefers-color-scheme: dark) { ${lvlStyleDark} }
  </style>
  ${bcells.join("\n  ")}
</svg>
`;
  writeFileSync(BANNER, bsvg);
}

const block = `${START}
![GitHub contribution stats](./${GRAPH})

_Updated ${today}_
${END}`;

const readme = readFileSync(README, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!pattern.test(readme)) {
  console.error("Markers not found in README.md");
  process.exit(1);
}
const updated = readme.replace(pattern, block);
if (updated !== readme) {
  writeFileSync(README, updated);
  console.log("README.md updated.");
} else {
  console.log("README.md unchanged.");
}
console.log(`Graph written: ${GRAPH}`);
