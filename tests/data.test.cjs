const assert = require('node:assert/strict');
const { existsSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { examples, servers, clients, getConfiguration } = require('../assets/data.js');

const workspace = path.resolve(__dirname, '../..');
const cpuPath = path.join(workspace, 'perfonext-profiler-mcp/tests/fixtures/sample.cpuprofile');
const renderPath = path.join(workspace, 'perfonext-render-mcp/tests/fixtures/sample-render-profile.json');
const buildPath = path.join(workspace, 'perfonext-build-mcp/tests/fixtures/sample-next-build/.next');

test('CPU example has consistent sample totals and ranks by self time', () => {
  assert.equal(examples.cpu.samples.length * 10, examples.cpu.duration);
  assert.equal(examples.cpu.rows.reduce((total, row) => total + row.value, 0), 400);
  assert.equal(examples.cpu.rows[0].name, 'JSON.parse');
  for (const row of examples.cpu.rows) {
    assert.ok(row.totalTime >= row.selfTime);
    assert.ok(Math.abs(row.selfPercent - row.selfTime / examples.cpu.duration * 100) < 1e-10);
  }
});

test('CPU values match the repository fixture', { skip: !existsSync(cpuPath) }, () => {
  const profile = JSON.parse(readFileSync(cpuPath, 'utf8'));
  assert.deepEqual(examples.cpu.samples, profile.samples);
  assert.equal(examples.cpu.duration, (profile.endTime - profile.startTime) / 1000);
  for (const row of examples.cpu.rows) {
    const selfTime = profile.samples.reduce((total, nodeId, index) => total + (nodeId === row.nodeId ? profile.timeDeltas[index] / 1000 : 0), 0);
    assert.equal(row.selfTime, selfTime);
    assert.equal(row.name, profile.nodes.find((node) => node.id === row.nodeId).callFrame.functionName);
  }
});

test('Render example distinguishes repeated rendering from exact causes', () => {
  assert.equal(examples.render.dataQuality, 'heuristic');
  assert.equal(examples.render.rows[0].name, 'ProductList');
  assert.equal(examples.render.rows[0].value, 21.5);
  assert.equal(examples.render.rows[0].renderCount, 3);
});

test('Render values match the repository fixture', { skip: !existsSync(renderPath) }, () => {
  const profile = JSON.parse(readFileSync(renderPath, 'utf8'));
  const commits = profile.dataForRoots[0].commitData;
  assert.ok(commits.every((commit) => commit.changeDescriptions === null));
  assert.deepEqual(examples.render.commits.map((commit) => commit.duration), commits.map((commit) => commit.duration));
  for (const row of examples.render.rows) {
    const durations = commits.map((commit) => commit.fiberSelfDurations.find(([fiberId]) => fiberId === row.fiberId)?.[1] ?? 0);
    assert.deepEqual(row.durations, durations);
    assert.equal(row.value, durations.reduce((total, duration) => total + duration, 0));
    assert.equal(row.totalActualDuration, commits.reduce((total, commit) => total + (commit.fiberActualDurations.find(([fiberId]) => fiberId === row.fiberId)?.[1] ?? 0), 0));
  }
});

test('Build example measures emitted bytes and preserves shared chunk identity', () => {
  assert.equal(examples.build.rows[0].name, '/dashboard');
  assert.equal(examples.build.rows[0].value, 164500);
  for (const route of examples.build.rows) {
    assert.equal(route.value, route.sharedBytes + route.exclusiveBytes);
    assert.equal(route.sharedBytes, 104500);
    assert.equal(route.chunks.length, 4);
  }
});

test('Build values match manifest membership and actual emitted files', { skip: !existsSync(buildPath) }, () => {
  const pages = JSON.parse(readFileSync(path.join(buildPath, 'build-manifest.json'), 'utf8')).pages;
  const app = JSON.parse(readFileSync(path.join(buildPath, 'app-build-manifest.json'), 'utf8')).pages;
  for (const route of examples.build.rows) {
    assert.deepEqual(new Set(route.chunks.map((chunk) => `static/chunks/${chunk.name}`)), new Set(pages[route.name] ?? app[route.name]));
    for (const chunk of route.chunks) {
      assert.equal(chunk.bytes, statSync(path.join(buildPath, 'static/chunks', chunk.name)).size);
    }
  }
});

test('Each client receives the correct MCP config format and scoped npm packages', () => {
  for (const client of Object.keys(clients)) {
    const config = getConfiguration(client, Object.keys(servers));
    if (client === 'claude-code') {
      assert.equal(config.split('\n').length, 3);
      for (const [server, details] of Object.entries(servers)) {
        assert.ok(config.includes(`claude mcp add perfonext-${server} -- npx -y ${details.package}`));
      }
    } else {
      const entries = JSON.parse(config)[client === 'copilot' ? 'servers' : 'mcpServers'];
      assert.equal(Object.keys(entries).length, 3);
      for (const [server, details] of Object.entries(servers)) {
        assert.equal(entries[`perfonext-${server}`].command, 'npx');
        assert.deepEqual(entries[`perfonext-${server}`].args, ['-y', details.package]);
      }
    }
  }
});

test('Installation selection is reflected without mutating the server list', () => {
  assert.deepEqual(Object.keys(JSON.parse(getConfiguration('copilot', ['render'])).servers), ['perfonext-render']);
  assert.equal(getConfiguration('cursor', []), '');
  assert.equal(Object.keys(servers).length, 3);
});