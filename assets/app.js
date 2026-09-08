(function () {
  'use strict';

  const { examples, clients, getConfiguration } = globalThis.PerfonextData;
  const select = (selector) => document.querySelector(selector);
  const selectAll = (selector) => [...document.querySelectorAll(selector)];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'cpu';
  let selectedId = examples.cpu.rows[0].id;
  let client = 'claude-code';
  let responseText = '';
  let configText = '';
  let promptText = '';
  let toastTimer;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function highlightJson(value) {
    const json = JSON.stringify(value, null, 2);
    const tokens = /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g;
    let output = '';
    let offset = 0;
    for (const match of json.matchAll(tokens)) {
      output += escapeHtml(json.slice(offset, match.index));
      const kind = match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'number' : 'boolean';
      output += `<span class="json-${kind}">${escapeHtml(match[0])}</span>`;
      offset = match.index + match[0].length;
    }
    return output + escapeHtml(json.slice(offset));
  }

  const readableMs = (value) => `${value.toFixed(1)} ms`;
  const resultMs = (value) => `${value.toFixed(1)}ms`;
  const readableBytes = (value) => `${(value / 1000).toFixed(1)} kB`;

  function renderRows() {
    const rows = examples[mode].rows;
    const maximum = Math.max(...rows.map((row) => row.value));
    select('#evidence-rows').innerHTML = rows.map((row, index) => {
      let segments = '';
      if (mode === 'render') {
        segments = row.durations.map((duration) => duration > 0 ? `<span style="flex:${duration}" title="${escapeHtml(readableMs(duration))}"></span>` : '').join('');
      } else if (mode === 'build') {
        segments = row.chunks.map((chunk) => `<span style="flex:${chunk.bytes}" title="${escapeHtml(`${chunk.name}: ${chunk.bytes.toLocaleString('en-US')} bytes`)}"></span>`).join('');
      }
      const amount = mode === 'build' ? readableBytes(row.value) : readableMs(row.value);
      return `<button class="evidence-row" data-row="${escapeHtml(row.id)}" aria-pressed="${row.id === selectedId}" aria-label="${escapeHtml(`${row.name}, ${amount}`)}"><span class="row-top"><span class="row-name"><span class="row-rank">0${index + 1}</span>${escapeHtml(row.name)}</span><span class="row-value">${amount}</span></span><span class="row-bar-track" aria-hidden="true"><span class="row-bar${segments ? ' segmented' : ''}" style="width:${row.value / maximum * 100}%;animation-delay:${index * 40}ms">${segments}</span></span></button>`;
    }).join('');
    select('#evidence-rows').setAttribute('aria-label', examples[mode].name);
  }

  function renderContext(row) {
    const context = select('#chart-context');
    if (mode === 'cpu') {
      context.innerHTML = `<div class="sample-strip" aria-hidden="true">${examples.cpu.samples.map((nodeId) => `<span class="${nodeId === row.nodeId ? 'is-related' : ''}"></span>`).join('')}</div><div class="context-caption mono"><span>SELF-TIME SAMPLES</span><span>0 &mdash; 500 ms</span></div>`;
    } else if (mode === 'render') {
      context.innerHTML = `<div class="commit-strip mono">${row.durations.map((duration, index) => `<div class="commit-marker"><span style="opacity:${duration ? 1 : .2}"></span>C0${index + 1} / ${readableMs(duration)}</div>`).join('')}</div><div class="context-caption mono"><span>COMPONENT SELF TIME BY COMMIT</span></div>`;
    } else {
      context.innerHTML = `<div class="chunk-legend mono">${row.chunks.map((chunk) => `<span><i aria-hidden="true"></i>${escapeHtml(chunk.name)}</span>`).join('')}</div>`;
    }
  }

  function updateEvidence() {
    const example = examples[mode];
    const row = example.rows.find((entry) => entry.id === selectedId);
    const rank = example.rows.indexOf(row) + 1;
    let result;
    let finding;
    if (mode === 'cpu') {
      select('#chart-title').textContent = 'Functions, ranked by self time';
      select('#chart-unit').textContent = 'ms';
      select('#response-tool').textContent = 'get_hotspots';
      select('#chart-note').textContent = 'Self time excludes callees. The 500 ms recording includes 100 ms of idle time.';
      result = { rank, function: row.name, selfTime: resultMs(row.selfTime), selfPercent: `${row.selfPercent.toFixed(1)}%`, totalTime: resultMs(row.totalTime) };
      finding = `${row.name} accounts for ${row.selfPercent.toFixed(1)}% of recorded CPU self time. Its caller is ${row.caller}. explain_function provides the next level of context.`;
    } else if (mode === 'render') {
      select('#chart-title').textContent = 'Components, ranked by self time';
      select('#chart-unit').textContent = 'ms';
      select('#response-tool').textContent = 'get_slow_components';
      select('#chart-note').textContent = 'Self duration excludes child work. This export has no change descriptions, so rerender causes are heuristic.';
      result = { rank, componentName: row.name, renderCount: row.renderCount, totalSelfDuration: resultMs(row.value), totalActualDuration: resultMs(row.totalActualDuration) };
      finding = `${row.name} rendered in ${row.renderCount} of 3 commits, with ${readableMs(row.value)} of self time. This fixture shows the cost, but cannot identify exact changed props or hooks.`;
    } else {
      select('#chart-title').textContent = 'Routes, ranked by emitted bytes';
      select('#chart-unit').textContent = 'kB';
      select('#response-tool').textContent = 'get_largest_routes';
      select('#chart-note').textContent = 'Raw, uncompressed bytes on disk, not network transfer sizes. 1 kB = 1,000 bytes. Shared chunks appear in each dependent route.';
      result = { path: row.name, totalBytes: row.value, sharedChunkBytes: row.sharedBytes, exclusiveChunkBytes: row.exclusiveBytes };
      finding = `${readableBytes(row.sharedBytes)} of ${row.name}'s ${readableBytes(row.value)} footprint comes from chunks shared by all four routes. get_shared_chunks reveals that shared cost.`;
    }
    responseText = JSON.stringify(result, null, 2);
    select('#response-code').innerHTML = highlightJson(result);
    select('#evidence-finding').textContent = finding;
    select('#fixture-link').href = example.source;
    select('#evidence-quality').textContent = mode === 'render' ? 'STATIC EXAMPLE / HEURISTIC CAUSES' : 'STATIC EXAMPLE / PUBLIC TEST FIXTURE';
    selectAll('.evidence-row').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.row === selectedId)));
    renderContext(row);
  }

  function chooseMode(nextMode) {
    mode = nextMode;
    selectedId = examples[mode].rows[0].id;
    select('#evidence').dataset.mode = mode;
    selectAll('.signal-tab').forEach((tab) => {
      const selected = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    select('#evidence-panel').setAttribute('aria-labelledby', `tab-${mode}`);
    renderRows();
    updateEvidence();
  }

  function wireTabs(selector, selectTab) {
    const tabs = selectAll(selector);
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        let nextIndex;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === undefined) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        selectTab(tabs[nextIndex]);
      });
    });
  }

  wireTabs('.signal-tab', (tab) => chooseMode(tab.dataset.mode));
  select('#evidence-rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-row]');
    if (!button) return;
    selectedId = button.dataset.row;
    updateEvidence();
  });
  function previewRow(event) {
    if (event.pointerType === 'touch') return;
    const button = event.target.closest('[data-row]');
    if (!button || button.dataset.row === selectedId) return;
    selectedId = button.dataset.row;
    updateEvidence();
  }
  select('#evidence-rows').addEventListener('pointerover', previewRow);
  select('#evidence-rows').addEventListener('focusin', previewRow);
  select('#evidence-rows').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = selectAll('.evidence-row');
    const position = rows.indexOf(event.target.closest('[data-row]'));
    if (position < 0) return;
    event.preventDefault();
    const next = rows[(position + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
    next.focus();
    selectedId = next.dataset.row;
    updateEvidence();
  });

  const instructions = {
    'claude-code': "Run in your project's terminal, then approve the servers in Claude Code.",
    copilot: 'Merge these entries into your workspace config, then run MCP: List Servers and approve the servers.',
    'claude-desktop': 'Merge these entries into your Claude Desktop configuration, then restart the app.',
    cursor: "Merge these entries into your project config, then enable the servers in Cursor's MCP settings.",
  };
  const starterPrompts = {
    profiler: 'How do I capture a CPU profile of my Next.js server?',
    render: 'Run a render analysis on my app.',
    build: 'Load the Next.js build in ./.next and show me the largest routes.',
  };

  function updateConfig() {
    const selected = selectAll('input[name="server"]:checked').map((input) => input.value);
    configText = getConfiguration(client, selected);
    select('#config-filename').textContent = clients[client].file;
    select('#config-language').textContent = clients[client].language;
    if (!selected.length) {
      select('#config-code').textContent = 'Select at least one server to generate its configuration.';
    } else if (client === 'claude-code') {
      select('#config-code').innerHTML = configText.split('\n').map((line) => `<span class="shell-command">${escapeHtml(line.slice(0, line.indexOf(' -- ')))}</span>${escapeHtml(line.slice(line.indexOf(' -- ')))}`).join('\n\n');
    } else {
      select('#config-code').innerHTML = highlightJson(JSON.parse(configText));
    }
    select('.config-code').scrollTop = 0;
    select('#config-count').textContent = `${selected.length} server${selected.length === 1 ? '' : 's'} selected`;
    select('#copy-config').disabled = !selected.length;
    select('#copy-config').setAttribute('aria-label', client === 'claude-code' ? 'Copy installation commands' : 'Copy installation configuration');
    select('#config-instruction').textContent = instructions[client];
    promptText = selected.length ? starterPrompts[selected[0]] : '';
    select('#starter-prompt').textContent = promptText ? `"${promptText}"` : 'Your starter prompt will appear when a server is selected.';
    select('#copy-prompt').disabled = !selected.length;
    selectAll('.client-tabs [role="tab"]').forEach((tab) => {
      const active = tab.dataset.client === client;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    select('#config-panel').setAttribute('aria-labelledby', `client-${client}`);
  }

  wireTabs('.client-tabs [role="tab"]', (tab) => { client = tab.dataset.client; updateConfig(); });
  selectAll('input[name="server"]').forEach((input) => input.addEventListener('change', updateConfig));

  function showToast(message) {
    const toast = select('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3500);
  }

  async function copyText(text, button) {
    if (!text) return;
    let copied = false;
    try {
      if (navigator.clipboard && globalThis.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px;';
      document.body.append(field);
      field.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      field.remove();
      button.focus({ preventScroll: true });
    }
    if (copied) {
      const image = button.querySelector('img');
      image.src = 'assets/icons/check.svg';
      showToast('Copied to clipboard.');
      setTimeout(() => { image.src = 'assets/icons/copy.svg'; }, 1800);
    } else {
      showToast('Clipboard unavailable. You can select and copy the text directly.');
    }
  }

  select('#copy-response').addEventListener('click', (event) => copyText(responseText, event.currentTarget));
  select('#copy-config').addEventListener('click', (event) => copyText(configText, event.currentTarget));
  select('#copy-prompt').addEventListener('click', (event) => copyText(promptText, event.currentTarget));

  function setupTimeline() {
    const canvas = select('#profile-canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    const samples = examples.cpu.samples;
    const names = { 1: '(root)', 2: '(program)', 3: 'processData', 4: 'JSON.parse', 5: 'transformResult', 6: 'RegExp.exec', 7: '(idle)' };
    const stacks = { 3: [1, 2, 3], 4: [1, 2, 3, 4], 5: [1, 2, 3, 5], 6: [1, 2, 3, 5, 6], 7: [1, 7] };
    const fills = { 1: '#dce4ce', 2: '#cbdcae', 3: '#a8ce62', 4: '#c4eb83', 5: '#80aa51', 6: '#526e39', 7: '#e5e8df' };
    let canvasWidth = 0;
    let canvasHeight = 0;
    let activeSample = -1;
    let progress = motionPreference.matches ? 1 : 0;
    let animationFrame;

    function draw() {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      const step = canvasWidth / samples.length;
      const rowHeight = Math.min(21, (canvasHeight - 12) / 5);
      context.strokeStyle = '#dce0d6';
      context.lineWidth = 1;
      context.setLineDash([2, 4]);
      for (let mark = 0; mark <= 10; mark += 1) {
        const position = mark / 10 * canvasWidth;
        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, canvasHeight);
        context.stroke();
      }
      context.setLineDash([]);
      for (let depth = 0; depth < 5; depth += 1) {
        let cursor = 0;
        while (cursor < samples.length) {
          const nodeId = stacks[samples[cursor]][depth];
          let end = cursor + 1;
          while (end < samples.length && stacks[samples[end]][depth] === nodeId) end += 1;
          if (nodeId !== undefined) {
            const related = activeSample < 0 || (activeSample >= cursor && activeSample < end);
            const horizontal = cursor * step + 1;
            const vertical = canvasHeight - (depth + 1) * rowHeight * progress;
            const width = (end - cursor) * step - 2;
            const height = Math.max(0, rowHeight * progress - 3);
            context.globalAlpha = related ? 1 : .3;
            context.fillStyle = fills[nodeId];
            context.fillRect(horizontal, vertical, width, height);
            context.font = '9px "IBM Plex Mono", monospace';
            if (width > context.measureText(names[nodeId]).width + 18 && height > 13) {
              context.fillStyle = nodeId === 6 ? '#f5f6f3' : '#28311e';
              context.fillText(names[nodeId], horizontal + 8, vertical + height / 2 + 3);
            }
            context.globalAlpha = 1;
          }
          cursor = end;
        }
      }
      if (activeSample >= 0) {
        const position = (activeSample + .5) * step;
        context.strokeStyle = '#20251f';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, canvasHeight);
        context.stroke();
        context.fillStyle = '#20251f';
        context.fillRect(position - 2, 0, 5, 5);
      }
    }

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
      canvasWidth = bounds.width;
      canvasHeight = bounds.height;
      canvas.width = Math.round(canvasWidth * ratio);
      canvas.height = Math.round(canvasHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }

    function inspect(index) {
      activeSample = Math.max(0, Math.min(samples.length - 1, index));
      select('#timeline-readout').textContent = `${activeSample * 10}-${(activeSample + 1) * 10} ms / ${names[samples[activeSample]]}`;
      canvas.setAttribute('aria-label', `CPU timeline. ${activeSample * 10} to ${(activeSample + 1) * 10} milliseconds: ${names[samples[activeSample]]}. Use left and right arrow keys to inspect samples.`);
      draw();
    }

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      inspect(Math.floor((event.clientX - canvas.getBoundingClientRect().left) / canvasWidth * samples.length));
    });
    canvas.addEventListener('pointerleave', () => {
      activeSample = -1;
      select('#timeline-readout').textContent = '50 samples. One place to start.';
      draw();
    });
    canvas.addEventListener('pointerdown', (event) => {
      inspect(Math.floor((event.clientX - canvas.getBoundingClientRect().left) / canvasWidth * samples.length));
    });
    canvas.addEventListener('focus', () => { if (activeSample < 0) inspect(0); });
    canvas.addEventListener('blur', () => { activeSample = -1; draw(); });
    canvas.addEventListener('keydown', (event) => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = activeSample + 1;
      if (event.key === 'ArrowLeft') nextIndex = activeSample - 1;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = samples.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      inspect(nextIndex);
    });

    resize();
    new ResizeObserver(resize).observe(canvas);
    document.fonts.ready.then(draw);
    const start = performance.now();
    function animate(now) {
      progress = 1 - Math.pow(1 - Math.min((now - start) / 1000, 1), 3);
      draw();
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    }
    if (!motionPreference.matches) animationFrame = requestAnimationFrame(animate);
    motionPreference.addEventListener('change', () => {
      cancelAnimationFrame(animationFrame);
      progress = 1;
      draw();
    });
  }

  renderRows();
  updateEvidence();
  updateConfig();
  setupTimeline();

  if ('IntersectionObserver' in globalThis && !motionPreference.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px 24px 0px' });
    selectAll('.reveal').forEach((element) => {
      element.classList.add('is-ready');
      observer.observe(element);
    });
  }
})();