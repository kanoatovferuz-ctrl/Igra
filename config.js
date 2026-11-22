const GAME_CONFIG = {
  worldWidth: 960,
  worldHeight: 960,

  dayDuration: 20,
  nightDuration: 30,

  cameraScale: 0.85,

  player: {
    radius: 18,
    speed: 200,
    maxHp: 100,
    startWood: 6,
    startAmmo: 24,
  },

  pistolUnlockLevel: 11,

  weapons: {
    bat: {
      name: "🏏 Бита",
      damage: 35,
      range: 68,
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
    x: 360,
    y: 360,
    width: 240,
    height: 240,
    wallThickness: 16,
    windowMaxHp: 100,
  },
};
