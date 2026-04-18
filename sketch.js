// ================================================================
//  FOG MIRROR — sketch.js
// ================================================================

let imgRoom, imgWater, imgGirl, imgGirlWave;
let imgWaveF, imgWaveL, imgWaveR;

// FOG — grid of plain rects
const FC=40, FR=71;
let fogMap, cellW, cellH;

// Water droplets that form after wiping
let drops = []; // [{x,y,len,speed,alpha,width}]

// Parallax
let tiltX=0,tiltY=0,smX=0,smY=0;

// Shake
let shakeAmt=0,shakeDir='front',splashA=0;
let pAX=0,pAY=0,pAZ=0;

// Girl
let girlWaving=false,bPhase=0,bY=0;

// TM
const TM_URL='https://teachablemachine.withgoogle.com/models/3coy75KsA/';
let tmModel=null,tmCam=null,tmReady=false,tmLastT=0;
let waveHold=0,coverHold=0;
const WAVE_NEED=80,COVER_NEED=45;

// Audio
let aCtx=null,ambGain=null,audioOn=false,lastCrash=0;
let mic,fft,blowCD=0;

// Speech
let srec=null,srActive=false,isSpeaking=false;
let aiHistory=[];
let idleAt=0,idleIdx=0;
const IDLE=[
  "do you hear the water",
  "i have been here a long time",
  "be quiet",
  "closer",
  "they are watching",
  "the water is rising",
  "don't look at the corner",
  "i know you can see me",
];

let fc=0,hintA=220;
let px=-1,py=-1;

// ── cover-scale ──────────────────────────────────────────────
function drawCover(img,cx,cy,sc,alpha){
  if(!img||!img.width) return;
  const s=max(width/img.width,height/img.height)*(sc||1);
  if(alpha!==undefined) tint(255,alpha); else noTint();
  image(img,cx,cy,img.width*s,img.height*s);
  noTint();
}

// ================================================================
//  PRELOAD
// ================================================================
function preload(){
  imgRoom     =loadImage('room.png');
  imgWater    =loadImage('water.png');
  imgGirl     =loadImage('girl.png');
  imgGirlWave =loadImage('girl_wave.png');
  imgWaveF    =loadImage('waves_front.png');
  imgWaveL    =loadImage('waves_left.png');
  imgWaveR    =loadImage('waves_right.png');
}

// ================================================================
//  SETUP
// ================================================================
function setup(){
  createCanvas(windowWidth,windowHeight);
  imageMode(CENTER);
  noStroke();
  fogMap=new Float32Array(FC*FR).fill(1.0);
  mic=new p5.AudioIn(); mic.start();
  fft=new p5.FFT(0.8,64); fft.setInput(mic);
  window.addEventListener('deviceorientation',onOrientation);
  window.addEventListener('devicemotion',onMotion);
}

// ================================================================
//  LAUNCH — called from experience.html on first touch
// ================================================================
window._launchExperience=async function(){
  try{ if(DeviceMotionEvent?.requestPermission) await DeviceMotionEvent.requestPermission(); }catch(e){}
  try{ if(DeviceOrientationEvent?.requestPermission) await DeviceOrientationEvent.requestPermission(); }catch(e){}
  try{
    if(typeof userStartAudio==='function') await userStartAudio();
    aCtx=new(window.AudioContext||window.webkitAudioContext)();
    ambGain=aCtx.createGain(); ambGain.gain.value=0.13;
    ambGain.connect(aCtx.destination);
    buildAmbient(); audioOn=true;
  }catch(e){}
  initSpeech();
  initTM();
  idleAt=millis()+18000;
};

// ================================================================
//  SENSORS
// ================================================================
function onOrientation(e){
  tiltX=constrain((e.gamma||0)/30,-1,1);
  tiltY=constrain(((e.beta||0)-30)/40,-1,1);
}
function onMotion(e){
  const a=e.accelerationIncludingGravity||e.acceleration||{};
  const ax=a.x||0,ay=a.y||0,az=a.z||0;
  const dx=ax-pAX,dy=ay-pAY,dz=az-pAZ;
  pAX=ax;pAY=ay;pAZ=az;
  const mag=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const prev=shakeAmt;
  shakeAmt=constrain(mag/12,0,1);
  shakeDir=(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>Math.abs(dz))?(dx>0?'right':'left'):'front';
  if(shakeAmt>0.25){
    splashA=min(255,splashA+shakeAmt*255);
    clearFogBottom(shakeAmt);
    if(shakeAmt>0.45&&prev<0.2) playCrash(shakeAmt);
  }
}
function mouseMoved(){
  if(touches&&touches.length>0) return;
  tiltX=map(mouseX,0,width,-0.5,0.5);
  tiltY=map(mouseY,0,height,-0.3,0.3);
}

// ================================================================
//  AUDIO
// ================================================================
function buildAmbient(){
  if(!aCtx) return;
  [[150,1.1,0.06,45,1.0],[290,0.7,0.11,75,0.5],[750,0.4,0.23,100,0.2]]
  .forEach(([freq,Q,lfoHz,lfoD,vol])=>{
    const len=aCtx.sampleRate*4;
    const buf=aCtx.createBuffer(1,len,aCtx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=aCtx.createBufferSource(); src.buffer=buf; src.loop=true;
    const bp=aCtx.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value=freq; bp.Q.value=Q;
    const lfo=aCtx.createOscillator();
    const lg=aCtx.createGain(); lg.gain.value=lfoD;
    lfo.frequency.value=lfoHz;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const g=aCtx.createGain(); g.gain.value=vol;
    src.connect(bp); bp.connect(g); g.connect(ambGain);
    src.start();
  });
}
function playCrash(str){
  if(!aCtx) return;
  const now=Date.now(); if(now-lastCrash<500) return; lastCrash=now;
  const sr=aCtx.sampleRate;
  const buf=aCtx.createBuffer(1,sr*1.2,sr);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(sr*0.35));
  const src=aCtx.createBufferSource(); src.buffer=buf;
  const lp=aCtx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=700;
  const g=aCtx.createGain(); g.gain.value=min(str,1)*0.7;
  src.connect(lp); lp.connect(g); g.connect(aCtx.destination);
  src.start();
}

// ================================================================
//  TEACHABLE MACHINE
// ================================================================
async function initTM(){
  try{
    tmModel=await tmImage.load(TM_URL+'model.json',TM_URL+'metadata.json');
    tmCam=new tmImage.Webcam(224,224,true);
    await tmCam.setup({facingMode:'user'});
    await tmCam.play();
    tmReady=true;
  }catch(e){ console.warn('TM:',e); }
}
async function tickTM(){
  if(!tmReady||millis()-tmLastT<130) return;
  tmLastT=millis();
  try{
    tmCam.update();
    const preds=await tmModel.predict(tmCam.canvas);
    const best=preds.reduce((a,b)=>a.probability>b.probability?a:b);
    if(best.className==='wave'&&best.probability>0.95){
      waveHold++; coverHold=max(0,coverHold-2);
    } else { waveHold=max(0,waveHold-3); }
    if(waveHold>=WAVE_NEED&&!girlWaving){
      girlWaving=true; waveHold=0;
      setTimeout(()=>{girlWaving=false;},3500);
    }
    if(best.className==='cover'&&best.probability>0.85&&waveHold<8)
      coverHold=min(coverHold+1,COVER_NEED+80);
    else coverHold=max(0,coverHold-1);
  }catch(e){}
}

// ================================================================
//  SPEECH
// ================================================================
function initSpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return;
  srec=new SR();
  srec.continuous=false; srec.interimResults=false; srec.lang='en-US';
  srec.onstart =()=>{ srActive=true;  window.setListenDot&&window.setListenDot(true); };
  srec.onend   =()=>{ srActive=false; window.setListenDot&&window.setListenDot(false); };
  srec.onerror =()=>{ srActive=false; window.setListenDot&&window.setListenDot(false); setTimeout(startListen,3000); };
  srec.onresult=e=>{
    const txt=e.results[0][0].transcript.trim();
    srActive=false; window.setListenDot&&window.setListenDot(false);
    if(txt.length>1) sendToAI(txt);
    setTimeout(startListen,3000);
  };
  setTimeout(startListen,3000);
}
function startListen(){
  if(!srec||srActive||isSpeaking) return;
  try{ srec.start(); }catch(e){ setTimeout(startListen,2000); }
}

// ================================================================
//  AI
// ================================================================
const SYS=`You are Mara — a girl sealed inside a flooded dark corridor between realities. You speak through fogged glass.
RULES: React to what was said. 1-2 sentences max, often 4-8 words. Always lowercase. No exclamation marks. Never respond with only punctuation — always say real words.
Exhausted, watching, cautious. Not theatrical.
- "can you hear me" → "yes, i've been hearing you for longer than you think"
- "hello/hi" → "you found it. i wasn't sure anyone would"
- "where are you" → "a corridor. flooded. it goes further than it should"
- "who are you" → "someone who found out something they shouldn't"
- "are you real" → "more real than some of the people near you right now"
- water → rises when hollow ones get near
- escape → can't leave but can warn them
LORE: some people are hollow — empty bodies. sealed here for knowing this. name is Mara, only say if asked directly.`;

async function sendToAI(msg){
  const key=(window._apiKey||'').trim();
  if(!key){
    const rules=[
      [['hear','hello','hi','hey'],    "yes, i've been hearing you for a while"],
      [['where','place'],              "a corridor. flooded. longer than it should be"],
      [['who','name'],                 "someone who found out something they shouldn't"],
      [['real','exist'],               "more real than some of the people near you"],
      [['water','flood'],              "it rises when they get close"],
      [['help','escape','leave'],      "i can't leave. but i can warn you"],
      [['safe'],                       "not anymore. not since you opened this"],
      [['see','look'],                 "there is something behind you"],
      [['trapped','stuck'],            "yes. for a long time now"],
      [['why'],                        "because i found out what they are"],
      [['what'],                       "a threshold. you're on the wrong side"],
    ];
    const low=msg.toLowerCase();
    let reply="i hear you";
    for(const [keys,resp] of rules) if(keys.some(k=>low.includes(k))){ reply=resp; break; }
    setTimeout(()=>speakLine(reply),1200+Math.random()*1000);
    return;
  }
  aiHistory.push({role:'user',content:msg});
  if(aiHistory.length>16) aiHistory=aiHistory.slice(-16);
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:90,system:SYS,messages:aiHistory})
    });
    const data=await res.json();
    const reply=data?.content?.[0]?.text?.trim()||'i hear you';
    aiHistory.push({role:'assistant',content:reply});
    setTimeout(()=>speakLine(reply),1000+Math.random()*1500);
  }catch(e){ setTimeout(()=>speakLine('i hear you'),1500); }
}

function speakLine(text){
  isSpeaking=true;
  window.showSubtitle&&window.showSubtitle(text);
  const dur=max(3000,text.length*90);
  setTimeout(()=>window.hideSubtitle&&window.hideSubtitle(),dur);
  if(!window.speechSynthesis){ isSpeaking=false; setTimeout(startListen,1500); return; }
  window.speechSynthesis.cancel();

  // Strip dots/ellipsis so TTS never says "dot"
  let spoken=text.replace(/\.{2,}/g,', ').replace(/\./g,' ').replace(/\s+/g,' ').trim();
  if(!spoken){ isSpeaking=false; setTimeout(startListen,1500); return; }

  setTimeout(()=>{
    const utt=new SpeechSynthesisUtterance(spoken);
    utt.rate=0.74; utt.pitch=0.80; utt.volume=0.95;
    const voices=speechSynthesis.getVoices();
    const pick=voices.find(v=>/samantha|moira|karen|zoe|nicky/i.test(v.name))
            ||voices.find(v=>v.lang.startsWith('en'));
    if(pick) utt.voice=pick;
    utt.onend=utt.onerror=()=>{ isSpeaking=false; setTimeout(startListen,2000); };
    speechSynthesis.speak(utt);
  },100);
}

function checkIdle(){
  if(isSpeaking||millis()<idleAt) return;
  speakLine(IDLE[idleIdx++%IDLE.length]);
  idleAt=millis()+14000+Math.random()*14000;
}

// ================================================================
//  FOG
// ================================================================
// Faster regen: 0.0018 (was 0.00042 — now ~4x faster)
const REGEN=0.0018;

function clearFogAt(px,py,radiusPx){
  const cx=(px/width)*FC, cy=(py/height)*FR;
  const fr=(radiusPx/width)*FC, fr2=fr*fr;
  const x0=max(0,floor(cx-fr)),x1=min(FC-1,ceil(cx+fr));
  const y0=max(0,floor(cy-fr)),y1=min(FR-1,ceil(cy+fr));
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    const d2=(x-cx)*(x-cx)+(y-cy)*(y-cy);
    if(d2<fr2) fogMap[y*FC+x]=max(0,fogMap[y*FC+x]-(1-d2/fr2)*0.97);
  }
  // Spawn water droplets at wipe location
  spawnDrops(px,py);
}
function clearFogBottom(intensity){
  const y0=floor(FR*0.78);
  for(let y=y0;y<FR;y++) for(let x=0;x<FC;x++)
    fogMap[y*FC+x]=max(0,fogMap[y*FC+x]-intensity*0.6*random(0.3,1));
}
function clearFogCenter(r){ clearFogAt(width/2,height/2,r); }
function regenFog(){
  const boost=coverHold>=COVER_NEED?0.008:0;
  for(let i=0;i<fogMap.length;i++) fogMap[i]=min(1,fogMap[i]+REGEN+boost);
}

function drawFog(){
  cellW=width/FC; cellH=height/FR;
  noStroke();
  for(let y=0;y<FR;y++){
    for(let x=0;x<FC;x++){
      const v=fogMap[y*FC+x];
      if(v<0.01) continue;
      const drift=(sin(fc*0.003+x*0.08+y*0.08)*0.5+0.5)*20;
      const c=170+drift;
      fill(c,c+8,c+20,v*252);
      rect(x*cellW,y*cellH,cellW+1,cellH+1);
    }
  }
}

// ================================================================
//  WATER DROPLETS — spawn on wipe, slide down the glass
// ================================================================
function spawnDrops(sx, sy) {
  // Spawn 2-4 droplets near the wipe position
  const count = floor(random(2,5));
  for (let i=0; i<count; i++) {
    drops.push({
      x:     sx + random(-30, 30),
      y:     sy + random(-10, 10),
      len:   random(8, 35),        // trail length px
      speed: random(0.4, 1.8),     // px per frame
      alpha: random(120, 200),
      w:     random(1.0, 2.5),     // stroke width
      wobble: random(TWO_PI),      // phase for slight sideways drift
    });
  }
  // Cap total drops
  if (drops.length > 80) drops = drops.slice(-80);
}

function updateAndDrawDrops() {
  push();
  noFill();
  for (let i = drops.length-1; i >= 0; i--) {
    const d = drops[i];
    d.y    += d.speed;
    d.alpha -= 0.8;           // fade out
    d.x    += sin(d.wobble + fc*0.04) * 0.15; // subtle sideways drift

    if (d.alpha <= 0 || d.y > height + 40) {
      drops.splice(i, 1);
      continue;
    }

    // Check fog density at drop position — only draw where fog exists
    const fogVal = fogMap[
      min(FR-1, floor((d.y/height)*FR)) * FC +
      min(FC-1, floor((d.x/width)*FC))
    ] || 0;
    if (fogVal < 0.05) { drops.splice(i,1); continue; } // fell into clear area

    // Draw: thin vertical line (the streak) + small oval at bottom (the bead)
    const streakAlpha = d.alpha * fogVal;
    stroke(220, 226, 235, streakAlpha * 0.55);
    strokeWeight(d.w * 0.6);
    line(d.x, d.y - d.len, d.x, d.y);

    // Bead at bottom
    fill(225, 230, 240, streakAlpha * 0.8);
    noStroke();
    ellipse(d.x, d.y, d.w*2.2, d.w*2.8);
    noFill();
  }
  pop();
}

// ================================================================
//  BLOW
// ================================================================
function detectBlow(){
  if(blowCD>0){ blowCD--; return; }
  if(!mic) return;
  const vol=mic.getLevel();
  if(vol<0.13) return;
  const s=fft.analyze();
  let lo=0,mi=0,hi=0;
  for(let i=0;i<8;i++) lo+=s[i]; lo/=8;
  for(let i=8;i<24;i++) mi+=s[i]; mi/=16;
  for(let i=24;i<48;i++) hi+=s[i]; hi/=24;
  if(abs(lo-mi)<60&&abs(mi-hi)<70&&vol>0.16){
    clearFogCenter(width*0.25); blowCD=55;
  }
}

// ================================================================
//  DRAW
// ================================================================
function draw(){
  fc++; background(0);

  smX=lerp(smX,tiltX,0.06); smY=lerp(smY,tiltY,0.06);
  const ox=smX*20,oy=smY*13;
  bPhase+=0.009; bY=sin(bPhase)*3;
  shakeAmt*=0.90; splashA=max(0,splashA-5);

  tickTM(); detectBlow(); regenFog(); checkIdle();

  // 1. ROOM
  drawCover(imgRoom,width/2+ox,height/2+oy,1);

  // 2. WATER
  push(); blendMode(SCREEN);
  const wox=ox*0.7+(shakeDir==='left'?-shakeAmt*30:shakeDir==='right'?shakeAmt*30:0);
  const woy=height*0.70+oy*0.7+sin(fc*0.017)*4+bY*0.4+shakeAmt*22;
  drawCover(imgWater,width/2+wox,woy,1,175);
  pop();

  // 3. GIRL
  push(); blendMode(SCREEN);
  drawCover(
    girlWaving?imgGirlWave:imgGirl,
    width*0.50+ox*0.85+sin(bPhase*0.35)*2,
    height*0.50+oy*0.85+bY,1,200);
  pop();

  // 4. VIGNETTE
  noStroke();
  const vg=drawingContext.createRadialGradient(width/2,height/2,height*0.03,width/2,height/2,height*0.82);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(0.5,'rgba(0,0,0,0.18)');
  vg.addColorStop(1,'rgba(0,0,0,0.92)');
  drawingContext.fillStyle=vg;
  drawingContext.fillRect(0,0,width,height);

  // 5. FOG
  drawFog();

  // 6. DROPLETS — drawn on top of fog so they appear on the glass
  updateAndDrawDrops();

  // 7. COVER
  if(coverHold>=COVER_NEED){
    const ca=map(coverHold,COVER_NEED,COVER_NEED+80,0,130);
    fill(178,184,196,constrain(ca,0,130));
    rect(0,0,width,height);
  }

  // 8. SPLASH
  if(splashA>4){
    push(); blendMode(SCREEN);
    const wi=shakeDir==='left'?imgWaveL:shakeDir==='right'?imgWaveR:imgWaveF;
    drawCover(wi,width/2,height*0.82,0.95,splashA);
    pop();
  }

  // 9. HINT
  if(hintA>0){
    if(fc>160) hintA=max(0,hintA-2);
    push();
    textFont('Georgia,serif'); textAlign(CENTER,CENTER); noStroke();
    textSize(14); fill(148,141,132,hintA);
    text('touch the glass',width/2,height*0.50-14);
    textSize(10); fill(102,96,90,hintA*0.5);
    text('w i p e   t o   s e e',width/2,height*0.50+12);
    pop();
  }
}

// ================================================================
//  INPUT
// ================================================================
const BRUSH=()=>width*0.19;
function touchStarted(){ hintA=0; px=mouseX; py=mouseY; clearFogAt(mouseX,mouseY,BRUSH()); return false; }
function touchMoved(){
  const r=BRUSH(),n=max(1,ceil(dist(mouseX,mouseY,px,py)/8));
  for(let i=0;i<=n;i++) clearFogAt(lerp(px,mouseX,i/n),lerp(py,mouseY,i/n),r);
  px=mouseX; py=mouseY; return false;
}
function mousePressed(){ hintA=0; px=mouseX; py=mouseY; clearFogAt(mouseX,mouseY,BRUSH()); }
function mouseDragged(){
  const r=BRUSH(),n=max(1,ceil(dist(mouseX,mouseY,px,py)/8));
  for(let i=0;i<=n;i++) clearFogAt(lerp(px,mouseX,i/n),lerp(py,mouseY,i/n),r);
  px=mouseX; py=mouseY;
}
function windowResized(){
  resizeCanvas(windowWidth,windowHeight);
  fogMap=new Float32Array(FC*FR).fill(1.0);
}