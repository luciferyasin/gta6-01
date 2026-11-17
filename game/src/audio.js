// All sound is synthesised with WebAudio: no audio files, no network. Engine hum, sirens,
// gunshots, punches, pickups and a low-key bass-line loop are built from oscillators and
// filtered noise, and everything runs through one master gain with a mute toggle.

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  // A minor-key bass walk, one note a beat, with a soft hat tick on the off-beats.
  const BASS_LINE = [55, 0, 55, 65.41, 49, 0, 58.27, 65.41, 55, 0, 55, 65.41, 73.42, 65.41, 58.27, 49];
  const BEAT = 0.42;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // The engine is two detuned saws through a low-pass, pitched by speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'sawtooth';
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // The siren is one square wave that swings between two notes.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!context) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  function startMusic() {
    if (!context || musicTimer) return;
    musicTimer = setInterval(() => {
      if (!context || muted) return;
      const freq = BASS_LINE[musicStep % BASS_LINE.length];
      if (freq > 0) blip(freq, BEAT * 0.9, 'triangle', 0.5);
      // Hat tick on the off-beat.
      if (musicStep % 2 === 1) noiseBurst(0.03, 0.05, 6000);
      musicStep += 1;
    }, BEAT * 1000);
  }

  return {
    /** Call from a user gesture (the start button); safe to call any time. */
    unlock() {
      if (ensure()) startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** speed01 is 0..1; called every frame while driving. */
    engine(speed01, on) {
      if (!context) return;
      const target = on ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      const freq = 55 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(freq, context.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.007 + 3, context.currentTime, 0.08);
    },
    /** Call every frame; the siren sounds only while police are near. */
    siren(on, dt) {
      if (!context) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.1);
      if (!on) return;
      sirenTimer += dt;
      const phase = Math.floor(sirenTimer / 0.45) % 2;
      sirenOsc.frequency.setTargetAtTime(phase === 0 ? 720 : 960, context.currentTime, 0.05);
    },
    shoot() {
      noiseBurst(0.14, 0.5, 1800);
      blip(160, 0.1, 'square', 0.3, 60);
    },
    punch() {
      noiseBurst(0.09, 0.4, 500);
    },
    crash() {
      noiseBurst(0.3, 0.5, 900);
      blip(90, 0.25, 'sine', 0.4, 40);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.35);
      setTimeout(() => blip(1318, 0.12, 'sine', 0.35), 70);
    },
    cash() {
      blip(988, 0.08, 'triangle', 0.4);
      setTimeout(() => blip(1319, 0.14, 'triangle', 0.4), 60);
    },
    missionComplete() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => setTimeout(() => blip(freq, 0.22, 'triangle', 0.4), i * 110));
    },
    busted() {
      const notes = [392, 330, 262, 196];
      notes.forEach((freq, i) => setTimeout(() => blip(freq, 0.3, 'sawtooth', 0.25), i * 160));
    },
    horn() {
      blip(370, 0.18, 'square', 0.18);
      blip(466, 0.18, 'square', 0.14);
    },
  };
}
