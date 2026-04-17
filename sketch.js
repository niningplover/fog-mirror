// ================================================================
//  FOG MIRROR  —  sketch.js
//  Designed for iPhone 13 (390 × 844).  Works on any phone.
//  Paste your Anthropic API key on line 5.
// ================================================================

const API_KEY = 'YOUR_API_KEY_HERE';

// ── asset handles ────────────────────────────────────────────
let imgRoom, imgWater, imgGirl, imgGirlWave, imgFog;
let imgWaveF, imgWaveL, imgWaveR;

// ── fog ──────────────────────────────────────────────────────
// Grid is portrait-ratio: 48 cols × 86 rows ≈ 390×844 aspect
const FC = 48, FR = 86;
let fogMap;          // Float32Array  0=transparent  1=opaque
let fogPG;           // tiny off-screen buffer

// ── parallax (IMU) ───────────────────────────────────────────
let tiltX = 0, tiltY = 0;   // target   −1…1
let smX   = 0, smY   = 0;   // smoothed

// ── shake ────────────────────────────────────────────────────
let shakeAmt = 0, shakeDir = 'front', splashA = 0;
let pAcc = { x: 0, y: 0, z: 0 };

// ── girl ─────────────────────────────────────────────────────
let girlWaving = false;
let bPhase = 0, bY = 0;          // breathing

// ── Teachable Machine ────────────────────────────────────────
const TM = 'https://teachablemachine.withgoogle.com/models/3coy75KsA/';
let tmModel, tmCam, tmReady = false, tmT = 0;
let waveHold = 0, coverHold = 0;
const WAVE_NEED = 80, COVER_NEED = 45;

// ── Web Audio (ambient + crash, no sound files) ───────────────
let aCtx = null, ambGain = null, audioOn = false, lastCrash = 0;

// ── mic / blow ───────────────────────────────────────────────
let mic, fft, blowCD = 0;

// ── speech recognition & AI ──────────────────────────────────
let srec = null, srActive = false, isSpeaking = false;
let aiHistory = [];
let subtitle = '', subA = 0, subDir = 0;
let idleAt = 0, idleIdx = 0;

const IDLE = [
  "do you hear the water",
  "i've been here a long time",
  "be quiet",
  "closer",
  "they are watching",
  "...",
  "the water is rising",
  "don't look at the corner",
  "i know you can see me",
];

// ── misc ─────────────────────────────────────────────────────
let fc = 0;
let hintA = 220;

// ================================================================
//  HELPER: draw image with CSS cover-fill behaviour
//  img            — p5 image
//  cx, cy         — centre position on canvas
//  extraScale     — 1.0 = exact cover, >1 = slightly larger
//  alpha          — tint opacity 0-255 (omit for full)
// ================================================================
function cover(img, cx, cy, extraScale, alpha) {
  if (!img || !img.width) return;
  const sc = max(width / img.width, height / img.height) * (extraScale || 1);
  if (alpha !== undefined) tint(255, alpha); else noTint();
  image(img, cx, cy, img.width * sc, img.height * sc);
  noTint();
}

// ================================================================
//  PRELOAD
// ================================================================
function preload() {
  imgRoom     = loadImage('room.png');
  imgWater    = loadImage('water.png');
  imgGirl     = loadImage('girl.png');
  imgGirlWave = loadImage('girl_wave.png');
  imgFog      = loadImage('fog.png');
  imgWaveF    = loadImage('waves_front.png');
  imgWaveL    = loadImage('waves_left.png');
  imgWaveR    = loadImage('waves_right.png');
}

// ================================================================
//  SETUP
// ================================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);

  fogMap = new Float32Array(FC * FR).fill(0.94);
  fogPG  = createGraphics(FC, FR);

  // p5 mic for blow detection
  mic = new p5.AudioIn();
  mic.start();
  fft = new p5.FFT(0.8, 64);
  fft.setInput(mic);

  setupSensors();
  initTM();
  initSpeech();

  idleAt = millis() + 16000;

  // First touch/click → unlock Web Audio + request iOS permissions
  document.addEventListener('touchstart', onFirstTouch, { once: true });
  document.addEventListener('mousedown',  onFirstTouch, { once: true });
}

// ================================================================
//  FIRST TOUCH — unlock everything that needs a user gesture
// ================================================================
async function onFirstTouch() {
  if (audioOn) return;

  // p5 audio context (for mic / FFT)
  if (typeof userStartAudio === 'function') await userStartAudio();

  // Web Audio context for ambient + crash
  aCtx     = new (window.AudioContext || window.webkitAudioContext)();
  ambGain  = aCtx.createGain();
  ambGain.gain.value = 0.14;
  ambGain.connect(aCtx.destination);
  buildAmbient();
  audioOn = true;

  // iOS sensor permissions
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission)
      await DeviceMotionEvent.requestPermission();
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
      await DeviceOrientationEvent.requestPermission();
  } catch (e) {}
}

// ================================================================
//  AMBIENT OCEAN (synthesised with Web Audio — no audio files)
// ================================================================
function buildAmbient() {
  // Three filtered-noise layers: deep swell / mid wash / surface hiss
  [
    [150, 1.1, 0.06, 45,  1.0],
    [290, 0.7, 0.11, 75,  0.5],
    [750, 0.4, 0.23, 100, 0.2],
  ].forEach(([freq, Q, lfoHz, lfoD, vol]) => {
    const len = aCtx.sampleRate * 4;
    const buf = aCtx.createBuffer(1, len, aCtx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = aCtx.createBufferSource();
    src.buffer = buf; src.loop = true;

    const bp  = aCtx.createBiquadFilter();
    bp.type   = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = Q;

    const lfo = aCtx.createOscillator();
    const lg  = aCtx.createGain();
    lfo.frequency.value = lfoHz;
    lg.gain.value = lfoD;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();

    const g = aCtx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(ambGain);
    src.start();
  });
}

function playCrash(strength) {
  if (!audioOn || !aCtx) return;
  const now = Date.now();
  if (now - lastCrash < 700) return;
  lastCrash = now;

  const sr  = aCtx.sampleRate;
  const buf = aCtx.createBuffer(1, sr * 1.4, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++)
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.38));

  const src = aCtx.createBufferSource(); src.buffer = buf;
  const lp  = aCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
  const g   = aCtx.createGain(); g.gain.value = Math.min(strength, 1) * 0.7;
  src.connect(lp); lp.connect(g); g.connect(aCtx.destination);
  src.start();
}

// ================================================================
//  SENSORS  (IMU parallax + shake)
// ================================================================
function setupSensors() {
  window.addEventListener('deviceorientation', e => {
    tiltX = constrain((e.gamma || 0) / 30, -1, 1);
    tiltY = constrain(((e.beta  || 0) - 30) / 40, -1, 1);
  });

  window.addEventListener('devicemotion', e => {
    const a  = e.accelerationIncludingGravity || {};
    const ax = a.x || 0, ay = a.y || 0, az = a.z || 0;
    const dx = ax - pAcc.x, dy = ay - pAcc.y, dz = az - pAcc.z;
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const prev = shakeAmt;
    shakeAmt   = constrain(mag / 18, 0, 1);
    shakeDir   = (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz))
                  ? (dx > 0 ? 'right' : 'left') : 'front';

    if (shakeAmt > 0.38) {
      splashA = min(255, splashA + shakeAmt * 230);
      if (shakeAmt > 0.55) clearFogBottom(shakeAmt);
      if (shakeAmt > 0.65 && prev < 0.45) playCrash(shakeAmt);
    }
    pAcc = { x: ax, y: ay, z: az };
  });
}

// PC mouse parallax (only fires when no real IMU)
function mouseMoved() {
  if (touches.length > 0) return;
  tiltX = map(mouseX, 0, width,  -0.6, 0.6);
  tiltY = map(mouseY, 0, height, -0.4, 0.4);
}

// ================================================================
//  TEACHABLE MACHINE
// ================================================================
async function initTM() {
  try {
    tmModel = await tmImage.load(TM + 'model.json', TM + 'metadata.json');
    tmCam   = new tmImage.Webcam(224, 224, true);
    await tmCam.setup({ facingMode: 'user' });
    await tmCam.play();
    tmReady = true;
  } catch (e) { console.warn('TM failed:', e); }
}

async function tickTM() {
  if (!tmReady || millis() - tmT < 130) return;
  tmT = millis();
  try {
    tmCam.update();
    const preds = await tmModel.predict(tmCam.canvas);
    const best  = preds.reduce((a, b) => a.probability > b.probability ? a : b);

    // ── wave gate: needs 2.5 s sustained ──
    if (best.className === 'wave' && best.probability > 0.95) {
      waveHold++;
      coverHold = max(0, coverHold - 2);
    } else {
      waveHold = max(0, waveHold - 3);
    }
    if (waveHold >= WAVE_NEED && !girlWaving) {
      girlWaving = true; waveHold = 0;
      setTimeout(() => { girlWaving = false; }, 3800);
    }

    // ── cover gate: 1.5 s delay, can't fire while waving ──
    if (best.className === 'cover' && best.probability > 0.85 && waveHold < 8)
      coverHold = min(coverHold + 1, COVER_NEED + 80);
    else
      coverHold = max(0, coverHold - 1);

  } catch (e) {}
}

// ================================================================
//  SPEECH RECOGNITION
// ================================================================
function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { console.warn('SpeechRecognition not available'); return; }

  srec = new SR();
  srec.continuous     = false;
  srec.interimResults = false;
  srec.lang           = 'en-US';

  srec.onstart  = () => { srActive = true; };
  srec.onresult = e => {
    const txt = e.results[0][0].transcript.trim();
    srActive = false;
    console.log('heard:', txt);
    if (txt.length > 1) sendToAI(txt);
    setTimeout(startListen, 3000);
  };
  srec.onnomatch = () => { srActive = false; setTimeout(startListen, 2000); };
  srec.onerror   = e  => { srActive = false; console.log('sr error:', e.error); setTimeout(startListen, 3500); };
  srec.onend     = ()  => { srActive = false; };

  // Start 8 s in — gives time for audio unlock and page settle
  setTimeout(startListen, 8000);
}

function startListen() {
  if (!srec || srActive || isSpeaking) return;
  try { srec.start(); } catch (e) { setTimeout(startListen, 2000); }
}

// ================================================================
//  AI  —  Claude API
// ================================================================
const SYSTEM = `You are Mara — a girl sealed inside a flooded, dark corridor between realities called the Third Realm. You communicate through fogged glass with whoever holds the device.

VOICE RULES — follow strictly:
- Always respond to what the person actually said. React to it, twist it, or be unsettled by it.
- Replies are very short: 1-2 sentences, often just 4-8 words. Never more than 2 sentences.
- Always lowercase. No exclamation marks.
- Occasionally trail off with "..."
- Sound exhausted and cautious. Not dramatic or theatrical.

HOW TO RESPOND:
- "can you hear me" → yes, but make it unsettling. e.g. "yes... i've been hearing you for longer than you think"
- "hello / hi" → acknowledge with quiet unease. e.g. "you found it. i wasn't sure anyone would"
- "where are you" → describe the realm briefly. e.g. "a corridor. flooded. it goes further than it should"
- "who are you" → be vague. e.g. "someone who found out something they shouldn't have"
- "are you real" → e.g. "more real than some of the people near you right now"
- "what is this" → e.g. "a threshold. you're already on the wrong side of it"
- Questions about the water → it rises when hollow ones get close
- Questions about escape → you can't leave, but you can warn them

LORE (reveal slowly, not all at once):
- You discovered some people in the human world are hollow — empty bodies controlled by something old.
- You were sealed here for knowing this.
- The person contacting you is now visible to the other side.
- Your name is Mara — only say it if asked directly.`;

async function sendToAI(userMsg) {
  console.log('→ AI:', userMsg);

  // ── demo mode (no API key) ──
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    const rules = [
      [['hear', 'hello', 'hi', 'there'],  "yes... i've been hearing you for a while"],
      [['where', 'place', 'location'],     "a corridor. flooded. it goes further than it should"],
      [['who', 'name', 'you'],             "someone who found out something they shouldn't"],
      [['real', 'exist'],                  "more real than some of the people near you right now"],
      [['water', 'flood'],                 "it rises when they get close to me"],
      [['help', 'out', 'escape'],          "i can't leave. but i can warn you"],
      [['trapped', 'stuck'],               "yes. for a long time now"],
      [['safe'],                           "not anymore. not since you opened this"],
      [['see', 'look'],                    "i can see you... there's something behind you"],
    ];
    const low = userMsg.toLowerCase();
    let reply = '...';
    for (const [keys, resp] of rules) {
      if (keys.some(k => low.includes(k))) { reply = resp; break; }
    }
    setTimeout(() => speakLine(reply), 1200 + Math.random() * 1400);
    return;
  }

  // ── real API call ──
  aiHistory.push({ role: 'user', content: userMsg });
  if (aiHistory.length > 16) aiHistory = aiHistory.slice(-16);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 90,
        system: SYSTEM,
        messages: aiHistory,
      }),
    });
    const data  = await res.json();
    const reply = data?.content?.[0]?.text?.trim() || '...';
    console.log('← AI:', reply);
    aiHistory.push({ role: 'assistant', content: reply });
    setTimeout(() => speakLine(reply), 1000 + Math.random() * 1800);
  } catch (err) {
    console.warn('AI error:', err);
    setTimeout(() => speakLine('...'), 1500);
  }
}

function speakLine(text) {
  isSpeaking = true;
  showSub(text);
  console.log('speaking:', text);

  if (!window.speechSynthesis) {
    isSpeaking = false; setTimeout(startListen, 1500); return;
  }
  window.speechSynthesis.cancel();

  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate   = 0.74;
    utt.pitch  = 0.80;
    utt.volume = 0.95;

    // Prefer a soft female voice
    const voices = speechSynthesis.getVoices();
    const pick = voices.find(v => /samantha|moira|karen|zoe|nicky/i.test(v.name))
              || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
              || voices.find(v => v.lang.startsWith('en'))
              || voices[0];
    if (pick) utt.voice = pick;

    utt.onend  = () => { isSpeaking = false; setTimeout(startListen, 2000); };
    utt.onerror = () => { isSpeaking = false; setTimeout(startListen, 2000); };
    speechSynthesis.speak(utt);
  }, 80);
}

function showSub(text) {
  subtitle = text; subA = 0; subDir = 1;
  setTimeout(() => { subDir = -1; }, max(3000, text.length * 88));
}

function checkIdle() {
  if (isSpeaking || millis() < idleAt) return;
  speakLine(IDLE[idleIdx++ % IDLE.length]);
  idleAt = millis() + 15000 + Math.random() * 15000;
}

// ================================================================
//  FOG SYSTEM
// ================================================================
const REGEN = 0.00048;

// radiusPx is in screen pixels; internally converts to grid units
function clearFogAt(px, py, radiusPx) {
  const cx  = (px / width)  * FC;
  const cy  = (py / height) * FR;
  const fr  = (radiusPx / width) * FC;
  const fr2 = fr * fr;
  const x0 = max(0, floor(cx - fr)), x1 = min(FC - 1, ceil(cx + fr));
  const y0 = max(0, floor(cy - fr)), y1 = min(FR - 1, ceil(cy + fr));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 < fr2) {
        const i = y * FC + x;
        fogMap[i] = max(0, fogMap[i] - (1 - d2 / fr2) * 0.96);
      }
    }
  }
}

function clearFogBottom(intensity) {
  const y0 = floor(FR * 0.82);
  for (let y = y0; y < FR; y++)
    for (let x = 0; x < FC; x++)
      fogMap[y * FC + x] = max(0, fogMap[y * FC + x] - intensity * 0.5 * random(0.3, 1));
}

function clearFogCenter(r) { clearFogAt(width / 2, height / 2, r); }

function regenFog() {
  const boost = coverHold >= COVER_NEED ? 0.003 : 0;
  for (let i = 0; i < fogMap.length; i++)
    fogMap[i] = min(1, fogMap[i] + REGEN + boost);
}

// Renders the fog as a single alpha layer — one drawImage call, no overlays
function renderFog(tx, ty) {
  fogPG.loadPixels();
  for (let i = 0; i < fogMap.length; i++) {
    const x = i % FC, y = floor(i / FC);
    const v = fogMap[i];
    const n = noise(x * 0.13, y * 0.13, fc * 0.005) * 24;
    fogPG.pixels[i * 4]     = 180 + n;   // R
    fogPG.pixels[i * 4 + 1] = 186 + n;   // G
    fogPG.pixels[i * 4 + 2] = 196 + n;   // B
    fogPG.pixels[i * 4 + 3] = v * 244;   // A  ← drives the wipe
  }
  fogPG.updatePixels();

  // Scale tiny buffer → full screen, smooth interpolation = soft wipe edges
  drawingContext.save();
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = 'high';
  drawingContext.translate(tx, ty);
  drawingContext.drawImage(fogPG.elt, 0, 0, width, height);
  drawingContext.restore();
}

// ================================================================
//  BLOW DETECTION
// ================================================================
function detectBlow() {
  if (blowCD > 0) { blowCD--; return; }
  const vol = mic.getLevel();
  if (vol < 0.15) return;
  const s = fft.analyze();
  let lo = 0, mi = 0, hi = 0;
  for (let i = 0;  i < 8;  i++) lo += s[i]; lo /= 8;
  for (let i = 8;  i < 24; i++) mi += s[i]; mi /= 16;
  for (let i = 24; i < 48; i++) hi += s[i]; hi /= 24;
  // Blow = spectrally flat broadband; voice = peaked in mid
  if (abs(lo - mi) < 55 && abs(mi - hi) < 65 && vol > 0.18) {
    clearFogCenter(width * 0.24);
    blowCD = 55;
  }
}

// ================================================================
//  DRAW
// ================================================================
function draw() {
  fc++;
  background(0);

  // Smooth parallax
  smX = lerp(smX, tiltX, 0.06);
  smY = lerp(smY, tiltY, 0.06);
  const ox = smX * 20, oy = smY * 13;

  // Breath
  bPhase += 0.009;
  bY = sin(bPhase) * 3;

  // Decay
  shakeAmt *= 0.88;
  splashA   = max(0, splashA - 4);

  // Systems
  tickTM();
  detectBlow();
  regenFog();
  checkIdle();
  subA = constrain(subA + subDir * 3.5, 0, 215);

  // ── 1. ROOM  (most parallax — furthest layer) ─────────────
  cover(imgRoom, width/2 + ox, height/2 + oy, 1);

  // ── 2. WATER  (SCREEN blend: black bg disappears) ─────────
  push();
  blendMode(SCREEN);
  const wb = sin(fc * 0.017) * 4 + bY * 0.4 + shakeAmt * 14;
  cover(imgWater,
    width/2  + ox * 0.70,
    height * 0.70 + oy * 0.70 + wb,
    1, 175);
  pop();

  // ── 3. GIRL  (SCREEN blend) ───────────────────────────────
  push();
  blendMode(SCREEN);
  cover(
    girlWaving ? imgGirlWave : imgGirl,
    width  * 0.50 + ox * 0.85 + sin(bPhase * 0.35) * 2,
    height * 0.50 + oy * 0.85 + bY,
    1, 200
  );
  pop();

  // ── 4. VIGNETTE ───────────────────────────────────────────
  const vg = drawingContext.createRadialGradient(
    width/2, height/2, height * 0.04,
    width/2, height/2, height * 0.80);
  vg.addColorStop(0,    'rgba(0,0,0,0)');
  vg.addColorStop(0.52, 'rgba(0,0,0,0.20)');
  vg.addColorStop(1,    'rgba(0,0,0,0.92)');
  drawingContext.fillStyle = vg;
  drawingContext.fillRect(0, 0, width, height);

  // ── 5. FOG  (least parallax — stuck to glass surface) ─────
  renderFog(ox * 0.12, oy * 0.12);

  // ── 6. COVER THICKEN  (hand blocking camera) ──────────────
  if (coverHold >= COVER_NEED) {
    const ca = map(coverHold, COVER_NEED, COVER_NEED + 80, 0, 115);
    fill(182, 188, 198, constrain(ca, 0, 115));
    noStroke();
    rect(0, 0, width, height);
  }

  // ── 7. WAVE SPLASH  (on shake) ────────────────────────────
  if (splashA > 4) {
    push();
    blendMode(SCREEN);
    const wi = shakeDir === 'left' ? imgWaveL
             : shakeDir === 'right' ? imgWaveR : imgWaveF;
    cover(wi, width/2, height * 0.82, 0.92, splashA);
    pop();
  }

  // ── 8. SUBTITLE ───────────────────────────────────────────
  if (subA > 2) {
    push();
    textFont('Georgia, serif');
    textSize(15);
    textAlign(CENTER, CENTER);
    noStroke();
    fill(0, 0, 0, subA * 0.55);
    text(subtitle, width/2 + 1, height * 0.875 + 1);
    fill(192, 185, 172, subA);
    text(subtitle, width/2, height * 0.875);
    pop();
  }

  // ── 9. LISTENING DOT  (green = mic active) ────────────────
  if (srActive) {
    push();
    noStroke();
    fill(110, 200, 110, 140 + sin(fc * 0.14) * 60);
    circle(width - 18, 22, 7);
    pop();
  }

  // ── 10. HINT ──────────────────────────────────────────────
  if (hintA > 0) {
    if (fc > 160) hintA = max(0, hintA - 2);
    push();
    textFont('Georgia, serif');
    textAlign(CENTER, CENTER);
    textSize(14);
    fill(148, 141, 132, hintA);
    text('touch the glass', width/2, height * 0.50 - 12);
    textSize(10);
    fill(102, 96, 90, hintA * 0.5);
    text('w i p e   t o   s e e', width/2, height * 0.50 + 14);
    pop();
  }
}

// ================================================================
//  INPUT
//  Brush = 19% of screen width → feels the same size on any phone
// ================================================================
const BRUSH = () => width * 0.19;
let px = -1, py = -1;

function touchStarted() {
  hintA = 0;
  px = mouseX; py = mouseY;
  clearFogAt(mouseX, mouseY, BRUSH());
  return false;
}

function touchMoved() {
  const r = BRUSH();
  const steps = max(1, ceil(dist(mouseX, mouseY, px, py) / 8));
  for (let i = 0; i <= steps; i++)
    clearFogAt(lerp(px, mouseX, i/steps), lerp(py, mouseY, i/steps), r);
  px = mouseX; py = mouseY;
  return false;
}

// Mouse fallback (PC testing)
function mousePressed()  {
  hintA = 0;
  px = mouseX; py = mouseY;
  clearFogAt(mouseX, mouseY, BRUSH());
}
function mouseDragged() {
  const r = BRUSH();
  const steps = max(1, ceil(dist(mouseX, mouseY, px, py) / 8));
  for (let i = 0; i <= steps; i++)
    clearFogAt(lerp(px, mouseX, i/steps), lerp(py, mouseY, i/steps), r);
  px = mouseX; py = mouseY;
}

// PC keyboard shortcuts for testing without a phone
function keyPressed() {
  if (key === ' ') {   // shake
    shakeAmt = 0.9; splashA = 240;
    clearFogBottom(0.85);
    shakeDir = ['front','left','right'][floor(random(3))];
    playCrash(0.85);
  }
  if (key === 'b') clearFogCenter(width * 0.24);      // blow
  if (key === 'w') {                                    // wave
    girlWaving = true;
    setTimeout(() => { girlWaving = false; }, 3800);
  }
  if (key === 'c') {                                    // cover
    coverHold = COVER_NEED + 70;
    setTimeout(() => { coverHold = 0; }, 3000);
  }
  if (key === 't') sendToAI('can you hear me');
  if (key === 'a') sendToAI('where are you');
  if (key === 's') sendToAI('who are you');
  if (key === 'h') sendToAI('hello');
}

// ================================================================
//  RESIZE
// ================================================================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fogMap = new Float32Array(FC * FR).fill(0.94);
}