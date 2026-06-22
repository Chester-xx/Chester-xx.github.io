/**
 * Shared dependency-map rendering & interaction engine.
 *
 * Each project's dependency-map page defines its own `nodes`, `edges`,
 * and `layerColors`/`legend` data, then calls `DependencyMap.init(config)`
 * once the DOM is ready. This file owns everything else: canvas edge
 * drawing, node DOM construction, pan/zoom/tap interaction (mouse +
 * touch), the info panel, and fit-to-view sizing.
 *
 * This consolidates the interaction fixes originally built for
 * BlendViewer's dependency-map (tap-vs-drag threshold, pinch-zoom anchor
 * math, viewport-aware fit-to-view) so every project gets the same
 * correct mobile + desktop behavior instead of N copies of the same logic
 * drifting apart over time.
 */
const DependencyMap = (function () {
  function init(config) {
    const { nodes, edges, layerColors, canvasLabels = [] } = config;

    // ─── DOM refs ────────────────────────────────────────────────────────
    const wrap = document.getElementById('canvas-wrap');
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');
    const nodesLayer = document.getElementById('nodes-layer');
    const infoPanel = document.getElementById('info-panel');
    const mobileHint = document.getElementById('mobile-hint');

    // ─── Viewport state ──────────────────────────────────────────────────
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let activeNode = null;

    // Compute the graph's bounding box from real node coordinates, so the
    // initial fit-to-view calculation adapts to whatever viewport loads
    // it instead of assuming one screen size.
    const GRAPH_PADDING = 80;
    const graphBounds = (() => {
      const xs = nodes.map(n => n.x);
      const ys = nodes.map(n => n.y);
      return {
        minX: Math.min(...xs) - GRAPH_PADDING,
        maxX: Math.max(...xs) + GRAPH_PADDING,
        minY: Math.min(...ys) - GRAPH_PADDING,
        maxY: Math.max(...ys) + GRAPH_PADDING,
      };
    })();

    function fitToView() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const graphW = graphBounds.maxX - graphBounds.minX;
      const graphH = graphBounds.maxY - graphBounds.minY;

      const fitScale = Math.min(w / graphW, h / graphH);
      scale = Math.max(0.15, Math.min(1, fitScale));

      const graphCenterX = (graphBounds.minX + graphBounds.maxX) / 2;
      const graphCenterY = (graphBounds.minY + graphBounds.maxY) / 2;
      offsetX = w / 2 - graphCenterX * scale;
      offsetY = h / 2 - graphCenterY * scale;
    }

    // ─── Build DOM nodes ─────────────────────────────────────────────────
    const nodeMap = {};
    nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = `node layer-${n.layer}${n.extra_class ? ' ' + n.extra_class : ''}`;
      el.id = 'n_' + n.id;
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      el.innerHTML = `
        <div class="node-header">
          <span class="node-icon">${n.icon}</span>
          <span class="node-title">${n.title}</span>
        </div>
        <div class="node-sub">${n.sub}</div>
        ${n.warn ? `<span class="node-warn">${n.warn}</span>` : ''}
        <span class="node-tag">${n.tag}</span>
      `;
      nodesLayer.appendChild(el);
      nodeMap[n.id] = { data: n, el };
    });

    // ─── Canvas resize ───────────────────────────────────────────────────
    function resizeCanvas() {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      drawEdges();
    }
    window.addEventListener('resize', resizeCanvas);

    // ─── Draw edges ──────────────────────────────────────────────────────
    function getNodeCenter(id) {
      const n = nodeMap[id].data;
      return { x: n.x, y: n.y };
    }

    function worldToScreen(x, y) {
      return { x: x * scale + offsetX, y: y * scale + offsetY };
    }

    function drawEdges() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      edges.forEach(e => {
        const a = getNodeCenter(e.from);
        const b = getNodeCenter(e.to);
        const as = worldToScreen(a.x, a.y);
        const bs = worldToScreen(b.x, b.y);

        const isDashed = e.type === 'dashed' || e.type === 'compile';
        const highlight = activeNode && (e.from === activeNode || e.to === activeNode);
        const baseColor = e.dashedColor || (isDashed ? '#ff4d6d' : '#1e2230');
        const color = highlight ? layerColors[nodeMap[e.from].data.layer] : baseColor;
        const alpha = highlight ? 0.9 : (isDashed ? 0.5 : 0.6);
        const lineWidth = highlight ? 2 : (isDashed ? 1.5 : 1);

        ctx.save();
        if (isDashed) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(as.x, as.y);
        const cpY = (as.y + bs.y) / 2;
        ctx.bezierCurveTo(as.x, cpY, bs.x, cpY, bs.x, bs.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();

        const angle = Math.atan2(bs.y - cpY, bs.x - bs.x) + Math.PI / 2;
        const aSize = highlight ? 6 : 4;
        ctx.beginPath();
        ctx.moveTo(bs.x, bs.y);
        ctx.lineTo(bs.x - aSize * Math.cos(angle - Math.PI / 6), bs.y - aSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(bs.x - aSize * Math.cos(angle + Math.PI / 6), bs.y - aSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Optional static canvas text labels (e.g. "COMPILE PATH →"),
      // positioned in world space so they pan/zoom with the graph.
      if (canvasLabels.length) {
        ctx.save();
        ctx.font = `600 9px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        canvasLabels.forEach(label => {
          const pos = worldToScreen(label.x, label.y);
          ctx.fillStyle = label.color || 'rgba(255,255,255,0.4)';
          ctx.fillText(label.text, pos.x, pos.y);
        });
        ctx.restore();
      }
    }

    function applyTransform() {
      nodesLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      drawEdges();
    }

    // ─── Unified pointer interaction (mouse + touch) ────────────────────
    // A "tap" (select node) is only recognized if the pointer moved less
    // than TAP_MOVE_THRESHOLD px and was released within TAP_TIME_THRESHOLD
    // ms — otherwise it's treated as a pan, even if it started on a node.
    const TAP_MOVE_THRESHOLD = 10;
    const TAP_TIME_THRESHOLD = 400;

    let pointerActive = false;
    let pointerStart = { x: 0, y: 0, time: 0 };
    let panStart = { x: 0, y: 0 };
    let pointerMoved = 0;
    let pointerDownNode = null;

    function nodeElementFromPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('.node') : null;
    }

    function startGesture(x, y) {
      pointerActive = true;
      pointerMoved = 0;
      pointerStart = { x, y, time: performance.now() };
      panStart = { x: x - offsetX, y: y - offsetY };
      pointerDownNode = nodeElementFromPoint(x, y);
      wrap.classList.add('dragging');
    }

    function moveGesture(x, y) {
      if (!pointerActive) return;
      const dx = x - pointerStart.x;
      const dy = y - pointerStart.y;
      pointerMoved = Math.max(pointerMoved, Math.hypot(dx, dy));

      offsetX = x - panStart.x;
      offsetY = y - panStart.y;
      applyTransform();
    }

    function endGesture() {
      if (!pointerActive) return;
      wrap.classList.remove('dragging');
      const elapsed = performance.now() - pointerStart.time;
      const wasTap = pointerMoved < TAP_MOVE_THRESHOLD && elapsed < TAP_TIME_THRESHOLD;

      if (wasTap) {
        if (pointerDownNode) {
          const id = pointerDownNode.id.replace(/^n_/, '');
          const nodeData = nodeMap[id]?.data;
          if (nodeData) selectNode(nodeData);
        } else {
          deselectNode();
        }
      }

      pointerActive = false;
      pointerDownNode = null;
    }

    // Mouse
    wrap.addEventListener('mousedown', e => {
      startGesture(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', e => {
      moveGesture(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      endGesture();
    });

    // Touch
    let pinchStartDist = null;
    let pinchStartScale = 1;
    let pinchMidpoint = { x: 0, y: 0 };

    wrap.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        startGesture(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        pointerActive = false;
        pointerDownNode = null;
        wrap.classList.remove('dragging');

        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartScale = scale;
        pinchMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: true });

    wrap.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && pointerActive) {
        moveGesture(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2 && pinchStartDist) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / pinchStartDist;
        const newScale = Math.max(0.15, Math.min(2.5, pinchStartScale * factor));

        const rect = wrap.getBoundingClientRect();
        const mx = pinchMidpoint.x - rect.left;
        const my = pinchMidpoint.y - rect.top;
        offsetX = mx - ((mx - offsetX) / scale) * newScale;
        offsetY = my - ((my - offsetY) / scale) * newScale;
        scale = newScale;
        applyTransform();
      }
    }, { passive: true });

    wrap.addEventListener('touchend', e => {
      if (e.touches.length === 0) {
        endGesture();
        pinchStartDist = null;
      } else if (e.touches.length === 1) {
        pinchStartDist = null;
        startGesture(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // ─── Wheel zoom (desktop) ────────────────────────────────────────────
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      offsetX = mx + (offsetX - mx) * factor;
      offsetY = my + (offsetY - my) * factor;
      scale *= factor;
      scale = Math.max(0.15, Math.min(2.5, scale));
      applyTransform();
    }, { passive: false });

    // ─── Controls ────────────────────────────────────────────────────────
    function zoomIn() { scale = Math.min(scale * 1.15, 2.5); applyTransform(); }
    function zoomOut() { scale = Math.max(scale * 0.85, 0.15); applyTransform(); }
    function resetView() {
      fitToView();
      applyTransform();
      deselectNode();
    }

    document.getElementById('btn-reset')?.addEventListener('click', resetView);
    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
    document.getElementById('info-close')?.addEventListener('click', deselectNode);

    // ─── Node selection ──────────────────────────────────────────────────
    function selectNode(n) {
      if (activeNode) document.getElementById('n_' + activeNode)?.classList.remove('active');
      activeNode = n.id;
      document.getElementById('n_' + n.id)?.classList.add('active');

      document.getElementById('ip-title').textContent = n.title;
      document.getElementById('ip-title').style.color = layerColors[n.layer];
      document.getElementById('ip-desc').textContent = n.desc;

      const depLabels = (n.deps || []).map(d => {
        const found = nodes.find(x => x.id === d);
        return found ? `<span>${found.title}</span>` : '';
      }).join('');
      document.getElementById('ip-deps').innerHTML = depLabels
        ? `<div style="margin-bottom:5px;color:#5a6480">Depends on:</div>${depLabels}`
        : '';

      infoPanel.classList.add('visible');
      mobileHint?.classList.add('hidden-by-panel');
      drawEdges();
    }

    function deselectNode() {
      if (activeNode) document.getElementById('n_' + activeNode)?.classList.remove('active');
      activeNode = null;
      infoPanel.classList.remove('visible');
      mobileHint?.classList.remove('hidden-by-panel');
      drawEdges();
    }

    // ─── Init ────────────────────────────────────────────────────────────
    resizeCanvas();
    fitToView();
    applyTransform();

    // Expose for any inline debugging/extension needs
    return { zoomIn, zoomOut, resetView, selectNode, deselectNode };
  }

  return { init };
})();
