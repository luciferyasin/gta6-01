// The player on foot: movement, sprint, punching and shooting. Driving lives in
// vehicles.js; this module only knows how a person walks, fights and aims.

import { PLAYER, WORLD } from './config.js';
import { angleTo, clamp, dist } from './utils.js';
import { collideCity } from './city.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    money: 0,
    ammo: PLAYER.pistolAmmo,
    hasPistol: false,
    inCar: null,
    punchCooldown: 0,
    shootCooldown: 0,
    hurtCooldown: 0,
    moving: false,
    sprinting: false,
  };
}

/** Move the player on foot from the held keys; returns true while moving. */
export function updateOnFoot(player, move, sprint, dt, city) {
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.sprinting = sprint && (move.x !== 0 || move.y !== 0);
  player.moving = move.x !== 0 || move.y !== 0;
  if (player.moving) {
    player.angle = angleTo(0, 0, move.x, move.y);
    player.x += move.x * speed * dt;
    player.y += move.y * speed * dt;
    // collideCity corrects the circle it is given, so pass a live one and copy back.
    const body = { x: player.x, y: player.y, r: PLAYER.radius };
    collideCity(body, city);
    player.x = clamp(body.x, PLAYER.radius, WORLD.width - PLAYER.radius);
    player.y = clamp(body.y, PLAYER.radius, WORLD.height - PLAYER.radius);
  }
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
}

/**
 * A punch in front of the player. Returns the nearest pedestrian or officer in range,
 * or null. The caller applies the damage and the heat.
 */
export function punchTarget(player, targets) {
  if (player.punchCooldown > 0) return null;
  player.punchCooldown = PLAYER.punchCooldown;
  const px = player.x + Math.cos(player.angle) * (PLAYER.radius + 14);
  const py = player.y + Math.sin(player.angle) * (PLAYER.radius + 14);
  let best = null;
  let bestD = PLAYER.punchRange + 14;
  for (const t of targets) {
    if (t.down) continue;
    const d = dist(px, py, t.x, t.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/**
 * A pistol shot toward a world point. Returns the nearest living target near the line of
 * fire, or null. The caller spends the ammo and applies the damage.
 */
export function shootTarget(player, tx, ty, targets) {
  if (player.shootCooldown > 0 || player.ammo <= 0) return null;
  player.shootCooldown = PLAYER.shootCooldown;
  player.ammo -= 1;
  player.angle = angleTo(player.x, player.y, tx, ty);
  let best = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (t.down) continue;
    const d = dist(player.x, player.y, t.x, t.y);
    if (d > PLAYER.shootRange || d < 20) continue;
    const a = angleTo(player.x, player.y, t.x, t.y);
    let diff = a - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    // A target counts when it lies close to the shot's line.
    const lateral = Math.abs(Math.sin(diff)) * d;
    if (lateral < 26 && d < bestD) { bestD = d; best = t; }
  }
  return best;
}
