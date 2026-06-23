/**
 * Wireframe field background element (About page).
 *
 * Renders several wireframe polyhedra scattered across the viewport — one
 * larger "anchor" shape near center, a handful of smaller ones spread
 * toward the edges — each independently idle-spinning and reacting to
 * scroll position, using the same rotation model proven in the homepage's
 * single-shape wireframe.js (kept separate/untouched; this is a distinct
 * script for the About page's different visual treatment).
 *
 * Shape geometry (icosahedron, cube, octahedron, tetrahedron) is generated
 * once; each placed instance gets its own independent rotation state, a
 * fixed screen-space anchor point (as a fraction of viewport size, picked
 * from a small set of spread-out slots with slight jitter so placement
 * reads as deliberate rather than randomly clumped), and its own scale.
 */
(function () {
  const svg = document.getElementById('wireframe-svg');
  if (!svg) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  // ─── Shape geometry generators (unit-sphere-ish, normalized) ────────────
  function normalize(verts) {
    return verts.map(([x, y, z]) => {
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      return [x / len, y / len, z / len];
    });
  }

  function makeIcosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = normalize([
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ]);
    const edges = [
      [0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],
      [2,3],[2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],
      [4,5],[4,9],[4,11],[5,9],[5,11],[6,7],[6,8],[6,10],
      [7,8],[7,10],[8,9],[10,11],
    ];
    return { verts, edges };
  }

  function makeCube() {
    const verts = normalize([
      [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
      [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1],
    ]);
    const edges = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7],
    ];
    return { verts, edges };
  }

  function makeOctahedron() {
    const verts = normalize([
      [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1],
    ]);
    const edges = [
      [0,2],[0,3],[0,4],[0,5],
      [1,2],[1,3],[1,4],[1,5],
      [2,4],[2,5],[3,4],[3,5],
    ];
    return { verts, edges };
  }

  function makeTetrahedron() {
    const verts = normalize([
      [1,1,1], [-1,-1,1], [-1,1,-1], [1,-1,-1],
    ]);
    const edges = [
      [0,1],[0,2],[0,3],[1,2],[1,3],[2,3],
    ];
    return { verts, edges };
  }

  const shapeTypes = [makeIcosahedron, makeCube, makeOctahedron, makeTetrahedron];

  // ─── Placement slots ─────────────────────────────────────────────────────
  // Fractional viewport positions (0-1) for scattered shapes, spread toward
  // the edges/corners so they don't clump together or crowd the center,
  // which is reserved for the one large anchor shape. Slight per-load
  // jitter keeps repeat visits from feeling identical without risking
  // genuine overlap.
  const scatterSlots = [
    { x: 0.12, y: 0.18 },
    { x: 0.88, y: 0.15 },
    { x: 0.08, y: 0.78 },
    { x: 0.90, y: 0.80 },
    { x: 0.85, y: 0.48 },
  ];

  function jitter(value, amount) {
    return Math.min(0.97, Math.max(0.03, value + (Math.random() * 2 - 1) * amount));
  }

  // Pick how many scattered shapes to show — "not too many, not too few".
  const scatterCount = 4;
  const chosenSlots = scatterSlots
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, scatterCount);

  const instances = [];

  // Central anchor — always an icosahedron (most visually rich shape),
  // always large, always dead-center.
  instances.push({
    ...makeIcosahedron(),
    anchorX: 0.5,
    anchorY: 0.46,
    sizeFactor: 0.30,
    rotSpeedFactor: 1,
  });

  chosenSlots.forEach((slot, i) => {
    const makeShape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
    instances.push({
      ...makeShape(),
      anchorX: jitter(slot.x, 0.03),
      anchorY: jitter(slot.y, 0.03),
      sizeFactor: 0.08 + Math.random() * 0.07,
      // Smaller shapes drift slightly faster/slower than the anchor so the
      // field doesn't look like one rigid object moving as a block.
      rotSpeedFactor: 0.7 + Math.random() * 0.8,
    });
  });

  // ─── Per-instance state setup ────────────────────────────────────────────
  const idleSpeedMin = 0.00025;
  const idleSpeedMax = 0.0011;
  const idleRetargetIntervalMs = [3000, 7000];
  const tiltAmplitudeX = 1.8;
  const tiltAmplitudeY = 1.1;

  instances.forEach((inst) => {
    inst.lineEls = inst.edges.map(() => {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('stroke', 'var(--wire-color)');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(el);
      return el;
    });

    inst.baseRotX = 0.3 + Math.random() * 0.3;
    inst.baseRotY = 0.1 + Math.random() * 0.3;
    inst.rotX = inst.baseRotX;
    inst.rotY = inst.baseRotY;
    inst.targetRotX = inst.baseRotX;
    inst.targetRotY = inst.baseRotY;

    inst.idleSpinOffset = 0;
    inst.idleVelocity = reduceMotion ? 0 : idleSpeedMin + Math.random() * (idleSpeedMax - idleSpeedMin);
    inst.idleVelocityTarget = 0;
    inst.idleRetargetAt = 0;

    function pickTarget() {
      const magnitude = (idleSpeedMin + Math.random() * (idleSpeedMax - idleSpeedMin)) * inst.rotSpeedFactor;
      const currentSign = inst.idleVelocityTarget < 0 ? -1 : 1;
      const sign = Math.random() < 0.25 ? currentSign * -1 : currentSign;
      inst.idleVelocityTarget = magnitude * sign;
      const [minMs, maxMs] = idleRetargetIntervalMs;
      inst.idleRetargetAt = performance.now() + minMs + Math.random() * (maxMs - minMs);
    }
    inst.pickTarget = pickTarget;

    if (!reduceMotion) pickTarget();
  });

  function rotatePoint([x, y, z], rx, ry) {
    let y1 = y * Math.cos(rx) - z * Math.sin(rx);
    let z1 = y * Math.sin(rx) + z * Math.cos(rx);
    let x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
    let z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
    return [x2, y1, z2];
  }

  function updateIdleVelocity(inst, now) {
    if (reduceMotion) return;
    if (now >= inst.idleRetargetAt) inst.pickTarget();
    inst.idleVelocity += (inst.idleVelocityTarget - inst.idleVelocity) * 0.0035;
    inst.idleSpinOffset += inst.idleVelocity;
  }

  function render() {
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const minDim = Math.min(w, h);
    const focalLength = 4;
    const now = performance.now();

    instances.forEach((inst) => {
      const scale = minDim * inst.sizeFactor;
      const cx = w * inst.anchorX;
      const cy = h * inst.anchorY;

      updateIdleVelocity(inst, now);

      inst.rotX += (inst.targetRotX - inst.rotX) * 0.045;
      inst.rotY += (inst.targetRotY - inst.rotY) * 0.045;
      const renderRotY = inst.rotY + inst.idleSpinOffset;

      const projected = inst.verts.map((v) => {
        const [x, y, z] = rotatePoint(v, inst.rotX, renderRotY);
        const perspective = focalLength / (focalLength - z);
        return {
          x: cx + x * scale * perspective,
          y: cy + y * scale * perspective,
          depth: z,
        };
      });

      inst.edges.forEach((edge, i) => {
        const a = projected[edge[0]];
        const b = projected[edge[1]];
        const el = inst.lineEls[i];
        el.setAttribute('x1', a.x.toFixed(2));
        el.setAttribute('y1', a.y.toFixed(2));
        el.setAttribute('x2', b.x.toFixed(2));
        el.setAttribute('y2', b.y.toFixed(2));
        const avgDepth = (a.depth + b.depth) / 2;
        const opacity = 0.30 + ((avgDepth + 1) / 2) * 0.4;
        el.setAttribute('opacity', opacity.toFixed(2));
      });
    });

    requestAnimationFrame(render);
  }

  // ─── Scroll-driven tilt target (shared across all instances) ────────────
  function updateScrollTargets() {
    const maxScroll = document.body.scrollHeight - window.innerHeight || 1;
    const scrollFraction = window.scrollY / maxScroll;
    const wave = Math.sin(scrollFraction * Math.PI * 2);
    const waveOffset = Math.sin(scrollFraction * Math.PI * 2 + Math.PI / 3);

    instances.forEach((inst) => {
      inst.targetRotX = inst.baseRotX + wave * tiltAmplitudeX * inst.rotSpeedFactor;
      inst.targetRotY = inst.baseRotY + waveOffset * tiltAmplitudeY * inst.rotSpeedFactor;
    });
  }

  window.addEventListener('scroll', updateScrollTargets, { passive: true });
  window.addEventListener('resize', updateScrollTargets);
  updateScrollTargets();
  requestAnimationFrame(render);
})();
