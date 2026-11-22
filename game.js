const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Слой темноты (offscreen canvas)
const darkCanvas = document.createElement("canvas");
const darkCtx = darkCanvas.getContext("2d");

let state = {};

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  darkCanvas.width = rect.width;
  darkCanvas.height = rect.height;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function initGame() {
  const h = GAME_CONFIG.house;
  const cx = h.x + h.width / 2;
  const cy = h.y + h.height / 2;

  state = {
    level: 1,
    isNight: false,
    phaseTimer: GAME_CONFIG.dayDuration,
    gameOver: false,
    player: {
      x: cx,
      y: cy,
      angle: -Math.PI / 2,
      hp: GAME_CONFIG.player.maxHp,
      wood: GAME_CONFIG.player.startWood,
      ammo: GAME_CONFIG.player.startAmmo,
      attackTimer: 0,
      swingVisual: 0,
    },
    // 4 окна/проема по сторонам дома
    openings: [
      { id: "top", x: cx - 35, y: h.y, w: 70, h: h.wallThickness, hp: 100 },
      { id: "bottom", x: cx - 35, y: h.y + h.height - h.wallThickness, w: 70, h: h.wallThickness, hp: 100 },
      { id: "left", x: h.x, y: cy - 35, w: h.wallThickness, h: 70, hp: 100 },
      { id: "right", x: h.x + h.width - h.wallThickness, y: cy - 35, w: h.wallThickness, h: 70, hp: 100 },
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
  const gap = 35;

  state.walls = [
    // Верхняя стена (левая и правая части от окна)
    { x: h.x, y: h.y, w: cx - gap - h.x, h: t },
    { x: cx + gap, y: h.y, w: h.x + h.width - (cx + gap), h: t },
    // Нижняя стена
    { x: h.x, y: h.y + h.height - t, w: cx - gap - h.x, h: t },
    { x: cx + gap, y: h.y + h.height - t, w: h.x + h.width - (cx + gap), h: t },
    // Левая стена
    { x: h.x, y: h.y, w: t, h: cy - gap - h.y },
    { x: h.x, y: cy + gap, w: t, h: h.y + h.height - (cy + gap) },
    // Правая стена
    { x: h.x + h.width - t, y: h.y, w: t, h: cy - gap - h.y },
    { x: h.x + h.width - t, y: cy + gap, w: t, h: h.y + h.height - (cy + gap) },
  ];
}

function spawnDayPickups() {
  state.pickups = [];
  const count = 8 + Math.min(state.level, 8);
  for (let i = 0; i < count; i++) {
    let px, py;
    do {
      px = 100 + Math.random() * (GAME_CONFIG.worldWidth - 200);
      py = 100 + Math.random() * (GAME_CONFIG.worldHeight - 200);
    } while (
      px > GAME_CONFIG.house.x - 40 &&
      px < GAME_CONFIG.house.x + GAME_CONFIG.house.width + 40 &&
      py > GAME_CONFIG.house.y - 40 &&
      py < GAME_CONFIG.house.y + GAME_CONFIG.house.height + 40
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
  const margin = 40;
  if (side === 0) { x = Math.random() * GAME_CONFIG.worldWidth; y = margin; }
  if (side === 1) { x = Math.random() * GAME_CONFIG.worldWidth; y = GAME_CONFIG.worldHeight - margin; }
  if (side === 2) { x = margin; y = Math.random() * GAME_CONFIG.worldHeight; }
  if (side === 3) { x = GAME_CONFIG.worldWidth - margin; y = Math.random() * GAME_CONFIG.worldHeight; }

  const isFast = state.level >= 3 && Math.random() < 0.3;
  const hpScale = 1 + (state.level - 1) * 0.18;

  state.enemies.push({
    x,
    y,
    radius: isFast ? 13 : 16,
    speed: isFast ? 125 : 75 + Math.min(state.level * 3, 45),
    hp: Math.round((isFast ? 45 : 75) * hpScale),
    maxHp: Math.round((isFast ? 45 : 75) * hpScale),
    damage: 10 + Math.floor(state.level * 1.5),
    attackCooldown: 0,
    isFast,
  });
}

// --- СЕНСОРНЫЕ ДЖОЙСТИКИ ---
const input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

function setupJoystick(zoneId, knobId, onMove) {
  const zone = document.getElementById(zoneId);
  const knob = document.getElementById(knobId);
  let touchId = null;
  const maxDist = 36;

  zone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    handleTouch(t);
  });

  zone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (let t of e.changedTouches) {
      if (t.identifier === touchId) handleTouch(t);
    }
  });

  const reset = (e) => {
    for (let t of e.changedTouches) {
      if (t.identifier === touchId) {
        touchId = null;
        knob.style.transform = `translate(-50%, -50%)`;
        onMove(0, 0);
      }
    }
  };
  zone.addEventListener("touchend", reset);
  zone.addEventListener("touchcancel", reset);

  function handleTouch(t) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onMove(dx / maxDist, dy / maxDist);
  }
}

setupJoystick("stick-move", "knob-move", (x, y) => {
  input.moveX = x;
  input.moveY = y;
});

setupJoystick("stick-aim", "knob-aim", (x, y) => {
  input.aimX = x;
  input.aimY = y;
  if (Math.hypot(x, y) > 0.2) {
    state.player.angle = Math.atan2(y, x);
  }
});

// Кнопка удара / выстрела
document.getElementById("btn-attack").addEventListener("touchstart", (e) => {
  e.preventDefault();
  performAttack();
});
document.getElementById("btn-attack").addEventListener("click", performAttack);

function performAttack() {
  if (state.gameOver || state.player.attackTimer > 0) return;

  const hasPistol = state.level >= GAME_CONFIG.pistolUnlockLevel && state.player.ammo > 0;

  if (hasPistol) {
    const cfg = GAME_CONFIG.weapons.pistol;
    state.player.attackTimer = cfg.cooldown;
    state.player.ammo--;
    state.bullets.push({
      x: state.player.x + Math.cos(state.player.angle) * 20,
      y: state.player.y + Math.sin(state.player.angle) * 20,
      vx: Math.cos(state.player.angle) * cfg.bulletSpeed,
      vy: Math.sin(state.player.angle) * cfg.bulletSpeed,
      damage: cfg.damage,
      life: 1.2,
    });
  } else {
    const cfg = GAME_CONFIG.weapons.bat;
    state.player.attackTimer = cfg.cooldown;
    state.player.swingVisual = 0.18;

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

// Кнопка ремонта окна
const btnRepair = document.getElementById("btn-repair");
btnRepair.addEventListener("touchstart", (e) => {
  e.preventDefault();
  repairNearestOpening();
});
btnRepair.addEventListener("click", repairNearestOpening);

function getNearestDamagedOpening() {
  let nearest = null;
  let minD = 68;
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
  if (state.player.wood <= 0) return;
  const op = getNearestDamagedOpening();
  if (op) {
    state.player.wood--;
    op.hp = Math.min(GAME_CONFIG.house.windowMaxHp, op.hp + 50);
    updateHUD();
  }
}

// Тест повышения уровня
document.getElementById("btn-test-lvl").addEventListener("click", () => {
  state.level++;
  updateHUD();
});

document.getElementById("btn-restart").addEventListener("click", initGame);

// --- ФИЗИКА И СТОЛКНОВЕНИЯ ---
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

// --- ИГРОВОЙ ЦИКЛ ---
let lastTime = performance.now();

function update(dt) {
  if (state.gameOver) return;

  // Таймер дня/ночи
  state.phaseTimer -= dt;
  if (state.phaseTimer <= 0) {
    if (!state.isNight) {
      state.isNight = true;
      state.phaseTimer = GAME_CONFIG.nightDuration;
    } else {
      state.isNight = false;
      state.level++;
      state.phaseTimer = GAME_CONFIG.dayDuration;
      state.enemies = []; // рассвет сжигает оставшихся монстров
      state.player.hp = Math.min(GAME_CONFIG.player.maxHp, state.player.hp + 15);
      spawnDayPickups();
    }
  }

  // Движение игрока
  const p = state.player;
  if (p.attackTimer > 0) p.attackTimer -= dt;
  if (p.swingVisual > 0) p.swingVisual -= dt;

  p.x += input.moveX * GAME_CONFIG.player.speed * dt;
  p.y += input.moveY * GAME_CONFIG.player.speed * dt;

  // Поворот по ходу движения, если правый стик не трогают
  if (Math.hypot(input.aimX, input.aimY) <= 0.2 && Math.hypot(input.moveX, input.moveY) > 0.2) {
    p.angle = Math.atan2(input.moveY, input.moveX);
  }

  p.x = Math.max(p.radius, Math.min(GAME_CONFIG.worldWidth - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(GAME_CONFIG.worldHeight - p.radius, p.y));

  for (let w of state.walls) resolveCircleRect(p, w);
  for (let op of state.openings) {
    if (op.hp > 0) resolveCircleRect(p, op);
  }

  // Подбор ресурсов
  state.pickups = state.pickups.filter((item) => {
    if (Math.hypot(p.x - item.x, p.y - item.y) < p.radius + 14) {
      if (item.type === "wood") p.wood++;
      if (item.type === "ammo") p.ammo += 8;
      return false;
    }
    return true;
  });

  // Спавн монстров ночью
  if (state.isNight) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.8, 3.2 - state.level * 0.18);
    }
  }

  // Обновление пуль
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

  // ИИ монстров
  for (let en of state.enemies) {
    if (en.attackCooldown > 0) en.attackCooldown -= dt;

    const dx = p.x - en.x;
    const dy = p.y - en.y;
    const dist = Math.hypot(dx, dy) || 1;

    en.x += (dx / dist) * en.speed * dt;
    en.y += (dy / dist) * en.speed * dt;

    for (let w of state.walls) resolveCircleRect(en, w);

    // Проверка столкновения с заколоченными окнами
    for (let op of state.openings) {
      if (op.hp > 0 && resolveCircleRect(en, op)) {
        if (en.attackCooldown <= 0) {
          op.hp = Math.max(0, op.hp - en.damage);
          en.attackCooldown = 1.0;
        }
      }
    }

    // Урон игроку
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

  // Активация кнопки починки
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
    document.getElementById("btn-attack").textContent = state.player.ammo > 0 ? "🔥 ОГОНЬ" : "🏏 УДАР";
  } else {
    elWeapon.textContent = `🏏 Бита (Пистолет с ${GAME_CONFIG.pistolUnlockLevel} ур.)`;
    document.getElementById("btn-attack").textContent = "⚔️ УДАР";
  }
}

// --- ОТРИСОВКА ---
function render() {
  const camX = state.player.x - canvas.width / 2;
  const camY = state.player.y - canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX, -camY);

  // Земля / двор
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight);

  // Пол дома
  const h = GAME_CONFIG.house;
  ctx.fillStyle = "#3f2e21";
  ctx.fillRect(h.x, h.y, h.width, h.height);

  // Ресурсы на земле
  for (let item of state.pickups) {
    ctx.fillStyle = item.type === "wood" ? "#d97706" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Стены дома
  ctx.fillStyle = "#64748b";
  for (let w of state.walls) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }

  // Окна / баррикады
  for (let op of state.openings) {
    if (op.hp > 0) {
      ctx.fillStyle = op.hp > 50 ? "#b45309" : "#ef4444";
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(op.x, op.y, op.w, op.h);
    }
  }

  // Пули
  ctx.fillStyle = "#fde047";
  for (let b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Монстры
  for (let en of state.enemies) {
    ctx.fillStyle = en.isFast ? "#a855f7" : "#22c55e";
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
    ctx.fill();

    // Полоска HP врага
    ctx.fillStyle = "#000";
    ctx.fillRect(en.x - 14, en.y - en.radius - 8, 28, 4);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(en.x - 14, en.y - en.radius - 8, 28 * (en.hp / en.maxHp), 4);
  }

  // Анимация взмаха битой
  const p = state.player;
  if (p.swingVisual > 0) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, GAME_CONFIG.weapons.bat.range, p.angle - 1.1, p.angle + 1.1);
    ctx.stroke();
  }

  // Игрок
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();

  // Оружие в руках
  ctx.strokeStyle = state.level >= GAME_CONFIG.pistolUnlockLevel ? "#94a3b8" : "#d97706";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26);
  ctx.stroke();

  ctx.restore();

  // --- ТЕМНОТА И ФОНАРИК НОЧЬЮ ---
  if (state.isNight) {
    darkCtx.globalCompositeOperation = "source-over";
    darkCtx.fillStyle = "rgba(3, 5, 10, 0.94)";
    darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);

    darkCtx.globalCompositeOperation = "destination-out";
    const px = canvas.width / 2;
    const py = canvas.height / 2;

    // Мягкий свет вокруг игрока
    const aura = darkCtx.createRadialGradient(px, py, 10, px, py, 75);
    aura.addColorStop(0, "rgba(0,0,0,1)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    darkCtx.fillStyle = aura;
    darkCtx.beginPath();
    darkCtx.arc(px, py, 75, 0, Math.PI * 2);
    darkCtx.fill();

    // Конус фонарика
    const beamLen = 280;
    const spread = 0.48;
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