(() => {
  const SCALE = 1.05;
  const presets = {
    "96x300":[96,300],"96x330":[96,330],"95x574":[95,574],"96x574":[96,574],
    "95x628":[95,628],"96x628":[96,628],"98x628":[98,628]
  };

  const $ = id => document.getElementById(id);
  const trailerEl = $("trailer");
  const state = {
    trailer:{width:96,length:300},
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
    return state.stacks.length ? Math.max(...state.stacks.map(s=>s.y+s.l)) : 0;
  }
  function selected(){ return state.stacks.find(s=>s.id===state.selectedId); }

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
      if(s.id===state.selectedId) el.classList.add("selected");
      if(s.locked) el.classList.add("locked");
      if(!valid(s)) el.classList.add("invalid");
      el.style.left=`${s.x*SCALE}px`; el.style.top=`${s.y*SCALE}px`;
      el.style.width=`${s.w*SCALE}px`; el.style.height=`${s.l*SCALE}px`;
      el.innerHTML=`${s.name}<small>${s.qty} alto · ${s.type}</small>`;
      trailerEl.appendChild(el);
      wireDrag(el,s);
    });
    updateSelected(); updateMetrics(); renderLibrary();
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

  function wireDrag(el,s){
    let dragging=false,startX=0,startY=0,original=null;
    el.addEventListener("pointerdown",e=>{
      e.preventDefault(); state.selectedId=s.id; render();
      if(s.locked) return;
      dragging=true; original={x:s.x,y:s.y}; startX=e.clientX; startY=e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove",e=>{
      if(!dragging) return;
      s.x=Math.round(original.x+(e.clientX-startX)/SCALE);
      s.y=Math.round(original.y+(e.clientY-startY)/SCALE);
      el.style.left=`${s.x*SCALE}px`; el.style.top=`${s.y*SCALE}px`;
      el.classList.toggle("invalid",!valid(s)); updateMetrics();
    });
    el.addEventListener("pointerup",()=>{
      if(!dragging) return; dragging=false; snapStack(s);
      if(!valid(s)){s.x=original.x;s.y=original.y;toast("Ese espacio no es válido");}
      else{
        const before=JSON.parse(snapShot());
        before.stacks=before.stacks.map(o=>o.id===s.id?{...o,x:original.x,y:original.y}:o);
        state.history.push(JSON.stringify(before)); state.future=[];
      }
      render();
    });
    el.addEventListener("click",()=>{state.selectedId=s.id;render();});
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
    if(s.type==="2-way"||!s.canRotate) return toast("Esta pila no se puede girar");
    remember(); [s.w,s.l]=[s.l,s.w];
    if(!valid(s)){[s.w,s.l]=[s.l,s.w];toast("No cabe girada en esa posición");}
    render();
  });
  $("lockBtn").addEventListener("click",()=>{
    const s=selected();if(!s)return toast("Selecciona una pila");
    remember();s.locked=!s.locked;render();
  });
  $("duplicateBtn").addEventListener("click",()=>{
    const s=selected();if(!s)return toast("Selecciona una pila");
    remember();const fit=candidatePositions(s.w,s.l)[0];
    state.stacks.push({...s,id:uid(),locked:false,x:fit?fit.x:0,y:fit?fit.y:usedLength()});render();
  });
  $("deleteBtn").addEventListener("click",()=>{
    if(!state.selectedId)return;remember();
    state.stacks=state.stacks.filter(s=>s.id!==state.selectedId);state.selectedId=null;render();
  });

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

  $("compactBtn").addEventListener("click",()=>{
    remember();
    state.stacks.filter(s=>!s.locked).sort((a,b)=>a.y-b.y).forEach(s=>{
      let changed=true;
      while(changed){
        changed=false;const old=s.y;s.y=Math.max(0,s.y-1);
        if(valid(s)) changed=true; else s.y=old;
      }
      snapStack(s);
    });
    render();toast("Carga compactada");
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
      <h1>LoadMaster AI — Plano de carga</h1>
      <p>Tráiler ${state.trailer.width}" × ${state.trailer.length}" · ${state.stacks.length} pilas · ${Math.max(0,state.trailer.length-usedLength())}" libres al final</p>
      </body></html>`);
    w.document.body.appendChild(clone);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  });

  render();
})();
