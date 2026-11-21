/* NULLS RUN — unofficial fan game. No wallet, no signup. */
(() => {
  "use strict";

  const LS_BEST = "nulls-run-best";
  const LS_MUTE = "nulls-run-mute";
  const LS_CHAR = "nulls-run-char";
  const PX_M = 36;

  const CHARS = [
    { id: 0, file: "assets/char1.png", name: "LEGION DRAGON", short: "LEGION", accent: "#4aa3ff", waist: 0.56 },
    { id: 1, file: "assets/char2.png", name: "BASE NULL", short: "BASE", accent: "#f07a3a", waist: 0.52 },
    { id: 2, file: "assets/char3.png", name: "GOGGLES", short: "GOGGLES", accent: "#f06aa0", waist: 0.50 },
    { id: 3, file: "assets/char4.png", name: "RAINBOW VISOR", short: "RAINBOW", accent: "#b8e04a", waist: 0.52 },
    { id: 4, file: "assets/char5.png", name: "HEADPHONES", short: "HEADPHONES", accent: "#4d7cff", waist: 0.50 },
  ];

  const ASSET_URLS = [
    ...CHARS.map((c) => c.file),
    "assets/billboard1.jpg",
    "assets/billboard2.jpg",
    "assets/billboard3.jpg",
    "assets/card.png",
    "assets/card_red.png",
    "assets/card_blue.png",
    "assets/card_pink.png",
    "assets/card_purple.png",
    "assets/card_yellow.png",
    "assets/tv.png",
    "assets/cart.png",
    "assets/tama.png",
    "assets/snack.png",
    "assets/console.png",
    "assets/wordmark.png",
    "assets/bomb.png",
  ];

  const GRAV = 2650;
  const JUMP_V = 990;
  const SLIDE_T = 0.50;
  const VAULT_T = 0.36;
  const CLIMB_T = 0.34;
  const STUMBLE_T = 0.46;
  const COYOTE = 0.10;
  const JUMP_BUF = 0.13;
  const SPEED0 = 430;
  const SPEED_MAX = 960;
  const HIT_W = 44;
  const HIT_H = 108;
  const SLIDE_H = 46;
  const DRAW_H = 152;

  const $ = (id) => document.getElementById(id);
  const canvas = $("cv");
  const ctx = canvas.getContext("2d", { alpha: false });

  const images = {};
  let selected = 0;
  let muted = localStorage.getItem(LS_MUTE) === "1";
  let best = parseInt(localStorage.getItem(LS_BEST) || "0", 10) || 0;

  /* ---------------- audio ---------------- */
  let ac = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let musicOn = false;

  function ensureAudio() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    sfxGain = ac.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(master);
  }
  function setMuted(m) {
    muted = m;
    localStorage.setItem(LS_MUTE, m ? "1" : "0");
    if (master) master.gain.value = m ? 0 : 0.7;
    $("btnMute").classList.toggle("off", m);
  }
  function envGain(g, t, a, h, d, vol) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + a + h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + d);
  }
  function beep(freq, dur, type, vol, slide) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    envGain(g, t, 0.01, 0.02, dur, vol || 0.2);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noiseBurst(dur, vol, hp) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const n = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = n;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp || 800;
    const g = ac.createGain();
    envGain(g, t, 0.005, 0.01, dur, vol || 0.2);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  const sfx = {
    jump: () => beep(420, 0.12, "square", 0.16, 680),
    land: () => {
      beep(120, 0.08, "triangle", 0.18, 60);
      noiseBurst(0.06, 0.08, 200);
    },
    slide: () => noiseBurst(0.18, 0.12, 400),
    vault: () => beep(520, 0.16, "square", 0.15, 820),
    climb: () => beep(300, 0.2, "triangle", 0.16, 520),
    collect: () => {
      beep(880, 0.08, "square", 0.14);
      setTimeout(() => beep(1320, 0.1, "square", 0.12), 50);
    },
    stumble: () => {
      noiseBurst(0.2, 0.25, 200);
      beep(180, 0.2, "sawtooth", 0.2, 60);
    },
    death: () => {
      noiseBurst(0.7, 0.35, 100);
      beep(200, 0.55, "sawtooth", 0.22, 40);
    },
    ui: () => beep(660, 0.05, "square", 0.1),
    warn: () => beep(240, 0.15, "square", 0.12, 140),
  };

  function startMusic() {
    if (!ac || musicOn) return;
    musicOn = true;
    const tempo = 108;
    const beat = 60 / tempo;
    let step = 0;
    const bass = [36, 36, 39, 36, 31, 31, 34, 36];
    const lead = [0, 63, 0, 67, 0, 63, 70, 67, 0, 63, 0, 58, 0, 55, 58, 63];
    function tick() {
      if (!musicOn || !ac) return;
      const t = ac.currentTime + 0.03;
      const i = step % 8;
      const bi = bass[i];
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sawtooth";
      o.frequency.value = 27.5 * Math.pow(2, (bi - 9) / 12); // around A1+
      envGain(g, t, 0.01, 0.05, beat * 0.7, 0.55);
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      o.connect(f);
      f.connect(g);
      g.connect(musicGain);
      o.start(t);
      o.stop(t + beat);
      // kick
      if (i % 2 === 0) {
        const k = ac.createOscillator();
        const kg = ac.createGain();
        k.type = "sine";
        k.frequency.setValueAtTime(140, t);
        k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        envGain(kg, t, 0.005, 0.03, 0.14, 0.7);
        k.connect(kg);
        kg.connect(musicGain);
        k.start(t);
        k.stop(t + 0.18);
      }
      // hat
      noiseBurst(i % 2 ? 0.04 : 0.03, 0.05, 4000);
      // lead
      const li = lead[step % 16];
      if (li) {
        const l = ac.createOscillator();
        const lg = ac.createGain();
        l.type = "square";
        l.frequency.value = 440 * Math.pow(2, (li - 69) / 12);
        envGain(lg, t, 0.01, 0.04, 0.18, 0.18);
        const lf = ac.createBiquadFilter();
        lf.type = "lowpass";
        lf.frequency.value = 1800;
        l.connect(lf);
        lf.connect(lg);
        lg.connect(musicGain);
        l.start(t);
        l.stop(t + 0.25);
      }
      step++;
      musicTimer = setTimeout(tick, beat * 1000);
    }
    tick();
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
  }

  /* ---------------- input ---------------- */
  const keys = {};
  let jumpTap = false;
  let slideTap = false;
  let jumpHeld = false;
  let pointerDownY = 0;
  let pointerDownAt = 0;
  let swiped = false;

  function wantJump() {
    return jumpTap || keys.Space || keys.ArrowUp || keys.KeyW || keys.KeyK;
  }
  function wantSlide() {
    return slideTap || keys.ArrowDown || keys.KeyS || keys.KeyJ;
  }
  function consumeJump() {
    jumpTap = false;
  }
  function consumeSlide() {
    slideTap = false;
  }

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) e.preventDefault();
    if ((e.code === "KeyP" || e.code === "Escape") && state === "play") pauseGame();
    else if ((e.code === "KeyP" || e.code === "Escape") && state === "pause") resumeGame();
    if (e.code === "KeyM") setMuted(!muted);
    if (state === "over" && (e.code === "Space" || e.code === "Enter")) retry();
    if (state === "start" && e.code === "Enter") startGame();
    if (state === "start" && (e.code === "ArrowLeft" || e.code === "KeyA")) pickChar((selected + 4) % 5);
    if (state === "start" && (e.code === "ArrowRight" || e.code === "KeyD")) pickChar((selected + 1) % 5);
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  function bindTouch() {
    const root = $("app");
    root.addEventListener(
      "pointerdown",
      (e) => {
        if (state !== "play") return;
        pointerDownY = e.clientY;
        pointerDownAt = performance.now();
        swiped = false;
        jumpHeld = true;
      },
      { passive: true }
    );
    root.addEventListener(
      "pointermove",
      (e) => {
        if (state !== "play" || !jumpHeld) return;
        const dy = e.clientY - pointerDownY;
        if (dy > 36 && !swiped) {
          swiped = true;
          slideTap = true;
        }
      },
      { passive: true }
    );
    const up = (e) => {
      if (state !== "play") return;
      const dt = performance.now() - pointerDownAt;
      const dy = e.clientY - pointerDownY;
      jumpHeld = false;
      if (!swiped && dy < 28 && dt < 400) jumpTap = true;
    };
    root.addEventListener("pointerup", up, { passive: true });
    root.addEventListener("pointercancel", () => { jumpHeld = false; }, { passive: true });
  }

  /* ---------------- particles ---------------- */
  const parts = [];
  function burst(x, y, n, col, spd, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (Math.random() * 0.6 + 0.4) * (spd || 220);
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 80,
        life: (life || 0.5) * (0.5 + Math.random()),
        t: 0,
        col: col || "#fff6d8",
        s: 2 + Math.random() * 3,
      });
    }
  }
  function dust(x, y) {
    for (let i = 0; i < 6; i++) {
      parts.push({
        x: x + Math.random() * 20 - 10,
        y,
        vx: -80 - Math.random() * 80,
        vy: -20 - Math.random() * 40,
        life: 0.35,
        t: 0,
        col: "rgba(255,246,216,.45)",
        s: 2 + Math.random() * 2,
      });
    }
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      if (p.t >= p.life) parts.splice(i, 1);
    }
  }

  /* ---------------- world ---------------- */
  let roofs = [];
  let obstacles = [];
  let items = [];
  let signs = [];
  let worldEnd = 0;
  let rngSeed = 1;
  function rnd() {
    rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
    return rngSeed / 4294967296;
  }
  function irnd(a, b) {
    return a + Math.floor(rnd() * (b - a + 1));
  }
  function pick(arr) {
    return arr[Math.floor(rnd() * arr.length)];
  }

  const CARD_KEYS = ["card", "card_red", "card_blue", "card_pink", "card_purple", "card_yellow"];

  function addRoof(x, w, h) {
    roofs.push({ x, w, h });
  }
  function addObs(o) {
    obstacles.push(o);
  }
  function addItem(x, y, kind) {
    items.push({ x, y, kind, taken: false });
  }
  function addSign(x, h, w, bh, img, style) {
    signs.push({ x, h, w, bh, img, style: style || "wall" });
  }

  function resetWorld() {
    roofs = [];
    obstacles = [];
    items = [];
    signs = [];
    worldEnd = 0;
    rngSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    addRoof(0, 1600, 0);
    addSign(420, 0, 260, 130, 0, "roof");
    addSign(780, 0, 280, 150, 1, "roof");
    addSign(1180, 0, 300, 160, 2, "wall");
    addItem(640, 70, "frag");
    addItem(1000, 90, "frag");
    worldEnd = 1600;
    while (worldEnd < 4200) addChunk();
  }

  function addChunk() {
    const x0 = worldEnd;
    const distM = x0 / PX_M;
    const d = Math.min(1, distM / 350);
    const gapExtra = Math.floor(40 + d * 180);
    const tight = 40 - d * 16;
    const kinds = ["flat", "gap", "stepup", "stepdown", "slide", "vaults", "rooftops", "mixed", "gap2"];
    const kind = pick(kinds);
    const lastH = roofs.length ? roofs[roofs.length - 1].h : 0;

    if (kind === "flat") {
      const w = irnd(700, 1100);
      addRoof(x0, w, lastH);
      scatterObstacles(x0 + 80, x0 + w - 80, lastH, d, 2 + irnd(0, 2));
      maybeSign(x0, w, lastH);
      maybeCoins(x0, w, lastH);
      worldEnd = x0 + w;
    } else if (kind === "gap") {
      const run = irnd(280, 420);
      addRoof(x0, run, lastH);
      const gap = irnd(180, 230) + gapExtra;
      const land = irnd(500, 800);
      addRoof(x0 + run + gap, land, lastH);
      addItem(x0 + run + gap * 0.5, lastH + 110, "frag");
      scatterObstacles(x0 + run + gap + 80, x0 + run + gap + land - 60, lastH, d, irnd(1, 2));
      maybeSign(x0 + run + gap, land, lastH);
      worldEnd = x0 + run + gap + land;
    } else if (kind === "gap2") {
      const run = irnd(260, 360);
      addRoof(x0, run, lastH);
      const gap = irnd(160, 210) + gapExtra * 0.8;
      const mid = irnd(200, 280);
      addRoof(x0 + run + gap, mid, lastH + (rnd() < 0.5 ? 70 : 0));
      const gap2 = irnd(160, 210) + gapExtra * 0.8;
      const land = irnd(480, 700);
      const h2 = lastH;
      addRoof(x0 + run + gap + mid + gap2, land, h2);
      addItem(x0 + run + gap * 0.5, lastH + 100, "frag");
      maybeCoins(x0 + run + gap + mid + gap2, land, h2);
      worldEnd = x0 + run + gap + mid + gap2 + land;
    } else if (kind === "stepup") {
      const run = irnd(260, 400);
      addRoof(x0, run, lastH);
      const gap = irnd(60, 110);
      const upH = lastH + irnd(70, 110);
      const land = irnd(520, 820);
      addRoof(x0 + run + gap, land, upH);
      addItem(x0 + run + 20, lastH + 130, "frag");
      scatterObstacles(x0 + run + gap + 140, x0 + run + gap + land - 60, upH, d, irnd(1, 2));
      maybeSign(x0 + run + gap, land, upH);
      worldEnd = x0 + run + gap + land;
    } else if (kind === "stepdown") {
      const run = irnd(300, 480);
      addRoof(x0, run, lastH);
      scatterObstacles(x0 + 40, x0 + run - 40, lastH, d, 1);
      const gap = irnd(70, 140);
      const dn = Math.max(0, lastH - irnd(60, 120));
      const land = irnd(520, 800);
      addRoof(x0 + run + gap, land, dn);
      maybeCoins(x0 + run + gap, land, dn);
      worldEnd = x0 + run + gap + land;
    } else if (kind === "slide") {
      const w = irnd(800, 1100);
      addRoof(x0, w, lastH);
      const hx = x0 + irnd(180, 260);
      addObs({ x: hx, w: irnd(90, 140), h: 54, base: lastH, kind: "hang", mode: "slide", img: "tv" });
      addItem(hx + 40, lastH + 30, "frag");
      if (d > 0.25) {
        addObs({
          x: hx + irnd(280, 360),
          w: 70,
          h: 46,
          base: lastH,
          kind: pick(["cart", "tama", "snack", "card"]),
          mode: "low",
        });
      }
      maybeSign(x0, w, lastH);
      worldEnd = x0 + w;
    } else if (kind === "vaults") {
      const w = irnd(800, 1200);
      addRoof(x0, w, lastH);
      let px = x0 + 140;
      const n = 2 + irnd(0, 2);
      for (let i = 0; i < n; i++) {
        addObs({
          x: px,
          w: 48 + irnd(0, 20),
          h: 34 + irnd(0, 16),
          base: lastH,
          kind: pick(["card", "cart", "tama", "snack"]),
          mode: "low",
        });
        if (rnd() < 0.6) addItem(px + 10, lastH + 90, "frag");
        px += irnd(200, 300) - d * 20;
      }
      worldEnd = x0 + w;
    } else if (kind === "rooftops") {
      let x = x0;
      let h = lastH;
      for (let i = 0; i < 3; i++) {
        const w = irnd(280, 420);
        h = Math.max(0, h + irnd(-1, 1) * irnd(50, 100));
        if (i) x += irnd(70, 130) + (d > 0.5 ? 20 : 0);
        addRoof(x, w, h);
        if (rnd() < 0.5) maybeSign(x, w, h);
        if (rnd() < 0.7) addItem(x + w * 0.5, h + 80, rnd() < 0.15 ? "dragon" : "frag");
        x += w;
      }
      worldEnd = x;
    } else {
      const w = irnd(900, 1300);
      addRoof(x0, w, lastH);
      scatterObstacles(x0 + 100, x0 + w - 80, lastH, d, 2 + irnd(0, 2));
      maybeSign(x0, w, lastH);
      maybeCoins(x0, w, lastH);
      worldEnd = x0 + w;
    }
    // safety: never end mid-gap
    if (worldEnd - x0 < 200) {
      addRoof(worldEnd, 400, lastH);
      worldEnd += 400;
    }
  }

  function scatterObstacles(x0, x1, h, d, n) {
    let x = x0;
    const span = Math.max(100, x1 - x0);
    for (let i = 0; i < n; i++) {
      x += irnd(120, 200);
      if (x > x1 - 40) break;
      const roll = rnd();
      if (roll < 0.38) {
        addObs({
          x,
          w: 46 + irnd(0, 16),
          h: 36 + irnd(0, 14),
          base: h,
          kind: pick(["card", "cart", "tama", "snack"]),
          mode: "low",
        });
      } else if (roll < 0.7) {
        addObs({
          x,
          w: 88 + irnd(0, 30),
          h: 86 + irnd(0, 30),
          base: h,
          kind: rnd() < 0.6 ? "tv" : "console",
          mode: "mid",
        });
      } else {
        addObs({
          x,
          w: 100 + irnd(0, 40),
          h: 52,
          base: h,
          kind: "hang",
          mode: "slide",
          img: "tv",
        });
      }
      x += 80;
    }
  }
  function maybeSign(x, w, h) {
    if (w < 360 || rnd() < 0.35) return;
    const img = irnd(0, 2);
    if (rnd() < 0.55) addSign(x + irnd(40, Math.max(50, w - 280)), h, 240 + irnd(0, 80), 120 + irnd(0, 50), img, "roof");
    else addSign(x + irnd(20, Math.max(40, w - 300)), h, 260 + irnd(0, 80), 150 + irnd(0, 40), img, "wall");
  }
  function maybeCoins(x, w, h) {
    const n = irnd(1, 3);
    for (let i = 0; i < n; i++) {
      const cx = x + 80 + rnd() * Math.max(20, w - 160);
      const cy = h + (rnd() < 0.5 ? 70 : 120);
      addItem(cx, cy, rnd() < 0.12 ? "dragon" : "frag");
    }
  }
  function cullWorld(camX) {
    const cut = camX - 400;
    roofs = roofs.filter((r) => r.x + r.w > cut);
    obstacles = obstacles.filter((o) => o.x + o.w > cut);
    items = items.filter((it) => !it.taken && it.x > cut - 80);
    signs = signs.filter((s) => s.x + s.w > cut);
    while (worldEnd < camX + 3200) addChunk();
  }

  /* ---------------- player / game state ---------------- */
  let state = "load"; // load start play pause over
  let player, chaser, score, frags, nearMiss, ranMeters, shake, glitch, speed, playedName;
  let lastTs = 0;
  let accDeath = 0;
  let deathMeters = 0;
  let deathScore = 0;

  function makePlayer() {
    return {
      x: 200,
      y: 0,
      vy: 0,
      state: "run",
      st: 0,
      onGround: true,
      coyote: 0,
      buf: 0,
      inv: 0,
      phase: 0,
      face: 1,
      vaultH: 0,
      climbTo: 0,
      stumbleLock: 0,
    };
  }

  function startGame() {
    ensureAudio();
    if (ac && ac.state === "suspended") ac.resume();
    startMusic();
    sfx.ui();
    player = makePlayer();
    chaser = { gap: 680, flash: 0 };
    score = 0;
    frags = 0;
    nearMiss = 0;
    ranMeters = 0;
    shake = 0;
    glitch = 0;
    speed = SPEED0;
    playedName = CHARS[selected].name;
    resetWorld();
    parts.length = 0;
    show("play");
    $("hBest").textContent = String(best);
    $("hFrags").textContent = "0";
    $("hWarn").classList.add("hidden");
  }

  function pauseGame() {
    if (state !== "play") return;
    state = "pause";
    $("scrPause").classList.remove("hidden");
    $("hud").classList.add("hidden");
  }
  function resumeGame() {
    if (state !== "pause") return;
    $("scrPause").classList.add("hidden");
    show("play");
    lastTs = 0;
  }

  function die(reason) {
    if (player.state === "dead") return;
    player.state = "dead";
    player.st = 0;
    stopMusic();
    sfx.death();
    shake = 14;
    glitch = 1;
    burst(player.x, player.y + HIT_H * 0.5, 40, "#ff003c", 360, 0.7);
    burst(player.x, player.y + HIT_H * 0.5, 24, "#00c8ff", 280, 0.6);
    deathMeters = Math.floor(ranMeters);
    deathScore = Math.floor(score);
    if (deathMeters > best) {
      best = deathMeters;
      localStorage.setItem(LS_BEST, String(best));
    }
    accDeath = reason || "erase";
    setTimeout(showOver, 850);
  }

  function showOver() {
    if (state === "over") return;
    state = "over";
    $("hud").classList.add("hidden");
    $("touch").classList.add("hidden");
    $("scrOver").classList.remove("hidden");
    $("oMeters").textContent = String(deathMeters);
    $("oScore").textContent = String(deathScore);
    $("oPlayed").textContent = playedName;
    $("oBest").textContent = String(best);
    $("oFrags").textContent = String(frags);
    $("oNear").textContent = String(nearMiss);
    $("oNew").classList.toggle("hidden", deathMeters < best || deathMeters <= 0);
  }

  function retry() {
    $("scrOver").classList.add("hidden");
    startGame();
  }
  function goMenu() {
    stopMusic();
    $("scrOver").classList.add("hidden");
    $("scrPause").classList.add("hidden");
    show("start");
    $("sBest").textContent = String(best);
  }

  function show(s) {
    state = s;
    $("scrLoad").classList.toggle("hidden", s !== "load");
    $("scrStart").classList.toggle("hidden", s !== "start");
    $("hud").classList.toggle("hidden", s !== "play");
    $("touch").classList.toggle("hidden", s !== "play");
    $("scrPause").classList.toggle("hidden", s !== "pause");
    $("scrOver").classList.toggle("hidden", s !== "over");
  }

  function roofAt(x, y, slack) {
    slack = slack || 10;
    let bestR = null;
    for (let i = 0; i < roofs.length; i++) {
      const r = roofs[i];
      if (x >= r.x + 2 && x <= r.x + r.w - 2) {
        const dy = y - r.h;
        if (dy >= -slack && dy <= 28) {
          if (!bestR || Math.abs(y - r.h) < Math.abs(y - bestR.h)) bestR = r;
        }
      }
    }
    return bestR;
  }
  function roofUnder(x) {
    let bestR = null;
    for (let i = 0; i < roofs.length; i++) {
      const r = roofs[i];
      if (x >= r.x && x <= r.x + r.w) {
        if (!bestR || r.h > bestR.h) bestR = r; // highest surface the x overlaps? actually want closest below
      }
    }
    // closest surface at or below y is handled by caller; here return all overlaps via loop in step
    return bestR;
  }
  function highestRoofBelow(x, y) {
    let bestR = null;
    for (let i = 0; i < roofs.length; i++) {
      const r = roofs[i];
      if (x >= r.x + 2 && x <= r.x + r.w - 2 && r.h <= y + 6) {
        if (!bestR || r.h > bestR.h) bestR = r;
      }
    }
    return bestR;
  }

  function standH() {
    return player.state === "slide" ? SLIDE_H : HIT_H;
  }

  function stepPlayer(dt) {
    const p = player;
    if (p.state === "dead") {
      p.st += dt;
      p.vy -= GRAV * dt;
      p.y += p.vy * dt;
      return;
    }
    speed = Math.min(SPEED_MAX, SPEED0 + ranMeters * 1.15);
    const spd = p.state === "stumble" ? speed * 0.42 : speed;
    p.x += spd * dt;
    ranMeters = p.x / PX_M;
    score += spd * dt * 0.28;
    p.inv = Math.max(0, p.inv - dt);
    p.st += dt;
    p.phase += dt * (spd / 70);

    const jumpNow = wantJump();
    if (jumpNow) p.buf = JUMP_BUF;
    else p.buf = Math.max(0, p.buf - dt);
    jumpHeld = jumpHeld || keys.Space || keys.ArrowUp || keys.KeyW;

    if (p.onGround) p.coyote = COYOTE;
    else p.coyote = Math.max(0, p.coyote - dt);

    // start slide
    if (wantSlide() && p.onGround && p.state === "run") {
      p.state = "slide";
      p.st = 0;
      consumeSlide();
      sfx.slide();
    }
    if (p.state === "slide") {
      if (p.st >= SLIDE_T && !wantSlide()) {
        p.state = "run";
        p.st = 0;
      }
    }

    // jump
    if (p.buf > 0 && p.coyote > 0 && p.state !== "vault" && p.state !== "climb" && p.state !== "stumble" && p.state !== "slide") {
      p.vy = JUMP_V;
      p.onGround = false;
      p.state = "jump";
      p.st = 0;
      p.buf = 0;
      p.coyote = 0;
      consumeJump();
      sfx.jump();
    } else if (p.buf > 0 && p.state === "slide" && p.onGround) {
      // jump cancel slide
      p.vy = JUMP_V * 0.92;
      p.onGround = false;
      p.state = "jump";
      p.st = 0;
      p.buf = 0;
      consumeJump();
      sfx.jump();
    }

    // variable jump cut
    if (p.state === "jump" && p.vy > 0 && !jumpHeld && !keys.Space && !keys.ArrowUp && !keys.KeyW) {
      p.vy *= 0.5;
      p.state = "fall";
    }

    if (p.state === "vault") {
      const t = Math.min(1, p.st / VAULT_T);
      p.y = p.vaultFrom + Math.sin(t * Math.PI) * (p.vaultH + 36);
      if (t >= 1) {
        p.state = "run";
        p.vy = 0;
        p.onGround = true;
        p.y = p.vaultFrom;
      }
    } else if (p.state === "climb") {
      const t = Math.min(1, p.st / CLIMB_T);
      p.y = p.climbFrom + (p.climbTo - p.climbFrom) * easeOut(t);
      if (t >= 1) {
        p.y = p.climbTo;
        p.vy = 0;
        p.onGround = true;
        p.state = "run";
      }
    } else if (p.state !== "slide" || !p.onGround) {
      if (!p.onGround && p.state !== "vault" && p.state !== "climb") {
        p.vy -= GRAV * dt;
        p.y += p.vy * dt;
        if (p.vy < 0 && p.state === "jump") p.state = "fall";
      }
    }

    // ground / ledges
    if (p.state !== "vault" && p.state !== "climb") {
      const r = highestRoofBelow(p.x + 10, p.y + (p.vy < 0 ? 24 : 4));
      if (r && p.y <= r.h + 4 && (p.onGround || p.vy <= 0)) {
        if (!p.onGround && p.y + 18 >= r.h) {
          p.y = r.h;
          p.vy = 0;
          if (!p.onGround) {
            sfx.land();
            dust(p.x, r.h);
          }
          p.onGround = true;
          if (p.state === "fall" || p.state === "jump") p.state = "run";
        } else if (p.onGround && Math.abs(p.y - r.h) < 20) {
          p.y = r.h;
        }
      } else if (p.onGround) {
        p.onGround = false;
        if (p.state === "run" || p.state === "slide") p.state = "fall";
      }
    }

    // ledge grab
    if (!p.onGround && p.state !== "vault" && p.state !== "climb" && p.state !== "stumble" && p.vy < 220) {
      for (let i = 0; i < roofs.length; i++) {
        const r = roofs[i];
        const lip = r.x;
        if (p.x + 16 < lip && p.x + 70 > lip && p.y + 20 < r.h && p.y + HIT_H + 10 > r.h && r.h - p.y < 130 && r.h > p.y + 20) {
          p.state = "climb";
          p.st = 0;
          p.climbFrom = p.y;
          p.climbTo = r.h;
          p.vy = 0;
          sfx.climb();
          break;
        }
      }
    }

    if (p.y < -200) die("fall");

    // obstacles
    const hh = standH();
    const px = p.x,
      py = p.y;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.hit) continue;
      const ox = o.x,
        ow = o.w;
      const top = o.mode === "slide" ? o.base + 200 : o.base + o.h;
      const bot = o.mode === "slide" ? o.base + 62 : o.base;
      // hanging: solid from bot to a high top
      const obot = bot,
        otop = o.mode === "slide" ? o.base + 200 : o.base + o.h;
      if (px + HIT_W * 0.35 < ox || px - HIT_W * 0.25 > ox + ow) continue;
      const ptop = py + hh;
      const pbot = py;
      if (ptop <= obot + 2 || pbot >= otop - 2) {
        // near miss?
        if (o.mode === "slide" && p.state === "slide" && Math.abs(ox + ow * 0.5 - px) < 20 && !o.near) {
          o.near = true;
          nearMiss++;
        }
        continue;
      }

      // collision
      if (o.mode === "low" && p.state !== "slide" && p.state !== "stumble") {
        // auto-vault if jumping or close with jump buf / in air
        if (p.state === "jump" || p.state === "fall" || p.buf > 0 || (p.state === "run" && p.buf >= 0 && wantJump())) {
          startVault(o);
          continue;
        }
        if (p.state === "run" && o.h <= 42) {
          startVault(o);
          continue;
        }
      }
      if (o.mode === "slide" && p.state === "slide") continue;
      if (o.mode === "mid" && (p.state === "jump" || p.state === "fall") && pbot >= o.base + o.h - 8) continue;

      // hit
      hitObstacle(o);
    }

    // collect
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.taken) continue;
      if (Math.abs(it.x - px) < 36 && Math.abs(it.y - (py + hh * 0.5)) < 50) {
        it.taken = true;
        frags++;
        score += it.kind === "dragon" ? 250 : 60;
        sfx.collect();
        burst(it.x, it.y, 12, it.kind === "dragon" ? "#4aa3ff" : "#f5b342", 180, 0.4);
        $("hFrags").textContent = String(frags);
      }
    }

    if (p.state === "stumble" && p.st >= STUMBLE_T) {
      p.state = p.onGround ? "run" : "fall";
    }

    consumeJump();
    consumeSlide();
    if (!(keys.Space || keys.ArrowUp || keys.KeyW)) {
      // jumpHeld from pointer handled separately
    }
  }

  function startVault(o) {
    const p = player;
    p.state = "vault";
    p.st = 0;
    p.vaultFrom = o.base;
    p.vaultH = o.h;
    p.onGround = false;
    p.vy = 0;
    p.y = o.base;
    o.hit = "vault";
    consumeJump();
    sfx.vault();
  }

  function hitObstacle(o) {
    const p = player;
    if (p.inv > 0 || p.state === "vault" || p.state === "climb") return;
    o.hit = true;
    // mid/hard hits close the virus more
    const hard = o.mode !== "low";
    stumble(hard ? 210 : 140);
  }

  function stumble(close) {
    const p = player;
    if (p.state === "dead") return;
    p.state = "stumble";
    p.st = 0;
    p.inv = 0.7;
    chaser.gap = Math.max(90, chaser.gap - close);
    chaser.flash = 1;
    shake = 8;
    glitch = 0.5;
    sfx.stumble();
    burst(p.x, p.y + 40, 16, "#ff003c", 200, 0.4);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function stepChaser(dt) {
    // pressure over time + recover when clean
    const pressure = 6 + ranMeters * 0.08;
    chaser.gap -= pressure * dt;
    if (player.state !== "stumble") chaser.gap += 18 * dt;
    const minGap = Math.max(160, 520 - ranMeters * 0.6);
    if (player.state !== "stumble") chaser.gap = Math.max(chaser.gap, minGap * 0.55);
    chaser.gap = Math.min(900, chaser.gap);
    chaser.flash = Math.max(0, chaser.flash - dt * 1.5);
    if (chaser.gap < 260) {
      $("hWarn").classList.remove("hidden");
      if (Math.floor(performance.now() / 700) !== Math.floor((performance.now() - dt * 1000) / 700)) sfx.warn();
    } else $("hWarn").classList.add("hidden");
    if (chaser.gap <= 70) die("erase");
  }

  /* ---------------- renderer ---------------- */
  let vw = 1600, vh = 900, dpr = 1;
  function resize() {
    dpr = Math.min(2.25, window.devicePixelRatio || 1);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const portrait = vh > vw * 1.15;
    $("rotate").classList.toggle("hidden", !portrait);
  }
  window.addEventListener("resize", resize);

  function groundY() {
    return vh * 0.78;
  }
  function camX() {
    return player ? player.x - vw * 0.27 : 0;
  }
  function sx(wx) {
    return wx - camX();
  }
  function sy(height) {
    return groundY() - height;
  }

  function draw() {
    const t = performance.now() / 1000;
    const gY = groundY();
    const cam = player ? camX() : 0;

    let ox = 0, oy = 0;
    if (shake > 0) {
      ox = (Math.random() - 0.5) * shake * 2;
      oy = (Math.random() - 0.5) * shake * 2;
      shake *= 0.86;
      if (shake < 0.3) shake = 0;
    }
    ctx.save();
    ctx.translate(ox, oy);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, "#0a0a18");
    sky.addColorStop(0.45, "#1a1028");
    sky.addColorStop(0.72, "#2a1430");
    sky.addColorStop(1, "#14080e");
    ctx.fillStyle = sky;
    ctx.fillRect(-10, -10, vw + 20, vh + 20);

    // stars
    ctx.fillStyle = "rgba(255,246,216,.7)";
    for (let i = 0; i < 60; i++) {
      const x = ((i * 173 + cam * 0.04) % (vw + 40)) - 20;
      const y = (i * 47) % (gY * 0.7);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
      ctx.globalAlpha = tw;
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // far city
    drawCity(cam * 0.18, gY - 220, 0.35, 9, "#120814");
    drawCity(cam * 0.35, gY - 130, 0.55, 7, "#1a0a16");
    drawMidBuildings(cam * 0.55, gY);

    // playable roofs + signs + obstacles
    if (player) {
      drawRoofs(gY);
      drawSigns(gY);
      drawItems(gY, t);
      drawObstacles(gY, t);
      drawPlayer(gY, t);
      drawChaser(gY, t);
    }

    // particles
    for (const p of parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.col;
      ctx.fillRect(sx(p.x), sy(p.y) - p.s, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    // vignette + chaser closeness
    const close = player ? Math.max(0, 1 - chaser.gap / 620) : 0;
    const vg = ctx.createLinearGradient(0, 0, vw * 0.4, 0);
    vg.addColorStop(0, `rgba(255,0,60,${0.08 + close * 0.4})`);
    vg.addColorStop(1, "rgba(255,0,60,0)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw * 0.4, vh);

    // scanlines
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = "#000";
    for (let y = 0; y < vh; y += 3) ctx.fillRect(0, y, vw, 1);
    ctx.globalAlpha = 1;

    // glitch overlay
    if (glitch > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, glitch);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,0,60,.25)";
      ctx.fillRect((Math.random() * vw * 0.6) | 0, (Math.random() * vh) | 0, 40 + Math.random() * 180, 4 + Math.random() * 16);
      ctx.fillStyle = "rgba(0,200,255,.25)";
      ctx.fillRect((Math.random() * vw * 0.6) | 0, (Math.random() * vh) | 0, 40 + Math.random() * 180, 3 + Math.random() * 12);
      ctx.restore();
      glitch *= 0.92;
      if (glitch < 0.03) glitch = 0;
    }

    ctx.restore();

    // menu background characters when on start? canvas still draws city. Good.
    if (state === "start" || state === "load") {
      // dim a bit so UI pops
      ctx.fillStyle = "rgba(7,8,12,.28)";
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  function drawCity(parX, base, shade, seed, col) {
    ctx.fillStyle = col;
    const w = vw + 200;
    let x = -((parX * 0.5) % 220) - 80;
    let i = 0;
    while (x < w) {
      const h = 80 + ((i * 13 + seed * 17) % 160);
      const bw = 50 + ((i * 9 + seed) % 70);
      ctx.fillRect(x, base - h, bw, h + 40);
      // windows
      ctx.fillStyle = `rgba(245,179,66,${0.12 + shade * 0.15})`;
      for (let wy = base - h + 10; wy < base - 8; wy += 16) {
        for (let wx = x + 6; wx < x + bw - 6; wx += 12) {
          if (((wx + wy + i) | 0) % 5 !== 0) ctx.fillRect(wx, wy, 6, 8);
        }
      }
      ctx.fillStyle = col;
      x += bw + 10;
      i++;
    }
  }

  function drawMidBuildings(parX, gY) {
    // silhouettes just behind the playable roof line
    const y = gY + 20;
    let x = -((parX) % 280) - 100;
    let i = 0;
    while (x < vw + 120) {
      const h = 90 + ((i * 19) % 140);
      const bw = 80 + ((i * 11) % 100);
      ctx.fillStyle = "#12060c";
      ctx.fillRect(x, y - h - 80, bw, h + 200);
      // faint windows
      ctx.fillStyle = "rgba(255,60,80,.15)";
      for (let wy = y - h - 60; wy < y - 30; wy += 18) {
        for (let wx = x + 8; wx < x + bw - 8; wx += 14) {
          if ((wx * 3 + wy + i) % 4) ctx.fillRect(wx, wy, 6, 9);
        }
      }
      x += bw + 18;
      i++;
    }
  }

  function drawRoofs(gY) {
    const cam = camX();
    for (const r of roofs) {
      const x = sx(r.x);
      const y = sy(r.h);
      const w = r.w;
      if (x + w < -40 || x > vw + 40) continue;
      // building body below the roof
      const depth = Math.min(vh - y + 80, 420);
      const wall = ctx.createLinearGradient(x, y, x, y + depth);
      wall.addColorStop(0, "#3a1e28");
      wall.addColorStop(0.35, "#2a1520");
      wall.addColorStop(1, "#10060c");
      ctx.fillStyle = wall;
      ctx.fillRect(x, y, w, depth);
      // edge
      ctx.fillStyle = "rgba(255,0,60,.15)";
      ctx.fillRect(x, y, 3, depth);
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(x + w - 4, y, 4, depth);
      // windows on the face
      ctx.fillStyle = "rgba(245,179,66,.16)";
      const cols = Math.max(2, Math.floor(w / 36));
      for (let c = 0; c < cols; c++) {
        for (let row = 0; row < 6; row++) {
          if ((c + row + (r.x | 0)) % 5 === 0) continue;
          ctx.fillRect(x + 14 + c * 36, y + 28 + row * 28, 14, 16);
        }
      }
      // rooftop slab
      ctx.fillStyle = "#4a333c";
      ctx.fillRect(x - 8, y - 16, w + 16, 18);
      ctx.fillStyle = "#6a4e56";
      ctx.fillRect(x - 8, y - 18, w + 16, 5);
      ctx.fillStyle = "rgba(255,246,216,.14)";
      ctx.fillRect(x - 8, y - 18, w + 16, 1);
      // front lip
      ctx.fillStyle = "#241418";
      ctx.fillRect(x - 8, y, w + 16, 8);
      ctx.fillStyle = "rgba(255,0,60,.12)";
      ctx.fillRect(x - 8, y, w + 16, 2);
      // short railing posts every so often
      ctx.fillStyle = "rgba(255,246,216,.18)";
      for (let rx = x + 16; rx < x + w - 10; rx += 46) {
        ctx.fillRect(rx, y - 28, 2, 12);
      }
      ctx.fillRect(x + 8, y - 28, w - 16, 2);
    }
    // dark ground fill under everything (pits look deep)
    ctx.fillStyle = "#07040a";
    ctx.fillRect(0, gY + 8, vw, vh - gY);
  }

  function drawSigns(gY) {
    for (const s of signs) {
      const x = sx(s.x);
      if (x + s.w < -20 || x > vw + 20) continue;
      const roofY = sy(s.h);
      if (s.style === "roof") {
        // billboard on poles on the roof
        const top = roofY - 28 - s.bh;
        ctx.fillStyle = "#1a1214";
        ctx.fillRect(x + 18, top + s.bh, 8, roofY - (top + s.bh));
        ctx.fillRect(x + s.w - 26, top + s.bh, 8, roofY - (top + s.bh));
        drawBillboard(x, top, s.w, s.bh, s.img, 0.08);
      } else {
        // hung on the building face, below the parapet
        const top = roofY + 24;
        drawBillboard(x, top, s.w, s.bh, s.img, -0.06);
      }
    }
  }

  function drawBillboard(x, y, w, h, imgIdx, skew) {
    ctx.save();
    ctx.translate(x, y);
    if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
    // frame
    ctx.fillStyle = "#1c1416";
    ctx.fillRect(-6, -6, w + 12, h + 12);
    ctx.strokeStyle = "#6a3038";
    ctx.lineWidth = 3;
    ctx.strokeRect(-6, -6, w + 12, h + 12);
    const key = "assets/billboard" + (imgIdx + 1) + ".jpg";
    const im = images[key];
    if (im && im.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      const ir = im.width / im.height;
      const br = w / h;
      let dw = w, dh = h, ox = 0, oy = 0;
      if (ir > br) {
        dw = h * ir;
        ox = -(dw - w) / 2;
      } else {
        dh = w / ir;
        oy = -(dh - h) / 2;
      }
      ctx.drawImage(im, ox, oy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, h);
    }
    // lighting: bottom darker, slight red bounce
    const lg = ctx.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, "rgba(255,246,216,.06)");
    lg.addColorStop(0.5, "rgba(0,0,0,0)");
    lg.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    // glow
    if (imgIdx === 2) {
      ctx.shadowColor = "#ff003c";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(255,0,60,.4)";
      ctx.strokeRect(0, 0, w, h);
    }
    ctx.restore();
  }

  function drawObstacles(gY, t) {
    for (const o of obstacles) {
      const x = sx(o.x);
      if (x + o.w < -30 || x > vw + 30) continue;
      const base = sy(o.base);
      if (o.mode === "slide") {
        // hanging TV / duct from above
        const bot = sy(o.base + 62);
        const top = bot - 160;
        ctx.fillStyle = "#2a1a20";
        ctx.fillRect(x + o.w * 0.5 - 6, top - 40, 12, 48);
        drawSpriteOrBox(o.img || "tv", x, top, o.w, 150);
        // warning stripe
        ctx.fillStyle = "rgba(245,179,66,.35)";
        ctx.fillRect(x, bot - 6, o.w, 6);
      } else {
        const y = base - o.h;
        drawSpriteOrBox(o.kind, x, y, o.w, o.h);
      }
    }
  }

  function cardImage(kind) {
    if (kind === "card") return images["assets/" + pickDraw(CARD_KEYS) + ".png"];
    // stable per call is bad — use kind only
    return null;
  }
  function kindImg(kind) {
    const map = {
      tv: "assets/tv.png",
      cart: "assets/cart.png",
      tama: "assets/tama.png",
      snack: "assets/snack.png",
      console: "assets/console.png",
      card: "assets/card.png",
      card_red: "assets/card_red.png",
      card_blue: "assets/card_blue.png",
      card_pink: "assets/card_pink.png",
      card_purple: "assets/card_purple.png",
      card_yellow: "assets/card_yellow.png",
    };
    if (kind === "card") {
      // cycle visually by x
      const keys = CARD_KEYS;
      return images["assets/" + keys[Math.abs(Math.floor((kind.__x || 0))) % keys.length] + ".png"] || images["assets/card.png"];
    }
    return images[map[kind] || ""];
  }

  function drawSpriteOrBox(kind, x, y, w, h) {
    let im = null;
    if (kind === "card") {
      const keys = CARD_KEYS;
      const idx = Math.abs((x * 13) | 0) % keys.length;
      im = images["assets/" + keys[idx] + ".png"];
    } else {
      const map = {
        tv: "assets/tv.png",
        cart: "assets/cart.png",
        tama: "assets/tama.png",
        snack: "assets/snack.png",
        console: "assets/console.png",
        hang: "assets/tv.png",
      };
      im = images[map[kind] || "assets/tv.png"];
    }
    if (im && im.complete && im.naturalWidth) {
      const ir = im.width / im.height;
      let dw = w, dh = h;
      // contain, sit on bottom
      if (dw / dh > ir) dw = dh * ir;
      else dh = dw / ir;
      // fill height mostly
      dh = h;
      dw = dh * ir;
      if (dw < w * 0.7) {
        dw = w;
        dh = dw / ir;
      }
      ctx.drawImage(im, x + (w - dw) / 2, y + h - dh, dw, dh);
    } else {
      ctx.fillStyle = "#a33";
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawItems(gY, t) {
    for (const it of items) {
      if (it.taken) continue;
      const x = sx(it.x);
      const y = sy(it.y) + Math.sin(t * 4 + it.x * 0.01) * 6;
      if (x < -20 || x > vw + 20) continue;
      if (it.kind === "dragon") {
        const im = images["assets/bomb.png"];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 3) * 0.2);
        if (im) ctx.drawImage(im, -14, -14, 28, 28);
        else {
          ctx.fillStyle = "#4aa3ff";
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else {
        const im = images["assets/card.png"];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 2 + it.x);
        if (im) ctx.drawImage(im, -12, -16, 24, 32);
        else {
          ctx.fillStyle = "#f5b342";
          ctx.fillRect(-8, -10, 16, 20);
        }
        ctx.restore();
        ctx.shadowColor = "#f5b342";
      }
    }
  }

  function drawPlayer(gY, t) {
    const p = player;
    const x = sx(p.x);
    const feet = sy(p.y);
    const img = images[CHARS[selected].file];
    const waist = CHARS[selected].waist;
    // shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    const sw = p.state === "slide" ? 70 : 40;
    ctx.ellipse(x, sy(highestRoofBelow(p.x, p.y + 40) ? highestRoofBelow(p.x, p.y + 40).h : p.y) + 2, sw, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!img || !img.complete) {
      ctx.fillStyle = CHARS[selected].accent;
      ctx.fillRect(x - 20, feet - HIT_H, 40, HIT_H);
      return;
    }

    const ih = img.height,
      iw = img.width;
    const drawH = DRAW_H;
    const drawW = (iw / ih) * drawH;

    ctx.save();
    ctx.translate(x, feet);

    if (p.state === "slide") {
      ctx.translate(10, -18);
      ctx.rotate(1.22);
      ctx.scale(1.05, 0.68);
      ctx.drawImage(img, -drawW * 0.45, -drawH * 0.15, drawW, drawH);
    } else if (p.state === "vault") {
      const k = Math.min(1, p.st / VAULT_T);
      ctx.translate(0, -20);
      ctx.rotate(-0.5 + k * 1.8);
      ctx.scale(1.05, 0.92);
      ctx.drawImage(img, -drawW * 0.5, -drawH * 0.7, drawW, drawH);
    } else if (p.state === "climb") {
      const k = Math.min(1, p.st / CLIMB_T);
      ctx.translate(0, -10);
      ctx.rotate(-0.2 + Math.sin(k * Math.PI) * 0.25);
      ctx.drawImage(img, -drawW * 0.5, -drawH, drawW, drawH);
    } else if (p.state === "jump" || p.state === "fall") {
      const stretch = p.state === "jump" ? 1.1 : 0.94;
      ctx.scale(0.95, stretch);
      ctx.rotate(p.state === "jump" ? -0.14 : 0.16);
      ctx.drawImage(img, -drawW * 0.5, -drawH, drawW, drawH);
    } else if (p.state === "stumble" || p.state === "dead") {
      ctx.rotate(p.state === "dead" ? 0.9 : Math.sin(p.st * 30) * 0.12);
      ctx.globalAlpha = p.state === "dead" ? 0.85 : 1;
      ctx.drawImage(img, -drawW * 0.5, -drawH, drawW, drawH);
    } else {
      // run cycle
      const ph = p.phase;
      const bob = Math.abs(Math.sin(ph)) * 9;
      const squash = 1 - 0.08 * Math.cos(ph * 2);
      ctx.translate(0, -bob);
      ctx.rotate(-0.08);
      ctx.scale(1, squash);
      const uh = drawH * waist;
      ctx.drawImage(img, 0, 0, iw, ih * waist, -drawW * 0.5, -drawH, drawW, uh);
      ctx.save();
      ctx.translate(0, -drawH + uh);
      ctx.rotate(Math.sin(ph) * 0.2);
      ctx.drawImage(img, 0, ih * waist, iw, ih * (1 - waist), -drawW * 0.5, 0, drawW, drawH * (1 - waist));
      ctx.restore();
    }
    ctx.restore();

    // motion trails at high speed
    if (speed > 700 && p.state === "run") {
      ctx.globalAlpha = 0.15;
      ctx.drawImage(img, x - drawW * 0.5 - 18, feet - drawH, drawW, drawH);
      ctx.globalAlpha = 0.08;
      ctx.drawImage(img, x - drawW * 0.5 - 34, feet - drawH, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  function drawChaser(gY, t) {
    const p = player;
    const edge = sx(p.x - chaser.gap);
    const width = 360 + (1 - Math.min(1, chaser.gap / 800)) * 220;
    const x0 = edge - width;

    // noise wall
    ctx.save();
    const grd = ctx.createLinearGradient(x0, 0, edge + 20, 0);
    grd.addColorStop(0, "rgba(8,0,4,0)");
    grd.addColorStop(0.3, "rgba(40,0,10,.75)");
    grd.addColorStop(0.75, "rgba(90,0,20,.9)");
    grd.addColorStop(1, "rgba(255,0,60,.0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x0, 0, width + 40, vh);

    // jagged front
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    const jag = 28;
    for (let y = 0; y <= vh + jag; y += jag) {
      const jx = edge + Math.sin(y * 0.08 + t * 14) * 16 + Math.sin(y * 0.3 + t * 23) * 10;
      ctx.lineTo(jx, y);
    }
    ctx.lineTo(x0, vh);
    ctx.closePath();
    ctx.fillStyle = "rgba(20,0,6,.55)";
    ctx.fill();

    // rgb split bars + static blocks
    for (let i = 0; i < 18; i++) {
      const y = ((i * 73 + t * 180) % (vh + 40)) - 20;
      const h = 4 + (i % 5) * 5;
      const x = x0 + 40 + ((i * 47) % (width - 60));
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = i % 2 ? "#ff003c" : "#00c8ff";
      ctx.fillRect(x, y, 30 + (i % 4) * 20, h);
    }
    ctx.globalAlpha = 1;

    // ERASE text
    ctx.save();
    ctx.font = "700 34px Silk, sans-serif";
    ctx.fillStyle = "rgba(255,0,60,.85)";
    ctx.shadowColor = "#ff003c";
    ctx.shadowBlur = 12;
    const txt = "ERASE";
    for (let i = 0; i < 8; i++) {
      const ty = ((i * 110 + t * 80) % (vh + 80)) - 20;
      const tx = edge - 120 + Math.sin(t * 8 + i) * 10;
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 6 + i));
      ctx.fillText(txt, tx, ty);
      ctx.fillStyle = i % 2 ? "rgba(0,200,255,.7)" : "rgba(255,0,60,.85)";
    }
    ctx.restore();

    // static speckles
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.fillRect(x0 + Math.random() * width, Math.random() * vh, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // leading edge glow
    ctx.strokeStyle = "rgba(255,0,60,.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = 0; y <= vh; y += 8) {
      const jx = edge + Math.sin(y * 0.08 + t * 14) * 16 + Math.sin(y * 0.3 + t * 23) * 10;
      if (y === 0) ctx.moveTo(jx, y);
      else ctx.lineTo(jx, y);
    }
    ctx.stroke();
  }

  /* ---------------- loop ---------------- */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    if (state === "play") {
      stepPlayer(dt);
      stepChaser(dt);
      stepParts(dt);
      cullWorld(camX());
      $("hScore").textContent = String(Math.floor(score));
      $("hMeters").textContent = String(Math.floor(ranMeters));
    } else if (state === "over" || state === "pause") {
      stepParts(dt * 0.3);
    } else {
      // idle pan
    }
    draw();
  }

  /* ---------------- UI / boot ---------------- */
  function pickChar(i) {
    selected = i;
    localStorage.setItem(LS_CHAR, String(i));
    document.querySelectorAll(".ch").forEach((el, idx) => el.classList.toggle("on", idx === i));
    sfx.ui();
  }

  function buildCharSelect() {
    const box = $("chars");
    box.innerHTML = "";
    CHARS.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "ch" + (i === selected ? " on" : "");
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", i === selected ? "true" : "false");
      b.type = "button";
      b.innerHTML = `<div class="pic"><img src="${c.file}" alt="${c.name}"></div><div class="nm">${c.name}</div>`;
      b.addEventListener("click", () => pickChar(i));
      box.appendChild(b);
    });
  }

  function loadAssets() {
    let done = 0;
    const total = ASSET_URLS.length;
    return Promise.all(
      ASSET_URLS.map(
        (url) =>
          new Promise((res) => {
            const im = new Image();
            im.onload = im.onerror = () => {
              done++;
              $("ldPct").textContent = " " + Math.round((done / total) * 100) + "%";
              $("ldBar").style.width = Math.round((done / total) * 100) + "%";
              res();
            };
            im.src = url;
            images[url] = im;
          })
      )
    );
  }

  function bootUI() {
    const saved = parseInt(localStorage.getItem(LS_CHAR) || "0", 10);
    selected = Number.isFinite(saved) && saved >= 0 && saved < 5 ? saved : 0;
    buildCharSelect();
    $("sBest").textContent = String(best);
    $("hBest").textContent = String(best);
    $("btnMute").classList.toggle("off", muted);
    $("btnPlay").addEventListener("click", startGame);
    $("btnRetry").addEventListener("click", retry);
    $("btnHome").addEventListener("click", goMenu);
    $("btnPauseHome").addEventListener("click", goMenu);
    $("btnPause").addEventListener("click", pauseGame);
    $("btnResume").addEventListener("click", resumeGame);
    $("btnMute").addEventListener("click", () => {
      ensureAudio();
      setMuted(!muted);
    });
    bindTouch();
  }

  // dummy pickDraw leftover
  function pickDraw() { return "card"; }

  resize();
  bootUI();
  show("load");
  loadAssets().then(() => {
    $("sBest").textContent = String(best);
    show("start");
    lastTs = 0;
    requestAnimationFrame(frame);
  });

  window.__nr = {
    get state(){ return state; },
    get player(){ return player; },
    get chaser(){ return chaser; },
    get obstacles(){ return obstacles; },
    get roofs(){ return roofs; },
    get items(){ return items; },
    get speed(){ return speed; },
    get score(){ return score; },
    get frags(){ return frags; },
    get meters(){ return ranMeters; },
    get selected(){ return selected; },
    jump(){ jumpTap = true; jumpHeld = true; },
    release(){ jumpHeld = false; },
    slide(){ slideTap = true; },
    start: startGame,
    retry,
    die,
    chars: CHARS,
  };
})();
