import * as T from "three";

// Isometric 3D yard scene (three.js r128 API).
// opts: { animationSpeed, cameraSway, showColliders } — read every frame, so they can be changed live.
// opts.onSelect({ id, kind, parked }) fires when a truck or forklift is clicked.
// Returns { zoomBy, recenter, select, focus, flyTo, setLabel, vehicles } for the UI to drive the camera.
export function createWavetrackScene(el, opts = {}) {
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xe6ecf5);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xe6ecf5, 120, 240);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);

  scene.add(new T.HemisphereLight(0xffffff, 0xb9c6dc, 0.75));
  const sun = new T.DirectionalLight(0xffffff, 0.85);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 260 });
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  const mats = {};
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.05 }, o || {}))); };
  const box = (w, h, d, m, x, y, z, p) => { const me = new T.Mesh(new T.BoxGeometry(w, h, d), m); me.position.set(x, y + h / 2, z); me.castShadow = me.receiveShadow = true; (p || scene).add(me); return me; };
  const cyl = (r, h, m, x, y, z, p, seg) => { const me = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 20), m); me.position.set(x, y + h / 2, z); me.castShadow = me.receiveShadow = true; (p || scene).add(me); return me; };
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 8; t.encoding = T.sRGBEncoding; return t; };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const BLUE = 0x2457e6, WHITE = 0xf5f7fb, DARK = 0x1c2433, YEL = 0xf3b52a, CARD = 0xd6a56a, ROAD = 0x95a1b6, CURB = 0xdfe5ee;

  const ground = new T.Mesh(new T.PlaneGeometry(700, 700), M(0xe9eef6));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pad = (w, d, x, z, c) => { const p = new T.Mesh(new T.PlaneGeometry(w, d), M(c || 0xf2f5fa)); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.01, z); p.receiveShadow = true; scene.add(p); };
  pad(70, 46, -4, 10); pad(40, 36, -52, 22); pad(38, 50, 69, 15); pad(40, 30, -30, -54);

  // roads: main (z=-17) + vertical (x=42)
  box(400, 0.06, 9, M(ROAD, { roughness: 0.9 }), 0, 0, -17);
  box(9, 0.055, 400, M(ROAD, { roughness: 0.9 }), 42, 0, 0);
  const hs = (z, x1, x2) => box(x2 - x1, 0.3, 0.5, M(CURB), (x1 + x2) / 2, 0, z);
  const vs = (x, z1, z2) => box(0.5, 0.3, z2 - z1, M(CURB), x, 0, (z1 + z2) / 2);
  [-21.7, -12.3].forEach(z => { hs(z, -200, 37.3); hs(z, 46.7, 200); });
  [37.3, 46.7].forEach(x => { vs(x, -200, -21.7); vs(x, -12.3, 200); });
  for (let x = -200; x < 200; x += 7) if (Math.abs(x - 42) > 7) box(3, 0.07, 0.28, M(0xffffff), x, 0, -17);
  for (let z = -200; z < 200; z += 7) if (Math.abs(z + 17) > 7) box(0.28, 0.07, 3, M(0xffffff), 42, 0, z);
  for (let i = 0; i < 6; i++) { box(0.7, 0.07, 3, M(0xffffff), 38.5 + i * 1.4, 0, -24.5); box(0.7, 0.07, 3, M(0xffffff), 38.5 + i * 1.4, 0, -9.5); }
  box(10, 0.04, 19, M(0xa9b3c4), -30, 0, -32.5);

  // fences
  const fTex = tex(64, 64, (g) => { g.strokeStyle = 'rgba(140,155,180,0.95)'; g.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } });
  fTex.wrapS = fTex.wrapT = T.RepeatWrapping; fTex.repeat.set(5, 3.5);
  const fMat = new T.MeshBasicMaterial({ map: fTex, transparent: true, side: T.DoubleSide, depthWrite: false, opacity: 0.8 });
  const fence = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), n = Math.ceil(L / 3.5), rot = -Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      cyl(0.08, 2.4, M(0xb8c3d5), x1 + dx * a, 0, z1 + dz * a, null, 8);
      const p = new T.Mesh(new T.PlaneGeometry(L / n, 2.2), fMat);
      p.position.set(x1 + dx * (a + b) / 2, 1.15, z1 + dz * (a + b) / 2); p.rotation.y = rot; scene.add(p);
    }
  };
  fence(-72, -11, 9, -11); fence(-72, -23, -35, -23); fence(-25, -23, 36, -23); fence(48, -23, 100, -23); fence(-28, -11, -28, 40); fence(-72, -11, -72, 40);

  // main warehouse
  const wx0 = 12, wz0 = -8, ww = 22, wd = 34, wh = 8, cx = wx0 + ww / 2, cz = wz0 + wd / 2;
  box(ww, wh, wd, M(WHITE), cx, 0, cz);
  box(ww + 0.8, 0.7, wd + 0.8, M(BLUE, { roughness: 0.5 }), cx, wh, cz);
  box(ww - 1, 0.25, wd - 1, M(0x3a6ff0, { roughness: 0.5 }), cx, wh + 0.7, cz);
  box(0.5, wh, 0.5, M(BLUE), wx0 - 0.05, 0, wz0); box(0.5, wh, 0.5, M(BLUE), wx0 - 0.05, 0, wz0 + wd);
  box(0.2, 1.2, 3.2, M(0x23314d), wx0 - 0.1, 5.2, wz0 + 3);
  const docks = [2, 10, 18];
  const numTex = n => tex(64, 64, (g) => { g.fillStyle = '#2457e6'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = 'bold 42px Manrope, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35); });
  docks.forEach((dz, i) => {
    box(0.6, 5.4, 0.6, M(BLUE), wx0 - 0.3, 0, dz - 2.6); box(0.6, 5.4, 0.6, M(BLUE), wx0 - 0.3, 0, dz + 2.6);
    box(0.6, 0.8, 5.8, M(BLUE), wx0 - 0.3, 5.4, dz);
    box(0.1, 5.2, 4.6, M(0xf0c891, { emissive: 0x7a4f1c, emissiveIntensity: 0.35 }), wx0 - 0.02, 0, dz);
    box(2.4, 0.3, 4.4, M(0xbfc8d6), wx0 - 1.3, 0, dz);
    if (i !== 1) { box(1.6, 0.18, 1.6, M(0xb08154), wx0 - 1.0, 0.3, dz); for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) box(0.72, 0.62, 0.72, M(CARD), wx0 - 1.4 + a * 0.76, 0.48 + c * 0.64, dz - 0.38 + b * 0.76); }
    [-3.1, 3.1].forEach(o => { cyl(0.18, 1.1, M(YEL), wx0 - 0.9, 0, dz + o, null, 12); cyl(0.185, 0.25, M(DARK), wx0 - 0.9, 0.35, dz + o, null, 12); });
    const lbl = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: numTex(i + 1) }));
    lbl.position.set(wx0 - 0.65, 6.8, dz); lbl.rotation.y = -Math.PI / 2; scene.add(lbl);
  });
  box(1.6, 2.6, 1.6, M(WHITE), 10.5, 0, -12.8); box(1.9, 0.25, 1.9, M(BLUE), 10.5, 2.6, -12.8);

  // markings + storage
  const py = M(0xf2c94c, { roughness: 0.6 });
  box(11, 0.05, 0.25, py, 2, 0, 15); box(11, 0.05, 0.25, py, 2, 0, 21); box(0.25, 0.05, 6, py, -3.5, 0, 18); box(0.25, 0.05, 6, py, 7.5, 0, 18);
  box(9, 0.05, 0.2, py, -12, 0, -3.2); box(9, 0.05, 0.2, py, -12, 0, 2.2);
  const pal = (x, z) => box(1.7, 0.18, 1.7, M(0x9fb4d8), x, 0, z);
  [[-20, -6], [-20, -3.8], [-17.8, -6], [-17.8, -3.8], [-15.6, -6]].forEach(([x, z], i) => { pal(x, z); cyl(0.65, 1.3 + (i % 2) * 0.3, M(0xf2f4f8, { roughness: 0.4 }), x, 0.18, z, null, 24); });
  [[-21.5, -1.6], [-19.6, -1.6]].forEach(([x, z]) => { pal(x, z); box(1.5, 1.2, 1.5, M(0xf2f4f8, { roughness: 0.5 }), x, 0.18, z); });
  const ball = new T.Mesh(new T.SphereGeometry(1.1, 32, 24), M(0x1fa85a, { roughness: 0.35 }));
  ball.position.set(-22.5, 2.6, -6.5); ball.castShadow = true; scene.add(ball);
  cyl(0.12, 1.6, M(0xb8c3d5), -22.5, 0, -6.5, null, 8);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { pal(-13.6 + a * 1.9, -7 + b * 1.9); for (let c = 0; c < 2; c++) box(1.5, 0.8, 1.5, M(BLUE, { roughness: 0.55 }), -13.6 + a * 1.9, 0.18 + c * 0.82, -7 + b * 1.9); }

  // north warehouse
  box(30, 9, 24, M(WHITE), -30, 0, -54);
  box(30.8, 0.7, 24.8, M(BLUE, { roughness: 0.5 }), -30, 9, -54);
  box(29, 0.25, 23, M(0x3a6ff0, { roughness: 0.5 }), -30, 9.7, -54);
  const nDocks = [-40, -33, -26, -19];
  nDocks.forEach((dx, i) => {
    box(0.6, 5.4, 0.6, M(BLUE), dx - 2.6, 0, -41.7); box(0.6, 5.4, 0.6, M(BLUE), dx + 2.6, 0, -41.7);
    box(5.8, 0.8, 0.6, M(BLUE), dx, 5.4, -41.7);
    box(4.6, 5.2, 0.1, M(0xf0c891, { emissive: 0x7a4f1c, emissiveIntensity: 0.35 }), dx, 0, -41.98);
    const lbl = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: numTex(i + 4) }));
    lbl.position.set(dx, 6.8, -41.6); scene.add(lbl);
  });

  // office
  box(14, 14, 12, M(0x8fb0ea, { roughness: 0.15, metalness: 0.35 }), 60, 0, -44);
  for (let i = 1; i <= 3; i++) box(14.2, 0.35, 12.2, M(WHITE), 60, i * 3.5, -44);
  box(14.6, 0.6, 12.6, M(WHITE), 60, 14, -44);
  box(4, 3, 0.3, M(BLUE), 60, 0, -37.9);

  // trees
  const tree = (x, z) => { const s = 0.8 + rnd() * 0.5; cyl(0.15, 1.1 * s, M(0x8a6a4a), x, 0, z, null, 8); const c = new T.Mesh(new T.SphereGeometry(1.1 * s, 14, 10), M(rnd() > 0.5 ? 0x5fae6e : 0x4f9a5f, { roughness: 0.9 })); c.position.set(x, 1.1 * s + 0.9 * s, z); c.castShadow = true; scene.add(c); };
  for (let x = -90; x < 36; x += 7) if (x < -48 || x > -12) tree(x, -26);
  for (let x = 70; x < 110; x += 7) tree(x, -26);
  for (let z = 22; z < 70; z += 7) tree(36, z);
  for (let z = -70; z < -28; z += 7) tree(50, z);
  for (let z = -6; z < 42; z += 8) tree(-76, z);

  // container yard
  const cCols = [0x2457e6, 0xf5f7fb, 0x8a9bb8, 0x1f3f9e, 0xd8dee8, 0x3a6ff0];
  [54.5, 61.5, 74.5, 81.5].forEach(bx => { for (let z = -6; z <= 36; z += 2.8) { if (Math.abs(z - 16) < 3) continue; const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { box(6, 2.5, 2.5, M(cCols[Math.floor(rnd() * cCols.length)], { roughness: 0.6 }), bx, k * 2.55, z); } } });

  // trucks + forklifts
  const sideTex = tex(512, 128, (g, w, h) => { g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2457e6'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(110, 48); g.quadraticCurveTo(140, 100, 170, 48); g.stroke(); g.globalAlpha = .55; g.beginPath(); g.moveTo(126, 44); g.quadraticCurveTo(140, 72, 154, 44); g.stroke(); g.globalAlpha = 1; g.fillStyle = '#2457e6'; g.font = 'italic 800 54px Manrope, sans-serif'; g.textBaseline = 'middle'; g.fillText('Wavetrack', 186, 66); });
  const makeTruck = () => {
    const g = new T.Group();
    box(9, 3.3, 2.6, M(WHITE, { roughness: 0.5 }), 0, 1.2, 0, g);
    box(9.04, 0.8, 2.64, M(BLUE, { roughness: 0.5 }), 0, 1.2, 0, g);
    [1, -1].forEach(s => { const p = new T.Mesh(new T.PlaneGeometry(7, 1.75), new T.MeshStandardMaterial({ map: sideTex, roughness: 0.5 })); p.position.set(0, 3.2, s * 1.325); if (s < 0) p.rotation.y = Math.PI; g.add(p); });
    box(11.4, 0.45, 2.1, M(DARK), -1.1, 0.6, 0, g);
    box(2.5, 2.9, 2.5, M(BLUE, { roughness: 0.45 }), -6.0, 0.75, 0, g);
    box(0.08, 1.15, 2.2, M(0x16233b, { roughness: 0.15, metalness: 0.4 }), -7.26, 2.25, 0, g);
    box(0.12, 0.5, 2.3, M(0xdde3ec), -7.28, 0.75, 0, g);
    [0.85, -0.85].forEach(z => box(0.05, 0.25, 0.4, M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 }), -7.32, 1.45, z, g));
    const brake = new T.MeshStandardMaterial({ color: 0x8a1c1c, emissive: 0xff2a2a, emissiveIntensity: 0 });
    [1.05, -1.05].forEach(z => box(0.06, 0.3, 0.35, brake, 4.53, 1.3, z, g));
    [-6, 1.6, 3.0].forEach(x => [1.15, -1.15].forEach(z => { const w = new T.Mesh(new T.CylinderGeometry(0.58, 0.58, 0.45, 20), M(0x151a24)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.58, z); w.castShadow = true; g.add(w); const hub = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.47, 12), M(0xc9d1dd)); hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); g.add(hub); }));
    g.userData.light = brake; scene.add(g); return g;
  };
  const makeForklift = (load) => {
    const g = new T.Group();
    box(1.7, 0.9, 1.2, M(YEL, { roughness: 0.5 }), 0, 0.35, 0, g);
    box(0.5, 0.9, 1.22, M(0xe09a17), -0.75, 0.45, 0, g);
    box(0.6, 0.35, 0.5, M(DARK), -0.1, 1.25, 0, g);
    [[-0.6, 0.5], [-0.6, -0.5], [0.55, 0.5], [0.55, -0.5]].forEach(([x, z]) => box(0.08, 1.4, 0.08, M(DARK), x, 1.25, z, g));
    box(1.3, 0.08, 1.15, M(DARK), 0, 2.65, 0, g);
    const bc = new T.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.6 });
    const beacon = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), bc); beacon.position.set(-0.3, 2.82, 0); g.add(beacon);
    box(0.12, 2.6, 0.12, M(0x2a3242), 0.95, 0.2, 0.4, g); box(0.12, 2.6, 0.12, M(0x2a3242), 0.95, 0.2, -0.4, g);
    box(1.2, 0.06, 0.15, M(0x6b7484), 1.6, 0.25, 0.3, g); box(1.2, 0.06, 0.15, M(0x6b7484), 1.6, 0.25, -0.3, g);
    if (load) box(0.9, 0.8, 0.9, M(CARD), 1.6, 0.31, 0, g);
    [[0.55, 0.62], [0.55, -0.62], [-0.55, 0.62], [-0.55, -0.62]].forEach(([x, z]) => { const w = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.25, 14), M(0x151a24)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.33, z); w.castShadow = true; g.add(w); });
    g.userData.light = bc; g.userData.lift = true; scene.add(g); return g;
  };

  // ---- vehicles with OBB colliders ----
  const V = [];
  const TRUCK = { hl: 6.05, hw: 1.35, off: -1.15 }, LIFT = { hl: 1.45, hw: 0.72, off: 0.45 };
  const vCount = { truck: 0, forklift: 0 };
  const addV = (obj, path, o) => { const v = Object.assign({ obj, path, p: 0, spd: 1, sf: 1, look: 1, prio: 1, stat: false, nb: null, dir: 1, bt: 0, canTurn: false }, o); const s = path(v.p); Object.assign(v, { x: s.x, z: s.z, r: s.r, vr: s.r }); v.kind = obj.userData.lift ? 'forklift' : 'truck'; v.id = (v.kind === 'truck' ? 'T' : 'F') + String(++vCount[v.kind]).padStart(2, '0'); obj.userData.v = v; V.push(v); return v; };
  const rect = (x, z, r, d, m) => { const ax = [Math.cos(r), -Math.sin(r)], az = [Math.sin(r), Math.cos(r)]; return { c: [x + ax[0] * d.off, z + ax[1] * d.off], ax, az, hl: d.hl + (m || 0), hw: d.hw + (m || 0) }; };
  const proj = (R, a) => { const c = R.c[0] * a[0] + R.c[1] * a[1], e = R.hl * Math.abs(R.ax[0] * a[0] + R.ax[1] * a[1]) + R.hw * Math.abs(R.az[0] * a[0] + R.az[1] * a[1]); return [c - e, c + e]; };
  const hit = (A, B) => [A.ax, A.az, B.ax, B.az].every(a => { const p = proj(A, a), q = proj(B, a); return p[1] > q[0] && q[1] > p[0]; });
  const vr = v => rect(v.x, v.z, v.r, v);

  const L = 220, mod = x => ((x % L) + L) % L;
  const laneE = p => ({ x: mod(p) - L / 2, z: -15, r: Math.PI });
  const laneW = p => ({ x: L / 2 - mod(p), z: -19, r: 0 });
  const laneS = p => ({ x: 40, z: mod(p) - L / 2, r: Math.PI / 2 });
  const laneN = p => ({ x: 44, z: L / 2 - mod(p), r: -Math.PI / 2 });
  [[laneE, 0, 7], [laneE, 75, 8.5], [laneE, 150, 6.2], [laneW, 30, 6], [laneW, 120, 7.5], [laneW, 190, 6.8]].forEach(([fn, p, s]) => addV(makeTruck(), fn, Object.assign({ p, spd: s, look: 3, prio: 3 }, TRUCK)));
  [[laneS, 10, 6], [laneS, 120, 5.5], [laneN, 60, 6.5], [laneN, 170, 6]].forEach(([fn, p, s]) => addV(makeTruck(), fn, Object.assign({ p, spd: s, look: 3, prio: 2 }, TRUCK)));

  const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const yardTruck = addV(makeTruck(), p => { const ph = (p * 0.06) % 1; let e; if (ph < 0.35) e = ease(ph / 0.35); else if (ph < 0.6) e = 1; else if (ph < 0.95) e = 1 - ease((ph - 0.6) / 0.35); else e = 0; return { x: -14 + e * 20.5, z: 10, r: 0 }; }, Object.assign({ look: 0.35, prio: 2 }, TRUCK));
  // forklift routes stay clear of the yard truck's lane (z 8.65–11.35) so they never block each other
  addV(makeForklift(true), p => { const a = p * 0.32; return { x: 2.5 + 4.5 * Math.sin(a), z: 18, r: Math.cos(a) > 0 ? 0 : Math.PI }; }, Object.assign({ look: 0.5, canTurn: true }, LIFT));
  addV(makeForklift(true), p => { const b = p * 0.25; return { x: -9 + 7 * Math.cos(b), z: 4.6 + 2 * Math.sin(b), r: Math.atan2(-2 * Math.cos(b), -7 * Math.sin(b)) }; }, Object.assign({ look: 0.6, canTurn: true }, LIFT));
  [0, 1].forEach(i => addV(makeForklift(false), () => ({ x: -11.5 + i * 2.2, z: -1.5, r: -Math.PI / 2 + 0.3 }), Object.assign({ stat: true }, LIFT)));
  addV(makeForklift(false), p => ({ x: -6.6 + 1.3 * Math.sin(p * 0.6), z: -1.5, r: 0 }), Object.assign({ look: 0.4, canTurn: true }, LIFT));
  addV(makeForklift(true), p => { const a = p * 0.2; return { x: 68, z: 16 + 18 * Math.sin(a), r: Math.cos(a) > 0 ? -Math.PI / 2 : Math.PI / 2 }; }, Object.assign({ look: 0.6, canTurn: true }, LIFT));
  addV(makeForklift(true), p => { const a = p * 0.17 + 1; return { x: 69 + 15 * Math.sin(a), z: 16, r: Math.cos(a) > 0 ? 0 : Math.PI }; }, Object.assign({ look: 0.6, canTurn: true }, LIFT));
  addV(makeForklift(true), p => { const a = p * 0.4; return { x: -33 + 3 * Math.sin(a), z: -39.8, r: Math.cos(a) > 0 ? 0 : Math.PI }; }, Object.assign({ look: 0.5, canTurn: true }, LIFT));
  [-40, -26].forEach(x => addV(makeTruck(), () => ({ x, z: -37.5, r: Math.PI / 2 }), Object.assign({ stat: true }, TRUCK)));
  for (let r = 0; r < 7; r++) [-62, -45].forEach(x => { if (rnd() > 0.3) addV(makeTruck(), () => ({ x, z: 8 + r * 4, r: 0 }), Object.assign({ stat: true }, TRUCK)); });
  for (let r = 0; r <= 7; r++) [-68.5, -53.5, -38.5].forEach(x => box(0.15, 0.05, 15, py, x + 6.6, 0, 8 + r * 4 - 2));

  const lineMat = new T.LineBasicMaterial({ color: 0x18a957 }), lineRed = new T.LineBasicMaterial({ color: 0xef4444 });
  V.forEach(v => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(15), 3)); v.line = new T.Line(g, lineMat); v.line.frustumCulled = false; scene.add(v.line); });

  const ring = new T.Mesh(new T.RingGeometry(1, 1.25, 48), new T.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.5, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);

  // ---- selection (click a vehicle) ----
  let selected = yardTruck, spot = null; // spot: a highlighted place (dock, zone) instead of a vehicle
  const info = v => ({ id: v.id, kind: v.kind, parked: v.stat });
  const select = id => { const v = V.find(w => w.id === id); if (v) { selected = v; spot = null; } return !!v; };
  // Floating tag over the selected vehicle. The UI supplies the text (setLabel) once it knows what the vehicle carries;
  // it only shows while it belongs to the current selection.
  const tag = document.createElement('div'), tagTitle = document.createElement('div'), tagSub = document.createElement('div'), tagAt = new T.Vector3();
  tag.className = 'scene-tag'; tagTitle.className = 'scene-tag__title'; tagSub.className = 'scene-tag__sub';
  tag.append(tagTitle, tagSub); tag.hidden = true; el.appendChild(tag);
  let tagFor = null;
  const setLabel = (id, title, sub) => { tagFor = id; tagTitle.textContent = title; tagSub.textContent = sub || ''; tagSub.hidden = !sub; };
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const pick = e => {
    const b = el.getBoundingClientRect();
    ndc.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(V.map(v => v.obj), true)[0]; let o = h && h.object;
    while (o && !o.userData.v) o = o.parent;
    return o ? o.userData.v : null;
  };

  const angd = (a, b) => ((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const stepV = dt => {
    V.forEach(v => {
      v.nb = null; if (v.stat || dt <= 0) return;
      const s = v.path(v.p + v.dir * (dt * v.spd + v.look)), C = rect(s.x, s.z, s.r + (v.dir < 0 ? Math.PI : 0), v, 0.2), cur = vr(v);
      for (const o of V) { if (o === v) continue; const O = vr(o); if (!hit(C, O)) continue; const dc = Math.hypot(C.c[0] - O.c[0], C.c[1] - O.c[1]), d0 = Math.hypot(cur.c[0] - O.c[0], cur.c[1] - O.c[1]); if (dc < d0 - 1e-3) { v.nb = o; break; } }
    });
    V.forEach((v, i) => {
      if (v.stat) return;
      const o = v.nb, full = dt * v.spd;
      // sf eases the speed instead of stopping dead: brake quickly when blocked, pull away gently when clear
      v.sf += ((o ? 0 : 1) - v.sf) * (1 - Math.exp(-dt * (o ? 9 : 2.5)));
      v.p += full * v.sf * v.dir;
      if (!o) v.bt = 0;
      else if ((v.bt += dt) > 1.2 && v.canTurn) { v.dir *= -1; v.bt = 0; }
      else if (o.nb === v && (v.prio < o.prio || (v.prio === o.prio && i > V.indexOf(o)))) { const b = v.path(v.p - v.dir * full * 0.6), B = rect(b.x, b.z, b.r + (v.dir < 0 ? Math.PI : 0), v); if (!V.some(w => w !== v && hit(B, vr(w)))) v.p -= v.dir * full * 0.6; }
      const s = v.path(v.p); v.x = s.x; v.z = s.z; v.r = s.r + (v.dir < 0 ? Math.PI : 0);
    });
  };

  // ---- camera / map controls ----
  const view = { target: new T.Vector3(0, 0, 3), zoom: 1, zt: 1, vel: { x: 0, z: 0 }, go: null, follow: null, pos: new T.Vector3(0, 0, 3) }; // pos: smoothed target the camera actually looks at; vel: pan inertia in units/s
  const zoomBy = k => { view.zt = Math.max(0.5, Math.min(2.8, view.zt * k)); };
  const recenter = () => { view.follow = null; view.go = { x: 0, z: 3 }; view.zt = 1; view.vel = { x: 0, z: 0 }; };
  // focus: select a vehicle and keep the camera on it until the user drags the map
  const focus = id => { if (!select(id)) return; view.follow = selected; view.zt = 1.3; view.vel = { x: 0, z: 0 }; };
  const flyTo = (x, z, zoom = 1.6) => { view.follow = null; spot = { x, z }; view.go = { x, z }; view.zt = zoom; view.vel = { x: 0, z: 0 }; };
  el.style.cursor = 'grab'; el.style.touchAction = 'none';
  let drag = null, press = null, hover = null;
  const panBy = (dx, dy) => {
    const wpp = (camera.right - camera.left) / camera.zoom / el.clientWidth;
    const off = camera.position.clone().sub(view.pos), fwd = new T.Vector3(-off.x, 0, -off.z).normalize();
    const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize(), sinE = off.y / off.length();
    const mx = -right.x * dx * wpp + fwd.x * dy * wpp / sinE, mz = -right.z * dx * wpp + fwd.z * dy * wpp / sinE;
    const ds = Math.max(0.008, (performance.now() - drag.t) / 1000), cap = v => Math.max(-150, Math.min(150, v));
    view.target.x += mx; view.target.z += mz; view.vel = { x: cap(view.vel.x * 0.4 + mx / ds * 0.6), z: cap(view.vel.z * 0.4 + mz / ds * 0.6) };
  };
  el.addEventListener('pointerdown', e => { press = { x: e.clientX, y: e.clientY }; drag = { x: e.clientX, y: e.clientY, t: performance.now() }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; view.vel = { x: 0, z: 0 }; view.go = null; view.follow = null; });
  el.addEventListener('pointermove', e => { if (!drag) { hover = e; return; } panBy(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  const end = () => { if (!drag) return; if (performance.now() - drag.t > 80) view.vel = { x: 0, z: 0 }; drag = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', e => {
    const p = press; press = null; end();
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) return;
    const v = pick(e); if (v) { selected = v; spot = null; opts.onSelect && opts.onSelect(info(v)); }
  }); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; // hidden (pages without the 3D preview)
    renderer.setSize(w, h);
    const asp = w / h, half = asp < 1.5 ? 24 * 1.5 / asp : 24;
    Object.assign(camera, { left: -half * asp, right: half * asp, top: half, bottom: -half }); camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(el); resize();

  const base = new T.Vector3(-36, 38, 44), up = new T.Vector3(0, 1, 0);
  // The sun follows the camera in whole shadow-map texels (along the shadow camera's own axes), so shadows don't shimmer while panning.
  const sunOff = new T.Vector3(-30, 55, 25), sunF = sunOff.clone().negate().normalize(), sunR = new T.Vector3().crossVectors(sunF, up).normalize(), sunU = new T.Vector3().crossVectors(sunR, sunF);
  const texel = 180 / sun.shadow.mapSize.x, sunAt = new T.Vector3();
  const smooth = (dt, rate) => 1 - Math.exp(-dt * rate); // frame-rate independent easing factor
  let last = performance.now(), t = 0;
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const sp = opts.animationSpeed ?? 1, sdt = dt * sp; t += sdt;
    stepV(sdt);
    const showC = opts.showColliders ?? false;
    V.forEach(v => {
      v.vr += angd(v.r, v.vr) * smooth(sdt, 5);
      v.obj.position.set(v.x, 0, v.z); v.obj.rotation.y = v.vr;
      const lm = v.obj.userData.light, blocked = !!v.nb;
      if (v.obj.userData.lift) { lm.color.setHex(blocked ? 0xef4444 : 0xffa31a); lm.emissive.setHex(blocked ? 0xff2020 : 0xff8a00); lm.emissiveIntensity = blocked ? 1.2 : 0.4 + 0.4 * Math.sin(t * 6); }
      else lm.emissiveIntensity = blocked ? 1.6 : 0;
      v.line.visible = showC;
      if (showC) { const R = vr(v), a = v.line.geometry.attributes.position; [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) => a.setXYZ(k, R.c[0] + R.ax[0] * R.hl * sx + R.az[0] * R.hw * sz, 0.12, R.c[1] + R.ax[1] * R.hl * sx + R.az[1] * R.hw * sz)); a.needsUpdate = true; v.line.material = blocked ? lineRed : lineMat; }
    });
    const sr = spot ? [spot.x, spot.z] : vr(selected).c, rk = spot ? 3 : selected.kind === 'truck' ? 2.4 : 1.2; ring.position.set(sr[0], 0.05, sr[1]);
    const rp = (t * 0.8) % 1, rs = rk * (1 + rp * 1.6); ring.scale.set(rs, rs, rs); ring.material.opacity = 0.55 * (1 - rp);
    ball.position.y = 2.6 + Math.sin(t * 1.5) * 0.08;

    if (hover) { el.style.cursor = pick(hover) ? 'pointer' : 'grab'; hover = null; } // at most one hover test per frame
    if (!drag) { const k = Math.exp(-dt * 4.5); view.target.x += view.vel.x * dt; view.target.z += view.vel.z * dt; view.vel.x *= k; view.vel.z *= k; }
    if (view.follow) view.go = { x: view.follow.x, z: view.follow.z };
    if (view.go) { const g = smooth(dt, 4.5); view.target.x += (view.go.x - view.target.x) * g; view.target.z += (view.go.z - view.target.z) * g; if (Math.hypot(view.go.x - view.target.x, view.go.z - view.target.z) < 0.05) view.go = null; }
    view.target.x = Math.max(-85, Math.min(95, view.target.x)); view.target.z = Math.max(-75, Math.min(60, view.target.z));
    view.pos.lerp(view.target, smooth(dt, 14));
    camera.zoom += (view.zt - camera.zoom) * smooth(dt, 7); camera.updateProjectionMatrix();
    const ang = (opts.cameraSway ?? true) ? 0.07 * Math.sin(t * 0.12) : 0;
    camera.position.copy(view.pos).add(base.clone().applyAxisAngle(up, ang)); camera.lookAt(view.pos);
    const er = view.pos.dot(sunR), eu = view.pos.dot(sunU);
    sunAt.copy(view.pos).addScaledVector(sunR, Math.round(er / texel) * texel - er).addScaledVector(sunU, Math.round(eu / texel) * texel - eu);
    sun.position.copy(sunAt).add(sunOff); sun.target.position.copy(sunAt);
    renderer.render(scene, camera);
    tag.hidden = !!spot || tagFor !== selected.id;
    if (!tag.hidden) {
      const c = vr(selected).c; tagAt.set(c[0], selected.kind === 'truck' ? 5.4 : 3.6, c[1]).project(camera);
      tag.style.transform = `translate(${((tagAt.x + 1) / 2 * el.clientWidth).toFixed(1)}px, ${((1 - tagAt.y) / 2 * el.clientHeight).toFixed(1)}px) translate(-50%, -100%)`;
    }
    requestAnimationFrame(loop);
  };
  loop();

  return { zoomBy, recenter, select, focus, flyTo, setLabel, vehicles: V.map(info) };
}
