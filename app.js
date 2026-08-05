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

  function optimize(){
    remember();
    const locked=state.stacks.filter(s=>s.locked);
    const moving=state.stacks.filter(s=>!s.locked).sort((a,b)=>(b.w*b.l)-(a.w*a.l));
    state.stacks=[...locked];
    moving.forEach(s=>{
      const orients=[{w:s.w,l:s.l}];
      if(s.type==="4-way"&&s.canRotate&&s.w!==s.l) orients.push({w:s.l,l:s.w});
      let best=null;
      orients.forEach(o=>{
        const fit=candidatePositions(o.w,o.l)[0];
        if(fit){
          const score=fit.y+o.l;
          if(!best||score<best.score) best={...fit,...o,score};
        }
      });
      if(best){s.x=best.x;s.y=best.y;s.w=best.w;s.l=best.l;}
      else{s.x=0;s.y=usedLength();}
      state.stacks.push(s);
    });
    render();toast("Optimización básica terminada");
  }
  $("optimizeBtn").addEventListener("click",optimize);

  function layoutUsedLength(stacks){
    return stacks.length ? Math.max(...stacks.map(s=>s.y+s.l)) : 0;
  }

  function layoutOverlaps(a,b){
    return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.l<=b.y || b.y+b.l<=a.y);
  }

  function layoutValid(s,placed){
    if(s.x<0||s.y<0||s.x+s.w>state.trailer.width||s.y+s.l>state.trailer.length) return false;
    return !placed.some(o=>o.id!==s.id&&layoutOverlaps(s,o));
  }

  function layoutCandidates(w,l,placed,id){
    const xs=new Set([0,state.trailer.width-w]);
    const ys=new Set([0]);
    placed.forEach(o=>{
      xs.add(o.x);
      xs.add(o.x+o.w);
      xs.add(o.x-w);
      xs.add(o.x+o.w-w);
      ys.add(o.y);
      ys.add(o.y+o.l);
      ys.add(o.y-l);
      ys.add(o.y+o.l-l);
    });
    const out=[];
    [...ys].filter(y=>y>=0).sort((a,b)=>a-b).forEach(y=>{
      [...xs].filter(x=>x>=0).sort((a,b)=>a-b).forEach(x=>{
        const t={id,x,y,w,l};
        if(layoutValid(t,placed)) out.push(t);
      });
    });
    return out;
  }

  function compactAdvanced(){
    const before=snapShot();
    const locked=state.stacks.filter(s=>s.locked).map(s=>({...s}));
    const moving=state.stacks.filter(s=>!s.locked).map(s=>({...s}));
    if(!moving.length) return toast("No hay pilas desbloqueadas para compactar");

    const orders=[
      arr=>[...arr].sort((a,b)=>(b.w*b.l)-(a.w*a.l)||b.l-a.l||b.w-a.w),
      arr=>[...arr].sort((a,b)=>b.l-a.l||b.w-a.w),
      arr=>[...arr].sort((a,b)=>b.w-a.w||b.l-a.l),
      arr=>[...arr].sort((a,b)=>a.y-b.y||a.x-b.x),
      arr=>[...arr].sort((a,b)=>(b.w+b.l)-(a.w+a.l))
    ];

    let best=null;
    orders.forEach(makeOrder=>{
      const placed=locked.map(s=>({...s}));
      const failed=[];
      makeOrder(moving).forEach(original=>{
        const orientations=[{w:original.w,l:original.l}];
        if(original.type==="4-way"&&original.canRotate&&original.w!==original.l){
          orientations.push({w:original.l,l:original.w});
        }
        let choice=null;
        orientations.forEach(o=>{
          layoutCandidates(o.w,o.l,placed,original.id).forEach(pos=>{
            const candidate={...original,...o,x:pos.x,y:pos.y};
            const projected=Math.max(layoutUsedLength(placed),candidate.y+candidate.l);
            const sideGap=Math.min(candidate.x,state.trailer.width-(candidate.x+candidate.w));
            const score=[projected,candidate.y,sideGap,candidate.x];
            if(!choice||score.some((v,i)=>v<choice.score[i]&&score.slice(0,i).every((x,j)=>x===choice.score[j]))){
              choice={candidate,score};
            }
          });
        });
        if(choice) placed.push(choice.candidate);
        else failed.push(original);
      });

      // Si alguna pila no pudo colocarse, conservarla para no perder información.
      failed.forEach(s=>placed.push({...s}));
      const conflicts=placed.filter((s,i)=>!layoutValid(s,placed.filter((_,j)=>j!==i))).length;
      const used=layoutUsedLength(placed.filter(s=>s.x>=0&&s.y>=0&&s.x+s.w<=state.trailer.width&&s.y+s.l<=state.trailer.length));
      const result={placed,conflicts,used};
      if(!best||result.conflicts<best.conflicts||(result.conflicts===best.conflicts&&result.used<best.used)) best=result;
    });

    state.history.push(before);
    if(state.history.length>80) state.history.shift();
    state.future=[];
    state.stacks=best.placed;
    render();
    if(best.conflicts){
      toast(`Compactación terminada con ${best.conflicts} conflicto(s)`);
    }else{
      toast(`Compactación avanzada: ${Math.round(best.used)} pulgadas usadas`);
    }
  }

  $("compactBtn").addEventListener("click",compactAdvanced);
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
      <h1>LoadMaster AI — Plano de carga</h1>
      <p>Tráiler ${state.trailer.width}" × ${state.trailer.length}" · ${state.stacks.length} pilas · ${Math.max(0,state.trailer.length-usedLength())}" libres al final</p>
      </body></html>`);
    w.document.body.appendChild(clone);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  });

  render();
})();
