// The renderer: everything the player sees. A top-down camera follows the player over
// Solmar Bay — roads and lane paint, buildings with long afternoon shadows, palms on the
// beach, the marina, traffic, pedestrians, police lights and muzzle flashes — plus the
// minimap, which is a second small canvas drawn from the same world.

import {
  AVENUES, BEACH, MARINA, PALETTE, ROAD_WIDTH, STREETS, VIEW, WORLD,
} from './config.js';
import { clamp } from './utils.js';

const ROAD_HALF = ROAD_WIDTH / 2;
const MINIMAP_W = 208;
const MINIMAP_H = 156;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas, minimapCanvas) {
  const ctx = canvas.getContext('2d');
  const mctx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  if (minimapCanvas) {
    minimapCanvas.width = MINIMAP_W;
    minimapCanvas.height = MINIMAP_H;
  }

  function drawGround(world) {
    // Grass base, then the beach and the water along the south edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(-200, -200, WORLD.width + 400, WORLD.height + 400);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH.y, WORLD.width, WORLD.height - BEACH.y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, BEACH.waterY, WORLD.width, WORLD.height - BEACH.waterY);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      const wobble = Math.sin(world.time * 1.4 + x * 0.02) * 6;
      ctx.fillRect(x, BEACH.waterY + 26 + wobble, 46, 5);
    }
    // The marina basin, east.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(MARINA.x, MARINA.y0, WORLD.width - MARINA.x, MARINA.y1 - MARINA.y0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(MARINA.x - 60, MARINA.y0, 60, MARINA.y1 - MARINA.y0);
  }

  function drawRoads() {
    ctx.fillStyle = PALETTE.sidewalk;
    for (const a of AVENUES) ctx.fillRect(a - ROAD_HALF - 14, 0, ROAD_WIDTH + 28, WORLD.height);
    for (const s of STREETS) ctx.fillRect(0, s - ROAD_HALF - 14, WORLD.width, ROAD_WIDTH + 28);
    ctx.fillStyle = PALETTE.asphalt;
    for (const a of AVENUES) ctx.fillRect(a - ROAD_HALF, 0, ROAD_WIDTH, WORLD.height);
    for (const s of STREETS) ctx.fillRect(0, s - ROAD_HALF, WORLD.width, ROAD_WIDTH);
    // Centre dashes.
    ctx.fillStyle = PALETTE.asphaltLine;
    for (const a of AVENUES) {
      for (let y = 40; y < WORLD.height; y += 90) ctx.fillRect(a - 3, y, 6, 44);
    }
    for (const s of STREETS) {
      for (let x = 40; x < WORLD.width; x += 90) ctx.fillRect(x, s - 3, 44, 6);
    }
  }

  function drawPark(world) {
    const { park, pond } = world.city;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = PALETTE.pond;
    ctx.beginPath();
    ctx.ellipse(pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 2, pond.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8cba8';
    ctx.lineWidth = 5;
    ctx.strokeRect(park.x + 8, park.y + 8, park.w - 16, park.h - 16);
  }

  function drawBuildings(world) {
    for (const b of world.city.buildings) {
      // Long afternoon shadow to the south-east.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 12, b.y + 16, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Windows: a grid that follows the floor count.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.min(b.floors, Math.floor(b.h / 34)));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          ctx.fillRect(b.x + 12 + c * 34, b.y + 12 + r * 34, 16, 18);
        }
      }
      if (b.place === 'garage') {
        ctx.fillStyle = '#f2f4f7';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText("VERA'S GARAGE", b.x + 14, b.y + b.h - 16);
      } else if (b.place === 'hospital') {
        ctx.fillStyle = '#e5534b';
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText('+', b.x + b.w / 2 - 10, b.y + 52);
      } else if (b.place === 'policeStation') {
        ctx.fillStyle = '#f2f4f7';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillText('SOLMAR PD', b.x + 14, b.y + b.h - 14);
      } else if (b.place === 'safehouse') {
        ctx.fillStyle = '#f2f4f7';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText('SAFEHOUSE', b.x + 8, b.y + b.h - 12);
      }
    }
  }

  function drawTrees(world) {
    for (const tree of world.city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 6, tree.y + 8, tree.r, tree.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (tree.palm) {
        ctx.strokeStyle = '#6a4a2a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(tree.x, tree.y + 8);
        ctx.lineTo(tree.x, tree.y - 6);
        ctx.stroke();
        ctx.fillStyle = '#4a8a3f';
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.ellipse(tree.x + Math.cos(a) * tree.r * 0.6, tree.y - 6 + Math.sin(a) * tree.r * 0.5, tree.r * 0.7, 5, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = tree.r > 16 ? PALETTE.tree : PALETTE.treeDark;
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(tree.x - 4, tree.y - 5, tree.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawMarina(world) {
    // Docks and a few moored boats.
    ctx.fillStyle = '#8a6f4a';
    for (let y = MARINA.y0 + 40; y < MARINA.y1; y += 160) {
      ctx.fillRect(MARINA.x + 30, y, 190, 14);
    }
    ctx.fillStyle = '#f2f4f7';
    for (let i = 0; i < 4; i += 1) {
      const y = MARINA.y0 + 90 + i * 160;
      ctx.beginPath();
      ctx.ellipse(MARINA.x + 130, y, 52, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8b13a';
      ctx.fillRect(MARINA.x + 120, y - 26, 20, 26);
      ctx.fillStyle = '#f2f4f7';
    }
  }

  function drawPickups(world) {
    for (const p of world.pickups) {
      const bob = Math.sin(p.bob) * 3;
      if (p.kind === 'cash') {
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5a00';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText('$', p.x - 5, p.y + bob + 5);
      } else if (p.kind === 'health') {
        ctx.fillStyle = '#f2f4f7';
        ctx.fillRect(p.x - 11, p.y - 11 + bob, 22, 22);
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(p.x - 3, p.y - 8 + bob, 6, 16);
        ctx.fillRect(p.x - 8, p.y - 3 + bob, 16, 6);
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#2f2f38';
        ctx.fillRect(p.x - 10, p.y - 8 + bob, 20, 16);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(p.x - 6, p.y - 5 + bob, 4, 10);
        ctx.fillRect(p.x + 2, p.y - 5 + bob, 4, 10);
      } else {
        ctx.fillStyle = '#c8ccd2';
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, 6, 0.6, Math.PI * 1.4);
        ctx.stroke();
      }
    }
  }

  function drawMarker(world, objective) {
    if (!objective) return;
    const pulse = 1 + Math.sin(world.time * 4) * 0.12;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(objective.x, objective.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,194,48,0.25)';
    ctx.beginPath();
    ctx.arc(objective.x, objective.y, 34 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // A light column so the marker reads from far away.
    const gradient = ctx.createLinearGradient(0, objective.y - 260, 0, objective.y);
    gradient.addColorStop(0, 'rgba(242,194,48,0)');
    gradient.addColorStop(1, 'rgba(242,194,48,0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(objective.x - 8, objective.y - 260, 16, 260);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(objective.x, objective.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(car, world) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, -car.length / 2 + 4, -car.width / 2 + 6, car.length, car.width, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.kind === 'wrecked' ? '#3a3a3a' : car.color;
    roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 9);
    ctx.stroke();
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    roundRect(ctx, -car.length * 0.08, -car.width / 2 + 4, car.length * 0.22, car.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, -car.length * 0.32, -car.width / 2 + 5, car.length * 0.2, car.width - 10, 4);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#14141a';
    const wl = car.length * 0.28;
    const ww = car.width / 2 + 2;
    ctx.fillRect(-wl, -ww - 3, 14, 6);
    ctx.fillRect(wl - 4, -ww - 3, 14, 6);
    ctx.fillRect(-wl, ww - 3, 14, 6);
    ctx.fillRect(wl - 4, ww - 3, 14, 6);
    if (car.model === 'taxi') {
      ctx.fillStyle = '#14141a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('TAXI', -14, 4);
    }
    if (car.kind === 'police') {
      // Flashing light bar.
      const phase = Math.floor(world.time * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#e5534b' : '#3f6fd8';
      ctx.fillRect(-8, -car.width / 2 - 2, 16, 7);
      ctx.fillStyle = phase ? '#3f6fd8' : '#e5534b';
      ctx.fillRect(-8, car.width / 2 - 5, 16, 7);
      ctx.fillStyle = '#f2f4f7';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('PD', -8, 4);
    }
    if (car.kind === 'wrecked') {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(-6, -4, 12 + Math.sin(world.time * 5) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, down, isOfficer) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8a078';
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8a078';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (isOfficer) {
      ctx.fillStyle = '#14141a';
      ctx.beginPath();
      ctx.arc(4, 0, 6.5, Math.PI, 0);
      ctx.fill();
    }
    // Facing tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawWorld(world, objective) {
    const cam = world.camera;
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.save();
    ctx.translate(VIEW.width / 2, VIEW.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
    drawGround(world);
    drawRoads();
    drawPark(world);
    drawMarina(world);
    drawBuildings(world);
    drawTrees(world);
    drawPickups(world);
    drawMarker(world, objective);
    for (const car of world.cars) drawCar(car, world);
    // A white ring marks the player's car so it reads at a glance.
    if (world.player.inCar) {
      const car = world.player.inCar;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(car.x, car.y, car.length * 0.62, car.width * 0.85, car.angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const ped of world.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.state === 'down', false);
    }
    for (const officer of world.wanted.officers) {
      drawPerson(officer.x, officer.y, officer.angle, '#1f3a8a', officer.down, true);
    }
    const { player } = world;
    if (!player.inCar) {
      // A white ring marks the player so they read at a glance.
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
      ctx.stroke();
      drawPerson(player.x, player.y, player.angle, '#2f7fd0', false, false);
      if (player.hasPistol) {
        ctx.strokeStyle = '#2f2f38';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12);
        ctx.lineTo(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26);
        ctx.stroke();
      }
    }
    // Muzzle tracers.
    for (const t of world.tracers) {
      ctx.strokeStyle = `rgba(255,240,160,${Math.max(0, t.life * 8)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    // Particles.
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Warm afternoon light over everything.
    const light = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
    light.addColorStop(0, 'rgba(255,220,150,0.05)');
    light.addColorStop(1, 'rgba(255,180,90,0.08)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawMinimap(world, objective) {
    if (!mctx) return;
    const sx = MINIMAP_W / WORLD.width;
    const sy = MINIMAP_H / WORLD.height;
    mctx.fillStyle = '#5d8a4a';
    mctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
    mctx.fillStyle = '#3f8fbf';
    mctx.fillRect(0, BEACH.waterY * sy, MINIMAP_W, MINIMAP_H - BEACH.waterY * sy);
    mctx.fillStyle = '#e8d29a';
    mctx.fillRect(0, BEACH.y * sy, MINIMAP_W, (BEACH.waterY - BEACH.y) * sy);
    mctx.fillStyle = '#3d3a38';
    for (const a of AVENUES) mctx.fillRect(a * sx - 2, 0, 4, MINIMAP_H);
    for (const s of STREETS) mctx.fillRect(0, s * sy - 2, MINIMAP_W, 4);
    mctx.fillStyle = '#6da054';
    mctx.fillRect(world.city.park.x * sx, world.city.park.y * sy, world.city.park.w * sx, world.city.park.h * sy);
    for (const b of world.city.buildings) {
      mctx.fillStyle = 'rgba(0,0,0,0.35)';
      mctx.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }
    for (const car of world.cars) {
      if (car.kind === 'parked' || car.kind === 'wrecked') continue;
      mctx.fillStyle = car.kind === 'police' ? '#ff5a4a' : '#e8e8e8';
      mctx.fillRect(car.x * sx - 1, car.y * sy - 1, 3, 3);
    }
    for (const o of world.wanted.officers) {
      mctx.fillStyle = '#ff5a4a';
      mctx.beginPath();
      mctx.arc(o.x * sx, o.y * sy, 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
    if (objective) {
      const pulse = 3 + Math.sin(world.time * 5) * 1.5;
      mctx.fillStyle = PALETTE.gold;
      mctx.beginPath();
      mctx.arc(objective.x * sx, objective.y * sy, pulse + 2, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#7a5a00';
      mctx.lineWidth = 1;
      mctx.stroke();
    }
    const { player } = world;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;
    const pa = player.inCar ? player.inCar.angle : player.angle;
    mctx.save();
    mctx.translate(px * sx, py * sy);
    mctx.rotate(pa);
    mctx.fillStyle = '#ffffff';
    mctx.strokeStyle = '#14141a';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.moveTo(6, 0);
    mctx.lineTo(-4, -4);
    mctx.lineTo(-4, 4);
    mctx.closePath();
    mctx.fill();
    mctx.stroke();
    mctx.restore();
    mctx.strokeStyle = 'rgba(0,0,0,0.5)';
    mctx.lineWidth = 2;
    mctx.strokeRect(1, 1, MINIMAP_W - 2, MINIMAP_H - 2);
  }

  return {
    draw(world, objective) {
      ctx.clearRect(0, 0, VIEW.width, VIEW.height);
      drawWorld(world, objective);
      drawMinimap(world, objective);
    },
  };
}
