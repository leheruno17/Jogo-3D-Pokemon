import * as THREE from './vendor/three.module.js';

/* Pokémon Chibi Adventure — atividade prática SENAI-SP.
 * Toda a geometria é criada com primitivas. A disposição do mapa usa
 * exclusivamente o PRNG da fase; não há dependências além do Three.js local.
 */
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['hud', 'menu', 'result', 'transition', 'timer',
  'phase-number', 'biome-name', 'collection-count', 'time-fill', 'phase-dots',
  'boost-indicator', 'boost-time', 'boost-fill', 'pause-button', 'game-footer',
  'touch-controls', 'seed-label'].map((id) => [id, $(id)]));

const PHASES = [
  { name: 'Rota Inicial', ground: 0x83ad61, fog: 0xaccb91, obstacle: 'rock', count: 12, balls: 8, time: 90 },
  { name: 'Floresta', ground: 0x315d43, fog: 0x749b78, obstacle: 'tree', count: 18, balls: 10, time: 80 },
  { name: 'Caverna', ground: 0x343b4c, fog: 0x686783, obstacle: 'crystal', count: 24, balls: 12, time: 70 },
  { name: 'Vulcão', ground: 0x9d4836, fog: 0xc88259, obstacle: 'lavaRock', count: 28, balls: 14, time: 60 },
  { name: 'Liga Pokémon', ground: 0x677e91, fog: 0x9bb6be, obstacle: 'pillar', count: 34, balls: 16, time: 50 },
];
const HALF_MAP = 18;
const PLAYER_RADIUS = 0.52;
const SAFE_RADIUS = 3.6;
const BASE_SPEED = 6;
const keys = new Set();
const velocity = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 22, 17);
let scene, renderer, camera, map, player, sun;
let obstacles = [], items = [], enemies = [], particles = [];
let state = 'menu', phase = 0, collected = 0, remaining = 90;
let totalTime = 0, boost = 0, walkTime = 0, invulnerable = 0;
let transitionRemaining = 0, bumpCooldown = 0, toastTimeout;
let previousFrame = 0, visualTime = 0;
let audioContext, muted = false;
const bgm = $('bgm');
bgm.volume = 0.25;

// Mulberry32: mesma seed => mesma sequência e mesmo layout ao reiniciar.
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });
}
const mats = {
  yellow: material(0xffcf35), black: material(0x20242a), red: material(0xee494b),
  white: material(0xfffbef), brown: material(0x87502e), pink: material(0xff879a),
  candy: material(0x90deff, { metalness: 0.45, roughness: 0.22, emissive: 0x145377, emissiveIntensity: 0.3 }),
  gold: material(0xffdf56, { metalness: 0.35, roughness: 0.3, emissive: 0xc18b17, emissiveIntensity: 0.25 }),
};
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function sphere(parent, mat, radius, x = 0, y = 0, z = 0, segments = 20) {
  return mesh(new THREE.SphereGeometry(radius, segments, 14), mat, parent, x, y, z);
}
function cylinder(parent, mat, top, bottom, height, x = 0, y = 0, z = 0, segments = 12) {
  return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), mat, parent, x, y, z);
}

function createPikachu() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = sphere(body, mats.yellow, 0.64, 0, 0.86, 0);
  torso.scale.set(0.9, 1.06, 0.83);
  const head = new THREE.Group();
  head.position.y = 1.78;
  body.add(head);
  const face = sphere(head, mats.yellow, 0.83);
  face.scale.set(1.08, 0.95, 0.91);
  // O rosto olha para +Z; todo o grupo gira para a direção de movimento.
  for (const side of [-1, 1]) {
    const eye = sphere(head, mats.black, 0.115, side * 0.32, 0.07, 0.692);
    eye.scale.z = 0.55;
    sphere(head, mats.white, 0.038, side * 0.32 - 0.018, 0.106, 0.752, 12);
    const cheek = sphere(head, mats.red, 0.178, side * 0.65, -0.18, 0.51);
    cheek.scale.set(1, 0.89, 0.4);
    cheek.rotation.y = side * 0.42;
    const ear = new THREE.Group();
    ear.position.set(side * 0.5, 0.62, -0.03);
    ear.rotation.z = -side * 0.24;
    head.add(ear);
    cylinder(ear, mats.yellow, 0.10, 0.18, 0.79, 0, 0.36, 0);
    mesh(new THREE.ConeGeometry(0.105, 0.4, 12), mats.black, ear, 0, 0.94, 0);
  }
  sphere(head, mats.black, 0.055, 0, -0.115, 0.764, 12);
  // Duas curvas finas formam o sorriso (primitiva TorusGeometry).
  for (const side of [-1, 1]) {
    const smile = mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 16, Math.PI), mats.black, head, side * 0.073, -0.265, 0.735);
    smile.rotation.z = Math.PI;
  }
  const arms = [], feet = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.54, 1.07, 0.02);
    arm.rotation.z = side * 0.18;
    body.add(arm);
    mesh(new THREE.CapsuleGeometry(0.16, 0.24, 5, 10), mats.yellow, arm, 0, -0.2, 0);
    arms.push(arm);
    const foot = sphere(body, mats.yellow, 0.24, side * 0.32, 0.23, 0.16);
    foot.scale.set(0.8, 0.65, 1.45);
    feet.push(foot);
    const stripe = sphere(body, mats.brown, 0.20, 0, 0.8 + side * 0.17, -0.49);
    stripe.scale.set(1.5, 0.25, 0.25);
  }
  // Cauda em zigue-zague composta por pequenos cilindros achatados.
  const tail = new THREE.Group();
  tail.position.set(0.1, 0.65, -0.45);
  tail.rotation.x = -0.45;
  body.add(tail);
  [[0.12, 0.1, -0.2, -0.7, 0.45], [0.25, 0.45, -0.4, 0.7, 0.55], [0.5, 0.78, -0.5, -0.65, 0.68]].forEach(([x, y, z, angle, height], i) => {
    const part = cylinder(tail, i === 0 ? mats.brown : mats.yellow, 0.19, 0.19, height, x, y, z, 4);
    part.rotation.z = angle;
    part.scale.z = 0.35;
  });
  root.userData = { body, head, arms, feet, tail };
  return root;
}

function createBall(voltorb = false) {
  const group = new THREE.Group();
  const radius = voltorb ? 0.73 : 0.38;
  // thetaLength = PI/2: duas semi-esferas reais, com cores distintas.
  mesh(new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.red, group);
  mesh(new THREE.SphereGeometry(radius, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.white, group);
  if (voltorb) {
    for (const side of [-1, 1]) {
      const eye = sphere(group, mats.white, 0.17, side * 0.27, 0.2, 0.63);
      eye.scale.set(1, 0.6, 0.25);
      sphere(group, mats.black, 0.065, side * 0.25, 0.18, 0.684, 10);
      const brow = cylinder(group, mats.black, 0.03, 0.03, 0.3, side * 0.26, 0.31, 0.65, 6);
      brow.rotation.z = side * 1.13;
    }
  } else {
    const band = mesh(new THREE.TorusGeometry(radius, 0.035, 8, 24), mats.black, group);
    band.rotation.x = Math.PI / 2;
    const button = cylinder(group, mats.black, 0.13, 0.13, 0.06, 0, 0, radius);
    button.rotation.x = Math.PI / 2;
    const center = cylinder(group, mats.white, 0.082, 0.082, 0.073, 0, 0, radius + 0.025);
    center.rotation.x = Math.PI / 2;
  }
  return group;
}

function createPowerup(type) {
  const group = new THREE.Group();
  if (type === 'candy') {
    const sweet = sphere(group, mats.candy, 0.27);
    sweet.scale.set(1.3, 0.9, 0.9);
    for (const side of [-1, 1]) {
      const paper = mesh(new THREE.ConeGeometry(0.22, 0.28, 6), mats.candy, group, side * 0.43, 0, 0);
      paper.rotation.z = side * Math.PI / 2;
    }
    const ribbon = mesh(new THREE.TorusGeometry(0.26, 0.032, 6, 16), mats.white, group);
    ribbon.rotation.y = Math.PI / 2;
  } else {
    // Um raio dourado usando cilindros de quatro lados.
    for (let i = 0; i < 3; i++) {
      const bolt = cylinder(group, mats.gold, 0.14, 0.14, 0.38, i === 1 ? 0.10 : 0, (1 - i) * 0.23, 0, 4);
      bolt.rotation.z = i === 1 ? -0.85 : 0.55;
      bolt.scale.z = 0.5;
    }
  }
  const halo = mesh(new THREE.TorusGeometry(0.54, 0.018, 6, 32), type === 'candy' ? mats.candy : mats.gold, group, 0, -0.43, 0);
  halo.rotation.x = Math.PI / 2;
  return group;
}

function createObstacle(type, rng, radius) {
  const group = new THREE.Group();
  if (type === 'tree') {
    cylinder(group, mats.brown, 0.18, 0.25, 1.05, 0, 0.52, 0);
    const green = material(new THREE.Color().setHSL(0.34 + rng() * 0.06, 0.36, 0.22 + rng() * 0.09));
    for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(radius * (1 - i * 0.22), 1.5 - i * 0.2, 8), green, group, 0, 1.35 + i * 0.65, 0);
  } else if (type === 'crystal') {
    const crystal = material(new THREE.Color().setHSL(0.57 + rng() * 0.2, 0.55, 0.58), { metalness: 0.25, roughness: 0.22, emissive: 0x322052, emissiveIntensity: 0.3 });
    for (let i = 0; i < 3; i++) {
      const angle = rng() * Math.PI * 2, size = 0.3 + rng() * 0.18, height = 1 + rng() * 1.5;
      const shard = mesh(new THREE.ConeGeometry(size, height, 5), crystal, group, Math.cos(angle) * radius * 0.32, height / 2, Math.sin(angle) * radius * 0.32);
      shard.rotation.z = (rng() - 0.5) * 0.35;
    }
  } else if (type === 'pillar') {
    const metal = material(0xa4b5c4, { metalness: 0.85, roughness: 0.18 });
    cylinder(group, metal, radius, radius, 0.2, 0, 0.1, 0);
    cylinder(group, metal, radius * 0.6, radius * 0.6, 2.1, 0, 1.2, 0);
    cylinder(group, metal, radius * 0.85, radius * 0.85, 0.18, 0, 2.3, 0);
    cylinder(group, mats.candy, radius * 0.62, radius * 0.62, 0.10, 0, 1.9, 0);
  } else {
    const rockMat = material(type === 'lavaRock' ? 0x342c2d : 0x899393, { flatShading: true });
    const stone = mesh(new THREE.DodecahedronGeometry(radius, 0), rockMat, group, 0, radius * 0.57, 0);
    stone.scale.set(0.95, 0.7 + rng() * 0.25, 0.95);
    stone.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.25);
    if (type === 'lavaRock') {
      const ember = material(0xff792f, { emissive: 0xff4d0b, emissiveIntensity: 1.5 });
      const crack = cylinder(group, ember, radius * 0.15, radius * 0.15, radius * 0.85, 0, radius * 0.9, radius * 0.5, 4);
      crack.rotation.z = 0.7;
    }
  }
  return group;
}

/* Reserva de espaços: obstáculos têm um corredor mínimo de 2,2 unidades.
 * Os discos reservados não se tocam nem encostam na borda, portanto não
 * formam paredes fechadas que prendam o jogador ou tornem itens inacessíveis.
 * Patrulhas reservam seu círculo inteiro; todos os itens nascem fora dele.
 */
function generateLayout(index) {
  const config = PHASES[index], seed = (index + 1) * 12345;
  const rng = mulberry32(seed), reserved = [], layout = [];
  function place(type, radius, gap, outer = false) {
    for (let attempt = 0; attempt < 12000; attempt++) {
      const limit = HALF_MAP - radius - 1.5;
      const x = (rng() * 2 - 1) * limit, z = (rng() * 2 - 1) * limit;
      const distance = Math.hypot(x, z);
      if (distance < SAFE_RADIUS + radius || (outer && Math.max(Math.abs(x), Math.abs(z)) < 12)) continue;
      if (reserved.some((p) => Math.hypot(x - p.x, z - p.z) < radius + p.radius + Math.max(gap, p.gap))) continue;
      const entry = { type, x, z, radius, gap, variant: rng(), angle: rng() * Math.PI * 2 };
      reserved.push(entry);
      layout.push(entry);
      return;
    }
    // Falha explícita: nunca coloca objetos sobrepostos como fallback.
    throw new Error(`Sem espaço para ${type} na seed ${seed}.`);
  }
  if (index >= 3) for (let i = 0; i < 2; i++) place('voltorb', 2.2, 1.1);
  // Na Liga, oito pilares são gerados primeiro na faixa externa da arena.
  for (let i = 0; i < config.count; i++) place('obstacle', 0.65 + rng() * 0.35, 2.2, index === 4 && i < 8);
  for (let i = 0; i < config.balls; i++) place('ball', 0.38, 0.35);
  for (let i = 0; i < 2; i++) { place('candy', 0.5, 0.35); place('speed', 0.5, 0.35); }
  return { seed, layout, rng };
}

function disposeMap() {
  if (!map) return;
  scene.remove(map);
  const shared = new Set(Object.values(mats)), geometries = new Set(), materials = new Set();
  map.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material && !shared.has(object.material)) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((mat) => mat.dispose());
}

function buildPhase(index) {
  disposeMap();
  phase = index;
  const config = PHASES[index], { seed, layout, rng } = generateLayout(index);
  map = new THREE.Group();
  scene.add(map);
  obstacles = []; items = []; enemies = []; particles = [];
  remaining = config.time; collected = 0; boost = 0;
  invulnerable = 0; bumpCooldown = 0; walkTime = 0;
  keys.clear(); velocity.set(0, 0, 0);
  player.position.set(0, 0, 0); player.rotation.y = 0;
  scene.background = new THREE.Color(config.fog);
  scene.fog = new THREE.Fog(config.fog, 38, 85);
  sun.color.setHex(index === 3 ? 0xffc096 : 0xfff5db);

  const groundMat = material(config.ground, index === 4 ? { metalness: 0.6, roughness: 0.22 } : {});
  const floor = mesh(new THREE.BoxGeometry(HALF_MAP * 2, 0.5, HALF_MAP * 2), groundMat, map, 0, -0.27, 0);
  floor.castShadow = false;
  const borderMat = material(index === 4 ? 0x283b53 : index === 3 ? 0x512e29 : 0x466343);
  // A borda e a marca do spawn definem o mapa, não posições do layout.
  for (const side of [-1, 1]) {
    mesh(new THREE.BoxGeometry(36.5, 0.35, 0.4), borderMat, map, 0, 0.03, side * HALF_MAP);
    mesh(new THREE.BoxGeometry(0.4, 0.35, 36.5), borderMat, map, side * HALF_MAP, 0.03, 0);
  }
  const ring = mesh(new THREE.TorusGeometry(2.4, 0.035, 6, 80), material(index === 4 ? 0xc9e5ef : 0xd0dfa7), map, 0, 0.015, 0);
  ring.rotation.x = Math.PI / 2;
  if (index === 4) {
    const grid = new THREE.GridHelper(36, 18, 0xa7c8d8, 0x849da9);
    grid.position.y = 0.006;
    grid.material.transparent = true; grid.material.opacity = 0.28;
    map.add(grid);
  }
  // Pequenos detalhes também seguem a seed (grama, pedrinhas ou brasas).
  const detailMat = material(index === 3 ? 0xe89b54 : index === 2 ? 0x666580 : index === 4 ? 0xc0d6df : 0xb6cd80);
  for (let i = 0; i < 90; i++) {
    const x = (rng() * 2 - 1) * 17.3, z = (rng() * 2 - 1) * 17.3;
    if (Math.hypot(x, z) < 3 || layout.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 0.5)) continue;
    const detail = mesh(new THREE.ConeGeometry(0.06 + rng() * 0.08, 0.13 + rng() * 0.12, 4), detailMat, map, x, 0.07, z);
    detail.rotation.y = rng() * Math.PI;
    detail.castShadow = false;
  }
  for (const entry of layout) {
    const { x, z, radius, type, angle, variant } = entry;
    if (type === 'obstacle') {
      const object = createObstacle(config.obstacle, rng, radius);
      object.position.set(x, 0, z); object.rotation.y = angle;
      map.add(object); obstacles.push({ x, z, radius, object });
    } else if (type === 'voltorb') {
      const object = createBall(true);
      map.add(object);
      enemies.push({ object, x, z, angle, patrolRadius: 1.4, speed: 0.7 + variant * 0.35, radius: 0.73 });
    } else {
      const object = type === 'ball' ? createBall() : createPowerup(type);
      object.position.set(x, 0.72, z); object.rotation.y = angle;
      map.add(object); items.push({ type, x, z, radius, object, offset: angle, active: true });
    }
  }
  updateEnemies(0);
  cameraTarget.set(0, 0, 0); camera.position.copy(cameraOffset); camera.lookAt(cameraTarget);
  ui['seed-label'].textContent = `SEED ${seed}`;
  ui['phase-number'].textContent = `${index + 1} / 5`;
  ui['biome-name'].textContent = config.name;
  ui['phase-dots'].replaceChildren(...PHASES.map((_, i) => {
    const dot = document.createElement('i'); dot.classList.toggle('active', i <= index); return dot;
  }));
  updateHUD();
}

// BGM começa dentro do gesto do usuário; SFX usam apenas Web Audio nativa.
function unlockAudio() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* O jogo continua em navegadores sem Web Audio. */ }
  if (!muted) bgm.play().catch(() => showToast('Música indisponível. Confira o arquivo Musica.mp3.'));
}
function tone(frequency, start, length, type = 'sine', volume = 0.10) {
  if (muted || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  const at = audioContext.currentTime + start;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, at + length);
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.start(at); oscillator.stop(at + length + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function sfx(type) {
  if (type === 'ball') { tone(1047, 0, 0.12); tone(1568, 0.06, 0.16); }
  if (type === 'power') [659, 880, 1319].forEach((f, i) => tone(f, i * 0.075, 0.20, 'triangle'));
  if (type === 'bump') tone(105, 0, 0.16, 'triangle', 0.13);
  if (type === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle'));
  if (type === 'lose') [330, 247, 165].forEach((f, i) => tone(f, i * 0.18, 0.3, 'triangle'));
}
function toggleSound() {
  muted = !muted; bgm.muted = muted;
  $('sound-button').textContent = `Som: ${muted ? 'desligado' : 'ligado'}`;
  $('sound-button').setAttribute('aria-pressed', String(muted));
  if (!muted && (state === 'playing' || state === 'transition')) unlockAudio();
}
function showToast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2400);
}
function formatTime(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function updateHUD() {
  ui.timer.textContent = formatTime(remaining);
  ui.timer.parentElement.classList.toggle('urgent', remaining <= 15);
  ui['time-fill'].style.width = `${Math.min(100, remaining / PHASES[phase].time * 100)}%`;
  ui['collection-count'].textContent = `${collected} / ${PHASES[phase].balls}`;
  ui['boost-indicator'].hidden = boost <= 0 || state === 'menu';
  ui['boost-time'].textContent = `${boost.toFixed(1)}s`;
  ui['boost-fill'].style.width = `${boost / 5 * 100}%`;
}
function setGameUI(visible) {
  ui.hud.hidden = !visible; ui['pause-button'].hidden = !visible;
  ui['game-footer'].hidden = !visible;
  ui['touch-controls'].hidden = !visible || !window.matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('playing', visible);
}
function startGame(retry = false) {
  // Acumula somente o tempo jogado, inclusive tentativas que falharam.
  if (!retry) totalTime = 0;
  buildPhase(retry ? phase : 0);
  state = 'playing'; ui.menu.hidden = true; ui.result.hidden = true; ui.transition.hidden = true;
  setGameUI(true); unlockAudio();
  showToast('Colete as Pokébolas! Doce Raro: +10s · Raio: agilidade');
}
function openResult(mode) {
  state = mode; keys.clear(); velocity.set(0, 0, 0); bgm.pause();
  ui.result.hidden = false; ui['pause-button'].hidden = true; ui['touch-controls'].hidden = true;
  const pause = mode === 'paused', won = mode === 'won';
  $('result-icon').textContent = pause ? 'Ⅱ' : won ? '★' : '⌛';
  $('result-label').textContent = pause ? 'RESPIRA. SUA AVENTURA ESPERA.' : won ? 'CINCO FASES. UMA GRANDE CONQUISTA.' : `FASE ${phase + 1} · ${PHASES[phase].name.toUpperCase()}`;
  $('result-title').textContent = pause ? 'Jogo pausado' : won ? 'Campeão da Liga Pokémon!' : 'Tempo Esgotado';
  $('result-description').textContent = pause ? 'O cronômetro e os power-ups estão pausados. Volte quando estiver pronto para explorar.' : won ? `Todas as fases concluídas! Tempo total de jogo: ${formatTime(totalTime)}. Pikachu chegou ao topo da Liga.` : `Você coletou ${collected} de ${PHASES[phase].balls} Pokébolas. Tente de novo: a seed mantém o mesmo mapa para você aperfeiçoar sua rota.`;
  $('result-button').firstChild.textContent = pause ? 'Continuar aventura ' : won ? 'Jogar novamente ' : 'Reiniciar fase ';
  $('result-button').focus();
}
function resumeGame() {
  state = 'playing'; ui.result.hidden = true; setGameUI(true); keys.clear(); unlockAudio();
}
function goToMenu() {
  state = 'menu'; bgm.pause(); keys.clear();
  ui.result.hidden = true; ui.transition.hidden = true; ui.menu.hidden = false;
  setGameUI(false); buildPhase(0); $('start-button').focus();
}
function completePhase() {
  sfx('win'); boost = 0; keys.clear(); velocity.set(0, 0, 0);
  if (phase === PHASES.length - 1) { openResult('won'); return; }
  state = 'transition'; transitionRemaining = 1.8;
  ui.transition.hidden = false; ui['pause-button'].hidden = true;
  $('transition-title').textContent = `${PHASES[phase].name} concluída!`;
  $('transition-next').textContent = `Próxima parada: ${PHASES[phase + 1].name}`;
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    enemy.angle += dt * enemy.speed;
    enemy.object.position.set(enemy.x + Math.cos(enemy.angle) * enemy.patrolRadius, 0.75, enemy.z + Math.sin(enemy.angle) * enemy.patrolRadius);
    enemy.object.rotation.y = -enemy.angle;
  }
}
function movePlayer(dt) {
  let x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  let z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  moveVector.set(x, 0, z);
  // Normalização impede movimento diagonal mais rápido.
  if (moveVector.lengthSq() > 0) moveVector.normalize();
  moveVector.multiplyScalar(BASE_SPEED * (boost > 0 ? 1.5 : 1));
  velocity.lerp(moveVector, 1 - Math.exp(-16 * dt));
  const oldX = player.position.x, oldZ = player.position.z;
  const limit = HALF_MAP - PLAYER_RADIUS - 0.3;
  player.position.x = THREE.MathUtils.clamp(oldX + velocity.x * dt, -limit, limit);
  player.position.z = THREE.MathUtils.clamp(oldZ + velocity.z * dt, -limit, limit);
  let blocked = false;
  // Resolve penetração radial: contato permite deslizar ao redor da pedra.
  for (const obstacle of obstacles) {
    const dx = player.position.x - obstacle.x, dz = player.position.z - obstacle.z;
    const distance = Math.hypot(dx, dz), minDistance = PLAYER_RADIUS + obstacle.radius;
    if (distance < minDistance) {
      const nx = distance > 0.0001 ? dx / distance : 1, nz = distance > 0.0001 ? dz / distance : 0;
      player.position.x = obstacle.x + nx * minDistance;
      player.position.z = obstacle.z + nz * minDistance;
      const inward = velocity.x * nx + velocity.z * nz;
      if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; }
      blocked = true;
    }
  }
  if (blocked && bumpCooldown <= 0) { sfx('bump'); bumpCooldown = 0.55; }
  const dx = player.position.x - oldX, dz = player.position.z - oldZ;
  const moving = Math.hypot(dx, dz) > 0.003;
  if (moving) {
    const angle = Math.atan2(dx, dz);
    const difference = Math.atan2(Math.sin(angle - player.rotation.y), Math.cos(angle - player.rotation.y));
    player.rotation.y += difference * (1 - Math.exp(-14 * dt));
  }
  animatePlayer(dt, moving);
}

function animatePlayer(dt, moving) {
  const { body, head, arms, feet, tail } = player.userData;
  if (moving) walkTime += dt * (boost > 0 ? 17 : 12);
  const swing = moving ? Math.sin(walkTime) : 0;
  const smoothing = 1 - Math.exp(-16 * dt);
  body.position.y = THREE.MathUtils.lerp(body.position.y, moving ? Math.abs(swing) * 0.09 : 0, smoothing);
  body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, swing * 0.035, smoothing);
  arms.forEach((arm, i) => arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, swing * (i ? 0.5 : -0.5), smoothing));
  feet.forEach((foot, i) => {
    foot.position.z = THREE.MathUtils.lerp(foot.position.z, 0.16 + swing * (i ? -0.14 : 0.14), smoothing);
    foot.rotation.x = THREE.MathUtils.lerp(foot.rotation.x, swing * (i ? -0.3 : 0.3), smoothing);
  });
  head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, swing * 0.025, smoothing);
  tail.rotation.z = THREE.MathUtils.lerp(tail.rotation.z, swing * 0.1, smoothing);
  body.visible = invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0;
}

function burst(position, color) {
  // Explosão determinística decorativa, sem alterar o PRNG do mapa.
  const group = new THREE.Group(), mat = material(color, { emissive: color, emissiveIntensity: 0.4 });
  for (let i = 0; i < 9; i++) {
    const angle = i / 9 * Math.PI * 2;
    const dot = sphere(group, mat, 0.065, 0, 0, 0, 8);
    dot.userData.velocity = new THREE.Vector3(Math.cos(angle) * 1.5, 1.6 + (i % 3) * 0.3, Math.sin(angle) * 1.5);
  }
  group.position.copy(position); map.add(group); particles.push({ group, mat, life: 0.6 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i]; particle.life -= dt;
    for (const dot of particle.group.children) {
      dot.position.addScaledVector(dot.userData.velocity, dt);
      dot.userData.velocity.y -= 4 * dt;
      dot.scale.setScalar(Math.max(0, particle.life / 0.6));
    }
    if (particle.life <= 0) {
      map.remove(particle.group); particle.group.children.forEach((dot) => dot.geometry.dispose());
      particle.mat.dispose(); particles.splice(i, 1);
    }
  }
}
function collectItems() {
  for (const item of items) {
    if (!item.active || Math.hypot(player.position.x - item.x, player.position.z - item.z) > PLAYER_RADIUS + item.radius + 0.15) continue;
    item.active = false; item.object.visible = false;
    burst(item.object.position, item.type === 'candy' ? 0x90deff : 0xffdf56);
    if (item.type === 'ball') { collected++; sfx('ball'); }
    else if (item.type === 'candy') { remaining += 10; sfx('power'); showToast('Doce Raro! +10 segundos'); }
    else { boost = 5; sfx('power'); showToast('Agilidade! Velocidade +50% por 5 segundos'); }
  }
  if (collected === PHASES[phase].balls) completePhase();
}
function enemyCollisions() {
  if (invulnerable > 0) return;
  for (const enemy of enemies) {
    const dx = player.position.x - enemy.object.position.x, dz = player.position.z - enemy.object.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < PLAYER_RADIUS + enemy.radius) {
      // Pequeno impulso e penalidade; invulnerabilidade evita dano a cada frame.
      const nx = distance > 0.001 ? dx / distance : 1, nz = distance > 0.001 ? dz / distance : 0;
      velocity.set(nx * 5, 0, nz * 5);
      remaining = Math.max(0, remaining - 3); invulnerable = 1.3;
      sfx('bump'); showToast('Voltorb! −3 segundos. Cuidado com as patrulhas.');
      break;
    }
  }
}

function update(dt) {
  if (state === 'playing') {
    totalTime += dt;
    remaining = Math.max(0, remaining - dt); boost = Math.max(0, boost - dt);
    invulnerable = Math.max(0, invulnerable - dt); bumpCooldown = Math.max(0, bumpCooldown - dt);
    // O prazo é validado antes das coletas: tempo zerado encerra a tentativa.
    if (remaining <= 0) { sfx('lose'); openResult('lost'); updateHUD(); return; }
    movePlayer(dt); updateEnemies(dt); enemyCollisions();
    if (remaining <= 0) { sfx('lose'); openResult('lost'); }
    else collectItems();
    updateParticles(dt); updateHUD();
  } else if (state === 'transition') {
    animatePlayer(dt, false); updateParticles(dt);
    transitionRemaining -= dt;
    if (transitionRemaining <= 0) {
      buildPhase(phase + 1); state = 'playing'; ui.transition.hidden = true; setGameUI(true);
      showToast(phase >= 3 ? 'Cuidado: dois Voltorbs estão patrulhando o mapa!' : `Explore ${PHASES[phase].name}!`);
    }
  }
  if (state === 'playing' || state === 'transition' || state === 'menu') {
    for (const item of items) if (item.active) {
      item.object.position.y = 0.72 + Math.sin(visualTime * 2.5 + item.offset) * 0.12;
      item.object.rotation.y += dt * 0.8;
    }
  }
  if (state === 'menu') {
    animatePlayer(dt, false);
    // Enquadramento de apresentação; o personagem usa o mesmo modelo do jogo.
    const wide = innerWidth > 700;
    desiredCamera.set(wide ? -5.2 : -3.0, 5.1, 8.0);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-4 * dt));
    cameraTarget.set(wide ? -2.2 : -0.5, 1.1, 0);
    camera.lookAt(cameraTarget);
  } else {
    cameraTarget.lerp(player.position, 1 - Math.exp(-7 * dt));
    desiredCamera.copy(cameraTarget).add(cameraOffset);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-6 * dt));
    camera.lookAt(cameraTarget);
  }
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!previousFrame) previousFrame = timestamp;
  const elapsed = Math.max(0, (timestamp - previousFrame) / 1000);
  previousFrame = timestamp;
  // Subpassos de até 1/60s impedem atravessar colisores em frames lentos.
  // Pausar ao perder foco evita saltos de tempo após trocar de aba.
  let unprocessed = Math.min(elapsed, 0.25);
  while (unprocessed > 0) {
    const dt = Math.min(unprocessed, 1 / 60);
    visualTime += dt; update(dt); unprocessed -= dt;
  }
  renderer.render(scene, camera);
}
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
}
function bindControls() {
  const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (event) => {
    if (movement.has(event.code)) { event.preventDefault(); if (state === 'playing') keys.add(event.code); }
    if (event.repeat) return;
    if (event.code === 'KeyM') toggleSound();
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (state === 'playing') openResult('paused'); else if (state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); if (state === 'playing') openResult('paused'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { keys.clear(); bgm.pause(); if (state === 'playing') openResult('paused'); }
    // Se uma transição foi ocultada, a BGM volta quando a aba reaparece.
    else if (state === 'transition' && !muted) bgm.play().catch(() => {});
    previousFrame = performance.now();
  });
  for (const button of document.querySelectorAll('[data-direction]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      if (state === 'playing') keys.add(button.dataset.direction);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(button.dataset.direction));
  }
  $('start-button').addEventListener('click', () => startGame());
  $('result-button').addEventListener('click', () => state === 'paused' ? resumeGame() : startGame(state === 'lost'));
  $('menu-button').addEventListener('click', goToMenu);
  $('pause-button').addEventListener('click', () => { if (state === 'playing') openResult('paused'); });
  $('sound-button').addEventListener('click', toggleSound);
  window.addEventListener('resize', resize);
}
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 120);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  $('scene').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x455237, 2.1));
  sun = new THREE.DirectionalLight(0xfff5db, 3.2);
  sun.position.set(-12, 24, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 70 });
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015;
  scene.add(sun);
  player = createPikachu(); scene.add(player);
  buildPhase(0); resize(); bindControls(); requestAnimationFrame(frame);
}
try { init(); } catch (error) {
  console.error(error);
  $('menu').hidden = true; $('result').hidden = false;
  $('result-label').textContent = 'NÃO FOI POSSÍVEL INICIAR';
  $('result-title').textContent = 'Confira o navegador';
  $('result-description').textContent = 'Abra index.html pelo Live Server e use um navegador com WebGL habilitado. Consulte o console para detalhes.';
  $('result-button').firstChild.textContent = 'Tentar novamente ';
  $('result-button').onclick = () => location.reload(); $('menu-button').hidden = true;
}
