// Save and load through localStorage: money, mission progress, the player's spot and
// health. The game autosaves when a mission ends and from the pause menu; the title screen
// offers Continue when a save exists. Storage can be off (private windows): every call is
// guarded, and a failed save never breaks the game.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      money: state.player.money,
      missionIndex: state.missions.index,
      missionStage: state.missions.stage,
      missionStarted: state.missions.started,
      storyDone: state.missions.done,
      playerX: Math.round(state.player.x),
      playerY: Math.round(state.player.y),
      health: state.player.health,
      ammo: state.player.ammo,
      hasPistol: state.player.hasPistol,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.playerX !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasSave() {
  return loadGame() !== null;
}
