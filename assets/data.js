(function (root) {
  'use strict';

  const cpuSamples = [3, 4, 4, 4, 5, 6, 6, 4, 4, 4, 5, 6, 6, 6, 3, 4, 4, 5, 6, 6, 4, 4, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 4, 4, 4, 5, 5, 6, 6, 3, 4, 5, 6, 3, 4, 4, 3];
  const cpuNodes = [
    { id: 'parse', nodeId: 4, name: 'JSON.parse', file: '(native)', caller: 'processData', children: [] },
    { id: 'regexp', nodeId: 6, name: 'RegExp.exec', file: '(native)', caller: 'transformResult', children: [] },
    { id: 'transform', nodeId: 5, name: 'transformResult', file: 'src/processor.js', caller: 'processData', children: [6] },
    { id: 'process', nodeId: 3, name: 'processData', file: 'src/processor.js', caller: '(program)', children: [4, 5, 6] },
  ];
  const cpuRows = cpuNodes.map((node) => {
    const selfTime = cpuSamples.filter((sample) => sample === node.nodeId).length * 10;
    const totalTime = cpuSamples.filter((sample) => sample === node.nodeId || node.children.includes(sample)).length * 10;
    return { ...node, value: selfTime, selfTime, totalTime, selfPercent: selfTime / 5 };
  }).sort((first, second) => second.value - first.value);

  const renderCommits = [
    { timestamp: 100, duration: 14, actual: [14, 12, 10, 9.5], self: [2, 2, 0.5, 9.5] },
    { timestamp: 200, duration: 7.5, actual: [0, 0, 5.5, 7], self: [0, 0, 0.2, 7] },
    { timestamp: 300, duration: 4.9, actual: [0, 0, 3.5, 5], self: [0, 0, 0.2, 5] },
  ];
  const renderRows = ['App', 'SearchPage', 'SearchResults', 'ProductList'].map((name, index) => ({
    id: name,
    fiberId: index + 1,
    name,
    value: renderCommits.reduce((total, commit) => total + commit.self[index], 0),
    totalActualDuration: renderCommits.reduce((total, commit) => total + commit.actual[index], 0),
    renderCount: renderCommits.filter((commit) => commit.actual[index] > 0).length,
    durations: renderCommits.map((commit) => commit.self[index]),
  })).sort((first, second) => second.value - first.value);

  const sharedChunks = [
    { name: 'framework.js', bytes: 64000, shared: true },
    { name: 'main.js', bytes: 12000, shared: true },
    { name: 'shared-search.js', bytes: 28500, shared: true },
  ];
  const buildRows = [
    { id: 'dashboard', name: '/dashboard', chunk: 'dashboard.js', bytes: 60000 },
    { id: 'home', name: '/', chunk: 'home.js', bytes: 58000 },
    { id: 'search', name: '/search', chunk: 'search.js', bytes: 20000 },
    { id: 'blog', name: '/blog/[slug]', chunk: 'blog.js', bytes: 2000 },
  ].map((route) => {
    const chunks = [...sharedChunks, { name: route.chunk, bytes: route.bytes, shared: false }];
    return {
      id: route.id,
      name: route.name,
      chunks,
      value: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
      sharedBytes: sharedChunks.reduce((total, chunk) => total + chunk.bytes, 0),
      exclusiveBytes: route.bytes,
    };
  });

  const examples = {
    cpu: {
      name: 'CPU profiling',
      source: 'https://github.com/souvikdu/perfonext-profiler-mcp/blob/main/tests/fixtures/sample.cpuprofile',
      file: 'sample.cpuprofile',
      duration: 500,
      samples: cpuSamples,
      rows: cpuRows,
    },
    render: {
      name: 'React renders',
      source: 'https://github.com/souvikdu/perfonext-render-mcp/blob/main/tests/fixtures/sample-render-profile.json',
      file: 'sample-render-profile.json',
      dataQuality: 'heuristic',
      commits: renderCommits,
      rows: renderRows,
    },
    build: {
      name: 'Bundle analysis',
      source: 'https://github.com/souvikdu/perfonext-build-mcp/tree/main/tests/fixtures/sample-next-build',
      file: 'sample-next-build/.next',
      rows: buildRows,
    },
  };

  const servers = {
    profiler: { name: 'CPU profiler', package: '@perfonext/profiler-mcp', repo: 'perfonext-profiler-mcp' },
    render: { name: 'React renders', package: '@perfonext/render-mcp', repo: 'perfonext-render-mcp' },
    build: { name: 'Bundle analysis', package: '@perfonext/build-mcp', repo: 'perfonext-build-mcp' },
  };

  const clients = {
    'claude-code': { name: 'Claude Code', file: 'Terminal', language: 'shell' },
    copilot: { name: 'GitHub Copilot', file: '.vscode/mcp.json', language: 'json' },
    'claude-desktop': { name: 'Claude Desktop', file: 'claude_desktop_config.json', language: 'json' },
    cursor: { name: 'Cursor', file: '.cursor/mcp.json', language: 'json' },
  };

  function getConfiguration(client, selectedServers) {
    if (!clients[client]) throw new Error('Unknown MCP client');
    const selected = Object.keys(servers).filter((server) => selectedServers.includes(server));
    if (!selected.length) return '';
    if (client === 'claude-code') {
      return selected.map((server) => `claude mcp add perfonext-${server} -- npx -y ${servers[server].package}`).join('\n');
    }
    const entries = Object.fromEntries(selected.map((server) => {
      const entry = { command: 'npx', args: ['-y', servers[server].package] };
      return [`perfonext-${server}`, client === 'copilot' || client === 'cursor' ? { type: 'stdio', ...entry } : entry];
    }));
    return JSON.stringify({ [client === 'copilot' ? 'servers' : 'mcpServers']: entries }, null, 2);
  }

  const data = { examples, servers, clients, getConfiguration };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.PerfonextData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);