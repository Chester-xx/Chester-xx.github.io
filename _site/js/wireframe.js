/**
 * Wireframe polyhedron background element.
 * Renders a low-poly icosahedron as an SVG line mesh. Rotation comes from
 * two independent sources: a slow wandering idle drift, and a scroll-driven
 * tilt that oscillates as the page scrolls. With prefers-reduced-motion,
 * the idle drift is disabled; the scroll-driven tilt remains, since it's
 * tied to a user-initiated action rather than autoplaying.
 */
(function () {
  const svg = document.getElementById('wireframe-svg');
  if (!svg) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Icosahedron geometry ────────────────────────────────────────────────
  const t = (1 + Math.sqrt(5)) / 2;
  const rawVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  // Normalize to unit sphere
  const verts = rawVerts.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  const edges = [
    [0,1],[0,5],[0,7],[0,10],[0,11],
    [1,5],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,6],[2,10],[2,11],
    [3,4],[3,6],[3,8],[3,9],
    [4,5],[4,9],[4,11],
    [5,9],[5,11],
    [6,7],[6,8],[6,10],
    [7,8],[7,10],
    [8,9],
    [10,11],
  ];

  // ─── Build SVG line elements once ───────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const lineEls = edges.map(() => {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('stroke', 'var(--wire-color)');
    el.setAttribute('stroke-width', '1');
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(el);
    return el;
  });

  // ─── Rotation state ──────────────────────────────────────────────────────
  // Base tilt the shape sits at when scrollFraction = 0 (top of page).
  const baseRotX = 0.4;
  const baseRotY = 0.2;

  let rotX = baseRotX;
  let rotY = baseRotY;
  let targetRotX = baseRotX;
  let targetRotY = baseRotY;

  // Idle spin: a slowly wandering drift layered ON TOP of the scroll-eased
  // rotation (added at render time), so it never fights the easing step
  // toward targetRotY — they're independent of each other.
  //
  // The spin velocity eases toward a new randomly-chosen target every few
  // seconds rather than jumping or snapping. Targets are picked with a
  // magnitude between idleSpeedMin and idleSpeedMax, and mostly keep the
  // current direction (only ~25% of retargets flip sign), so the velocity
  // rarely needs to cross all the way through zero — that's what keeps
  // the speed/direction changes gradual rather than noticeable.
  let idleSpinOffset = 0;
  let idleVelocity = 0;
  let idleVelocityTarget = 0;
  let idleRetargetAt = 0;

  const idleSpeedMin = 0.00025;
  const idleSpeedMax = 0.0011;
  const idleRetargetIntervalMs = [3000, 7000]; // re-pick a new target every 3-7s

  function pickIdleVelocityTarget() {
    const magnitude = idleSpeedMin + Math.random() * (idleSpeedMax - idleSpeedMin);

    // Bias toward keeping the current direction — only flip sign on roughly
    // 1 in 4 retargets. Frequent reversals are what made direction changes
    // noticeable before; keeping the same direction most of the time means
    // the velocity rarely has to ease all the way through zero.
    const currentSign = idleVelocityTarget < 0 ? -1 : 1;
    const sign = Math.random() < 0.25 ? currentSign * -1 : currentSign;

    idleVelocityTarget = magnitude * sign;
    const [minMs, maxMs] = idleRetargetIntervalMs;
    idleRetargetAt = performance.now() + minMs + Math.random() * (maxMs - minMs);
  }

  if (!reduceMotion) {
    idleVelocity = idleSpeedMin + Math.random() * (idleSpeedMax - idleSpeedMin);
    pickIdleVelocityTarget();
  }

  // Scroll tilt amplitude — how far the shape swings from its base angle.
  const tiltAmplitudeX = 1.8;
  const tiltAmplitudeY = 1.1;

  function rotatePoint([x, y, z], rx, ry) {
    // Rotate around X axis
    let y1 = y * Math.cos(rx) - z * Math.sin(rx);
    let z1 = y * Math.sin(rx) + z * Math.cos(rx);
    // Rotate around Y axis
    let x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
    let z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
    return [x2, y1, z2];
  }

  function updateIdleVelocity(now) {
    if (reduceMotion) return;

    if (now >= idleRetargetAt) {
      pickIdleVelocityTarget();
    }

    // Ease current velocity toward the wandering target. This is the only
    // place velocity changes — no clamping/snapping afterward — so a
    // direction change reads as a smooth decelerate-then-reaccelerate
    // rather than a visible snap. The slow easing factor (vs. the 0.045
    // used for scroll tilt) is what makes the speed change gradual enough
    // not to draw attention.
    idleVelocity += (idleVelocityTarget - idleVelocity) * 0.0035;

    idleSpinOffset += idleVelocity;
  }

  function render() {
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const scale = Math.min(w, h) * 0.34;
    const cx = w / 2;
    const cy = h / 2;
    const focalLength = 4;

    updateIdleVelocity(performance.now());

    // Ease current rotation toward scroll-driven target on both axes
    rotX += (targetRotX - rotX) * 0.045;
    rotY += (targetRotY - rotY) * 0.045;

    const renderRotY = rotY + idleSpinOffset;

    const projected = verts.map((v) => {
      const [x, y, z] = rotatePoint(v, rotX, renderRotY);
      const perspective = focalLength / (focalLength - z);
      return {
        x: cx + x * scale * perspective,
        y: cy + y * scale * perspective,
        depth: z,
      };
    });

    edges.forEach((edge, i) => {
      const a = projected[edge[0]];
      const b = projected[edge[1]];
      const el = lineEls[i];
      el.setAttribute('x1', a.x.toFixed(2));
      el.setAttribute('y1', a.y.toFixed(2));
      el.setAttribute('x2', b.x.toFixed(2));
      el.setAttribute('y2', b.y.toFixed(2));
      // Edges further back fade slightly, for subtle depth
      const avgDepth = (a.depth + b.depth) / 2;
      const opacity = 0.35 + ((avgDepth + 1) / 2) * 0.45;
      el.setAttribute('opacity', opacity.toFixed(2));
    });

    requestAnimationFrame(render);
  }

  // ─── Scroll-driven tilt target ──────────────────────────────────────────
  // Maps scroll position to a non-linear oscillation rather than a single
  // linear tilt: the shape swings one way, eases back through its base
  // angle, then swings the other way as you keep scrolling — like slowly
  // orbiting around it rather than being cranked in one direction forever.
  function updateScrollTarget() {
    const maxScroll = document.body.scrollHeight - window.innerHeight || 1;
    const scrollFraction = window.scrollY / maxScroll;

    // Two full oscillations over the page's height, offset between axes
    // so X and Y don't peak at the same scroll position (keeps the motion
    // from feeling like a single flat back-and-forth).
    const wave = Math.sin(scrollFraction * Math.PI * 2);
    const waveOffset = Math.sin(scrollFraction * Math.PI * 2 + Math.PI / 3);

    targetRotX = baseRotX + wave * tiltAmplitudeX;
    targetRotY = baseRotY + waveOffset * tiltAmplitudeY;
  }

  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.addEventListener('resize', updateScrollTarget);
  updateScrollTarget();
  requestAnimationFrame(render);
})();
