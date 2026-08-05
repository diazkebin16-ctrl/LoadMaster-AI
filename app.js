(() => {
  const SCALE = 1.05;
  const presets = {
    "96x300":[96,300],"96x330":[96,330],"95x574":[95,574],"96x574":[96,574],
    "95x628":[95,628],"96x628":[96,628],"98x628":[98,628]
  };

  const $ = id => document.getElementById(id);
  const trailerEl = $("trailer");
  const state = {
    trailer:{width:96,length:628},
    stacks:[],
    library:[],
    selectedId:null,
    history:[],
    future:[]
  };

  const savedLibrary = localStorage.getItem("loadmaster-library");
  if (savedLibrary) {
    try { state.library = JSON.parse(savedLibrary); } catch {}
  }

  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); installPrompt = e; $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; $("installBtn").hidden = true;
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

  function toast(msg){
    $("toast").textContent=msg; $("toast").classList.add("show");
    setTimeout(()=>$("toast").classList.remove("show"),1800);
  }
  function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
  function snapShot(){ return JSON.stringify({trailer:state.trailer,stacks:state.stacks,library:state.library}); }
  function remember(){
    state.history.push(snapShot());
    if(state.history.length>80) state.history.shift();
    state.future=[];
  }
  function restore(raw){
    const d=JSON.parse(raw);
    state.trailer=d.trailer; state.stacks=d.stacks; state.library=d.library||state.library;
    state.selectedId=null; syncInputs(); saveLibrary(); render();
  }
  function saveLibrary(){
    localStorage.setItem("loadmaster-library",JSON.stringify(state.library));
    renderLibrary();
  }
  function syncInputs(){
    $("trailerWidth").value=state.trailer.width;
    $("trailerLength").value=state.trailer.length;
  }

  function overlaps(a,b){
    return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.l<=b.y || b.y+b.l<=a.y);
  }
  function valid(s,ignore=s.id){
    if(s.x<0||s.y<0||s.x+s.w>state.trailer.width||s.y+s.l>state.trailer.length) return false;
    return !state.stacks.some(o=>o.id!==ignore&&overlaps(s,o));
  }
  function usedLength(){
    const insideEnds=state.stacks
      .filter(s=>s.y < state.trailer.length && s.x < state.trailer.width && s.x+s.w > 0 && s.y+s.l > 0)
      .map(s=>Math.min(state.trailer.length,Math.max(0,s.y+s.l)));
    return insideEnds.length ? Math.max(...insideEnds) : 0;
  }
  function selected(){ return state.stacks.find(s=>s.id===state.selectedId); }

  function updateFloatingTools(){
    const tools=$("floatingTools");
    const s=selected();
    if(!tools||!s){
      if(tools) tools.hidden=true;
      return;
    }
    tools.hidden=false;

    const name=$("bottomSelectedName");
    if(name) name.textContent=`${s.name} · ${s.qty} alto · ${s.type}`;

    const rotate=$("floatRotateBtn");
    const lock=$("floatLockBtn");
    if(rotate){
      const can=s.type==="4-way"&&s.canRotate&&s.w!==s.l;
      rotate.disabled=!can;
      rotate.title=can?"Girar pila":"Esta pila no se puede girar";
    }
    if(lock){
      lock.textContent=s.locked?"🔓 Desbloq.":"🔒 Bloq.";
      lock.title=s.locked?"Desbloquear":"Bloquear";
    }
  }

  function splitQty(total,max){
    const result=[];
    while(total>0){ const n=Math.min(max,total); result.push(n); total-=n; }
    return result;
  }

  function renderLibrary(){
    const sel=$("librarySelect");
    const current=sel.value;
    sel.innerHTML='<option value="">— Nueva medida —</option>';
    state.library.forEach(item=>{
      const o=document.createElement("option");
      o.value=item.id; o.textContent=`${item.name} · ${item.type} · máx ${item.maxHeight}`;
      sel.appendChild(o);
    });
    if([...sel.options].some(o=>o.value===current)) sel.value=current;
  }

  function updateSelected(){
    const s=selected();
    $("selectedInfo").textContent=s
      ? `${s.name} · ${s.qty} alto · ${s.type} · ${s.category}${s.locked?" · bloqueada":""}`
      : "Ninguna seleccionada";
  }

  function updateMetrics(){
    const used=usedLength();
    const free=Math.max(0,state.trailer.length-used);
    $("metricStacks").textContent=state.stacks.length;
    $("metricPallets").textContent=state.stacks.reduce((a,s)=>a+s.qty,0);
    $("metricUsed").textContent=`${Math.round(used)}"`;
    $("metricFree").textContent=`${Math.round(free)}"`;
    const floorArea=state.stacks.reduce((sum,s)=>sum+s.w*s.l,0);
    const trailerArea=Math.max(1,state.trailer.width*state.trailer.length);
    const usedEnvelope=Math.max(1,state.trailer.width*used);
    const util=Math.min(100,(floorArea/trailerArea)*100);
    const efficiency=used?Math.min(100,(floorArea/usedEnvelope)*100):0;
    const utilEl=$("metricUtilization"), effEl=$("metricEfficiency");
    if(utilEl) utilEl.textContent=`${util.toFixed(1)}%`;
    if(effEl) effEl.textContent=`${efficiency.toFixed(1)}%`;
    const bad=state.stacks.some(s=>!valid(s));
    $("metricStatus").textContent=bad?"Hay conflicto":"Carga válida";
    $("metricStatus").style.color=bad?"#dc2626":"#16a34a";
    $("freeZone").style.top=`${used*SCALE}px`;
    $("freeZone").style.height=`${free*SCALE}px`;
  }

  function render(){
    trailerEl.style.width=`${state.trailer.width*SCALE}px`;
    trailerEl.style.height=`${state.trailer.length*SCALE}px`;
    [...trailerEl.querySelectorAll(".stack")].forEach(n=>n.remove());
    state.stacks.forEach(s=>{
      const el=document.createElement("div");
      el.className="stack";
      el.dataset.id=s.id;
      if(s.id===state.selectedId) el.classList.add("selected");
      if(s.locked) el.classList.add("locked");
      if(!valid(s)) el.classList.add("invalid");
      el.style.left=`${s.x*SCALE}px`; el.style.top=`${s.y*SCALE}px`;
      el.style.width=`${s.w*SCALE}px`; el.style.height=`${s.l*SCALE}px`;
      el.innerHTML=`${s.name}<small>${s.qty} alto · ${s.type}</small>`;
      trailerEl.appendChild(el);
      wireDrag(el,s);
    });
    updateSelected(); updateMetrics(); renderLibrary(); updateFloatingTools();
  }

  function edgePoints(s){
    const xs=[0,state.trailer.width-s.w],ys=[0,state.trailer.length-s.l];
    state.stacks.forEach(o=>{
      if(o.id===s.id) return;
      xs.push(o.x,o.x+o.w,o.x-s.w,o.x+o.w-s.w);
      ys.push(o.y,o.y+o.l,o.y-s.l,o.y+o.l-s.l);
    });
    return {xs,ys};
  }
  function nearest(v,arr,d=4){
    let best=v,dist=d+1;
    arr.forEach(n=>{const dd=Math.abs(v-n);if(dd<dist){dist=dd;best=n;}});
    return best;
  }
  function snapStack(s){
    const p=edgePoints(s); s.x=nearest(s.x,p.xs); s.y=nearest(s.y,p.ys);
  }

  function selectStack(id){
    state.selectedId=id;
    trailerEl.querySelectorAll(".stack").forEach(node=>{
      node.classList.toggle("selected",node.dataset.id===id);
    });
    updateSelected();
  }

  function wireDrag(el,s){
    el.dataset.id=s.id;
    let dragging=false;
    let moved=false;
    let startX=0,startY=0;
    let original=null;
    let historyBefore=null;
    let activePointer=null;

    el.addEventListener("pointerdown",e=>{
      e.preventDefault();
      e.stopPropagation();
      selectStack(s.id);
      if(s.locked){toast("Esta pila está bloqueada");return;}

      dragging=true;
      moved=false;
      activePointer=e.pointerId;
      original={x:s.x,y:s.y};
      historyBefore=snapShot();
      startX=e.clientX;
      startY=e.clientY;
      el.classList.add("dragging");
      try{el.setPointerCapture(e.pointerId);}catch{}
    });

    el.addEventListener("pointermove",e=>{
      if(!dragging||e.pointerId!==activePointer)return;
      e.preventDefault();
      const dx=(e.clientX-startX)/SCALE;
      const dy=(e.clientY-startY)/SCALE;
      if(Math.abs(dx)>1||Math.abs(dy)>1)moved=true;
      s.x=Math.round(original.x+dx);
      s.y=Math.round(original.y+dy);
      el.style.left=`${s.x*SCALE}px`;
      el.style.top=`${s.y*SCALE}px`;
      el.classList.toggle("invalid",!valid(s));
      updateMetrics();
    });

    function finishDrag(cancelled=false){
      if(!dragging)return;
      dragging=false;
      el.classList.remove("dragging");

      if(cancelled){
        s.x=original.x;s.y=original.y;
      }else if(moved){
        // En modo editor libre la pila puede quedar fuera del tráiler
        // o temporalmente encima de otra. El color rojo indica conflicto.
        snapStack(s);
        state.history.push(historyBefore);
        if(state.history.length>80)state.history.shift();
        state.future=[];
        if(!valid(s)) toast("Pila fuera o en conflicto; puedes seguir acomodándola");
      }
      activePointer=null;
      render();
    }

    el.addEventListener("pointerup",e=>{
      if(e.pointerId===activePointer)finishDrag(false);
    });
    el.addEventListener("pointercancel",()=>finishDrag(true));
    el.addEventListener("lostpointercapture",()=>{
      if(dragging)finishDrag(false);
    });
  }

  function candidatePositions(w,l,ignore=null){
    const xs=new Set([0]),ys=new Set([0]);
    state.stacks.forEach(s=>{
      if(s.id===ignore) return;
      xs.add(s.x); xs.add(s.x+s.w); ys.add(s.y); ys.add(s.y+s.l);
    });
    const out=[];
    [...ys].sort((a,b)=>a-b).forEach(y=>{
      [...xs].sort((a,b)=>a-b).forEach(x=>{
        const t={id:ignore||"new",x,y,w,l};
        if(valid(t,ignore||"new")) out.push(t);
      });
    });
    return out.sort((a,b)=>(a.y+a.l)-(b.y+b.l)||a.y-b.y||a.x-b.x);
  }

  function addLibraryEntry(){
    const entry={
      id:uid(),name:$("palletName").value.trim()||`${$("palletWidth").value}×${$("palletLength").value}`,
      width:+$("palletWidth").value,length:+$("palletLength").value,
      maxHeight:+$("maxHeight").value,type:$("palletType").value,
      category:$("category").value,canRotate:$("canRotate").checked
    };
    const same=state.library.findIndex(x=>x.name===entry.name&&x.category===entry.category);
    if(same>=0) state.library[same]={...state.library[same],...entry,id:state.library[same].id};
    else state.library.push(entry);
    saveLibrary(); toast("Medida guardada en la biblioteca");
  }





  let backgroundPointerStart=null;
  trailerEl.addEventListener("pointerdown",e=>{
    if(e.target===trailerEl || e.target.classList.contains("freeZone")){
      backgroundPointerStart={x:e.clientX,y:e.clientY};
    }else{
      backgroundPointerStart=null;
    }
  },{passive:true});
  trailerEl.addEventListener("pointerup",e=>{
    if(!backgroundPointerStart) return;
    const moved=Math.hypot(
      e.clientX-backgroundPointerStart.x,
      e.clientY-backgroundPointerStart.y
    );
    backgroundPointerStart=null;
    if(moved<6){
      state.selectedId=null;
      render();
    }
  },{passive:true});

  $("floatRotateBtn").addEventListener("click",()=>{
    $("rotateBtn").click();
  });
  $("floatLockBtn").addEventListener("click",()=>{
    $("lockBtn").click();
  });
  $("floatDeleteBtn").addEventListener("click",()=>{
    $("deleteBtn").click();
  });

  $("trailerPreset").addEventListener("change",()=>{
    const v=$("trailerPreset").value;
    if(v!=="custom"){[$("trailerWidth").value,$("trailerLength").value]=presets[v];}
  });
  $("applyTrailer").addEventListener("click",()=>{
    remember(); state.trailer={width:+$("trailerWidth").value,length:+$("trailerLength").value}; render();
  });
  $("librarySelect").addEventListener("change",()=>{
    const item=state.library.find(x=>x.id===$("librarySelect").value); if(!item) return;
    $("palletWidth").value=item.width;$("palletLength").value=item.length;
    $("maxHeight").value=item.maxHeight;$("palletType").value=item.type;
    $("category").value=item.category;$("canRotate").checked=item.canRotate;
    $("palletName").value=item.name;
  });
  $("saveLibrary").addEventListener("click",addLibraryEntry);

  $("addPallet").addEventListener("click",()=>{
    const total=+$("palletQty").value,max=+$("maxHeight").value;
    if(total<1||max<1) return;
    remember();
    const groups=splitQty(total,max);
    groups.forEach(q=>{
      const w=+$("palletWidth").value,l=+$("palletLength").value;
      const fit=candidatePositions(w,l)[0];
      state.stacks.push({
        id:uid(),name:$("palletName").value.trim()||`${w}×${l}`,
        w,l,qty:q,type:$("palletType").value,category:$("category").value,
        canRotate:$("canRotate").checked,locked:false,
        x:fit?fit.x:0,y:fit?fit.y:usedLength()
      });
    });
    render(); toast(`${groups.length} pila(s) creada(s)`);
  });

  $("rotateBtn").addEventListener("click",()=>{
    const s=selected(); if(!s) return toast("Selecciona una pila");
    if(s.type==="2-way"||!s.canRotate) return toast("Esta pila es 2-way o tiene el giro desactivado");
    if(s.w===s.l) return toast("Esta pila es cuadrada; girarla no cambia sus medidas");
    const before=snapShot();
    [s.w,s.l]=[s.l,s.w];
    state.history.push(before);
    if(state.history.length>80) state.history.shift();
    state.future=[];
    render();
    if(!valid(s)) toast("Pila girada; quedó fuera o en conflicto");
    else toast("Pila girada");
  });
  $("lockBtn").addEventListener("click",()=>{
    const s=selected();if(!s)return toast("Selecciona una pila");
    remember();s.locked=!s.locked;render();
  });
  $("duplicateBtn").addEventListener("click",()=>{
    const s=selected();if(!s)return toast("Selecciona una pila");
    const fit=candidatePositions(s.w,s.l)[0];
    if(!fit)return toast("No hay espacio válido para duplicarla");
    remember();
    const copy={...s,id:uid(),locked:false,x:fit.x,y:fit.y};
    state.stacks.push(copy);state.selectedId=copy.id;render();
  });
  $("deleteBtn").addEventListener("click",()=>{
    if(!state.selectedId)return;remember();
    state.stacks=state.stacks.filter(s=>s.id!==state.selectedId);state.selectedId=null;render();
  });

  function nudgeSelected(dx,dy){
    const s=selected();if(!s)return toast("Selecciona una pila");
    if(s.locked)return toast("Desbloquea la pila para moverla");
    const before=snapShot();
    s.x+=dx;s.y+=dy;
    state.history.push(before);
    if(state.history.length>80) state.history.shift();
    state.future=[];
    render();
    if(!valid(s)) toast("Pila fuera o en conflicto");
  }
  function moveStep(){return +$("moveStep").value||1;}
  $("moveUpBtn").addEventListener("click",()=>nudgeSelected(0,-moveStep()));
  $("moveDownBtn").addEventListener("click",()=>nudgeSelected(0,moveStep()));
  $("moveLeftBtn").addEventListener("click",()=>nudgeSelected(-moveStep(),0));
  $("moveRightBtn").addEventListener("click",()=>nudgeSelected(moveStep(),0));

  $("undoBtn").addEventListener("click",()=>{
    if(!state.history.length)return;state.future.push(snapShot());restore(state.history.pop());
  });
  $("redoBtn").addEventListener("click",()=>{
    if(!state.future.length)return;state.history.push(snapShot());restore(state.future.pop());
  });

  // FASE 2 — Motor inteligente de optimización.
  // Genera varias soluciones completas, respeta bloqueos y rotación, y compara
  // largo usado, huecos internos y movimiento total respecto al plano actual.
  let optimizerSolutions=[];

  function cloneStack(s){ return {...s}; }
  function layoutUsed(items){ return items.length?Math.max(...items.map(p=>p.y+p.l)):0; }
  function layoutArea(items){ return items.reduce((sum,p)=>sum+p.w*p.l,0); }
  function layoutValid(items){
    for(let i=0;i<items.length;i++){
      const a=items[i];
      if(a.x<0||a.y<0||a.x+a.w>state.trailer.width||a.y+a.l>state.trailer.length)return false;
      for(let j=i+1;j<items.length;j++) if(localOverlaps(a,items[j])) return false;
    }
    return true;
  }
  function solutionStats(items){
    const used=layoutUsed(items);
    const area=layoutArea(items);
    const free=Math.max(0,state.trailer.length-used);
    const utilization=100*area/Math.max(1,state.trailer.width*state.trailer.length);
    const efficiency=used?100*area/(state.trailer.width*used):0;
    return {used,free,utilization,efficiency};
  }
  function placementKey(items){
    return [...items].sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .map(p=>`${p.id}:${p.x},${p.y},${p.w},${p.l}`).join('|');
  }
  function candidateCorners(w,l,placed){
    const xs=new Set([0,state.trailer.width-w]);
    const ys=new Set([0]);
    placed.forEach(p=>{
      xs.add(p.x); xs.add(p.x+p.w); xs.add(p.x-w); xs.add(p.x+p.w-w);
      ys.add(p.y); ys.add(p.y+p.l); ys.add(p.y-l); ys.add(p.y+p.l-l);
    });
    const out=[];
    for(const y0 of ys){
      for(const x0 of xs){
        const x=Math.round(x0*100)/100, y=Math.round(y0*100)/100;
        const piece={x,y,w,l};
        if(fitsPlacement(piece,placed)) out.push(piece);
      }
    }
    out.sort((a,b)=>(a.y+a.l)-(b.y+b.l)||a.y-b.y||a.x-b.x);
    return out.slice(0,36);
  }
  function smartScore(placed, originalById){
    const used=layoutUsed(placed);
    const area=layoutArea(placed);
    const empty=Math.max(0,state.trailer.width*used-area);
    let movement=0, side=0;
    placed.forEach(p=>{
      side+=p.x;
      const o=originalById.get(p.id);
      if(o) movement+=Math.abs(p.x-o.x)+Math.abs(p.y-o.y)+(p.w!==o.w?4:0);
    });
    return used*1e8 + empty*1e3 + movement*5 + side;
  }
  function seededShuffle(items,seed){
    const a=[...items]; let x=seed>>>0;
    for(let i=a.length-1;i>0;i--){
      x=(1664525*x+1013904223)>>>0;
      const j=x%(i+1); [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }
  function intelligentOrders(items){
    const candidates=[
      [...items].sort((a,b)=>(b.w*b.l)-(a.w*a.l)),
      [...items].sort((a,b)=>b.l-a.l||b.w-a.w),
      [...items].sort((a,b)=>b.w-a.w||b.l-a.l),
      [...items].sort((a,b)=>Math.max(b.w,b.l)-Math.max(a.w,a.l)),
      [...items].sort((a,b)=>a.y-b.y||a.x-b.x)
    ];
    for(let seed=1;seed<=18;seed++) candidates.push(seededShuffle(items,seed*7919));
    const seen=new Set();
    return candidates.filter(order=>{const k=order.map(x=>x.id).join('|');if(seen.has(k))return false;seen.add(k);return true;});
  }
  function beamPack(order,locked,deadline,originalById){
    let beam=[{placed:locked.map(cloneStack),moves:[],score:0}];
    const width=order.length<=12?180:order.length<=24?110:65;
    for(const source of order){
      if(performance.now()>deadline) return null;
      const next=[];
      const orientations=[{w:source.w,l:source.l}];
      if(source.type==='4-way'&&source.canRotate&&source.w!==source.l) orientations.push({w:source.l,l:source.w});
      for(const node of beam){
        for(const o of orientations){
          for(const pos of candidateCorners(o.w,o.l,node.placed)){
            const piece={...source,x:pos.x,y:pos.y,w:o.w,l:o.l};
            const placed=[...node.placed,piece];
            next.push({placed,moves:[...node.moves,piece],score:smartScore(placed,originalById)});
          }
        }
      }
      if(!next.length)return null;
      next.sort((a,b)=>a.score-b.score);
      const unique=[], keys=new Set();
      for(const n of next){
        const k=n.moves.map(p=>`${p.x},${p.y},${p.w},${p.l}`).join(';');
        if(keys.has(k))continue; keys.add(k); unique.push(n);
        if(unique.length>=width)break;
      }
      beam=unique;
    }
    beam.sort((a,b)=>a.score-b.score);
    return beam[0]||null;
  }
  function feasibilityCheck(){
    const badSize=state.stacks.find(s=>{
      const normal=s.w<=state.trailer.width&&s.l<=state.trailer.length;
      const rotated=s.type==='4-way'&&s.canRotate&&s.l<=state.trailer.width&&s.w<=state.trailer.length;
      return !normal&&!rotated;
    });
    if(badSize)return `La pila ${badSize.name} no cabe por sus dimensiones.`;
    const totalArea=layoutArea(state.stacks);
    if(totalArea>state.trailer.width*state.trailer.length)return 'La carga supera el área total disponible del tráiler.';
    const locked=state.stacks.filter(s=>s.locked);
    if(!layoutValid(locked))return 'Las pilas bloqueadas están fuera del tráiler o se superponen.';
    return null;
  }
  async function runIntelligentOptimizer(){
    const problem=feasibilityCheck();
    if(problem){toast(problem);return;}
    const panel=$("optimizerPanel"), results=$("optimizerResults"), summary=$("optimizerSummary");
    panel.hidden=false; results.innerHTML=''; summary.textContent='Analizando órdenes, rotaciones y espacios disponibles…';
    document.body.classList.add('optimizing');
    await new Promise(r=>setTimeout(r,40));
    const locked=state.stacks.filter(s=>s.locked).map(cloneStack);
    const moving=state.stacks.filter(s=>!s.locked).map(cloneStack);
    const originalById=new Map(state.stacks.map(s=>[s.id,s]));
    const deadline=performance.now()+Math.min(8000,2200+moving.length*180);
    const found=[], keys=new Set();
    for(const order of intelligentOrders(moving)){
      if(performance.now()>deadline)break;
      const node=beamPack(order,locked,deadline,originalById);
      if(!node)continue;
      const all=node.placed;
      if(all.length!==state.stacks.length||!layoutValid(all))continue;
      const key=placementKey(all);if(keys.has(key))continue;keys.add(key);
      found.push({items:all,score:smartScore(all,originalById),stats:solutionStats(all)});
      found.sort((a,b)=>a.score-b.score);
      if(found.length>8)found.length=8;
    }
    document.body.classList.remove('optimizing');
    if(!found.length){summary.textContent='No se encontró un acomodo completo válido.';toast('La carga no pudo acomodarse automáticamente');return;}
    optimizerSolutions=found.slice(0,3);
    const current=solutionStats(state.stacks);
    const best=optimizerSolutions[0].stats;
    summary.textContent=`${optimizerSolutions.length} solución(es) · mejor resultado: ${Math.round(best.used)}" usados, ${Math.round(best.free)}" libres.`;
    results.innerHTML='';
    optimizerSolutions.forEach((sol,i)=>{
      const card=document.createElement('article');card.className='solutionCard'+(i===0?' best':'');
      const saved=Math.max(0,current.used-sol.stats.used);
      card.innerHTML=`<h3>${i===0?'⭐ Mejor solución':`Alternativa ${i+1}`}</h3><div class="solutionStats">
        <span>Largo usado<strong>${Math.round(sol.stats.used)}"</strong></span>
        <span>Libre al final<strong>${Math.round(sol.stats.free)}"</strong></span>
        <span>Eficiencia<strong>${sol.stats.efficiency.toFixed(1)}%</strong></span>
        <span>Reducción<strong>${Math.round(saved)}"</strong></span>
      </div><button class="${i===0?'primary':''}" data-solution="${i}">Aplicar esta solución</button>`;
      results.appendChild(card);
    });
    toast('Optimización inteligente terminada');
  }
  function applyOptimizerSolution(index){
    const sol=optimizerSolutions[index];if(!sol)return;
    remember();
    const map=new Map(sol.items.map(p=>[p.id,p]));
    state.stacks.forEach(s=>Object.assign(s,map.get(s.id)||{}));
    render();$("optimizerPanel").hidden=true;toast('Solución aplicada');
  }
  $("optimizerResults").addEventListener('click',e=>{
    const b=e.target.closest('[data-solution]');if(b)applyOptimizerSolution(+b.dataset.solution);
  });
  $("closeOptimizer").addEventListener('click',()=>$("optimizerPanel").hidden=true);
  $("optimizeBtn").addEventListener("click",runIntelligentOptimizer);

  // Motor de compactación avanzada: reconstruye únicamente las pilas desbloqueadas
  // usando búsqueda por esquinas, varias órdenes de colocación y un beam search limitado.
  function localOverlaps(a,b){
    return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.l<=b.y || b.y+b.l<=a.y);
  }

  function fitsPlacement(piece, placed){
    if(piece.x<0 || piece.y<0 || piece.x+piece.w>state.trailer.width || piece.y+piece.l>state.trailer.length) return false;
    return !placed.some(other=>localOverlaps(piece,other));
  }

  function packingCandidates(w,l,placed){
    const xs=new Set([0]);
    const ys=new Set([0]);
    placed.forEach(p=>{
      xs.add(p.x); xs.add(p.x+p.w);
      ys.add(p.y); ys.add(p.y+p.l);
    });
    const out=[];
    [...ys].sort((a,b)=>a-b).forEach(y=>{
      [...xs].sort((a,b)=>a-b).forEach(x=>{
        const p={x,y,w,l};
        if(fitsPlacement(p,placed)) out.push(p);
      });
    });
    return out.sort((a,b)=>(a.y+a.l)-(b.y+b.l) || a.y-b.y || a.x-b.x).slice(0,24);
  }

  function packingScore(placed){
    const used=placed.length ? Math.max(...placed.map(p=>p.y+p.l)) : 0;
    // Penaliza huecos internos y posiciones laterales sin sacrificar el largo usado.
    const footprint=placed.reduce((sum,p)=>sum+p.w*p.l,0);
    const envelope=Math.max(1,state.trailer.width*used);
    const empty=envelope-footprint;
    const side=placed.reduce((sum,p)=>sum+p.x,0);
    return used*100000 + empty*10 + side;
  }

  function orderVariants(items){
    const variants=[];
    const add=arr=>{
      const key=arr.map(x=>x.id).join('|');
      if(!variants.some(v=>v.key===key)) variants.push({key,items:arr});
    };
    add([...items].sort((a,b)=>(b.w*b.l)-(a.w*a.l)));
    add([...items].sort((a,b)=>Math.max(b.w,b.l)-Math.max(a.w,a.l) || (b.w*b.l)-(a.w*a.l)));
    add([...items].sort((a,b)=>b.l-a.l || b.w-a.w));
    add([...items].sort((a,b)=>b.w-a.w || b.l-a.l));
    add([...items].sort((a,b)=>a.y-b.y || a.x-b.x));
    // Variaciones deterministas para escapar de bloqueos locales sin resultados aleatorios.
    for(let seed=1;seed<=5;seed++){
      const arr=[...items];
      for(let i=arr.length-1;i>0;i--){
        const j=(seed*1103515245 + i*12345)%(i+1);
        [arr[i],arr[j]]=[arr[j],arr[i]];
      }
      add(arr);
    }
    return variants.map(v=>v.items);
  }

  function packInOrder(items,locked){
    let beam=[{placed:locked.map(p=>({...p})),moves:[]}];
    const BEAM_WIDTH=90;
    for(const source of items){
      const next=[];
      const orientations=[{w:source.w,l:source.l,rotated:false}];
      if(source.type==='4-way' && source.canRotate && source.w!==source.l){
        orientations.push({w:source.l,l:source.w,rotated:true});
      }
      beam.forEach(node=>{
        orientations.forEach(o=>{
          packingCandidates(o.w,o.l,node.placed).forEach(pos=>{
            const placedPiece={...source,x:pos.x,y:pos.y,w:o.w,l:o.l};
            const placed=[...node.placed,placedPiece];
            next.push({placed,moves:[...node.moves,placedPiece],score:packingScore(placed)});
          });
        });
      });
      if(!next.length) return null;
      next.sort((a,b)=>a.score-b.score);
      beam=next.slice(0,BEAM_WIDTH);
    }
    return beam.sort((a,b)=>a.score-b.score)[0]||null;
  }

  function advancedCompact(){
    const locked=state.stacks.filter(s=>s.locked);
    const moving=state.stacks.filter(s=>!s.locked);
    if(!moving.length) return {ok:true,moved:0,used:usedLength()};

    let best=null;
    orderVariants(moving).forEach(order=>{
      const result=packInOrder(order,locked);
      if(result && (!best || result.score<best.score)) best=result;
    });
    if(!best) return {ok:false,moved:0,used:usedLength()};

    const before=new Map(moving.map(s=>[s.id,{x:s.x,y:s.y,w:s.w,l:s.l}]));
    const byId=new Map(best.moves.map(s=>[s.id,s]));
    moving.forEach(s=>{
      const p=byId.get(s.id);
      s.x=p.x; s.y=p.y; s.w=p.w; s.l=p.l;
    });
    const moved=moving.filter(s=>{
      const b=before.get(s.id);
      return b.x!==s.x || b.y!==s.y || b.w!==s.w || b.l!==s.l;
    }).length;
    return {ok:true,moved,used:usedLength()};
  }

  $("compactBtn").addEventListener("click",()=>{
    const before=snapShot();
    const previousUsed=usedLength();
    const result=advancedCompact();
    if(!result.ok){
      toast("No se encontró un acomodo válido; no se cambió la carga");
      return;
    }
    if(result.moved){
      state.history.push(before);
      if(state.history.length>80) state.history.shift();
      state.future=[];
    }
    render();
    const saved=Math.max(0,Math.round(previousUsed-result.used));
    toast(result.moved ? `Compactación real: ${result.moved} pila(s) movidas${saved?` · ${saved}\" menos`:''}` : "La carga ya estaba compactada");
  });
  $("clearBtn").addEventListener("click",()=>{
    if(!confirm("¿Vaciar toda la carga?"))return;remember();state.stacks=[];state.selectedId=null;render();
  });

  $("demoBtn").addEventListener("click",()=>{
    remember();
    state.trailer={width:98,length:628};syncInputs();
    state.stacks=[
      {id:uid(),name:"145×26",w:26,l:145,qty:14,type:"2-way",category:"Combo",canRotate:false,locked:false,x:0,y:0},
      {id:uid(),name:"145×26",w:26,l:145,qty:13,type:"2-way",category:"Combo",canRotate:false,locked:false,x:26,y:0},
      {id:uid(),name:"145×26",w:26,l:145,qty:13,type:"2-way",category:"Combo",canRotate:false,locked:false,x:52,y:0},
      {id:uid(),name:"52×52",w:52,l:52,qty:13,type:"4-way",category:"New",canRotate:true,locked:false,x:0,y:337},
      {id:uid(),name:"48×40",w:40,l:48,qty:1,type:"4-way",category:"New",canRotate:true,locked:false,x:52,y:491},
      {id:uid(),name:"27×27",w:27,l:27,qty:13,type:"4-way",category:"New",canRotate:true,locked:false,x:0,y:599}
    ];
    render();
  });

  $("saveLoadBtn").addEventListener("click",()=>{
    const blob=new Blob([snapShot()],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="loadmaster-carga.json";a.click();URL.revokeObjectURL(a.href);
  });
  $("openLoadBtn").addEventListener("click",()=>$("fileInput").click());
  $("fileInput").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    remember();restore(await file.text());e.target.value="";
  });

  $("printBtn").addEventListener("click",()=>{
    const w=window.open("","_blank");
    const clone=trailerEl.cloneNode(true);
    clone.style.margin="20px auto";
    w.document.write(`<html><head><title>Plano LoadMaster AI</title><style>
      body{font-family:Arial;text-align:center}.trailer{position:relative;background:#fff;border:4px solid #111827}
      .stack{position:absolute;border:2px solid #16a34a;background:#dbeafe;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;font-weight:bold;overflow:hidden}
      .freeZone{position:absolute;left:0;right:0;bottom:0;background:#dcfce7}.noseTag,.doorTag{position:absolute;left:50%;transform:translateX(-50%);font-weight:bold}
      .noseTag{top:2px}.doorTag{bottom:2px}</style></head><body>
      <h1>LoadMaster AI v2.0 — Plano de carga</h1>
      <p>Tráiler ${state.trailer.width}" × ${state.trailer.length}" · ${state.stacks.length} pilas · ${Math.max(0,state.trailer.length-usedLength())}" libres al final</p>
      </body></html>`);
    w.document.body.appendChild(clone);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  });

  render();
})();
