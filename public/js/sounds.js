/**
 * BLOB ARENA - Sound Effects (Web Audio API, no files needed)
 */

const Sounds = (() => {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  function playTone(freq, type = 'square', duration = 0.08, volume = 0.15, decay = 0.08) {
    if (!enabled) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + duration);
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration + decay);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + decay + 0.01);
    } catch(e) {}
  }

  function playNoise(duration = 0.05, volume = 0.1, freq = 800) {
    if (!enabled) return;
    try {
      const c = getCtx();
      const bufferSize = c.sampleRate * duration;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      const source = c.createBufferSource();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      source.start();
    } catch(e) {}
  }

  return {
    shoot() {
      playTone(520, 'sawtooth', 0.04, 0.12, 0.03);
    },
    hit() {
      playNoise(0.08, 0.2, 600);
      playTone(200, 'square', 0.05, 0.1);
    },
    die() {
      // Descending explosion
      playTone(300, 'sawtooth', 0.15, 0.3, 0.2);
      setTimeout(() => playTone(150, 'square', 0.2, 0.2, 0.3), 80);
      playNoise(0.3, 0.3, 200);
    },
    powerUp() {
      playTone(440, 'sine', 0.05, 0.2);
      setTimeout(() => playTone(660, 'sine', 0.05, 0.2), 60);
      setTimeout(() => playTone(880, 'sine', 0.1,  0.3), 120);
    },
    countdown() {
      playTone(600, 'square', 0.1, 0.2, 0.05);
    },
    go() {
      playTone(880, 'square', 0.05, 0.3);
      setTimeout(() => playTone(1100, 'square', 0.1, 0.4, 0.1), 60);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => setTimeout(() => playTone(n, 'sine', 0.15, 0.25, 0.1), i * 120));
    },
    lose() {
      const notes = [400, 350, 300, 200];
      notes.forEach((n, i) => setTimeout(() => playTone(n, 'sawtooth', 0.12, 0.2, 0.1), i * 100));
    },
    click() {
      playTone(440, 'sine', 0.03, 0.1, 0.02);
    },
    toggle() { enabled = !enabled; return enabled; }
  };
})();
