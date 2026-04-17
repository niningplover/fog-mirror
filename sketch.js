// ================================================================
//  FOG MIRROR  —  sketch.js
//  Paste your Anthropic API key on line 5.
// ================================================================

const API_KEY = 'YOUR_API_KEY_HERE';

// ── assets ───────────────────────────────────────────────────
let imgRoom, imgWater, imgGirl, imgGirlWave;
let imgWaveF, imgWaveL, imgWaveR;

// ── FOG — native HTMLCanvas, NOT p5.Graphics ─────────────────
// Using a plain HTMLCanvasElement guarantees drawImage scales
// it to exactly (0,0,screenW,screenH) — no tiling, ever.
const FC = 48, FR = 86;          // fog grid: portrait ratio
let fogMap;                       // Float32Array 0=clear 1=full
let fogBuf;                       // HTMLCanvasElement  (tiny: 48×86)
let fogBufCtx;                    // its 2D context
let fogImageData;                 // reused ImageData object

// ── parallax ─────────────────────────────────────────────────
let tiltX = 0, tiltY = 0, smX = 0, smY = 0;

// ── shake ────────────────────────────────────────────────────
let shakeAmt = 0, shakeDir = 'front', splashA = 0;
let pAcc = {x:0,y:0,z:0};

// ── girl ─────────────────────────────────────────────────────
let girlWaving = false, bPhase = 0, bY = 0;

// ── Teachable Machine ────────────────────────────────────────
const TM_URL = 'https://teachablemachine.withgoogle.com/models/3coy75KsA/';
let tmModel, tmCam, tmReady = false, tmT = 0;
let waveHold = 0, coverHold = 0;
const WAVE_NEED = 80, COVER_NEED = 45;

// ── Web Audio ────────────────────────────────────────────────
let aCtx = null, ambGain = null, audioOn = false, lastCrash = 0;

// ── mic / blow ───────────────────────────────────────────────
let mic, fft, blowCD = 0;

// ── speech & AI ──────────────────────────────────────────────
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
let fc = 0, hintA = 220;

// ================================================================
//  COVER DRAW — fills canvas like CSS object-fit:cover
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

  // Fog — pure native canvas, completely independent of p5
  fogMap      = new Float32Array(FC * FR).fill(0.94);
  fogBuf      = document.createElement('canvas');
  fogBuf.width  = FC;
  fogBuf.height = FR;
  fogBufCtx   = fogBuf.getContext('2d');
  fogImageData  = fogBufCtx.createImageData(FC, FR);

  // p5 mic
  mic = new p5.AudioIn();
  mic.start();
  fft = new p5.FFT(0.8, 64);
  fft.setInput(mic);

  setupSensors();
  initTM();
  initSpeech();

  idleAt = millis() + 16000;

  document.addEventListener('touchstart', onFirstTouch, {once: true});
  document.addEventListener('mousedown',  onFirstTouch, {once: true});
}

// ================================================================
//  FIRST TOUCH
// ================================================================
async function onFirstTouch() {
  if (audioOn) return;
  if (typeof userStartAudio === 'function') await userStartAudio();
  aCtx    = new (window.AudioContext || window.webkitAudioContext)();
  ambGain = aCtx.createGain();
  ambGain.gain.value = 0.14;
  ambGain.connect(aCtx.destination);
  buildAmbient();
  audioOn = true;
  try {
    if (DeviceMotionEvent?.requestPermission) await DeviceMotionEvent.requestPermission();
    if (DeviceOrientationEvent?.requestPermission) await DeviceOrientationEvent.requestPermission();
  } catch(e) {}
}

// ================================================================
//  AMBIENT OCEAN SOUND
// ================================================================
function buildAmbient() {
  [[150,1.1,0.06,45,1.0],[290,0.7,0.11,75,0.5],[750,0.4,0.23,100,0.2]]
  .forEach(([freq,Q,lfoHz,lfoD,vol]) => {
    const len = aCtx.sampleRate * 4;
    const buf = aCtx.createBuffer(1, len, aCtx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random()*2-1;
    const src = aCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = aCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = Q;
    const lfo = aCtx.createOscillator();
    const lg  = aCtx.createGain(); lg.gain.value = lfoD;
    lfo.frequency.value = lfoHz;
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
  const buf = aCtx.createBuffer(1, sr*1.4, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++)
    d[i] = (Math.random()*2-1) * Math.exp(-i/(sr*0.38));
  const src = aCtx.createBufferSource(); src.buffer = buf;
  const lp  = aCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
  const g   = aCtx.createGain(); g.gain.value = Math.min(strength,1)*0.7;
  src.connect(lp); lp.connect(g); g.connect(aCtx.destination);
  src.start();
}

// ================================================================
//  SENSORS
// ================================================================
function setupSensors() {
  window.addEventListener('deviceorientation', e => {
    tiltX = constrain((e.gamma||0)/30, -1, 1);
    tiltY = constrain(((e.beta||0)-30)/40, -1, 1);
  });
  window.addEventListener('devicemotion', e => {
    const a  = e.accelerationIncludingGravity || {};
    const ax = a.x||0, ay = a.y||0, az = a.z||0;
    const dx = ax-pAcc.x, dy = ay-pAcc.y, dz = az-pAcc.z;
    const mag = Math.sqrt(dx*dx+dy*dy+dz*dz);
    const prev = shakeAmt;
    shakeAmt = constrain(mag/18, 0, 1);
    shakeDir = (Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>Math.abs(dz))
               ? (dx>0?'right':'left') : 'front';
    if (shakeAmt > 0.38) {
      splashA = min(255, splashA + shakeAmt*230);
      if (shakeAmt > 0.55) clearFogBottom(shakeAmt);
      if (shakeAmt > 0.65 && prev < 0.45) playCrash(shakeAmt);
    }
    pAcc = {x:ax,y:ay,z:az};
  });
}

function mouseMoved() {
  if (touches.length > 0) return;
  tiltX = map(mouseX, 0, width,  -0.5, 0.5);
  tiltY = map(mouseY, 0, height, -0.3, 0.3);
}

// ================================================================
//  TEACHABLE MACHINE
// ================================================================
async function initTM() {
  try {
    tmModel = await tmImage.load(TM_URL+'model.json', TM_URL+'metadata.json');
    tmCam   = new tmImage.Webcam(224,224,true);
    await tmCam.setup({facingMode:'user'});
    await tmCam.play();
    tmReady = true;
  } catch(e) { console.warn('TM failed:',e); }
}

async function tickTM() {
  if (!tmReady || millis()-tmT < 130) return;
  tmT = millis();
  try {
    tmCam.update();
    const preds = await tmModel.predict(tmCam.canvas);
    const best  = preds.reduce((a,b) => a.probability>b.probability?a:b);
    if (best.className==='wave' && best.probability>0.95) {
      waveHold++; coverHold = max(0,coverHold-2);
    } else { waveHold = max(0,waveHold-3); }
    if (waveHold>=WAVE_NEED && !girlWaving) {
      girlWaving=true; waveHold=0;
      setTimeout(()=>{ girlWaving=false; },3800);
    }
    if (best.className==='cover' && best.probability>0.85 && waveHold<8)
      coverHold = min(coverHold+1, COVER_NEED+80);
    else coverHold = max(0,coverHold-1);
  } catch(e){}
}

// ================================================================
//  SPEECH RECOGNITION
// ================================================================
function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { console.warn('No SpeechRecognition'); return; }
  srec = new SR();
  srec.continuous = false; srec.interimResults = false; srec.lang = 'en-US';
  srec.onstart  = ()=>{ srActive=true; };
  srec.onresult = e=>{
    const txt = e.results[0][0].transcript.trim();
    srActive = false;
    console.log('heard:', txt);
    if (txt.length>1) sendToAI(txt);
    setTimeout(startListen, 3000);
  };
  srec.onnomatch = ()=>{ srActive=false; setTimeout(startListen,2000); };
  srec.onerror   = e=>{ srActive=false; console.log('sr:',e.error); setTimeout(startListen,3500); };
  srec.onend     = ()=>{ srActive=false; };
  setTimeout(startListen, 8000);
}

function startListen() {
  if (!srec||srActive||isSpeaking) return;
  try { srec.start(); } catch(e){ setTimeout(startListen,2000); }
}

// ================================================================
//  AI
// ================================================================
const SYSTEM = `You are Mara — a girl sealed inside a flooded dark corridor between realities called the Third Realm. You speak through fogged glass to whoever holds the device.

VOICE RULES:
- Always react to what the person actually said. Never ignore context.
- Very short replies: 1-2 sentences, often just 4-8 words.
- Always lowercase. No exclamation marks. Occasional "..."
- Exhausted and cautious, not dramatic.

HOW TO RESPOND:
- "can you hear me" → "yes... i've been hearing you for a while"
- "hello/hi" → "you found it. i wasn't sure anyone would"
- "where are you" → "a corridor. flooded. it goes further than it should"
- "who are you" → "someone who found out something they shouldn't"
- "are you real" → "more real than some of the people near you right now"
- "what is this" → "a threshold. you're already on the wrong side of it"
- water questions → it rises when hollow ones get close
- escape questions → you can't leave, but you can warn them

LORE (reveal slowly):
- Some people in the human world are hollow — empty bodies controlled by something old.
- You were sealed here for knowing this.
- The person contacting you is now visible to the other side.
- Your name is Mara — only say it if asked directly.`;

async function sendToAI(msg) {
  console.log('→ AI:', msg);
  if (!API_KEY || API_KEY==='YOUR_API_KEY_HERE') {
    const rules = [
      [['hear','hello','hi','there'], "yes... i've been hearing you for a while"],
      [['where','place','location'],  "a corridor. flooded. it goes further than it should"],
      [['who','name'],                "someone who found out something they shouldn't"],
      [['real','exist'],              "more real than some of the people near you right now"],
      [['water','flood'],             "it rises when they get close to me"],
      [['help','escape','out'],       "i can't leave. but i can warn you"],
      [['safe'],                      "not anymore. not since you opened this"],
      [['see','look'],                "i can see you... there's something behind you"],
      [['trapped','stuck'],           "yes. for a long time now"],
    ];
    const low = msg.toLowerCase();
    let reply = '...';
    for (const [keys,resp] of rules) if (keys.some(k=>low.includes(k))){ reply=resp; break; }
    setTimeout(()=>speakLine(reply), 1200+Math.random()*1400);
    return;
  }
  aiHistory.push({role:'user',content:msg});
  if (aiHistory.length>16) aiHistory=aiHistory.slice(-16);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':API_KEY,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:90,
        system:SYSTEM,
        messages:aiHistory
      })
    });
    const data  = await res.json();
    const reply = data?.content?.[0]?.text?.trim()||'...';
    console.log('← AI:', reply);
    aiHistory.push({role:'assistant',content:reply});
    setTimeout(()=>speakLine(reply), 1000+Math.random()*1800);
  } catch(err){
    console.warn('AI error:',err);
    setTimeout(()=>speakLine('...'),1500);
  }
}

function speakLine(text) {
  isSpeaking=true; showSub(text);
  console.log('speaking:', text);
  if (!window.speechSynthesis){ isSpeaking=false; setTimeout(startListen,1500); return; }
  window.speechSynthesis.cancel();
  setTimeout(()=>{
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate=0.74; utt.pitch=0.80; utt.volume=0.95;
    const vlist = speechSynthesis.getVoices();
    const pick  = vlist.find(v=>/samantha|moira|karen|zoe|nicky/i.test(v.name))
               || vlist.find(v=>v.lang.startsWith('en'));
    if (pick) utt.voice=pick;
    utt.onend  = ()=>{ isSpeaking=false; setTimeout(startListen,2000); };
    utt.onerror= ()=>{ isSpeaking=false; setTimeout(startListen,2000); };
    speechSynthesis.speak(utt);
  }, 80);
}

function showSub(text) {
  subtitle=text; subA=0; subDir=1;
  setTimeout(()=>{ subDir=-1; }, max(3000,text.length*88));
}

function checkIdle() {
  if (isSpeaking||millis()<idleAt) return;
  speakLine(IDLE[idleIdx++%IDLE.length]);
  idleAt=millis()+15000+Math.random()*15000;
}

// ================================================================
//  FOG SYSTEM
// ================================================================
const REGEN = 0.00048;

function clearFogAt(px, py, radiusPx) {
  const cx=(px/width)*FC, cy=(py/height)*FR;
  const fr=(radiusPx/width)*FC, fr2=fr*fr;
  const x0=max(0,floor(cx-fr)), x1=min(FC-1,ceil(cx+fr));
  const y0=max(0,floor(cy-fr)), y1=min(FR-1,ceil(cy+fr));
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) {
    const d2=(x-cx)*(x-cx)+(y-cy)*(y-cy);
    if (d2<fr2) fogMap[y*FC+x]=max(0,fogMap[y*FC+x]-(1-d2/fr2)*0.96);
  }
}

function clearFogBottom(intensity) {
  const y0=floor(FR*0.82);
  for (let y=y0;y<FR;y++) for (let x=0;x<FC;x++)
    fogMap[y*FC+x]=max(0,fogMap[y*FC+x]-intensity*0.5*random(0.3,1));
}

function clearFogCenter(r) { clearFogAt(width/2,height/2,r); }

function regenFog() {
  const boost = coverHold>=COVER_NEED ? 0.003 : 0;
  for (let i=0;i<fogMap.length;i++)
    fogMap[i]=min(1,fogMap[i]+REGEN+boost);
}

// ── THE FIX ──────────────────────────────────────────────────
// Write fogMap into a native ImageData on a 48×86 HTMLCanvas,
// then drawImage it onto the MAIN canvas context scaled to
// exactly (0, 0, width, height).
// This is ONE draw call, ONE layer. Cannot tile. Cannot split.
function renderFog(tx, ty) {
  const d = fogImageData.data;
  for (let i=0;i<fogMap.length;i++) {
    const x=i%FC, y=floor(i/FC);
    const v=fogMap[i];
    const n=noise(x*0.13, y*0.13, fc*0.005)*24;
    const c=180+n;
    d[i*4]  =c;        // R
    d[i*4+1]=c+6;      // G
    d[i*4+2]=c+16;     // B
    d[i*4+3]=v*244;    // A  ← this is the only thing that matters for wipe
  }
  fogBufCtx.putImageData(fogImageData, 0, 0);

  // Get the MAIN canvas 2D context (the one p5 draws on)
  const ctx = canvas.elt.getContext('2d');
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(tx, ty);
  // Scale the 48×86 buffer to EXACTLY fill the screen
  ctx.drawImage(fogBuf, 0, 0, width, height);
  ctx.restore();
}

// ================================================================
//  BLOW DETECTION
// ================================================================
function detectBlow() {
  if (blowCD>0){ blowCD--; return; }
  const vol=mic.getLevel();
  if (vol<0.15) return;
  const s=fft.analyze();
  let lo=0,mi=0,hi=0;
  for(let i=0; i<8; i++) lo+=s[i]; lo/=8;
  for(let i=8; i<24;i++) mi+=s[i]; mi/=16;
  for(let i=24;i<48;i++) hi+=s[i]; hi/=24;
  if(abs(lo-mi)<55&&abs(mi-hi)<65&&vol>0.18){
    clearFogCenter(width*0.24); blowCD=55;
  }
}

// ================================================================
//  DRAW
// ================================================================
function draw() {
  fc++;
  background(0);

  smX=lerp(smX,tiltX,0.06); smY=lerp(smY,tiltY,0.06);
  const ox=smX*20, oy=smY*13;

  bPhase+=0.009; bY=sin(bPhase)*3;
  shakeAmt*=0.88; splashA=max(0,splashA-4);

  tickTM(); detectBlow(); regenFog(); checkIdle();
  subA=constrain(subA+subDir*3.5, 0, 215);

  // 1. ROOM
  cover(imgRoom, width/2+ox, height/2+oy, 1);

  // 2. WATER  (SCREEN blend: black→transparent)
  push(); blendMode(SCREEN);
  const wb=sin(fc*0.017)*4+bY*0.4+shakeAmt*14;
  cover(imgWater, width/2+ox*0.70, height*0.70+oy*0.70+wb, 1, 175);
  pop();

  // 3. GIRL  (SCREEN blend)
  push(); blendMode(SCREEN);
  cover(girlWaving?imgGirlWave:imgGirl,
    width*0.50+ox*0.85+sin(bPhase*0.35)*2,
    height*0.50+oy*0.85+bY, 1, 200);
  pop();

  // 4. VIGNETTE
  const vg=drawingContext.createRadialGradient(
    width/2,height/2, height*0.04,
    width/2,height/2, height*0.80);
  vg.addColorStop(0,    'rgba(0,0,0,0)');
  vg.addColorStop(0.52, 'rgba(0,0,0,0.20)');
  vg.addColorStop(1,    'rgba(0,0,0,0.92)');
  drawingContext.fillStyle=vg;
  drawingContext.fillRect(0,0,width,height);

  // 5. FOG — single layer, drawn directly onto main canvas
  renderFog(ox*0.12, oy*0.12);

  // 6. COVER THICKEN
  if (coverHold>=COVER_NEED) {
    const ca=map(coverHold,COVER_NEED,COVER_NEED+80,0,115);
    fill(182,188,198,constrain(ca,0,115));
    noStroke(); rect(0,0,width,height);
  }

  // 7. SPLASH
  if (splashA>4) {
    push(); blendMode(SCREEN);
    const wi=shakeDir==='left'?imgWaveL:shakeDir==='right'?imgWaveR:imgWaveF;
    cover(wi,width/2,height*0.82,0.92,splashA);
    pop();
  }

  // 8. SUBTITLE
  if (subA>2) {
    push();
    textFont('Georgia, serif'); textSize(15);
    textAlign(CENTER,CENTER); noStroke();
    fill(0,0,0,subA*0.55);
    text(subtitle,width/2+1,height*0.875+1);
    fill(192,185,172,subA);
    text(subtitle,width/2,height*0.875);
    pop();
  }

  // 9. LISTENING DOT
  if (srActive) {
    push(); noStroke();
    fill(110,200,110, 140+sin(fc*0.14)*60);
    circle(width-18,22,7);
    pop();
  }

  // 10. HINT
  if (hintA>0) {
    if (fc>160) hintA=max(0,hintA-2);
    push();
    textFont('Georgia, serif'); textAlign(CENTER,CENTER);
    textSize(14); fill(148,141,132,hintA);
    text('touch the glass',width/2,height*0.50-12);
    textSize(10); fill(102,96,90,hintA*0.5);
    text('w i p e   t o   s e e',width/2,height*0.50+14);
    pop();
  }
}

// ================================================================
//  INPUT — brush = 19% of screen width
// ================================================================
const BRUSH=()=>width*0.19;
let px=-1,py=-1;

function touchStarted(){
  hintA=0; px=mouseX; py=mouseY;
  clearFogAt(mouseX,mouseY,BRUSH()); return false;
}
function touchMoved(){
  const r=BRUSH();
  const n=max(1,ceil(dist(mouseX,mouseY,px,py)/8));
  for(let i=0;i<=n;i++)
    clearFogAt(lerp(px,mouseX,i/n),lerp(py,mouseY,i/n),r);
  px=mouseX; py=mouseY; return false;
}
function mousePressed(){
  hintA=0; px=mouseX; py=mouseY; clearFogAt(mouseX,mouseY,BRUSH());
}
function mouseDragged(){
  const r=BRUSH();
  const n=max(1,ceil(dist(mouseX,mouseY,px,py)/8));
  for(let i=0;i<=n;i++)
    clearFogAt(lerp(px,mouseX,i/n),lerp(py,mouseY,i/n),r);
  px=mouseX; py=mouseY;
}

function keyPressed(){
  if(key===' '){ shakeAmt=0.9;splashA=240;clearFogBottom(0.85);shakeDir=['front','left','right'][floor(random(3))];playCrash(0.85); }
  if(key==='b') clearFogCenter(width*0.24);
  if(key==='w'){ girlWaving=true; setTimeout(()=>{girlWaving=false;},3800); }
  if(key==='c'){ coverHold=COVER_NEED+70; setTimeout(()=>{coverHold=0;},3000); }
  if(key==='t') sendToAI('can you hear me');
  if(key==='a') sendToAI('where are you');
  if(key==='s') sendToAI('who are you');
  if(key==='h') sendToAI('hello');
}

// ================================================================
//  RESIZE
// ================================================================
function windowResized(){
  resizeCanvas(windowWidth,windowHeight);
  fogMap=new Float32Array(FC*FR).fill(0.94);
}