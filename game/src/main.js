// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over. The title
// keeps the city alive behind it, so the first thing a player sees is Solmar Bay moving.
//
// ?seed=N fixes the city's random pattern. ?shot=chase|street|mission|standoff (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, VIEW } from './config.js';
import { createWorld, updateWorld } from './world.js';
import { createRenderer } from './render.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { currentObjective, startStory } from './missions.js';
import { hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const status = document.getElementById('status');
const renderer = createRenderer(canvas, minimap);
const audio = createAudio();
const input = createInput(canvas);

let world = createWorld(seed);
let screen = 'title';
let muted = false;

const ui = createUI({
  onNewGame() {
    audio.unlock();
    world = createWorld(Math.floor(Math.random() * 4294967296));
    ui.resetFeed();
    startStory(world.missions, storyCtx());
    ui.showHud();
    screen = 'play';
    status.textContent = 'Playing. Follow the gold marker.';
  },
  onContinue() {
    audio.unlock();
    const save = loadGame();
    world = createWorld(seed);
    if (save) applySave(world, save);
    ui.resetFeed();
    if (!world.missions.started) startStory(world.missions, storyCtx());
    ui.showHud();
    screen = 'play';
    status.textContent = 'Playing. Welcome back to Solmar Bay.';
  },
  onResume() {
    ui.hidePause();
    screen = 'play';
  },
  onRestart() {
    audio.unlock();
    world = createWorld(Math.floor(Math.random() * 4294967296));
    ui.resetFeed();
    ui.hidePause();
    startStory(world.missions, storyCtx());
    ui.showHud();
    screen = 'play';
  },
  onQuitToTitle() {
    saveGame(world);
    ui.hidePause();
    ui.hideOver();
    screen = 'title';
    ui.showTitle(hasSave());
  },
  onRetry() {
    world.gameOver = null;
    ui.hideOver();
    ui.showHud();
    screen = 'play';
  },
  onMuteToggle() {
    muted = !muted;
    audio.setMuted(muted);
    ui.setMuted(muted);
  },
});

function storyCtx() {
  return {
    messages: world.messages,
    audio,
    wanted: world.wanted,
    now: world.time,
  };
}

function applySave(target, save) {
  target.player.money = save.money;
  target.player.x = save.playerX;
  target.player.y = save.playerY;
  target.player.health = save.health;
  target.player.ammo = save.ammo;
  target.player.hasPistol = save.hasPistol;
  target.missions.index = Math.min(save.missionIndex, 2);
  target.missions.stage = save.missionStage;
  target.missions.started = save.missionStarted;
  target.missions.done = save.storyDone;
  target.camera.x = save.playerX;
  target.camera.y = save.playerY;
}

/** Screen-space mouse (CSS pixels) to logical canvas pixels. */
function logicalMouse() {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (input.mouse.x / Math.max(1, rect.width)) * VIEW.width,
    y: (input.mouse.y / Math.max(1, rect.height)) * VIEW.height,
  };
}

/** Logical canvas pixels to world pixels, through the camera. */
function pointerToWorld() {
  const lm = logicalMouse();
  const cam = world.camera;
  return {
    x: (lm.x - VIEW.width / 2) / cam.zoom + cam.x,
    y: (lm.y - VIEW.height / 2) / cam.zoom + cam.y,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  ui.showHud();
  function paint() {
    const objective = currentObjective(world.missions, world.city.places);
    world.pointer = pointerToWorld();
    renderer.draw(world, objective);
    ui.update(world, objective, logicalMouse());
    window.__shotReady = true;
  }
  requestAnimationFrame(paint);
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function stepGame(actions) {
    world.pointer = pointerToWorld();
    const out = updateWorld(world, input, STEP, audio, actions);
    if (out.missionComplete) {
      ui.toastMessage(world.storyComplete ? 'STORY COMPLETE — KING OF SOLMAR BAY' : 'MISSION COMPLETE', 3000);
    }
    if (out.busted || out.wasted) {
      screen = 'over';
      ui.showOver(out.busted ? 'busted' : 'wasted', out.lost || 0);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      ui.setMuted(muted);
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) {
        ui.showHud();
        startStory(world.missions, storyCtx());
        screen = 'play';
      } else {
        // The city lives behind the title: traffic and pedestrians move, nobody plays.
        const idle = {
          move: () => ({ x: 0, y: 0 }),
          drive: () => ({ throttle: 0, steer: 0 }),
          sprint: () => false,
          handbrake: () => false,
          mouse: { x: 0, y: 0, down: false, clicked: false },
          takeActions: () => 0,
          takeClick: () => false,
        };
        while (accumulator >= STEP) {
          updateWorld(world, idle, STEP, audio, 0);
          accumulator -= STEP;
        }
      }
    } else if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'paused';
        ui.showPause();
      } else {
        while (accumulator >= STEP) {
          stepGame(actions);
          accumulator -= STEP;
          if (screen !== 'play') break;
        }
      }
    } else if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        ui.hidePause();
        screen = 'play';
      }
      accumulator = 0;
    } else {
      // Game over: the world waits for Retry.
      accumulator = 0;
    }
    const objective = currentObjective(world.missions, world.city.places);
    renderer.draw(world, objective);
    if (screen === 'play' || screen === 'paused') ui.update(world, objective, logicalMouse());
  }

  ui.showTitle(hasSave());
  ui.setMuted(false);
  requestAnimationFrame(frame);

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      ui.showPause();
    }
  });
}

if (shot) runShot(shot);
else runGame();
