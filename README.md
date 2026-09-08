# perfonext.github.io

A static landing page for the perfonext MCP servers. No backend, build step,
framework runtime, CDN, analytics, or external font requests.

## Preview

Open `index.html` directly in a browser. All fonts, icons, styles, scripts, and
example data are local. JavaScript uses classic deferred scripts so the page also
works over `file://` without a development server.

## Deploy to GitHub Pages

Publish this directory as the root of the `perfonext.github.io` repository. In
**Settings > Pages**, choose **Deploy from a branch**, the publishing branch, and
**/ (root)**. No build workflow or dependency installation is required. The
`.nojekyll` file disables Jekyll processing.

For a different domain, update the canonical and Open Graph URLs in `index.html`.
All runtime asset paths are relative, including fonts and icons.

## Maintain

- `index.html`: semantic content and progressive-enhancement defaults.
- `assets/style.css`: responsive layouts, local font definitions, and motion.
- `assets/data.js`: example evidence and MCP client configuration generation.
- `assets/app.js`: canvas timeline, evidence selection, tabs, and clipboard actions.
- `assets/fonts`, `assets/icons`, `assets/licenses`: vendored open-source assets.

The optional npm dependencies are development sources for the vendored assets,
not runtime dependencies. Font and icon licenses are included in `assets/licenses`.

```sh
npm test
```

For repeatable Chromium interaction, layout, offline-asset, and accessibility
checks at desktop, mobile, and compact mobile sizes:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Browser tests open `index.html` directly. No local server is involved.

`npm run capture` regenerates the 1200 x 630 social image and 32 x 32 favicon
from the actual page, saves desktop/mobile screenshots under
`test-results/visuals`, and checks that the timeline entrance paints changing
pixels when reduced motion is disabled. This is an optional development command,
not a deployment step.

The tests verify timings, rankings, and all four client configuration formats.
In the parent multi-repository workspace, they also compare each example against
the original perfonext fixtures. Those cross-repository checks are skipped when
the site is checked out by itself; the self-contained checks still run.

## Evidence Provenance

The examples are static test fixtures, not a live analysis of the visitor's app
and not performance benchmarks:

- CPU: `perfonext-profiler-mcp/tests/fixtures/sample.cpuprofile`. Self time is
  calculated from samples and time deltas, not the fixture's node hit counts.
- Renders: `perfonext-render-mcp/tests/fixtures/sample-render-profile.json`.
  Rankings use self duration. Actual duration is reported separately, and the
  missing change descriptions are explicitly identified as heuristic evidence.
- Builds: `perfonext-build-mcp/tests/fixtures/sample-next-build/.next`. Values are
  actual uncompressed emitted bytes. Shared chunks are counted in each route
  that depends on them. Displayed kB uses 1,000 bytes, not gzip or transfer sizes.

JSON panels show selected fields, not complete MCP responses. Installation
recipes follow the server READMEs and Cursor's documented MCP configuration.

Keyboard users can navigate both tab sets with Left/Right/Home/End, use Up/Down
within evidence rows, and inspect the CPU timeline with Left/Right/Home/End.
Reduced-motion preferences disable reveal and timeline entrance animations.