// Space Experience — Smooth, low-power, scroll-driven space journey
// More realistic planets & galaxies, smoother fades + clickable stars/meteors
// Updated: multi-style meteors, varied glowing stars, bigger opening galaxy,
//          stars only inside galaxy, icon-based play/pause state, wider orbits.
//          dimmer galaxy intro, scattered rocks near galaxies, hide other
//          galaxies at cluster stage (keep Milky Way + stars).

/* --------------------------------------------------------------------- */
/* DATA (loaded from JSON files in /data)                                */
/* --------------------------------------------------------------------- */

let I18N = {};
let PLANETS = [];
let MOONS = [];
let GALAXIES = [];
let STAR_CLUSTERS = [];
let BLACK_HOLES = [];
let CONSTELLATIONS = [];

// extra scene configuration from scenes.json
let SECTION_KEYS = [];
let NARRATIVE_STATUS = {};
let PHASES = {};

/* --------------------------------------------------------------------- */
/* STATE                                                                 */
/* --------------------------------------------------------------------- */

const STATE = {
  lang: "ar",
  scrollProgress: 0,
  time: 0,
  animationSpeed: 0.25, // أقل سرعة افتراضية
  playing: false, // التشغيل موقوف من البداية
  activeObject: null,
  activeSectionKey: null,
};

/* --------------------------------------------------------------------- */
/* UTILS                                                                 */
/* --------------------------------------------------------------------- */

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function smoothStep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

function createPRNG(seed) {
  let s = seed >>> 0;
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  return function () {
    s = (a * s + c) % m;
    return s / m;
  };
}

/* --------------------------------------------------------------------- */
/* DOM REFS                                                              */
/* --------------------------------------------------------------------- */

let bodyEl,
  splashEl,
  canvasStars,
  canvasGalaxies,
  canvasForeground,
  ctxStars,
  ctxGalaxies,
  ctxForeground,
  narrativeStatusEl,
  sectionsEls,
  langToggleBtn,
  reducedMotionIndicatorEl,
  controlPanelEl,
  controlPanelToggleEl,
  speedSlider,
  playPauseBtn,
  lowQualityToggle,
  planetInfoEl,
  planetPreviewCanvas,
  planetPreviewCtx;

/* --------------------------------------------------------------------- */
/* DATA LOADING FROM JSON                                                */
/* --------------------------------------------------------------------- */

async function loadData() {
  try {
    const [i18nRes, objectsRes, scenesRes] = await Promise.all([
      fetch("data/i18n.json"),
      fetch("data/objects.json"),
      fetch("data/scenes.json"),
    ]);

    const [i18nJson, objectsJson, scenesJson] = await Promise.all([
      i18nRes.ok ? i18nRes.json() : Promise.resolve({}),
      objectsRes.ok ? objectsRes.json() : Promise.resolve({}),
      scenesRes.ok ? scenesRes.json() : Promise.resolve({}),
    ]);

    I18N = i18nJson || {};

    PLANETS = (objectsJson && objectsJson.planets) || [];
    MOONS = (objectsJson && objectsJson.moons) || [];
    GALAXIES = (objectsJson && objectsJson.galaxies) || [];
    STAR_CLUSTERS = (objectsJson && objectsJson.clusters) || [];
    BLACK_HOLES = (objectsJson && objectsJson.blackHoles) || [];
    CONSTELLATIONS = (objectsJson && objectsJson.constellations) || [];

    SECTION_KEYS = (scenesJson && scenesJson.sectionKeys) || [];
    NARRATIVE_STATUS = (scenesJson && scenesJson.narrativeStatus) || {};
    PHASES = (scenesJson && scenesJson.phases) || {};
  } catch (err) {
    console.error("Failed to load JSON data files", err);
  }
}

function phaseValue(name, progress) {
  if (!PHASES || !PHASES[name]) return 0;
  const cfg = PHASES[name];
  return smoothStep(cfg.start, cfg.end, progress);
}

/* --------------------------------------------------------------------- */
/* INIT                                                                  */
/* --------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  await loadData();

  bodyEl = document.body;
  splashEl = document.getElementById("splash");
  canvasStars = document.getElementById("canvas-stars");
  canvasGalaxies = document.getElementById("canvas-galaxies");
  canvasForeground = document.getElementById("canvas-foreground");

  narrativeStatusEl = document.getElementById("narrative-status");
  sectionsEls = Array.from(
    document.querySelectorAll(".scroll-section[data-section]")
  );

  langToggleBtn = document.getElementById("lang-toggle");
  reducedMotionIndicatorEl = document.getElementById(
    "reduced-motion-indicator"
  );

  controlPanelEl = document.querySelector(".control-panel");
  controlPanelToggleEl = document.querySelector(".control-panel-toggle");
  speedSlider = document.getElementById("speed-slider");
  playPauseBtn = document.getElementById("play-pause-btn");
  lowQualityToggle = document.getElementById("low-quality-toggle");

  // افتح لوحة التحكم من البداية (لو موجودة)
  if (controlPanelEl) {
    controlPanelEl.classList.remove("control-panel--minimized");
    const body = controlPanelEl.querySelector(".control-panel-body");
    if (body) body.setAttribute("aria-hidden", "false");
  }
  if (controlPanelToggleEl) {
    controlPanelToggleEl.setAttribute("aria-expanded", "true");
  }

  // اضبط السلايدر على أقل قيمة، وحدث STATE.animationSpeed
  if (speedSlider) {
    const minVal = speedSlider.min ? parseFloat(speedSlider.min) : 0.25;
    speedSlider.value = String(minVal);
    STATE.animationSpeed = isNaN(minVal) ? STATE.animationSpeed : minVal;
  }

  // زر التشغيل/الإيقاف — نعتمد على data-state + aria-label (الأيقونات من الـ CSS)
  if (playPauseBtn) {
    const dict = I18N[STATE.lang];
    playPauseBtn.dataset.state = "paused";
    playPauseBtn.setAttribute("aria-label", dict.play);
    playPauseBtn.textContent = ""; // نخليه فاضي، الأيقونة من CSS
  }

  planetInfoEl = document.getElementById("planet-info");
  planetPreviewCanvas = document.getElementById("planet-preview-canvas");
  if (planetPreviewCanvas) {
    planetPreviewCtx = planetPreviewCanvas.getContext("2d");
  }

  if (!canvasStars || !canvasStars.getContext) {
    bodyEl.classList.add("no-canvas");
    return;
  }
  ctxStars = canvasStars.getContext("2d");
  ctxGalaxies = canvasGalaxies.getContext("2d");
  ctxForeground = canvasForeground.getContext("2d");

  const rmQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  if (rmQuery && rmQuery.matches && reducedMotionIndicatorEl) {
    reducedMotionIndicatorEl.classList.remove("hud-pill-hidden");
  }
  if (rmQuery) {
    rmQuery.addEventListener("change", (e) => {
      if (!reducedMotionIndicatorEl) return;
      reducedMotionIndicatorEl.classList.toggle("hud-pill-hidden", !e.matches);
    });
  }

  setupLanguage();
  setupLayout();
  setupEvents();
  generateStaticFields();
  resizeCanvases();
  handleInitialDeepLinks();

  updateScrollProgress();
  startLoop();
}

/* --------------------------------------------------------------------- */
/* LANGUAGE                                                              */
/* --------------------------------------------------------------------- */

function setupLanguage() {
  const htmlLang = document.documentElement.lang;
  STATE.lang = htmlLang === "en" ? "en" : "ar";
  applyLanguage();

  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      STATE.lang = STATE.lang === "en" ? "ar" : "en";
      applyLanguage();
    });
  }
}

function applyLanguage() {
  const lang = STATE.lang;
  const dict = I18N[lang] || I18N.en || I18N.ar || {};

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  if (langToggleBtn) {
    const spans = langToggleBtn.querySelectorAll("span[data-lang]");
    spans.forEach((span) => {
      span.classList.toggle("active", span.getAttribute("data-lang") === lang);
    });
  }

  const splashSubtitle = document.querySelector(".splash-subtitle");
  if (splashSubtitle) splashSubtitle.textContent = dict.scrollDown;

  const devLabel = document.querySelector(
    '.splash-developer [data-i18n="developerBy"]'
  );
  if (devLabel) devLabel.textContent = dict.developerBy;

  const speedLabel = document.querySelector(
    'label[for="speed-slider"][data-i18n="speed"]'
  );
  if (speedLabel) speedLabel.textContent = dict.speed;

  if (playPauseBtn) {
    playPauseBtn.setAttribute(
      "aria-label",
      STATE.playing ? dict.pause : dict.play
    );
    playPauseBtn.dataset.state = STATE.playing ? "playing" : "paused";
  }

  const infoLabels = document.querySelectorAll("#planet-info [data-i18n]");
  infoLabels.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  const moonsTitleEl = document.querySelector(
    "#planet-moons-title[data-i18n='moonsTitle']"
  );
  if (moonsTitleEl) moonsTitleEl.textContent = dict.moonsTitle;
}

/* --------------------------------------------------------------------- */
/* LAYOUT & SCROLL                                                       */
/* --------------------------------------------------------------------- */

function setupLayout() {
  window.addEventListener("resize", () => {
    resizeCanvases();
    generateStaticFields();
  });
}

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  [canvasStars, canvasGalaxies, canvasForeground].forEach((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });

  if (planetPreviewCanvas && planetPreviewCtx) {
    const size = 300;
    planetPreviewCanvas.width = size * dpr;
    planetPreviewCanvas.height = size * dpr;
    planetPreviewCanvas.style.width = "100%";
    planetPreviewCanvas.style.aspectRatio = "1 / 1";
    planetPreviewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function unlockOnFirstScroll() {
  if (!bodyEl.classList.contains("no-scroll")) return;
  bodyEl.classList.remove("no-scroll");
  if (splashEl) {
    splashEl.classList.add("splash-hidden");
    splashEl.setAttribute("aria-hidden", "true");
  }
}

function updateScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const p = maxScroll > 0 ? y / maxScroll : 0;
  STATE.scrollProgress = clamp01(p);
  updateSectionEffects();

  // إعادة إظهار شاشة البدء عند الصعود للأعلى
  if (splashEl) {
    if (y <= 5) {
      splashEl.classList.remove("splash-hidden");
      splashEl.setAttribute("aria-hidden", "false");
    } else if (!bodyEl.classList.contains("no-scroll")) {
      splashEl.classList.add("splash-hidden");
      splashEl.setAttribute("aria-hidden", "true");
    }
  }
}

/* SECTION EFFECTS & URL ----------------------------------------------- */

function updateSectionEffects() {
  if (!sectionsEls || !sectionsEls.length) return;
  const viewportCenter = window.innerHeight / 2;

  let bestSection = null;
  let bestIntensity = -Infinity;

  sectionsEls.forEach((section) => {
    const title = section.querySelector(".section-title");
    const rect = section.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - viewportCenter);
    const norm = dist / (window.innerHeight * 0.7);
    const intensity = 1 - norm;

    const t = clamp01(intensity);
    if (title) {
      const opacity = 0.25 + 0.75 * t;
      const translateY = 25 * (1 - t);
      const scale = 0.95 + 0.05 * t;
      title.style.opacity = String(opacity);
      title.style.transform = `translateY(${translateY}px) scale(${scale})`;
    }

    if (intensity > bestIntensity) {
      bestIntensity = intensity;
      bestSection = section;
    }
  });

  if (bestSection) {
    const key = bestSection.getAttribute("data-section");
    if (key && key !== STATE.activeSectionKey) {
      STATE.activeSectionKey = key;
      updateNarrativeStatus(key);
      updateSectionInURL(key);
    }
  }
}

function updateNarrativeStatus(key) {
  if (!narrativeStatusEl) return;
  const lang = STATE.lang || "en";
  const entry = NARRATIVE_STATUS && NARRATIVE_STATUS[key];
  if (!entry) {
    narrativeStatusEl.textContent = "";
    return;
  }
  narrativeStatusEl.textContent =
    entry[lang] || entry.en || entry.ar || "";
}

function updateSectionInURL(key) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("section", key);
    history.replaceState(null, "", url.toString());
  } catch (_) {}
}

function scrollToSectionKey(key) {
  const target = sectionsEls.find(
    (s) => s.getAttribute("data-section") === key
  );
  if (!target) return;
  const top = target.offsetTop - 40;
  window.scrollTo({ top, behavior: "auto" });
}

/* Deep links on first load -------------------------------------------- */

function handleInitialDeepLinks() {
  try {
    const url = new URL(window.location.href);
    const sectionKey = url.searchParams.get("section");
    const planetId = url.searchParams.get("planet");
    if (sectionKey) {
      unlockOnFirstScroll();
      scrollToSectionKey(sectionKey);
    }
    if (planetId) {
      const planet = PLANETS.find((p) => p.id === planetId);
      if (planet) {
        setTimeout(() => {
          openObjectInfo({ kind: "planet", id: planet.id, ref: planet });
        }, 400);
      }
    }
  } catch (_) {}
}

/* --------------------------------------------------------------------- */
/* EVENTS                                                                */
/* --------------------------------------------------------------------- */

function setupEvents() {
  window.addEventListener(
    "scroll",
    () => {
      if (bodyEl.classList.contains("no-scroll")) unlockOnFirstScroll();
      updateScrollProgress();
    },
    { passive: true }
  );

  const unlockOnce = () => {
    unlockOnFirstScroll();
    window.removeEventListener("wheel", unlockOnce);
    window.removeEventListener("touchstart", unlockOnce);
    window.removeEventListener("keydown", keyUnlock);
  };
  const keyUnlock = (e) => {
    if (
      e.key === "ArrowDown" ||
      e.key === "PageDown" ||
      e.key === " " ||
      e.key === "Enter"
    ) {
      unlockOnce();
    }
  };
  window.addEventListener("wheel", unlockOnce, { passive: true });
  window.addEventListener("touchstart", unlockOnce, { passive: true });
  window.addEventListener("keydown", keyUnlock);

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const delta = window.innerHeight * 0.85;
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      window.scrollBy({ top: delta, behavior: "smooth" });
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      window.scrollBy({ top: -delta, behavior: "smooth" });
    }
  });

  if (controlPanelToggleEl && controlPanelEl) {
    controlPanelToggleEl.addEventListener("click", () => {
      const minimized = controlPanelEl.classList.toggle(
        "control-panel--minimized"
      );
      controlPanelToggleEl.setAttribute(
        "aria-expanded",
        minimized ? "false" : "true"
      );
      const body = controlPanelEl.querySelector(".control-panel-body");
      if (body) body.setAttribute("aria-hidden", minimized ? "true" : "false");
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener("input", () => {
      const v = parseFloat(speedSlider.value);
      STATE.animationSpeed = isNaN(v) ? STATE.animationSpeed : v;
    });
  }

  if (lowQualityToggle) {
    lowQualityToggle.addEventListener("change", () => {
      // واجهة فقط – لا نغير الداتا
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      STATE.playing = !STATE.playing;
      const dict = I18N[STATE.lang];
      playPauseBtn.setAttribute(
        "aria-label",
        STATE.playing ? dict.pause : dict.play
      );
      playPauseBtn.dataset.state = STATE.playing ? "playing" : "paused";
    });
  }

  if (canvasForeground) {
    canvasForeground.addEventListener("pointerdown", handleScenePointerDown);
    canvasForeground.addEventListener("dblclick", handleSceneDoubleClick);
  }

  const infoCloseBtn = document.getElementById("info-close-btn");
  if (infoCloseBtn) infoCloseBtn.addEventListener("click", closeInfoCard);
  if (planetInfoEl) {
    planetInfoEl.addEventListener("click", (e) => {
      if (e.target === planetInfoEl) closeInfoCard();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeInfoCard();
  });
}

/* --------------------------------------------------------------------- */
/* STATIC FIELDS                                                         */
/* --------------------------------------------------------------------- */

const STATIC_FIELDS = {
  stars: [],
  dust: [],
  galaxyParticles: [],
  meteors: [],
  rocks: [], // كويكبات/صخور حول المجرات
};

function generateStaticFields() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const prngStars = createPRNG(42);
  const prngDust = createPRNG(1701);
  const prngGal = createPRNG(1337);
  const prngMet = createPRNG(999);
  const prngRocks = createPRNG(2024);

  // --- Stars: متنوعين بالألوان والتوهج --------------------------------
  STATIC_FIELDS.stars = [];
  const starCount = 140;
  for (let i = 0; i < starCount; i++) {
    const x = prngStars() * width;
    const y = prngStars() * height;
    const depth = prngStars();
    const radius = 0.6 + prngStars() * 1.4;
    const twinkleOffset = prngStars() * Math.PI * 2;
    const toneRand = prngStars();
    let tone = "white";
    if (toneRand < 0.4) tone = "blue";
    else if (toneRand < 0.7) tone = "gold";
    else if (toneRand < 0.88) tone = "aqua";
    else tone = "white";

    STATIC_FIELDS.stars.push({
      x,
      y,
      radius,
      depth,
      twinkleOffset,
      twinkleAmp: 0.3 + prngStars() * 0.7,
      glowScale: 2.0 + prngStars() * 2.6,
      tone,
    });
  }

  // Dust
  STATIC_FIELDS.dust = [];
  const dustCount = 90;
  for (let i = 0; i < dustCount; i++) {
    STATIC_FIELDS.dust.push({
      x: prngDust() * width,
      y: prngDust() * height,
      radius: 0.5 + prngDust() * 0.8,
      angle: prngDust() * Math.PI * 2,
      speed: 0.04 + prngDust() * 0.12,
    });
  }

  // Galaxy particle field (spiral arms)
  STATIC_FIELDS.galaxyParticles = [];
  const cx = width / 2;
  const cy = height / 2;
  const arms = 4;
  const perArm = 210;
  const a = 3;
  const b = 0.25;
  for (let arm = 0; arm < arms; arm++) {
    const baseAngle = (arm / arms) * Math.PI * 2;
    for (let i = 0; i < perArm; i++) {
      const t = i / perArm;
      const theta = baseAngle + t * 4 * Math.PI + (prngGal() - 0.5) * 0.4;
      const r = a * Math.exp(b * theta);
      const spread = 35 + prngGal() * 65;
      const x =
        cx + (r + (prngGal() - 0.5) * spread) * Math.cos(theta) * 4.1;
      const y =
        cy + (r + (prngGal() - 0.5) * spread) * Math.sin(theta) * 2.5;
      const alpha = 0.15 + 0.7 * (1 - t);
      STATIC_FIELDS.galaxyParticles.push({
        x,
        y,
        alpha,
        size: 0.4 + prngGal() * 1.1,
      });
    }
  }

  // Meteors — 3 أنماط مختلفة
  STATIC_FIELDS.meteors = [];
  const meteorCount = 6;
  for (let i = 0; i < meteorCount; i++) {
    STATIC_FIELDS.meteors.push({
      index: i,
      startX: prngMet() * width,
      startY: -60 - prngMet() * height * 0.25,
      endX: -80 + prngMet() * width * 1.4,
      endY: height + 70,
      speed: 0.16 + prngMet() * 0.15,
      phase: prngMet(),
      style: i % 3, // 0: أزرق نحيف، 1: برتقالي ناري، 2: نبضة قصيرة
    });
  }

  // Rocks / asteroids حول مركز المجرات
  STATIC_FIELDS.rocks = [];
  const rocksCount = 34;
  for (let i = 0; i < rocksCount; i++) {
    const ring = 0.2 + prngRocks() * 0.6; // بعد نسبي عن المركز
    const angle = prngRocks() * Math.PI * 2;
    STATIC_FIELDS.rocks.push({
      baseRadiusNorm: ring,
      baseAngle: angle,
      wobble: (prngRocks() - 0.5) * 0.35,
      size: 4 + prngRocks() * 7,
      orbitSpeed: 0.05 + prngRocks() * 0.16,
    });
  }
}

/* --------------------------------------------------------------------- */
/* RENDER LOOP                                                           */
/* --------------------------------------------------------------------- */

let lastTimestamp = performance.now();
let CURRENT_FRAME_OBJECTS = [];

function startLoop() {
  function frame(ts) {
    const dt = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;

    if (STATE.playing) {
      STATE.time += dt * STATE.animationSpeed;
    }

    renderScene();
    renderPreviewIfAny();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function clearCanvas(ctx) {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function renderScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  clearCanvas(ctxStars);
  clearCanvas(ctxGalaxies);
  clearCanvas(ctxForeground);

  CURRENT_FRAME_OBJECTS = [];

  renderStarsAndDust(ctxStars, width, height);
  renderGalaxiesAndClusters(ctxGalaxies, width, height);
  renderSolarAndDeep(ctxForeground, width, height);
}

/* Stars + dust + meteors ---------------------------------------------- */

function renderStarsAndDust(ctx, width, height) {
  if (!ctx) return;
  ctx.save();

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#050515");
  bg.addColorStop(1, "#000009");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const time = STATE.time;
  const scroll = STATE.scrollProgress;

  const dustPhase = phaseValue("dustPhase", scroll); // مرحلة الغبار الكثيف
  const meteorPhase = phaseValue("meteorPhase", scroll); // ظهور الشهب في النهاية
  const insideGalaxy = phaseValue("starsInsideGalaxy", scroll); // النجوم تظهر فقط بعد دخول المجرة

  // Stars
  STATIC_FIELDS.stars.forEach((s, idx) => {
    const parallax = 1 + s.depth * 0.4 * scroll;
    const offsetX =
      Math.sin(time * 0.04 + s.y * 0.003) * 8 * s.depth * scroll;

    const twinkle =
      0.6 +
      s.twinkleAmp *
        0.4 *
        Math.sin(time * 1.1 + s.twinkleOffset);

    const midFog = dustPhase;
    const endClear = smoothStep(0.8, 1.0, scroll);
    let starAlphaFactor =
      insideGalaxy * (0.55 - 0.25 * midFog + 0.6 * endClear);
    if (starAlphaFactor < 0) starAlphaFactor = 0;

    const sx = s.x / parallax + offsetX;
    const sy = s.y / parallax;

    const rCore = s.radius;
    const rGlow = rCore * (s.glowScale || 2.5);

    let inner = "rgba(255,255,255,1)";
    let mid = "rgba(230,240,255,0.9)";
    let outer = "rgba(0,0,0,0)";
    if (s.tone === "blue") {
      mid = "rgba(164,198,255,0.95)";
    } else if (s.tone === "gold") {
      mid = "rgba(255,215,170,0.95)";
    } else if (s.tone === "aqua") {
      mid = "rgba(170,255,235,0.95)";
    }

    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rGlow);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, mid);
    grad.addColorStop(1, outer);

    ctx.globalAlpha = twinkle * starAlphaFactor;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, rGlow, 0, Math.PI * 2);
    ctx.fill();

    // كل النجوم قابلة للضغط
    CURRENT_FRAME_OBJECTS.push({
      kind: "star",
      id: "star-" + idx,
      ref: {
        name: { en: "Star", ar: "نجم" },
        type: "Star",
      },
      x: sx,
      y: sy,
      radius: rGlow * 0.9,
    });
  });

  // Dust – يصبح أكثر كثافة في منتصف الرحلة
  ctx.globalAlpha = 0.18 + 0.35 * dustPhase;
  STATIC_FIELDS.dust.forEach((d) => {
    const t = STATE.time * d.speed;
    const x = d.x + Math.cos(d.angle + t * 0.3) * 18;
    const y = d.y + Math.sin(d.angle + t * 0.35) * 18;
    ctx.beginPath();
    ctx.arc(x, y, d.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(150,190,255,0.7)";
    ctx.fill();
  });

  // Meteors – ثلاث أشكال مختلفة
  STATIC_FIELDS.meteors.forEach((m) => {
    const tt = (STATE.time * m.speed + m.phase) % 1;
    const x = m.startX + (m.endX - m.startX) * tt;
    const y = m.startY + (m.endY - m.startY) * tt;

    let trailX, trailY, grad, lineWidth;

    if (m.style === 0) {
      // 1️⃣ شهاب أبيض أزرق نحيف وسريع
      const len = 55;
      trailX = x - len;
      trailY = y - len * 1.2;
      grad = ctx.createLinearGradient(trailX, trailY, x, y);
      grad.addColorStop(0, "rgba(126,248,255,0)");
      grad.addColorStop(0.5, "rgba(126,248,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0.98)");
      lineWidth = 1.8;
    } else if (m.style === 1) {
      // 2️⃣ شهاب برتقالي بنار tail
      const len = 70;
      trailX = x - len * 0.8;
      trailY = y - len * 0.4;
      grad = ctx.createLinearGradient(trailX, trailY, x, y);
      grad.addColorStop(0, "rgba(255,180,80,0)");
      grad.addColorStop(0.4, "rgba(255,190,110,0.7)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
      lineWidth = 2.4;
    } else {
      // 3️⃣ شهاب ضوئي قصير جداً (نبضة ضوء)
      const len = 28;
      trailX = x - len * 0.3;
      trailY = y - len * 0.3;
      grad = ctx.createLinearGradient(trailX, trailY, x, y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(200,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
      lineWidth = 3;
    }

    ctx.strokeStyle = grad;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = meteorPhase;
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (m.style === 2) {
      // نبضة ضوئية – توهج دائري
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 10);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.4, "rgba(200,255,255,0.9)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    if (meteorPhase > 0.05) {
      let nameEn = "Meteor";
      let nameAr = "شهاب";
      if (m.style === 0) {
        nameEn = "Blue streak meteor";
        nameAr = "شهاب أزرق سريع";
      } else if (m.style === 1) {
        nameEn = "Fiery orange meteor";
        nameAr = "شهاب برتقالي ناري";
      } else {
        nameEn = "Flash meteor";
        nameAr = "شهاب نبضة ضوء";
      }

      CURRENT_FRAME_OBJECTS.push({
        kind: "meteor",
        id: "meteor-" + m.index,
        ref: {
          style: m.style,
          name: { en: nameEn, ar: nameAr },
          type: "Meteor",
        },
        x,
        y,
        radius: 14,
      });
    }
  });

  ctx.restore();
}

/* Galaxies, clusters, black holes background -------------------------- */

function renderGalaxiesAndClusters(ctx, width, height) {
  if (!ctx) return;
  ctx.save();

  const p = STATE.scrollProgress;

  // مراحل:
  // 0   -> مجرة كبيرة في المنتصف مثل صورة التلسكوب
  // 0.18-0.4 -> دخول درب التبانة (تكبر وتقرب والباقي يختفي)
  // 0.25-0.6 -> مرحلة العناقيد: نخفي المجرات البعيدة
  // 0.4-0.7 -> داخل الغبار الكثيف
  // بعد 0.7 -> تركيز على المجموعة الشمسية

  const intoMilky = phaseValue("intoMilky", p);
  const afterMilky = phaseValue("afterMilky", p);
  const dustPhase = phaseValue("dustPhase", p);
  const solarPhase = phaseValue("solarPhase", p);
  const clustersPhase = phaseValue("clustersPhase", p); // بداية العناقيد

  // مجرة كبيرة في بداية الرحلة (تشبه الصورة الثانية)
  const bigGalaxyPhaseRaw = 1 - phaseValue("bigGalaxyFadeOut", p);
  const hideBigForClusters = 1 - clustersPhase; // اخفاء في العناقيد
  const bigGalaxyPhase = bigGalaxyPhaseRaw * hideBigForClusters;

  if (bigGalaxyPhase > 0.02) {
    const gcx = width * 0.5;
    const gcy = height * 0.45;
    const maxR = Math.max(width, height) * 0.55;

    const g = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, maxR);
    // إضاءة أهدى في البداية
    g.addColorStop(0, `rgba(255,235,210,${0.55 * bigGalaxyPhase})`);
    g.addColorStop(0.25, `rgba(255,215,180,${0.45 * bigGalaxyPhase})`);
    g.addColorStop(0.55, `rgba(110,160,255,${0.35 * bigGalaxyPhase})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gcx, gcy, maxR, maxR * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // أذرع بسيطة للمجرة الكبيرة
    ctx.save();
    ctx.translate(gcx, gcy);
    ctx.rotate(STATE.time * 0.03);
    ctx.globalAlpha = 0.4 * bigGalaxyPhase;
    ctx.strokeStyle = "rgba(150,200,255,0.9)";
    ctx.lineWidth = 1;
    const armsCountBG = 4;
    const stepsBG = 28;
    for (let arm = 0; arm < armsCountBG; arm++) {
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= stepsBG; i++) {
        const t = i / stepsBG;
        const theta = arm * ((2 * Math.PI) / armsCountBG) + t * 3.1;
        const rr = maxR * 0.15 + t * maxR * 0.7;
        const x = Math.cos(theta) * rr;
        const y = Math.sin(theta) * rr * 0.6;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // خلفية حبيبات المجرة
  const baseFieldAlpha = 0.12; // أهدى من قبل
  const farGalVis = 1 - intoMilky; // تختفي أثناء الدخول
  const dustFade = 1 - dustPhase; // يغطيها الغبار
  const solarFade = 1 - solarPhase; // تختفي مع وضوح النظام الشمسي
  const alphaField =
    baseFieldAlpha *
    farGalVis *
    dustFade *
    solarFade *
    (0.4 + 0.6 * bigGalaxyPhase);

  ctx.globalAlpha = alphaField;
  STATIC_FIELDS.galaxyParticles.forEach((gp) => {
    ctx.beginPath();
    ctx.globalAlpha = alphaField * gp.alpha;
    ctx.fillStyle = gp.y < height * 0.5 ? "#8fe2ff" : "#d0b0ff";
    ctx.arc(gp.x, gp.y, gp.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // صخور/كويكبات حول المجرات
  const rockPhase = (1 - solarPhase) * (1 - smoothStep(0.65, 0.9, p));
  if (rockPhase > 0.01) {
    const cx = width / 2;
    const cy = height / 2;
    ctx.globalAlpha = 0.4 * rockPhase * (1 - dustPhase * 0.4);
    STATIC_FIELDS.rocks.forEach((r) => {
      const radius =
        Math.min(width, height) * (0.18 + r.baseRadiusNorm * 0.35);
      const ang =
        r.baseAngle +
        STATE.time * r.orbitSpeed +
        Math.sin(STATE.time * 0.4 + r.wobble) * 0.12;
      const x = cx + Math.cos(ang) * radius * 1.2;
      const y = cy + Math.sin(ang) * radius * 0.7;

      // جسم صخري بسيط
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + r.wobble);
      const w = r.size;
      const h = r.size * 0.7;
      const rockGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      rockGrad.addColorStop(0, "rgba(230,230,235,0.95)");
      rockGrad.addColorStop(0.5, "rgba(160,160,175,0.85)");
      rockGrad.addColorStop(1, "rgba(20,20,30,0.9)");
      ctx.fillStyle = rockGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      CURRENT_FRAME_OBJECTS.push({
        kind: "rock",
        id: "rock-" + r.baseAngle + "-" + r.baseRadiusNorm,
        ref: {
          name: {
            en: "Asteroid",
            ar: "كويكب",
          },
          type: "Asteroid",
        },
        x,
        y,
        radius: w + 4,
      });
    });
  }

  ctx.restore();

  // مجرات مسماة
  GALAXIES.forEach((g, index) => {
    const isMilky = g.id === "milkyway";

    const angle = (index / GALAXIES.length) * Math.PI * 2;
    const baseCx = width * (0.25 + index * 0.3);
    const baseCy = height * 0.36 + Math.sin(angle) * 60;

    const baseSize = 48 + index * 16;
    let cx = baseCx;
    let cy = baseCy;
    let size = baseSize;

    // تحريك درب التبانة إلى المركز وتكبيرها
    if (isMilky) {
      const targetCx = width * 0.5;
      const targetCy = height * 0.5;
      cx = lerp(baseCx, targetCx, intoMilky);
      cy = lerp(baseCy, targetCy, intoMilky);
      const maxScale = 3.5;
      size = baseSize * (1 + intoMilky * maxScale);
    }

    const rot = STATE.time * 0.05 * (index % 2 ? 1 : -1);

    let focusAlpha;
    if (isMilky) {
      const appear = smoothStep(0.03, 0.22, p);
      const stay = 1 - afterMilky;
      const noSolar = 1 - solarPhase;
      // تبقى مرئية في مرحلة العناقيد
      focusAlpha = (0.35 + 0.65 * appear) * stay * noSolar;
    } else {
      const appear = smoothStep(0.0 + index * 0.05, 0.25 + index * 0.05, p);
      const vanishIntoMilky = 1 - intoMilky;
      const hideForClusters = 1 - smoothStep(0.25, 0.4, p); // إخفاء المجرات غير درب التبانة في العناقيد
      focusAlpha =
        (0.25 + 0.7 * appear) *
        vanishIntoMilky *
        hideForClusters *
        (1 - dustPhase) *
        (1 - solarPhase);
    }

    if (focusAlpha <= 0.01) return;

    const ctx2 = ctxGalaxies;
    if (!ctx2) return;

    ctx2.save();
    ctx2.translate(cx, cy);
    ctx2.rotate(rot);
    ctx2.globalAlpha = focusAlpha;

    let coreColor = "rgba(255,255,255,0.98)";
    let midColor = "rgba(255,240,210,0.9)";
    let armColor = "rgba(160,200,255,0.7)";
    if (g.id === "andromeda") {
      coreColor = "rgba(255,255,255,0.98)";
      midColor = "rgba(220,230,255,0.9)";
      armColor = "rgba(140,190,255,0.8)";
    } else if (g.id === "whirlpool") {
      coreColor = "rgba(255,255,255,0.98)";
      midColor = "rgba(255,220,220,0.9)";
      armColor = "rgba(255,170,200,0.8)";
    }

    const grad = ctx2.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, coreColor);
    grad.addColorStop(0.25, midColor);
    grad.addColorStop(0.55, armColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx2.fillStyle = grad;
    ctx2.beginPath();
    ctx2.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
    ctx2.fill();

    ctx2.globalAlpha *= isMilky ? 0.8 : 0.7;
    ctx2.lineWidth = isMilky ? 1.2 : 1;
    const armsCount = isMilky ? 4 : 3;
    const steps = isMilky ? 26 : 18;
    for (let arm = 0; arm < armsCount; arm++) {
      ctx2.beginPath();
      let first = true;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = arm * ((2 * Math.PI) / armsCount) + t * 2.9;
        const rr = size * 0.25 + t * size * 0.7;
        const x = Math.cos(theta) * rr;
        const y = Math.sin(theta) * rr * 0.5;
        if (first) {
          ctx2.moveTo(x, y);
          first = false;
        } else {
          ctx2.lineTo(x, y);
        }
      }
      ctx2.strokeStyle = armColor;
      ctx2.stroke();
    }

    ctx2.restore();

    CURRENT_FRAME_OBJECTS.push({
      kind: "galaxy",
      id: g.id,
      ref: g,
      x: cx,
      y: cy,
      radius: isMilky ? size * 0.5 : size * 0.6,
    });
  });

  // star clusters
  STAR_CLUSTERS.forEach((c, idx) => {
    const cx = width * (0.3 + idx * 0.4);
    const cy = height * 0.68;
    const size = 24;

    const ctx2 = ctxGalaxies;
    if (!ctx2) return;

    ctx2.save();
    const vis =
      smoothStep(0.25, 0.6, p) * (1 - smoothStep(0.75, 0.95, p));
    ctx2.globalAlpha = vis;
    const grad = ctx2.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(126,248,255,0.7)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx2.translate(cx, cy);
    ctx2.fillStyle = grad;
    ctx2.beginPath();
    ctx2.arc(0, 0, size, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.restore();

    CURRENT_FRAME_OBJECTS.push({
      kind: "cluster",
      id: c.id,
      ref: c,
      x: cx,
      y: cy,
      radius: size,
    });
  });
}

/* Solar system + deep black hole + constellations --------------------- */

function renderSolarAndDeep(ctx, width, height) {
  if (!ctx) return;

  const progress = STATE.scrollProgress;

  const centerX = width / 2;
  const centerY =
    height / 2 +
    (1 - smoothStep(0.35, 0.7, progress)) * 70;

  const scrollAngle = progress * Math.PI * 4;
  const t = STATE.time + scrollAngle * 0.5;

  const solarAppear = smoothStep(0.55, 0.9, progress);
  const solarFarPhase = smoothStep(0.45, 0.62, progress);
  const solarScale = lerp(0.35, 1.0, solarAppear);
  const orbitsEmphasis = smoothStep(0.8, 1.0, progress);

  const sunAlpha = smoothStep(0.52, 0.75, progress);
  if (sunAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = sunAlpha;
    const sunRadius = 36 * (0.7 + solarScale * 0.5); // حجم شمس جديد
    drawSun(ctx, centerX, centerY, sunRadius);
    ctx.restore();

    CURRENT_FRAME_OBJECTS.push({
      kind: "sun",
      id: "sun",
      ref: {
        name: { en: "Sun", ar: "الشمس" },
        type: "Sun",
      },
      x: centerX,
      y: centerY,
      radius: sunRadius * 1.4,
    });
  }

  const zoom = 0.95 * solarScale;
  const baseOrbit = 100 * solarScale; // توسعة بسيطة للمدارات
  const orbitSpread = 180 * zoom;

  PLANETS.forEach((planet, index) => {
    const orbitRadius = baseOrbit + planet.orbitRadiusNorm * orbitSpread;

    const orbitAlpha = solarAppear * (0.3 + orbitsEmphasis * 0.7);

    if (orbitAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = orbitAlpha;
      ctx.strokeStyle = "rgba(230,240,255,0.28)";
      ctx.lineWidth = 0.9 + orbitsEmphasis * 0.4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, orbitRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const baseSpeed = 0.35 + index * 0.16;
    const theta = t * baseSpeed + index * Math.PI * 0.7;
    const px = centerX + orbitRadius * Math.cos(theta);
    const py = centerY + orbitRadius * Math.sin(theta);

    const sizeNorm = Math.sqrt(planet.radius_km) / Math.sqrt(69911);
    const rawRadius = 7 + sizeNorm * 13;
    const radius = rawRadius * (0.4 + solarAppear * 0.8);

    const visibility = solarAppear;

    if (visibility > 0) {
      ctx.save();
      ctx.globalAlpha = visibility * (0.4 + (1 - solarFarPhase) * 0.6);
      drawPlanet(
        ctx,
        px,
        py,
        radius,
        planet.textureParams,
        planet.ui.accent
      );
      if (planet.textureParams.rings) {
        drawRings(ctx, px, py, radius, planet.ui.accent);
      }
      ctx.restore();

      CURRENT_FRAME_OBJECTS.push({
        kind: "planet",
        id: planet.id,
        ref: planet,
        x: px,
        y: py,
        radius: radius + 6,
      });

      // Moons
      const moons = MOONS.filter((m) => m.planetId === planet.id);
      moons.forEach((moon, midx) => {
        const rMoon = radius * 0.32;
        const moonOrbit = radius * (1.6 + midx * 0.6);
        const mSpeed = 1.1 + midx * 0.5;
        const mTheta = -t * mSpeed + midx * 1.2;
        const mx = px + moonOrbit * Math.cos(mTheta);
        const my = py + moonOrbit * Math.sin(mTheta);

        ctx.save();
        ctx.globalAlpha = visibility * (0.25 + orbitsEmphasis * 0.5);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(230,240,255,0.25)";
        ctx.lineWidth = 0.6 + orbitsEmphasis * 0.2;
        ctx.beginPath();
        ctx.arc(px, py, moonOrbit, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = visibility;
        drawPlanet(
          ctx,
          mx,
          my,
          rMoon,
          { baseColor: "#cfd5dd", specular: 0.15, style: "rocky" },
          planet.ui.accent
        );
        ctx.restore();

        CURRENT_FRAME_OBJECTS.push({
          kind: "moon",
          id: moon.id,
          ref: moon,
          x: mx,
          y: my,
          radius: rMoon + 4,
        });
      });
    }
  });

  // Constellations
  const constAlpha = smoothStep(0.65, 0.98, progress);
  CONSTELLATIONS.forEach((c, idx) => {
    const cx = width * (0.25 + idx * 0.34);
    const cy = height * 0.18;
    const scale = Math.min(width, height) * 0.16;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = constAlpha * 0.9;

    // Lines
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(126,248,255,0.8)";
    ctx.beginPath();
    c.lines.forEach(([a, b]) => {
      const sa = c.stars[a];
      const sb = c.stars[b];
      const x1 = sa.x * scale;
      const y1 = sa.y * scale;
      const x2 = sb.x * scale;
      const y2 = sb.y * scale;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
    ctx.stroke();

    // Stars
    c.stars.forEach((s) => {
      const sx = s.x * scale;
      const sy = s.y * scale;
      const r = 4;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.3);
      grad.addColorStop(0, "rgba(200,255,255,1)");
      grad.addColorStop(0.4, "rgba(126,248,255,0.8)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 2.3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    CURRENT_FRAME_OBJECTS.push({
      kind: "constellation",
      id: c.id,
      ref: c,
      x: cx,
      y: cy,
      radius: scale * 0.7,
    });
  });

  // Black hole في النهاية (deep space)
  const deepAlpha = smoothStep(0.82, 0.97, progress);
  if (deepAlpha > 0) {
    const bh = BLACK_HOLES[0];
    const bhX = width * 0.8;
    const bhY = height * 0.35;
    renderBlackHole(ctx, bhX, bhY, 110, deepAlpha);

    CURRENT_FRAME_OBJECTS.push({
      kind: "blackhole",
      id: bh.id,
      ref: bh,
      x: bhX,
      y: bhY,
      radius: 130,
    });
  }
}

/* Drawing helpers ------------------------------------------------------ */

function drawSun(ctx, x, y, radius) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
  glow.addColorStop(0, "rgba(255, 245, 220, 1)");
  glow.addColorStop(0.4, "rgba(255, 210, 120, 0.95)");
  glow.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(x, y, 0, x, y, radius);
  core.addColorStop(0, "#fffef3");
  core.addColorStop(0.4, "#ffe19c");
  core.addColorStop(1, "#ffb347");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // small surface turbulence
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + STATE.time * 0.25;
    const r1 = radius * 0.5;
    const r2 = radius * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, lerp(r1, r2, (Math.sin(a * 2) + 1) / 2), a, a + 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRings(ctx, x, y, radius, accent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  const inner = radius * 1.4;
  const outer = radius * 2.2;
  const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  grad.addColorStop(0, "rgba(255,255,255,0.1)");
  grad.addColorStop(0.5, "rgba(240,220,180,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = radius * 0.7;
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    (inner + outer) / 2,
    ((inner + outer) / 2) * 0.45,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();
}

function drawPlanet(ctx, x, y, radius, params = {}, accent = "#5ee7e6") {
  const baseColor = params.baseColor || "#777";
  const specular = params.specular ?? 0.2;
  const style = params.style || "default";
  const angle = STATE.time * 0.4;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  const baseGrad = ctx.createRadialGradient(
    x - radius * 0.4,
    y - radius * 0.4,
    radius * 0.2,
    x,
    y,
    radius
  );
  baseGrad.addColorStop(0, baseColor);
  baseGrad.addColorStop(1, "#050510");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  if (style === "earthLike") {
    const landColor = params.landColor || "#3faf62";
    const iceColor = params.iceColor || "#f7fbff";
    const cloudColor = params.cloudColor || "rgba(255,255,255,0.6)";

    ctx.fillStyle = landColor;
    for (let i = 0; i < 3; i++) {
      const a = angle * 0.6 + i * 2.1;
      const cxL = x + Math.cos(a) * radius * 0.4;
      const cyL = y + Math.sin(a) * radius * 0.2;
      ctx.beginPath();
      ctx.ellipse(
        cxL,
        cyL,
        radius * 0.35,
        radius * 0.2,
        a * 0.4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.fillStyle = iceColor;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y - radius * 0.65,
      radius * 0.5,
      radius * 0.25,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + radius * 0.65,
      radius * 0.5,
      radius * 0.25,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = cloudColor;
    ctx.lineWidth = radius * 0.08;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
      const a = angle * 0.8 + i;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(a) * radius * 0.15,
        y + Math.sin(a) * radius * 0.1,
        radius * (0.6 + i * 0.07),
        a - 0.7,
        a + 0.7
      );
      ctx.stroke();
    }
  } else if (style === "gasGiant" || style === "iceGiant") {
    const bands = params.bands || [];
    const n = bands.length || 6;
    const stripeHeight = (2 * radius) / n;
    for (let i = 0; i < n; i++) {
      const yy = y - radius + stripeHeight * i;
      ctx.globalAlpha = style === "gasGiant" ? 0.9 : 0.8;
      ctx.fillStyle = bands[i] || baseColor;
      ctx.fillRect(x - radius, yy, radius * 2, stripeHeight + 1);
    }

    if (params.spotColor && style === "gasGiant") {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = params.spotColor;
      ctx.beginPath();
      ctx.ellipse(
        x + radius * 0.2,
        y + radius * 0.15,
        radius * 0.35,
        radius * 0.22,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else if (style === "rocky" || style === "rockyRed") {
    const patchColor = params.patchColor || "#6b6b6b";
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 4; i++) {
      const a = angle * 0.5 + i * 1.5;
      const cxP = x + Math.cos(a) * radius * 0.4;
      const cyP = y + Math.sin(a) * radius * 0.3;
      ctx.fillStyle = patchColor;
      ctx.beginPath();
      ctx.ellipse(
        cxP,
        cyP,
        radius * (0.25 + 0.08 * Math.random()),
        radius * (0.18 + 0.05 * Math.random()),
        a,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else if (style === "cloudy") {
    const cloudColor = params.cloudColor || "#f5deb5";
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = cloudColor;
    for (let i = 0; i < 5; i++) {
      const a = angle * 0.5 + i * 0.9;
      const cxC = x + Math.cos(a) * radius * 0.1;
      const cyC = y + Math.sin(a) * radius * 0.1;
      ctx.beginPath();
      ctx.ellipse(
        cxC,
        cyC,
        radius * 0.6,
        radius * 0.18,
        a,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  ctx.restore();

  const highlight = ctx.createLinearGradient(
    x - radius,
    y - radius,
    x + radius,
    y + radius
  );
  highlight.addColorStop(
    0,
    `rgba(255,255,255,${0.18 + specular * 0.3})`
  );
  highlight.addColorStop(0.5, "rgba(255,255,255,0)");
  highlight.addColorStop(1, `rgba(0,0,0,${0.45 + specular * 0.4})`);

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.arc(
    x + Math.cos(angle) * radius * 0.45,
    y + Math.sin(angle) * radius * 0.2,
    radius * 0.23,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = accent || "#5ee7e6";
  ctx.fill();
  ctx.restore();
}

function renderBlackHole(ctx, cx, cy, baseRadius, fade) {
  const rInner = baseRadius * 0.3;
  const rOuter = baseRadius;

  ctx.save();
  ctx.globalAlpha = fade;

  const g = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
  g.addColorStop(0, "#000000");
  g.addColorStop(0.4, "#000000");
  g.addColorStop(0.6, "rgba(255,255,255,0.12)");
  g.addColorStop(0.8, "rgba(126,248,255,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = fade * 0.5;
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + STATE.time * 0.25;
    const r1 = rOuter + 16;
    const r2 = rOuter + 65;
    const x1 = cx + r1 * Math.cos(angle);
    const y1 = cy + r1 * Math.sin(angle);
    const x2 = cx + r2 * Math.cos(angle + 0.1);
    const y2 = cy + r2 * Math.sin(angle + 0.1);

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, "rgba(94,231,230,0)");
    grad.addColorStop(1, "rgba(214,107,255,0.55)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

/* --------------------------------------------------------------------- */
/* INTERACTION: hit test + info card                                     */
/* --------------------------------------------------------------------- */

function handleScenePointerDown(e) {
  const rect = canvasForeground.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  let hit = null;
  for (const obj of CURRENT_FRAME_OBJECTS) {
    const dx = x - obj.x;
    const dy = y - obj.y;
    if (Math.sqrt(dx * dx + dy * dy) <= (obj.radius || 20)) {
      hit = obj;
      break;
    }
  }
  if (hit) openObjectInfo(hit);
}

function handleSceneDoubleClick(e) {
  const rect = canvasForeground.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  let hit = null;
  for (const obj of CURRENT_FRAME_OBJECTS) {
    const dx = x - obj.x;
    const dy = y - obj.y;
    if (Math.sqrt(dx * dx + dy * dy) <= (obj.radius || 20)) {
      hit = obj;
      break;
    }
  }
  if (hit) {
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const targetProgress =
      hit.kind === "blackhole"
        ? 0.95
        : hit.kind === "planet" || hit.kind === "sun"
        ? 0.65
        : hit.kind === "cluster" || hit.kind === "constellation"
        ? 0.45
        : 0.3;
    const targetY = targetProgress * maxScroll;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  }
}

function openObjectInfo(obj) {
  if (!planetInfoEl) return;
  STATE.activeObject = obj;
  planetInfoEl.classList.remove("info-card--hidden");

  const dict = I18N[STATE.lang];
  const titleEl = document.getElementById("planet-info-title");
  const subtitleEl = document.getElementById("planet-info-subtitle");

  let nameEn = "";
  let nameAr = "";
  let kindLabel = "";

  if (obj.kind === "planet") {
    const p = obj.ref;
    nameEn = p.name.en;
    nameAr = p.name.ar;
    kindLabel = dict.objectPlanet;
  } else if (obj.kind === "moon") {
    const m = obj.ref;
    nameEn = m.name.en;
    nameAr = m.name.ar;
    kindLabel = dict.objectMoon;
  } else if (obj.kind === "sun") {
    nameEn = "Sun";
    nameAr = "الشمس";
    kindLabel = dict.objectSun;
  } else if (obj.kind === "galaxy") {
    nameEn = obj.ref.name.en;
    nameAr = obj.ref.name.ar;
    kindLabel = dict.objectGalaxy;
  } else if (obj.kind === "cluster") {
    nameEn = obj.ref.name.en;
    nameAr = obj.ref.name.ar;
    kindLabel = dict.objectCluster;
  } else if (obj.kind === "blackhole") {
    nameEn = obj.ref.name.en;
    nameAr = obj.ref.name.ar;
    kindLabel = dict.objectBlackHole;
  } else if (obj.kind === "constellation") {
    nameEn = obj.ref.name.en;
    nameAr = obj.ref.name.ar;
    kindLabel = dict.objectConstellation;
  } else if (obj.kind === "star") {
    nameEn = "Star";
    nameAr = "نجم";
    kindLabel = dict.objectStar;
  } else if (obj.kind === "meteor") {
    nameEn = obj.ref?.name?.en || "Meteor";
    nameAr = obj.ref?.name?.ar || "شهاب";
    kindLabel = dict.objectMeteor;
  } else if (obj.kind === "rock") {
    nameEn = obj.ref?.name?.en || "Asteroid";
    nameAr = obj.ref?.name?.ar || "كويكب";
    kindLabel = dict.objectAsteroid;
  }

  if (titleEl)
    titleEl.textContent =
      STATE.lang === "ar" ? nameAr || nameEn : nameEn || nameAr;
  if (subtitleEl)
    subtitleEl.textContent =
      STATE.lang === "ar"
        ? (nameEn || "") + " · " + kindLabel
        : (nameAr || "") + " · " + kindLabel;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  let typeText = kindLabel;
  let distanceText = "—";
  let radiusText = "—";
  let massText = "—";
  let orbitText = "—";
  let rotationText = "—";
  let atmText = "—";
  let discText = "—";

  if (obj.kind === "planet") {
    const p = obj.ref;
    typeText = p.type;
    distanceText = p.distance_from_sun_km.toLocaleString() + " km";
    radiusText = p.radius_km.toLocaleString() + " km";
    massText = p.mass_kg.toExponential(3) + " kg";
    orbitText = p.orbital_period_days.toLocaleString() + " days";
    rotationText = p.rotation_period_hours.toLocaleString() + " h";
    atmText = p.atmosphere || "—";
    discText = p.discovery || "—";
  } else if (obj.kind === "moon") {
    const m = obj.ref;
    typeText = m.type;
    distanceText = m.distance_km.toLocaleString() + " km";
    radiusText = m.radius_km.toLocaleString() + " km";
    orbitText = m.orbital_period_days.toLocaleString() + " days";
  } else if (obj.kind === "sun") {
    typeText = dict.objectSun;
    distanceText = "0 km";
    radiusText = "696,340 km";
    massText = "1.989e30 kg";
    atmText = "Hydrogen & Helium plasma";
  } else if (obj.kind === "galaxy") {
    const g = obj.ref;
    typeText = dict.objectGalaxy;
    distanceText = g.distance_ly
      ? g.distance_ly.toLocaleString() + " ly"
      : "—";
  } else if (obj.kind === "cluster") {
    const c = obj.ref;
    typeText = dict.objectCluster;
    distanceText = c.distance_ly
      ? c.distance_ly.toLocaleString() + " ly"
      : "—";
  } else if (obj.kind === "blackhole") {
    const b = obj.ref;
    typeText = dict.objectBlackHole;
    distanceText = b.distance_ly
      ? b.distance_ly.toLocaleString() + " ly"
      : "—";
  } else if (obj.kind === "constellation") {
    const c = obj.ref;
    typeText = dict.objectConstellation;
    distanceText = "—";
    discText =
      STATE.lang === "ar"
        ? "مجموعة نجوم تُرى بوضوح من الأرض."
        : "A pattern of bright stars visible from Earth.";
  } else if (obj.kind === "star") {
    typeText = dict.objectStar;
    distanceText =
      STATE.lang === "ar"
        ? "نجم عادي في مجرتنا"
        : "Typical star in our galaxy";
    atmText =
      STATE.lang === "ar"
        ? "بلازما من الهيدروجين والهيليوم"
        : "Plasma of hydrogen & helium";
  } else if (obj.kind === "meteor") {
    typeText = dict.objectMeteor;
    const style =
      obj.ref && typeof obj.ref.style === "number" ? obj.ref.style : 0;
    if (style === 0) {
      distanceText =
        STATE.lang === "ar"
          ? "شهاب أزرق نحيف وسريع"
          : "Fast blue streak meteor";
      discText =
        STATE.lang === "ar"
          ? "ذيل طويل رفيع يلمع باللون الأزرق."
          : "Long thin blue tail with bright head.";
    } else if (style === 1) {
      distanceText =
        STATE.lang === "ar"
          ? "شهاب برتقالي بنار مشتعلة"
          : "Fiery orange meteor with burning tail";
      discText =
        STATE.lang === "ar"
          ? "ذيل برتقالي سميك يشبه لهب النار."
          : "Thick orange trail that looks like fire.";
    } else {
      distanceText =
        STATE.lang === "ar"
          ? "نبضة ضوئية قصيرة جداً"
          : "Very short bright light flash";
      discText =
        STATE.lang === "ar"
          ? "وميض سريع يختفي خلال لحظة."
          : "A quick flash that disappears in a moment.";
    }
  } else if (obj.kind === "rock") {
    typeText = dict.objectAsteroid;
    distanceText =
      STATE.lang === "ar"
        ? "صخور صغيرة تدور حول المجرات."
        : "Small rocky bodies orbiting near galaxies.";
    radiusText =
      STATE.lang === "ar"
        ? "حجم تقريبي من بضعة كيلومترات."
        : "Estimated size of a few km.";
    discText =
      STATE.lang === "ar"
        ? "كويكبات متفرقة تشكّل حزاماً صخرياً غير منتظم."
        : "Scattered asteroids forming a loose rocky belt.";
  }

  set("planet-type", typeText);
  set("planet-distance", distanceText);
  set("planet-radius", radiusText);
  set("planet-mass", massText);
  set("planet-orbit", orbitText);
  set("planet-rotation", rotationText);
  set("planet-atmosphere", atmText);
  set("planet-discovery", discText);

  // قائمة الأقمار
  const moonsListEl = document.getElementById("planet-moons-list");
  const moonsTitleWrapper = document.getElementById("planet-moons-wrapper");
  if (moonsListEl && moonsTitleWrapper) {
    moonsListEl.innerHTML = "";
    if (obj.kind === "planet") {
      const moons = MOONS.filter((m) => m.planetId === obj.id);
      if (moons.length) {
        moonsTitleWrapper.style.display = "block";
        moons.forEach((m) => {
          const li = document.createElement("li");
          li.textContent =
            STATE.lang === "ar"
              ? m.name.ar || m.name.en
              : m.name.en || m.name.ar;
          moonsListEl.appendChild(li);
        });
      } else {
        moonsTitleWrapper.style.display = "none";
      }
    } else {
      moonsTitleWrapper.style.display = "none";
    }
  }

  try {
    const url = new URL(window.location.href);
    if (obj.kind === "planet") url.searchParams.set("planet", obj.id);
    else url.searchParams.delete("planet");
    history.replaceState(null, "", url.toString());
  } catch (_) {}

  drawPreviewForObject(obj);
}

function closeInfoCard() {
  if (!planetInfoEl) return;
  STATE.activeObject = null;
  planetInfoEl.classList.add("info-card--hidden");

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("planet");
    history.replaceState(null, "", url.toString());
  } catch (_) {}
}

/* Preview (rotating 3D-ish object) ------------------------------------ */

function renderPreviewIfAny() {
  if (!STATE.activeObject) return;
  drawPreviewForObject(STATE.activeObject);
}

function drawPreviewForObject(obj) {
  if (!planetPreviewCanvas || !planetPreviewCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = planetPreviewCanvas.width / dpr;
  const height = planetPreviewCanvas.height / dpr;

  const ctx = planetPreviewCtx;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.32;

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
  bg.addColorStop(0, "rgba(20,20,45,1)");
  bg.addColorStop(1, "rgba(3,3,10,1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (obj.kind === "planet" || obj.kind === "moon" || obj.kind === "sun") {
    const params =
      obj.kind === "planet"
        ? obj.ref.textureParams
        : obj.kind === "sun"
        ? { baseColor: "#ffdd7a", specular: 0.35, style: "cloudy" }
        : { baseColor: "#cfd5dd", specular: 0.15, style: "rocky" };
    const accent =
      obj.kind === "planet"
        ? obj.ref.ui.accent
        : obj.kind === "sun"
        ? "#ffd27a"
        : "#ffffff";
    drawPlanet(ctx, cx, cy, r, params, accent);
    if (obj.kind === "planet" && obj.ref.textureParams.rings) {
      drawRings(ctx, cx, cy, r, accent);
    }
  } else if (obj.kind === "galaxy" || obj.kind === "cluster") {
    ctx.save();
    ctx.translate(cx, cy);
    const angle = STATE.time * 0.2;
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.4, "rgba(126,248,255,0.6)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    if (obj.kind === "galaxy") {
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (obj.kind === "blackhole") {
    renderBlackHole(ctx, cx, cy, r * 1.2, 1);
  } else if (obj.kind === "star") {
    drawPlanet(
      ctx,
      cx,
      cy,
      r * 0.7,
      { baseColor: "#f8f6ff", specular: 0.4, style: "cloudy" },
      "#fff"
    );
  } else if (obj.kind === "meteor") {
    const style =
      obj.ref && typeof obj.ref.style === "number" ? obj.ref.style : 0;
    ctx.save();
    ctx.translate(cx, cy);
    if (style === 0) {
      const len = r * 1.3;
      const grad = ctx.createLinearGradient(
        -len * 0.7,
        -len * 0.6,
        len * 0.3,
        len * 0.4
      );
      grad.addColorStop(0, "rgba(126,248,255,0)");
      grad.addColorStop(0.4, "rgba(126,248,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-len * 0.7, -len * 0.6);
      ctx.lineTo(len * 0.3, len * 0.4);
      ctx.stroke();
    } else if (style === 1) {
      const len = r * 1.3;
      const grad = ctx.createLinearGradient(
        -len * 0.6,
        -len * 0.2,
        len * 0.2,
        len * 0.3
      );
      grad.addColorStop(0, "rgba(255,180,80,0)");
      grad.addColorStop(0.3, "rgba(255,190,110,0.8)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-len * 0.6, -len * 0.2);
      ctx.lineTo(len * 0.2, len * 0.3);
      ctx.stroke();
    } else {
      const len = r * 0.8;
      const grad = ctx.createLinearGradient(
        -len * 0.4,
        -len * 0.4,
        len * 0.1,
        len * 0.1
      );
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(200,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-len * 0.4, -len * 0.4);
      ctx.lineTo(len * 0.1, len * 0.1);
      ctx.stroke();

      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.28);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.5, "rgba(200,255,255,0.95)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (obj.kind === "constellation") {
    const c = obj.ref;
    const scale = Math.min(width, height) * 0.25;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 1;

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(126,248,255,0.8)";
    ctx.beginPath();
    c.lines.forEach(([a, b]) => {
      const sa = c.stars[a];
      const sb = c.stars[b];
      const x1 = sa.x * scale;
      const y1 = sa.y * scale;
      const x2 = sb.x * scale;
      const y2 = sb.y * scale;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
    ctx.stroke();

    c.stars.forEach((s) => {
      const sx = s.x * scale;
      const sy = s.y * scale;
      const rStar = 4;
      const grad2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, rStar * 2.5);
      grad2.addColorStop(0, "rgba(200,255,255,1)");
      grad2.addColorStop(0.4, "rgba(126,248,255,0.8)");
      grad2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(sx, sy, rStar * 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  } else if (obj.kind === "rock") {
    // preview بسيط للكويكب
    ctx.save();
    ctx.translate(cx, cy);
    const w = r * 0.6;
    const h = r * 0.4;
    const rockGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
    rockGrad.addColorStop(0, "rgba(230,230,235,0.95)");
    rockGrad.addColorStop(0.5, "rgba(160,160,175,0.85)");
    rockGrad.addColorStop(1, "rgba(20,20,30,0.9)");
    ctx.fillStyle = rockGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
