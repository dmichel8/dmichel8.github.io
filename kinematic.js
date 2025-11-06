(function(){
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const m1Input = document.getElementById('m1');
  const m2Input = document.getElementById('m2');
  const dt_input = document.getElementById('dt_in');
  
  const simspeedEl = document.getElementById('simspeed');
  const liveEl = document.getElementById('live');
  const collEl = document.getElementById('collisionInfo');
  
  const resetBtn = document.getElementById('resetBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  // Pixels per meter (px/m): 50 px correspond to 1 m in the playfield.
  const UNIT_SCALE = 110.0; 

  const SQ_LEN = 64;
  const MAX_DRAG = 220;

  const POWER_SCALE = 4.0;

  let DT_SCALE = 1.0;

  let paused = false;

  const state = {
    squares: [], // {id, pos:{x,y} in px, v:{x,y} in m/s, size px, mass kg, color, label}
    dragging: null, // {id, start:{x,y} in px, cur:{x,y} in px}
    locked: false,
    com: null, // {pos:{x,y} in px, v:{x,y} in m/s, offsets:[{x,y} px, {x,y} px]}
    lastCollision: null
  };

  function rand(min, max){ 
    //Maybe fix this to spawn more spread out
    return Math.random() * (max - min) + min; 
  }

  function resize(){
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const rect = document.getElementById('stageWrap').getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnSquares(){
    const W = canvas.clientWidth
    const H = canvas.clientHeight;

    const cxMin = W * 0.25;
    const cxMax = W * 0.75;
    const cyMin = H * 0.25;
    const cyMax = H * 0.75;

    const a = { id: 0, size: SQ_LEN, mass: parseFloat(m1Input.value) || 1.5, color: '#000', label: 'A', pos: {x:0,y:0}, v:{x:0,y:0} };
    const b = { id: 1, size: SQ_LEN, mass: parseFloat(m2Input.value) || 2.5, color: '#000', label: 'B', pos: {x:0,y:0}, v:{x:0,y:0} };

    function randomCenteredPos(){ 
        return { x: rand(cxMin, cxMax), y: rand(cyMin, cyMax) }; 
    }

    function overlaps(p1, p2, size){ 
        return Math.abs(p1.x - p2.x) < size && Math.abs(p1.y - p2.y) < size; 
    }

    a.pos = randomCenteredPos();
    b.pos = randomCenteredPos();

    while (overlaps(a.pos, b.pos, SQ_LEN)) {
        b.pos = randomCenteredPos();
    }

    state.squares = [a, b];
    state.locked = false;
    state.com = null;
    state.lastCollision = null;
    updateCollisionPanel();
  }

  function draw(){
    const W = canvas.clientWidth
    const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    for (const s of state.squares){
      ctx.fillStyle = s.color;
      ctx.fillRect(s.pos.x - s.size/2, s.pos.y - s.size/2, s.size, s.size);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = "white";
      ctx.strokeRect(s.pos.x - s.size/2, s.pos.y - s.size/2, s.size, s.size);
      ctx.font = 'bold 14px FOSS';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, s.pos.x, s.pos.y);
    }

    if (state.dragging){
      const {id, start, cur} = state.dragging;
      const sq = state.squares.find(s=>s.id===id);
      if (sq){
        const dx = cur.x - start.x;
        const dy = cur.y - start.y;
        const pullPx = Math.hypot(dx, dy);
        const clampedPx = Math.min(pullPx, MAX_DRAG);
        const ang = Math.atan2(dy, dx);
        const dir = {x: Math.cos(ang), y: Math.sin(ang)};

        const from = {x: sq.pos.x, y: sq.pos.y};
        const to = {x: from.x - dir.x * clampedPx, y: from.y - dir.y * clampedPx};

        ctx.save();
        ctx.lineWidth = 2;
        ctx.setLineDash([6,6]);
        ctx.strokeStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        const head = 10;
        const ah = Math.atan2(from.y - to.y, from.x - to.x);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x + Math.cos(ah + Math.PI/7)*head, to.y + Math.sin(ah + Math.PI/7)*head);
        ctx.lineTo(to.x + Math.cos(ah - Math.PI/7)*head, to.y + Math.sin(ah - Math.PI/7)*head);
        ctx.closePath();
        ctx.fillStyle = '#111';
        ctx.fill();
        ctx.restore();

        const vMagMps = (clampedPx * POWER_SCALE) / UNIT_SCALE;
        ctx.fillStyle = '#111';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${vMagMps.toFixed(1)} m/s`, to.x, to.y - 12);
        

        //const speedMps = (clampPx * POWER_SCALE) / UNIT_SCALE;
        //sq.v.x = -Math.cos(ang) * speedMps;
        //sq.v.y = -Math.sin(ang) * speedMps;


        const dx_m = POWER_SCALE*(-dir.x * clampedPx) / UNIT_SCALE;
        const dy_m = POWER_SCALE*(dir.y * clampedPx) / UNIT_SCALE;
        ctx.fillText(`${dx_m.toFixed(2)} m, ${dy_m.toFixed(2)} m`, to.x, to.y + 12);
      }
    }
  }

  function update(dt){
    if (paused) return;

    const W = canvas.clientWidth, H = canvas.clientHeight;

    if (!state.locked){
      for (const s of state.squares){
        s.pos.x += (s.v.x * dt) * UNIT_SCALE;
        s.pos.y += (s.v.y * dt) * UNIT_SCALE;

        const half = s.size/2;
        if (s.pos.x - half < 0) { s.pos.x = half; s.v.x *= -1; }
        if (s.pos.x + half > W) { s.pos.x = W - half; s.v.x *= -1; }
        if (s.pos.y - half < 0) { s.pos.y = half; s.v.y *= -1; }
        if (s.pos.y + half > H) { s.pos.y = H - half; s.v.y *= -1; }
      }
      const a = state.squares[0], b = state.squares[1];
      if (overlapAABB(a, b)) { 
        triggerInelastic(a, b); 
      }
    } else {
      const com = state.com;
      com.pos.x += com.v.x * dt * UNIT_SCALE;
      com.pos.y += com.v.y * dt * UNIT_SCALE;

      const bounds = compositeBounds();
      if (bounds.minX < 0) { com.pos.x += (0 - bounds.minX); com.v.x *= -1; }
      if (bounds.maxX > W) { com.pos.x -= (bounds.maxX - W); com.v.x *= -1; }
      if (bounds.minY < 0) { com.pos.y += (0 - bounds.minY); com.v.y *= -1; }
      if (bounds.maxY > H) { com.pos.y -= (bounds.maxY - H); com.v.y *= -1; }

      const [offA, offB] = com.offsets;
      state.squares[0].pos = { x: com.pos.x + offA.x, y: com.pos.y + offA.y };
      state.squares[1].pos = { x: com.pos.x + offB.x, y: com.pos.y + offB.y };
      state.squares[0].v = { x: com.v.x, y: com.v.y };
      state.squares[1].v = { x: com.v.x, y: com.v.y };
    }

    updateSidebar();
  }

  function overlapAABB(a,b){
    return Math.abs(a.pos.x - b.pos.x) < (a.size/2 + b.size/2) &&
           Math.abs(a.pos.y - b.pos.y) < (a.size/2 + b.size/2);
  }

  function KE(m, v){ return 0.5 * m * (v.x*v.x + v.y*v.y); }

  function triggerInelastic(a, b){
    const keBefore = KE(a.mass, a.v) + KE(b.mass, b.v);
    const mt = a.mass + b.mass;
    const v = {
      x: (a.mass * a.v.x + b.mass * b.v.x) / mt,
      y: (a.mass * a.v.y + b.mass * b.v.y) / mt,
    };
    const keAfter = KE(mt, v);
    const lost = Math.max(0, keBefore - keAfter);

    const comPos = {
      x: (a.mass * a.pos.x + b.mass * b.pos.x) / mt,
      y: (a.mass * a.pos.y + b.mass * b.pos.y) / mt,
    };
    const offA = { x: a.pos.x - comPos.x, y: a.pos.y - comPos.y };
    const offB = { x: b.pos.x - comPos.x, y: b.pos.y - comPos.y };

    state.locked = true;
    state.com = { pos: comPos, v, offsets: [offA, offB], mt };
    state.lastCollision = { t: performance.now(), keBefore, keAfter, lost, v };
    updateCollisionPanel();
  }

  function compositeBounds(){
    const com = state.com;
    const A = state.squares[0], B = state.squares[1];
    const ax = com.pos.x + com.offsets[0].x, ay = com.pos.y + com.offsets[0].y;
    const bx = com.pos.x + com.offsets[1].x, by = com.pos.y + com.offsets[1].y;
    const half = A.size/2;
    const minX = Math.min(ax - half, bx - half);
    const maxX = Math.max(ax + half, bx + half);
    const minY = Math.min(ay - half, by - half);
    const maxY = Math.max(ay + half, by + half);
    return {minX, maxX, minY, maxY};
  }

  function updateSidebar(){
    const [A,B] = state.squares;
    const aSpeed = Math.hypot(A.v.x, A.v.y);
    const bSpeed = Math.hypot(B.v.x, B.v.y);

    const accel = {x: 0, y: 0, mag: 0};

    simspeedEl.innerHTML = `
    <div class="kv">Simulation Speed: ${DT_SCALE}x</div>
    `;

    liveEl.innerHTML = `
      <div class="row">
        <div>
          <div class="pill">Square A</div>
          <div class="kv">m = <strong>${A.mass.toFixed(2)}</strong> kg</div>
          <div class="kv">v = (${A.v.x.toFixed(2)}, ${-1.00*A.v.y.toFixed(2)}) m/s · |v| = <strong>${aSpeed.toFixed(2)}</strong></div>
          <div class="kv">KE = <strong>${KE(A.mass, A.v).toFixed(2)}</strong> J</div>
        </div>
        <div>
          <div class="pill">Square B</div>
          <div class="kv">m = <strong>${B.mass.toFixed(2)}</strong> kg</div>
          <div class="kv">v = (${B.v.x.toFixed(2)}, ${-1.00*B.v.y.toFixed(2)}) m/s · |v| = <strong>${bSpeed.toFixed(2)}</strong></div>
          <div class="kv">KE = <strong>${KE(B.mass, B.v).toFixed(2)}</strong> J</div>
        </div>
      </div>
    `;
  }

  function updateCollisionPanel(){
    if (!state.lastCollision){
      collEl.textContent = 'No collision yet.';
      return;
    }
    const {keBefore, keAfter, lost, v} = state.lastCollision;
    
    collEl.innerHTML = `
      <div class="kv">KE before = <strong>${keBefore.toFixed(2)}</strong> J</div>
      <div class="kv">KE after  = <strong>${keAfter.toFixed(2)}</strong> J</div>
      <div class="kv">Energy lost to heat = <strong>${lost.toFixed(2)}</strong> J</div>
      <div class="kv">Velocity after collision = (${v.x.toFixed(2)}, ${-1.0*v.y.toFixed(2)})</div>
    `;
  }

  function screenPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
  }

  function pickSquare(pt){
    for (const s of state.squares){
      if (Math.abs(pt.x - s.pos.x) <= s.size/2 && Math.abs(pt.y - s.pos.y) <= s.size/2) return s.id;
    }
    return null;
  }

  canvas.addEventListener('mousedown', (e)=>{
    if (state.locked) return;
    const pt = screenPos(e);
    const id = pickSquare(pt);
    if (id != null){
      state.dragging = { id, start: {x: pt.x, y: pt.y}, cur: {x: pt.x, y: pt.y} };
    }
  });

  window.addEventListener('mousemove', (e)=>{
    if (!state.dragging) return;
    const pt = screenPos(e);
    state.dragging.cur = pt;
  });

  window.addEventListener('mouseup', ()=>{
    if (!state.dragging) return;
    const {id, start, cur} = state.dragging;
    const sq = state.squares.find(s=>s.id===id);
    if (sq){
      const dx = cur.x - start.x; // px
      const dy = cur.y - start.y; // px
      const pullPx = Math.hypot(dx, dy); // px
      const clampPx = Math.min(pullPx, MAX_DRAG);
      if (clampPx > 2){
        const ang = Math.atan2(dy, dx);
        const speedMps = (clampPx * POWER_SCALE) / UNIT_SCALE;
        sq.v.x = -Math.cos(ang) * speedMps;
        sq.v.y = -Math.sin(ang) * speedMps;
      }
    }
    state.dragging = null;
  });

  m1Input.addEventListener('input', ()=>{
    const v = Math.max(0.1, parseFloat(m1Input.value)||1);
    state.squares[0].mass = v;
    updateSidebar();
  });
  m2Input.addEventListener('input', ()=>{
    const v = Math.max(0.1, parseFloat(m2Input.value)||1);
    state.squares[1].mass = v;
    updateSidebar();
  });
  dt_input.addEventListener('input', ()=>{
    const v = parseFloat(dt_input.value)||1;
    DT_SCALE = v;
    updateSidebar();
  });

  resetBtn.addEventListener('click', ()=>{ spawnSquares(); });

  pauseBtn.addEventListener('click', ()=>{
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  });

  let last = performance.now();
  function tick(now){
    //const dt = DT_SCALE*Math.min(0.033, (now - last)/1000);
    const dt = DT_SCALE*(1/100)
    console.log(DT_SCALE);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);

  // Init
  resize();
  spawnSquares();
  updateSidebar();
  requestAnimationFrame(tick);
})();
