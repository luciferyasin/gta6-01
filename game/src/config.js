// Every tuning number, colour and place name in one place. SOLMAR BAY is a sun-soaked
// coastal city: warm light, palm-lined avenues, a beach along the south edge and a marina
// on the east. The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city itself, in world pixels. */
export const WORLD = { width: 4800, height: 3600 };

/** Vertical avenues and horizontal streets, by centre line. Roads are 120 wide. */
export const AVENUES = [400, 1000, 1600, 2200, 2800, 3400, 4000];
export const STREETS = [400, 900, 1400, 1900, 2400, 2900];
export const ROAD_WIDTH = 120;

/** The beach strip along the south edge; the water past it is impassable. */
export const BEACH = { y: 3260, waterY: 3460 };

/** The marina docks on the east edge. */
export const MARINA = { x: 4360, y0: 420, y1: 1180 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  sprintSpeed: 330,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
  shootDamage: 34,
  shootCooldown: 0.28,
  shootRange: 420,
  pistolAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 64,
  width: 30,
  radius: 20,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 620,
  maxReverse: 180,
  steer: 2.6,
  grip: 3.2,
  drag: 0.55,
  health: 100,
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 55;

/** Heat bands: heat 0-100 maps to 0-5 wanted stars. */
export const WANTED_BANDS = [0, 1, 25, 50, 75, 95];
export const WANTED_DECAY = 2.2;
export const CRIME_HEAT = {
  stealParked: 8,
  stealOccupied: 18,
  punchPed: 10,
  killPed: 22,
  shoot: 6,
  killCop: 30,
  hitPedWithCar: 16,
};

/** Police presence by wanted stars: [foot officers, police cars]. */
export const POLICE_FORCE = [
  [0, 0],
  [2, 0],
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 4],
];

export const MISSION_REWARDS = [800, 1500, 3000];

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  sand: '#e8d29a',
  water: '#3f8fbf',
  waterDeep: '#2f6f9e',
  asphalt: '#3d3a38',
  asphaltLine: '#e8d44d',
  sidewalk: '#b9b3a4',
  curb: '#8f887a',
  buildingRoof: ['#c96f4a', '#4a7a9e', '#8a6fae', '#b09a5a', '#5a8a6f', '#a04a5a', '#6a6a7a', '#c98a4a'],
  buildingWall: '#e8ddd0',
  park: '#6da054',
  pond: '#5aa3c8',
  tree: '#3f7a3a',
  treeDark: '#356b31',
  player: '#2f7fd0',
  playerShirt: '#f2f2f2',
  pedShirt: ['#d05a4a', '#4a9e6a', '#e8b13f', '#7a5ac8', '#3fa8c8', '#c86a9e'],
  police: '#1f3a8a',
  policeCar: '#1f3a8a',
  taxi: '#f2c230',
  sport: '#d8b13a',
  hud: '#10141c',
  hudText: '#f2f4f7',
  hudMuted: '#9aa3b0',
  gold: '#f2c230',
  danger: '#e5534b',
  good: '#58c472',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
