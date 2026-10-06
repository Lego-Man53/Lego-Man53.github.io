(() => {
  'use strict';
  const { WIDTH: W, HEIGHT: H, LANES, create, steer, update } = window.RaceCore;
  const $ = selector => document.querySelector(selector);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const overlay = $('#overlay'), startBtn = $('#startBtn'), pauseBtn = $('#pauseBtn');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = create(), accumulator = 0, lastTime = null, particles = [], shake = 0;
  let sound = false, audioContext, pointerStart = null;
  const best = {};
  // Private browsing and storage restrictions must never prevent a game from starting.
  function readBest(mode) {
    try {
      const value = Number(localStorage.getItem(`flappy-car-best-${mode}`) || (mode === 'easy' && localStorage.getItem('flappy-lane-racer-best')) || 0);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch { return 0; }
  }
  for (const mode of ['easy', 'medium', 'hard']) best[mode] = readBest(mode);
  function saveBest() {
    if (state.score <= best[state.mode]) return;
    best[state.mode] = state.score;
    try { localStorage.setItem(`flappy-car-best-${state.mode}`, String(state.score)); } catch { /* Keep the session record when storage is unavailable. */ }
  }
  function tone(frequency, duration = .08, type = 'sine') {
    if (!sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Sound is optional. */ }
  }
  function scores() {
    $('#score').textContent = String(state.score).padStart(2, '0');
    $('#best').textContent = String(best[state.mode]).padStart(2, '0');
  }
  function syncUI() {
    const phase = state.phase;
    overlay.hidden = phase === 'running';
    pauseBtn.disabled = phase === 'ready' || phase === 'over';
    pauseBtn.textContent = phase === 'paused' ? 'Resume ▷' : 'Pause Ⅱ';
    $('#leftBtn').disabled = $('#rightBtn').disabled = phase !== 'running';
    $('#pace').textContent = state.mode.toUpperCase();
    if (phase === 'ready') {
      $('#overlayKicker').textContent = 'YOUR NIGHT STARTS HERE';
      $('#overlayTitle').innerHTML = 'Take the<br><em>night shift.</em>';
      $('#overlayDescription').innerHTML = 'Three lanes. An open road.<br>How far can you go?';
      startBtn.textContent = 'Let’s drive ↗';
      $('#gameStatus').textContent = 'Ready when you are. Choose a pace and start driving.';
    } else if (phase === 'paused') {
      $('#overlayKicker').textContent = 'TAKE A BREATHER';
      $('#overlayTitle').innerHTML = 'Enjoy the<br><em>pit stop.</em>';
      $('#overlayDescription').textContent = `Your run is safe. ${state.score} traffic waves passed.`;
      startBtn.textContent = 'Keep driving ↗';
      $('#gameStatus').textContent = 'Paused. Press Space or Resume to continue.';
    } else if (phase === 'over') {
      $('#overlayKicker').textContent = 'THERE’S ALWAYS ANOTHER RUN';
      $('#overlayTitle').innerHTML = 'One more<br><em>night?</em>';
      $('#overlayDescription').textContent = `You passed ${state.score} traffic waves. Personal best: ${best[state.mode]}.`;
      startBtn.textContent = 'Try again ↗';
      $('#gameStatus').textContent = `Run finished. Score ${state.score}. Press Space or Try again.`;
    } else $('#gameStatus').textContent = 'Driving. Steer with ← →, A / D, or the touch controls. Space pauses.';
    scores();
  }
  function start() {
    if (state.phase !== 'paused') { state = create(state.mode); particles = []; shake = 0; }
    state.phase = 'running'; accumulator = 0; lastTime = null;
    tone(420); syncUI(); canvas.focus({ preventScroll: true });
    if (matchMedia('(max-width: 680px)').matches) $('.game-panel').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
  }
  function pause() {
    if (state.phase === 'running') { state.phase = 'paused'; accumulator = 0; syncUI(); }
    else if (state.phase === 'paused') start();
  }
  function move(direction) { steer(state, direction); if (state.phase === 'running') tone(170 + state.lane * 35, .035); }
  function crash() {
    saveBest(); shake = reducedMotion ? 0 : 9;
    particles = Array.from({ length: reducedMotion ? 0 : 30 }, () => ({ x: state.x, y: state.y - 25, vx: (Math.random() - .5) * 330, vy: (Math.random() - .5) * 330, life: .35 + Math.random() * .55 }));
    tone(70, .25, 'triangle'); syncUI();
  }
  function rect(x, y, w, h, radius, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function line(x1, y1, x2, y2, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function tree(x, y, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#071e16'; ctx.beginPath(); ctx.ellipse(4, 7, 29, 37, .2, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy, r, c] of [[0,0,21,'#244330'],[-10,-8,15,'#2a4d35'],[8,-12,16,'#36583b'],[4,3,13,'#2c4930']]) { ctx.fillStyle=c; ctx.beginPath();ctx.arc(dx,dy,r,0,Math.PI*2);ctx.fill(); }
    ctx.restore();
  }
  function drawRoad() {
    ctx.fillStyle = '#192d23'; ctx.fillRect(0,0,W,H);
    const roadGradient = ctx.createLinearGradient(54,0,378,0);
    roadGradient.addColorStop(0,'#253232');roadGradient.addColorStop(.5,'#303b3b');roadGradient.addColorStop(1,'#232f30');
    ctx.fillStyle=roadGradient;ctx.fillRect(54,0,324,H);
    // Subtle asphalt grain; fixed positions avoid shimmering between frames.
    ctx.fillStyle='#d5ddce07';
    for(let i=0;i<170;i++){const x=58+(i*97)%316,y=((i*61)+state.distance)%H;ctx.fillRect(x,y,1,2);}
    ctx.fillStyle='#0c1618';ctx.fillRect(43,0,8,H);ctx.fillRect(381,0,8,H);
    line(57,0,57,H,'#bac59880',2);line(375,0,375,H,'#bac59880',2);
    ctx.setLineDash([34,38]);ctx.lineDashOffset=-state.distance%72;
    line(162,-72,162,H+72,'#b6c6bd69',2);line(270,-72,270,H+72,'#b6c6bd69',2);ctx.setLineDash([]);
    for(let i=-1;i<9;i++){
      const y=i*110+state.distance%110;
      rect(47,y,5,35,1,'#b7c59a');rect(380,y,5,35,1,'#b7c59a');
      rect(47,y+35,5,35,1,'#566646');rect(380,y+35,5,35,1,'#566646');
    }
    for(let i=-1;i<5;i++){
      const y=i*200+(state.distance*.85)%200;
      tree(14,y,.85);tree(422,y+100,1.05);
    }
    for(let i=-1;i<3;i++){
      const y=i*330+state.distance%330;
      for(const side of [0,1]){
        const x=side?398:34;
        const glow=ctx.createRadialGradient(x,y,0,x,y,95);glow.addColorStop(0,'#f3edb523');glow.addColorStop(1,'#f3edb500');ctx.fillStyle=glow;ctx.fillRect(x-95,y-95,190,190);
        rect(x-2,y-20,4,30,1,'#617064');rect(x-7,y-23,14,5,2,'#f4ebba');
      }
    }
  }
  function drawCar(x,y,color,isPlayer=false,tilt=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);
    // Headlight pools, cast shadows, body highlights, glass, mirrors and brake lights.
    if (isPlayer) {
      const beam=ctx.createLinearGradient(0,-180,0,-34);beam.addColorStop(0,'#e9ffd000');beam.addColorStop(1,'#e9ffd030');ctx.fillStyle=beam;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*18-5,-35);ctx.lineTo(side*18-31,-175);ctx.lineTo(side*18+31,-175);ctx.lineTo(side*18+5,-35);ctx.fill();}
    }
    rect(-28,-38,59,92,14,'#00000050');
    for (const side of [-1,1]) { rect(side*25-4,-26,8,21,3,'#10191a');rect(side*25-4,19,8,20,3,'#10191a'); }
    const body=ctx.createLinearGradient(-26,0,26,0);body.addColorStop(0,color[0]);body.addColorStop(.35,color[1]);body.addColorStop(.7,color[1]);body.addColorStop(1,color[0]);
    rect(-25,-44,50,88,12,body);
    line(-19,-31,-19,32,'#ffffff35');line(19,-31,19,32,'#00000030');
    rect(-19,-21,38,25,6,'#11282e');
    const glass=ctx.createLinearGradient(0,-22,0,5);glass.addColorStop(0,'#7eaaa3');glass.addColorStop(1,'#20383c');
    rect(-16,-19,32,18,4,glass);line(-14,-16,10,-16,'#bce0d750',2);
    rect(-16,6,32,18,5,color[0]);rect(-17,26,34,9,3,'#173136');
    rect(-29,-11,7,10,2,color[1]);rect(22,-11,7,10,2,color[1]);
    if(isPlayer){rect(-7,-42,4,18,0,'#f4f6cf90');rect(3,-42,4,18,0,'#f4f6cf90');rect(-7,36,4,7,0,'#f4f6cf90');rect(3,36,4,7,0,'#f4f6cf90');}
    rect(-21,-38,13,4,2,'#f1f4cf');rect(8,-38,13,4,2,'#f1f4cf');
    ctx.shadowColor='#ff674d';ctx.shadowBlur=reducedMotion?0:9;
    rect(-21,37,12,4,2,'#fd735e');rect(9,37,12,4,2,'#fd735e');ctx.shadowBlur=0;
    rect(-8,40,16,3,1,'#a8af9d');ctx.restore();
  }
  const colors=[['#975b40','#d4916c'],['#435b78','#83a2b7'],['#85867c','#c6c8b9'],['#714c59','#bb8090']];
  function draw(dt) {
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==W*dpr||canvas.height!==H*dpr){canvas.width=W*dpr;canvas.height=H*dpr;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    ctx.save();
    if(shake>.1){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=Math.exp(-12*dt);}
    drawRoad();
    // Parked preview traffic establishes the scene before the first run.
    if(state.phase==='ready'){drawCar(LANES[0],170,colors[0]);drawCar(LANES[2],-5,colors[2]);}
    for(const obstacle of state.obstacles)drawCar(LANES[obstacle.lane],obstacle.y,colors[obstacle.color]);
    drawCar(state.x,state.y,['#6c8a45','#d0e997'],true,reducedMotion?0:Math.max(-.12,Math.min(.12,(LANES[state.lane]-state.x)*.003)));
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);rect(p.x,p.y,3,6,1,'#f4d782');}ctx.globalAlpha=1;
    ctx.restore();
    const vignette=ctx.createLinearGradient(0,0,0,H);vignette.addColorStop(0,'#07121160');vignette.addColorStop(.3,'#07121100');vignette.addColorStop(1,'#07121140');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function loop(time) {
    const dt=lastTime===null?0:Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;
    if(state.phase==='running') {
      accumulator+=dt;
      while(accumulator>=1/120){const oldScore=state.score;update(state,1/120);accumulator-=1/120;if(state.score!==oldScore){saveBest();scores();tone(660,.1);}if(state.phase==='over'){crash();accumulator=0;break;}}
    }
    if(state.phase!=='paused'){for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
    draw(dt);requestAnimationFrame(loop);
  }
  startBtn.addEventListener('click',start);pauseBtn.addEventListener('click',pause);
  $('#leftBtn').addEventListener('click',()=>move(-1));$('#rightBtn').addEventListener('click',()=>move(1));
  $('#soundBtn').addEventListener('click',()=>{sound=!sound;$('#soundBtn').setAttribute('aria-pressed',String(sound));$('#soundBtn').setAttribute('aria-label',sound?'Disable sound':'Enable sound');$('#soundBtn').textContent=sound?'Sound on':'Sound off';tone(450);});
  document.querySelectorAll('.mode').forEach(button=>button.addEventListener('click',()=>{
    saveBest();state=create(button.dataset.mode);particles=[];shake=0;accumulator=0;
    document.querySelectorAll('.mode').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});syncUI();
  }));
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,a'))return;
    if(event.target.closest('button')&&(event.code==='Space'||event.code==='Enter'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyP','Escape'].includes(event.code))event.preventDefault();
    if(event.repeat)return;
    if(event.code==='ArrowLeft'||event.code==='KeyA')move(-1);
    if(event.code==='ArrowRight'||event.code==='KeyD')move(1);
    if(event.code==='Space'){if(state.phase==='running')pause();else start();}
    if(event.code==='KeyP')pause();
    if(event.code==='Escape'&&state.phase==='running')pause();
    if(event.code==='ArrowUp'&&(state.phase==='ready'||state.phase==='over'))start();
  });
  canvas.addEventListener('pointerdown',event=>{if(!event.isPrimary)return;pointerStart={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointerup',event=>{if(!pointerStart)return;const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;pointerStart=null;if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy))move(Math.sign(dx));else if(Math.abs(dx)<20&&Math.abs(dy)<20){const bounds=canvas.getBoundingClientRect();move(event.clientX<bounds.left+bounds.width/2?-1:1);}});
  canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='running')pause();lastTime=null;});
  window.addEventListener('blur',()=>{if(state.phase==='running')pause();});
  syncUI();requestAnimationFrame(loop);
})();
