const GAME_CONFIG = {
  worldWidth: 1400,
  worldHeight: 1400,

  dayDuration: 20,   // секунд на сбор ресурсов и ремонт
  nightDuration: 30, // секунд выживания ночью

  player: {
    radius: 16,
    speed: 190,
    maxHp: 100,
    startWood: 6,
    startAmmo: 24,
  },

  // С 1 по 10 уровень — бита, с 11 уровня — пистолет
  pistolUnlockLevel: 11,

  weapons: {
    bat: {
      name: "🏏 Бита",
      damage: 35,
      range: 64,
      arc: Math.PI * 0.75,
      cooldown: 0.45,
      knockback: 110,
    },
    pistol: {
      name: "🔫 Пистолет",
      damage: 55,
      cooldown: 0.3,
      bulletSpeed: 650,
    },
  },

  house: {
    x: 480,
    y: 480,
    width: 440,
    height: 440,
    wallThickness: 18,
    windowMaxHp: 100,
  },
};