const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const darkCanvas = document.createElement("canvas");
const darkCtx = darkCanvas.getContext("2d");

let state = {};

// --- СПРАЙТЫ ИГРОКА (7 СОСТОЯНИЙ + УДАЛЕНИЕ СВЕТЛОГО ФОНА) ---
const RAW_SPRITE_PATHS = {
  idle: "sprites/idle.jpg?v=5",
  walk_left: "sprites/walk_left.jpg?v=5",
  walk_right: "sprites/walk_right.jpg?v=5",
  bat_idle: "sprites/bat_idle.jpg?v=5",
  bat_attack: "sprites/bat_attack.jpg?v=5",
  pistol_idle: "sprites/pistol_idle.jpg?v=5",
  pistol_attack: "sprites/pistol_attack.jpg?v=5",
};

const PLAYER_SPRITES = {};

function removeLightBackground(img, threshold = 235) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;

  tempCtx.drawImage(img, 0, 0);
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }

  tempCtx.putImageData(imageData, 0, 0);
  return tempCanvas;
}

Object.entries(RAW_SPRITE_PATHS).forEach(([key, src]) => {
  const rawImg = new Image();
  rawImg.onload = () => {
    PLAYER_SPRITES[key] = removeLightBackground(rawImg, 235);
  };
  rawImg.src = src;
});

let activeSpriteKey = "idle";
let stepAnimTimer = 0;
let stepSideToggle = false;
let shootVisualTimer = 0;

function resizeCanvas() {
  const w = window.innerWidth || 360;
  const h = window.innerHeight || 640;
  canvas.width = w;
  canvas.height = h;
  darkCanvas.width = w;
  darkCanvas.height = h;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function initGame() {
  const h = GAME_CONFIG.house;
  const cx = h.x + h.width / 2;
  const cy = h.y + h.height / 2;

  activeSpriteKey = "idle";
  stepAnimTimer = 0;
  stepSideToggle = false;
  shootVisualTimer = 0;

  state = {
    level: 1,
    isNight: false,
    phaseTimer: GAME_CONFIG.dayDuration,
    gameOver: false,
    walkAnim: 0,
    player: {
      x: cx,
      y: cy,
      radius: GAME_CONFIG.player.radius,
      angle: -Math.PI / 2,
      hp: GAME_CONFIG.player.maxHp,
      wood: GAME_CONFIG.player.startWood,
      ammo: GAME_CONFIG.player.startAmmo,
      attackTimer: 0,
      swingVisual: 0,
    },
    openings: [
      { id: "top", x: cx - 28, y: h.y, w: 56, h: h.wallThickness, hp: 70 },
      { id: "bottom", x: cx - 28, y: h.y + h.height - h.wallThickness, w: 56, h: h.wallThickness, hp: 70 },
      { id: "left", x: h.x, y: cy - 28, w: h.wallThickness, h: 56, hp: 70 },
      { id: "right", x: h.x + h.width - h.wallThickness, y: cy - 28, w: h.wallThickness, h: 56, hp: 70 },
    ],
    walls: [],
    pickups: [],
    enemies: [],
    bullets: [],
    spawnTimer: 0,
  };

  buildHouseWalls();
  spawnDayPickups();
  document.getElementById("game-over").classList.add("hidden");
  updateHUD();
}

function buildHouseWalls() {
  const h = GAME_CONFIG.house;
  const t = h.wallThickness;
  const cx = h.x + h.width / 2;
  const cy = h.y + h.height / 2;
  const gap = 28;

  state.walls = [
    { x: h.x, y: h.y, w: cx - gap - h.x, h: t },
    { x: cx + gap, y: h.y, w: h.x + h.width - (cx + gap), h: t },
    { x: h.x, y: h.y + h.height - t, w: cx - gap - h.x, h: t },
    { x: cx + gap, y: h.y + h.height - t, w: h.x + h.width - (cx + gap), h: t },
    { x: h.x, y: h.y, w: t, h: cy - gap - h.y },
    { x: h.x, y: cy + gap, w: t, h: h.y + h.height - (cy + gap) },
    { x: h.x + h.width - t, y: h.y, w: t, h: cy - gap - h.y },
    { x: h.x + h.width - t, y: cy + gap, w: t, h: h.y + h.height - (cy + gap) },
  ];
}

function spawnDayPickups() {
  state.pickups = [];
  const h = GAME_CONFIG.house;
  const count = 12;
  for (let i = 0; i < count; i++) {
    let px, py;
    do {
      px = 60 + Math.random() * (GAME_CONFIG.worldWidth - 120);
      py = 60 + Math.random() * (GAME_CONFIG.worldHeight - 120);
    } while (
      px > h.x - 35 &&
      px < h.x + h.width + 35 &&
      py > h.y - 35 &&
      py < h.y + h.height + 35
    );

    const isAmmo = state.level >= GAME_CONFIG.pistolUnlockLevel && Math.random() < 0.4;
    state.pickups.push({
      x: px,
      y: py,
      type: isAmmo ? "ammo" : "wood",
    });
  }
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  const margin = 30;
  if (side === 0) { x = Math.random() * GAME_CONFIG.worldWidth; y = margin; }
  if (side === 1) { x = Math.random() * GAME_CONFIG.worldWidth; y = GAME_CONFIG.worldHeight - margin; }
  if (side === 2) { x = margin; y = Math.random() * GAME_CONFIG.worldHeight; }
  if (side === 3) { x = GAME_CONFIG.worldWidth - margin; y = Math.random() * GAME_CONFIG.worldHeight; }

  const isFast = state.level >= 3 && Math.random() < 0.3;
  const hpScale = 1 + (state.level - 1) * 0.18;

  state.enemies.push({
    x,
    y,
    radius: isFast ? 14 : 17,
    speed: isFast ? 120 : 72 + Math.min(state.level * 3, 45),
    hp: Math.round((isFast ? 45 : 75) * hpScale),
    maxHp: Math.round((isFast ? 45 : 75) * hpScale),
    damage: 10 + Math.floor(state.level * 1.5),
    attackCooldown: 0,
    isFast,
  });
}

// --- СЕНСОРНЫЕ ДЖОЙСТИКИ + КЛАВИАТУРА ---
const input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") performAttack();
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

function setupJoystick(zoneId, knobId, onMove) {
  const zone = document.getElementById(zoneId);
  const knob = document.getElementById(knobId);
  let activeId = null;
  const maxDist = 38;

  function updateFromClient(clientX, clientY) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onMove(dx / maxDist, dy / maxDist);
  }

  function reset() {
    activeId = null;
    knob.style.transform = `translate(-50%, -50%)`;
    onMove(0, 0);
  }

  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    activeId = e.pointerId;
    updateFromClient(e.clientX, e.clientY);
  });

  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activeId) return;
    e.preventDefault();
    updateFromClient(e.clientX, e.clientY);
  });

  zone.addEventListener("pointerup", (e) => {
    if (e.pointerId === activeId) reset();
  });
  zone.addEventListener("pointercancel", (e) => {
    if (e.pointerId === activeId) reset();
  });
}

setupJoystick("stick-move", "knob-move", (x, y) => {
  input.moveX = x;
  input.moveY = y;
});

setupJoystick("stick-aim", "knob-aim", (x, y) => {
  input.aimX = x;
  input.aimY = y;
  if (Math.hypot(x, y) > 0.15) {
    state.player.angle = Math.atan2(y, x);
  }
});

const btnAttack = document.getElementById("btn-attack");
btnAttack.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  performAttack();
});

function performAttack() {
  if (state.gameOver || state.player.attackTimer > 0) return;

  const hasPistol = state.level >= GAME_CONFIG.pistolUnlockLevel && state.player.ammo > 0;

  if (hasPistol) {
    const cfg = GAME_CONFIG.weapons.pistol;
    state.player.attackTimer = cfg.cooldown;
    state.player.ammo--;
    shootVisualTimer = 0.14;
    state.bullets.push({
      x: state.player.x + Math.cos(state.player.angle) * 22,
      y: state.player.y + Math.sin(state.player.angle) * 22,
      vx: Math.cos(state.player.angle) * cfg.bulletSpeed,
      vy: Math.sin(state.player.angle) * cfg.bulletSpeed,
      damage: cfg.damage,
      life: 1.2,
    });
  } else {
    const cfg = GAME_CONFIG.weapons.bat;
    state.player.attackTimer = cfg.cooldown;
    state.player.swingVisual = 0.2;

    state.enemies.forEach((en) => {
      const dx = en.x - state.player.x;
      const dy = en.y - state.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= cfg.range + en.radius) {
        let angleDiff = Math.atan2(dy, dx) - state.player.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= cfg.arc / 2) {
          en.hp -= cfg.damage;
          en.x += (dx / (dist || 1)) * cfg.knockback * 0.35;
          en.y += (dy / (dist || 1)) * cfg.knockback * 0.35;
        }
      }
    });
  }
  updateHUD();
}

const btnRepair = document.getElementById("btn-repair");
btnRepair.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  repairNearestOpening();
});

function getNearestDamagedOpening() {
  let nearest = null;
  let minD = 95;
  for (let op of state.openings) {
    if (op.hp >= GAME_CONFIG.house.windowMaxHp) continue;
    const cx = op.x + op.w / 2;
    const cy = op.y + op.h / 2;
    const d = Math.hypot(state.player.x - cx, state.player.y - cy);
    if (d < minD) {
      minD = d;
      nearest = op;
    }
  }
  return nearest;
}

function repairNearestOpening() {
  if (state.gameOver || state.player.wood <= 0) return;
  const op = getNearestDamagedOpening();
  if (op) {
    state.player.wood--;
    op.hp = Math.min(GAME_CONFIG.house.windowMaxHp, op.hp + 50);
    updateHUD();
  }
}

document.getElementById("btn-test-lvl").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  state.level++;
  updateHUD();
});

document.getElementById("btn-restart").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  initGame();
});

function resolveCircleRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const dist = Math.hypot(dx, dy);

  if (dist < circle.radius) {
    const overlap = circle.radius - (dist || 0.01);
    circle.x += (dx / (dist || 1)) * overlap;
    circle.y += (dy / (dist || 1)) * overlap;
    return true;
  }
  return false;
}

let lastTime = performance.now();

function update(dt) {
  if (state.gameOver) return;

  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    if (!state.isNight) {
      state.isNight = true;
      state.phaseTimer = GAME_CONFIG.nightDuration;
    } else {
      state.isNight = false;
      state.level++;
      state.phaseTimer = GAME_CONFIG.dayDuration;
      state.enemies = [];
      state.player.hp = Math.min(GAME_CONFIG.player.maxHp, state.player.hp + 15);
      spawnDayPickups();
    }
  }

  const p = state.player;
  if (p.attackTimer > 0) p.attackTimer -= dt;
  if (p.swingVisual > 0) p.swingVisual -= dt;
  if (shootVisualTimer > 0) shootVisualTimer -= dt;

  let mx = input.moveX;
  let my = input.moveY;
  if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
  if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;

  const moveMag = Math.hypot(mx, my);
  if (moveMag > 0.05) {
    const norm = Math.min(1, moveMag);
    p.x += (mx / moveMag) * norm * GAME_CONFIG.player.speed * dt;
    p.y += (my / moveMag) * norm * GAME_CONFIG.player.speed * dt;
    state.walkAnim += dt * 12;

    if (Math.hypot(input.aimX, input.aimY) <= 0.15) {
      p.angle = Math.atan2(my, mx);
    }
  }

  const hasPistolEquipped = state.level >= GAME_CONFIG.pistolUnlockLevel && p.ammo > 0;
  const isMoving = moveMag > 0.05;
  const isAttackingBat = p.swingVisual > 0;
  const isShootingPistol = shootVisualTimer > 0;

  if (isShootingPistol) {
    activeSpriteKey = "pistol_attack";
  } else if (isAttackingBat) {
    activeSpriteKey = "bat_attack";
  } else if (isMoving) {
    stepAnimTimer += dt;
    if (stepAnimTimer >= 0.14) {
      stepAnimTimer = 0;
      stepSideToggle = !stepSideToggle;
    }
    activeSpriteKey = stepSideToggle ? "walk_right" : "walk_left";
  } else {
    stepAnimTimer = 0;
    stepSideToggle = false;
    if (hasPistolEquipped) {
      activeSpriteKey = "pistol_idle";
    } else if (state.level >= 1) {
      activeSpriteKey = "bat_idle";
    } else {
      activeSpriteKey = "idle";
    }
  }

  p.x = Math.max(p.radius, Math.min(GAME_CONFIG.worldWidth - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(GAME_CONFIG.worldHeight - p.radius, p.y));

  for (let w of state.walls) resolveCircleRect(p, w);
  for (let op of state.openings) {
    if (op.hp > 0) resolveCircleRect(p, op);
  }

  state.pickups = state.pickups.filter((item) => {
    if (Math.hypot(p.x - item.x, p.y - item.y) < p.radius + 16) {
      if (item.type === "wood") p.wood++;
      if (item.type === "ammo") p.ammo += 8;
      return false;
    }
    return true;
  });

  if (state.isNight) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.8, 3.2 - state.level * 0.18);
    }
  }

  state.bullets = state.bullets.filter((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) return false;

    for (let w of state.walls) {
      if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) return false;
    }
    for (let en of state.enemies) {
      if (Math.hypot(b.x - en.x, b.y - en.y) < en.radius + 4) {
        en.hp -= b.damage;
        return false;
      }
    }
    return true;
  });

  for (let en of state.enemies) {
    if (en.attackCooldown > 0) en.attackCooldown -= dt;

    const dx = p.x - en.x;
    const dy = p.y - en.y;
    const dist = Math.hypot(dx, dy) || 1;

    en.x += (dx / dist) * en.speed * dt;
    en.y += (dy / dist) * en.speed * dt;

    for (let w of state.walls) resolveCircleRect(en, w);

    for (let op of state.openings) {
      if (op.hp > 0 && resolveCircleRect(en, op)) {
        if (en.attackCooldown <= 0) {
          op.hp = Math.max(0, op.hp - en.damage);
          en.attackCooldown = 1.0;
        }
      }
    }

    if (dist < p.radius + en.radius + 4 && en.attackCooldown <= 0) {
      p.hp -= en.damage;
      en.attackCooldown = 1.0;
      if (p.hp <= 0) {
        p.hp = 0;
        state.gameOver = true;
        document.getElementById("final-stats").textContent = `Пережито ночей: ${state.level - 1}`;
        document.getElementById("game-over").classList.remove("hidden");
      }
    }
  }

  state.enemies = state.enemies.filter((en) => en.hp > 0);

  const nearOp = getNearestDamagedOpening();
  btnRepair.disabled = !(nearOp && p.wood > 0);

  updateHUD();
}

function updateHUD() {
  const elLvl = document.getElementById("hud-level");
  const elPhase = document.getElementById("hud-phase");
  const elWeapon = document.getElementById("hud-weapon");

  elLvl.textContent = `Ур. ${state.level} (Ночь ${state.level})`;
  elPhase.textContent = `${state.isNight ? "НОЧЬ" : "ДЕНЬ"}: ${Math.ceil(state.phaseTimer)}с`;
  elPhase.className = `stat ${state.isNight ? "phase-night" : "phase-day"}`;

  document.getElementById("hud-hp").textContent = state.player.hp;
  document.getElementById("hud-wood").textContent = state.player.wood;

  if (state.level >= GAME_CONFIG.pistolUnlockLevel) {
    elWeapon.textContent = `🔫 Пистолет (${state.player.ammo})`;
    btnAttack.textContent = state.player.ammo > 0 ? "🔥 ОГОНЬ" : "🏏 УДАР";
  } else {
    elWeapon.textContent = `🏏 Бита (Пистолет с ${GAME_CONFIG.pistolUnlockLevel} ур.)`;
    btnAttack.textContent = "⚔️ УДАР";
  }
}

function drawHumanPlayer(p) {
  const sprite = PLAYER_SPRITES[activeSpriteKey];
  const drawSize = 58;
  const half = drawSize / 2;

  if (!sprite) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const vx = Math.cos(p.angle);
  const faceLeft = vx < -0.15;

  ctx.save();
  ctx.translate(p.x, p.y);
  if (faceLeft) {
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sprite, -half, -half, drawSize, drawSize);
  ctx.restore();
}

function render() {
  const scale = GAME_CONFIG.cameraScale || 0.85;
  const viewW = canvas.width / scale;
  const viewH = canvas.height / scale;
  const camX = state.player.x - viewW / 2;
  const camY = state.player.y - viewH / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
  ctx.lineWidth = 1;
  const grid = 48;
  for (let gx = 0; gx <= GAME_CONFIG.worldWidth; gx += grid) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, GAME_CONFIG.worldHeight);
    ctx.stroke();
  }
  for (let gy = 0; gy <= GAME_CONFIG.worldHeight; gy += grid) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(GAME_CONFIG.worldWidth, gy);
    ctx.stroke();
  }

  const h = GAME_CONFIG.house;
  ctx.fillStyle = "#5c3c24";
  ctx.fillRect(h.x, h.y, h.width, h.height);

  for (let item of state.pickups) {
    ctx.fillStyle = item.type === "wood" ? "#f59e0b" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(item.x, item.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  for (let w of state.walls) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }

  for (let op of state.openings) {
    if (op.hp > 0) {
      ctx.fillStyle = op.hp > 50 ? "#d97706" : "#ef4444";
      ctx.fillRect(op.x, op.y, op.w, op.h);
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.strokeStyle = "#f87171";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(op.x, op.y, op.w, op.h);
      ctx.setLineDash([]);
    }
  }

  ctx.fillStyle = "#fde047";
  for (let b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let en of state.enemies) {
    ctx.fillStyle = en.isFast ? "#c084fc" : "#4ade80";
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#090d16";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.fillRect(en.x - 15, en.y - en.radius - 9, 30, 5);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(en.x - 15, en.y - en.radius - 9, 30 * (en.hp / en.maxHp), 5);
  }

  const p = state.player;
  if (p.swingVisual > 0) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, GAME_CONFIG.weapons.bat.range, p.angle - 1.1, p.angle + 1.1);
    ctx.stroke();
  }

  drawHumanPlayer(p);

  ctx.restore();

  if (state.isNight) {
    darkCtx.globalCompositeOperation = "source-over";
    darkCtx.fillStyle = "rgba(3, 5, 10, 0.9)";
    darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);

    darkCtx.globalCompositeOperation = "destination-out";
    const px = canvas.width / 2;
    const py = canvas.height / 2;

    const aura = darkCtx.createRadialGradient(px, py, 12, px, py, 95);
    aura.addColorStop(0, "rgba(0,0,0,1)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    darkCtx.fillStyle = aura;
    darkCtx.beginPath();
    darkCtx.arc(px, py, 95, 0, Math.PI * 2);
    darkCtx.fill();

    const beamLen = 300;
    const spread = 0.5;
    const grad = darkCtx.createRadialGradient(px, py, 15, px, py, beamLen);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    darkCtx.fillStyle = grad;
    darkCtx.beginPath();
    darkCtx.moveTo(px, py);
    darkCtx.arc(px, py, beamLen, p.angle - spread, p.angle + spread);
    darkCtx.closePath();
    darkCtx.fill();

    ctx.drawImage(darkCanvas, 0, 0);
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
