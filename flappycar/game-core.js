/* Shared, deterministic simulation. Coordinates are logical pixels; time is seconds. */
(function (root) {
  'use strict';
  const WIDTH = 432, HEIGHT = 720, LANES = [108, 216, 324];
  const MODES = {
    easy: { speed: 220, interval: 1.65 },
    medium: { speed: 290, interval: 1.4 },
    hard: { speed: 365, interval: 1.18 },
  };
  function create(mode = 'easy') {
    if (!MODES[mode]) mode = 'easy';
    return { mode, phase: 'ready', lane: 1, x: LANES[1], y: 526, score: 0, distance: 0, time: 0, spawnIn: .8, obstacles: [] };
  }
  function steer(state, direction) {
    if (state.phase === 'running') state.lane = Math.max(0, Math.min(2, state.lane + direction));
  }
  function collision(state, obstacle) {
    return Math.abs(state.x - LANES[obstacle.lane]) < 42 && state.y + 32 > obstacle.y - 37 && state.y - 32 < obstacle.y + 37;
  }
  function update(state, dt, random = Math.random) {
    if (state.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    const config = MODES[state.mode];
    state.time += dt;
    const speed = config.speed + Math.min(60, state.score * 2);
    state.distance += speed * dt;
    state.x += (LANES[state.lane] - state.x) * (1 - Math.exp(-19 * dt));
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      const open = Math.floor(random() * 3);
      let blocked = [0, 1, 2].filter(lane => lane !== open);
      if (state.mode === 'easy' && random() < .45) blocked = [blocked[Math.floor(random() * 2)]];
      const wave = { counted: false };
      for (const lane of blocked) state.obstacles.push({ lane, y: -100, color: Math.floor(random() * 4), wave });
      state.spawnIn += config.interval;
    }
    for (const obstacle of state.obstacles) obstacle.y += speed * dt;
    // Use the visible car position during lane changes, not the destination lane.
    if (state.obstacles.some(obstacle => collision(state, obstacle))) { state.phase = 'over'; return; }
    for (const obstacle of state.obstacles) {
      if (!obstacle.wave.counted && obstacle.y - 46 > state.y + 38) {
        obstacle.wave.counted = true;
        state.score += 1;
      }
    }
    state.obstacles = state.obstacles.filter(obstacle => obstacle.y < HEIGHT + 110);
  }
  const api = { WIDTH, HEIGHT, LANES, MODES, create, steer, collision, update };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RaceCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
