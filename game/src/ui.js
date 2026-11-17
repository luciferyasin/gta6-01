// The DOM around the canvas: the HUD (health, money, wanted stars, objective, speed),
// Vera's message feed, the title, pause and busted/wasted screens, the damage flash and
// the crosshair. The canvas draws the world; this module owns everything drawn in HTML.

import { dist } from './utils.js';

export function createUI(callbacks) {
  const hud = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const moneyText = document.getElementById('money-text');
  const starsBox = document.getElementById('stars');
  const objectiveText = document.getElementById('objective-text');
  const objectiveDist = document.getElementById('objective-dist');
  const speedText = document.getElementById('speed-text');
  const ammoText = document.getElementById('ammo-text');
  const hintText = document.getElementById('hint-text');
  const messagesBox = document.getElementById('messages');
  const toast = document.getElementById('toast');
  const damage = document.getElementById('damage');
  const crosshair = document.getElementById('crosshair');
  const titleScreen = document.getElementById('title-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const overScreen = document.getElementById('over-screen');
  const overTitle = document.getElementById('over-title');
  const overText = document.getElementById('over-text');
  const continueButton = document.getElementById('btn-continue');
  const muteButton = document.getElementById('btn-mute');
  const status = document.getElementById('status');
  let toastTimer = null;
  let lastMessages = 0;

  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }
  bind('btn-new', () => callbacks.onNewGame());
  bind('btn-continue', () => callbacks.onContinue());
  bind('btn-resume', () => callbacks.onResume());
  bind('btn-restart', () => callbacks.onRestart());
  bind('btn-quit', () => callbacks.onQuitToTitle());
  bind('btn-retry', () => callbacks.onRetry());
  bind('btn-mute', () => callbacks.onMuteToggle());
  bind('btn-over-title', () => callbacks.onQuitToTitle());

  function starRow(n) {
    let out = '';
    for (let i = 0; i < 5; i += 1) out += i < n ? '★' : '☆';
    return out;
  }

  return {
    showTitle(hasSave) {
      titleScreen.classList.remove('hidden');
      pauseScreen.classList.add('hidden');
      overScreen.classList.add('hidden');
      hud.classList.add('hidden');
      continueButton.classList.toggle('hidden', !hasSave);
      status.textContent = 'Solmar Bay. Press Enter or click New Game to start.';
    },
    showPause() {
      pauseScreen.classList.remove('hidden');
      status.textContent = 'Paused.';
    },
    hidePause() {
      pauseScreen.classList.add('hidden');
    },
    showOver(reason, lost) {
      overTitle.textContent = reason === 'busted' ? 'BUSTED' : 'WASTED';
      overText.textContent = reason === 'busted'
        ? `The Solmar PD caught up with you. They took $${lost} and your afternoon.`
        : `You woke up in Solmar General, $${lost} lighter.`;
      overScreen.classList.remove('hidden');
      hud.classList.add('hidden');
      status.textContent = overTitle.textContent;
    },
    hideOver() {
      overScreen.classList.add('hidden');
    },
    showHud() {
      hud.classList.remove('hidden');
      titleScreen.classList.add('hidden');
      overScreen.classList.add('hidden');
    },
    /** The centre announcement (mission complete, story complete). */
    toastMessage(text, ms) {
      toast.textContent = text;
      toast.classList.remove('hidden');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add('hidden'), ms || 2600);
    },
    setMuted(muted) {
      muteButton.textContent = muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    },
    update(world, objective, pointer) {
      const { player } = world;
      const hp = Math.max(0, Math.round(player.health));
      healthFill.style.width = `${hp}%`;
      healthFill.className = hp > 50 ? 'good' : hp > 25 ? 'warn' : 'bad';
      healthText.textContent = `${hp}`;
      moneyText.textContent = `$${player.money.toLocaleString('en-US')}`;
      starsBox.textContent = starRow(world.wanted.stars);
      starsBox.className = world.wanted.stars > 0 ? 'hot' : '';
      if (objective) {
        objectiveText.textContent = objective.text;
        const d = Math.round(dist(player.x, player.y, objective.x, objective.y));
        objectiveDist.textContent = `${d}m`;
      } else {
        objectiveText.textContent = world.storyComplete
          ? 'Free roam — Solmar Bay is yours'
          : 'No active job — see Vera at the garage';
        objectiveDist.textContent = '';
      }
      if (player.inCar) {
        const kmh = Math.round(Math.abs(player.inCar.speed) * 0.36);
        speedText.textContent = `${kmh} km/h`;
        hintText.textContent = 'W/S drive · A/D steer · Space handbrake · E get out · H horn';
      } else {
        speedText.textContent = '';
        hintText.textContent = player.hasPistol
          ? 'WASD move · Shift sprint · E enter car · F punch · Click shoot · M mute'
          : 'WASD move · Shift sprint · E enter car · F punch · M mute';
      }
      ammoText.textContent = player.hasPistol ? `🔫 ${player.ammo}` : '';
      // The damage flash grows as health falls.
      damage.style.opacity = player.health < 35 ? String((35 - player.health) / 55) : '0';
      // The crosshair follows the mouse while armed on foot.
      if (player.hasPistol && !player.inCar) {
        crosshair.classList.remove('hidden');
        crosshair.style.left = `${pointer.x}px`;
        crosshair.style.top = `${pointer.y}px`;
      } else {
        crosshair.classList.add('hidden');
      }
      // New messages join the feed (newest on top, five at most).
      while (lastMessages < world.messages.length) {
        const text = world.messages[lastMessages];
        lastMessages += 1;
        const div = document.createElement('div');
        div.className = 'message';
        div.textContent = text;
        messagesBox.prepend(div);
        while (messagesBox.children.length > 5) messagesBox.removeChild(messagesBox.lastChild);
      }
    },
    /** Reset the feed (a new game starts it over). */
    resetFeed() {
      messagesBox.innerHTML = '';
      lastMessages = 0;
    },
  };
}
