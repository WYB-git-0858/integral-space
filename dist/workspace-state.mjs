import {coordinateContext} from './coordinates.mjs';
// Session navigation and undo deliberately have different lifetimes from the
// opt-in localStorage backup. Reloading starts a new, empty visit.
const copy=value=>JSON.parse(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class UndoHistory {
  constructor(initial,{limit=60,groupMs=700}={}){this.present=copy(initial);this.past=[];this.future=[];this.limit=limit;this.groupMs=groupMs;this.key=null;this.time=0;}
  commit(state,key=null,now=Date.now()){
    if(equal(state,this.present))return false;
    if(!key||this.key!==key||now-this.time>this.groupMs){this.past.push(this.present);if(this.past.length>this.limit)this.past.shift();}
    this.present=copy(state);this.future=[];this.key=key;this.time=now;return true;
  }
  refresh(state){this.present=copy(state);}
  breakGroup(){this.key=null;}
  undo(){if(!this.past.length)return null;this.future.push(this.present);this.present=this.past.pop();this.breakGroup();return copy(this.present);}
  redo(){if(!this.future.length)return null;this.past.push(this.present);this.present=this.future.pop();this.breakGroup();return copy(this.present);}
  serialize(){return copy({past:this.past,present:this.present,future:this.future});}
  restore(data){if(!data||!Array.isArray(data.past)||!Array.isArray(data.future)||!data.present)return;this.past=copy(data.past.slice(-this.limit));this.present=copy(data.present);this.future=copy(data.future.slice(-this.limit));this.breakGroup();}
}
const prefix='integral-space-session-';
export function enterWorkspace(dimension,{storage,navigation='navigate',historyState=null,now=Date.now()}={}){
  let restored=null,visit;
  try{
    const handoff=JSON.parse(storage.getItem(prefix+'handoff')||'null');
    visit=storage.getItem(prefix+'visit');storage.removeItem(prefix+'handoff');
    const switching=navigation==='navigate'&&handoff?.dimension===dimension&&handoff.visit===visit&&now-handoff.time>=0&&now-handoff.time<120000;
    const traversing=navigation==='back_forward'&&visit&&historyState?.integralVisit===visit;
    if(switching||traversing){restored=JSON.parse(storage.getItem(prefix+dimension)||'null');}
    else{visit=String(now)+'-'+Math.random().toString(36).slice(2);for(const d of['2d','3d'])storage.removeItem(prefix+d);storage.setItem(prefix+'visit',visit);}
  }catch{}
  return{restored,visit,leave(destination,data){try{storage.setItem(prefix+dimension,JSON.stringify(data));storage.setItem(prefix+'handoff',JSON.stringify({dimension:destination,visit,time:Date.now()}));}catch{return false;}return true;}};
}
export const presentationIds=['autoFit','regionSelect','showIntersections','showPoints','cameraMode','sliceAxis','sliceNumber','showSlice','cutBody','projectionPlane','projectionAxis','coordinateSystem','integralOrder','integrandMode'];
export function readPresentation(){return Object.fromEntries(presentationIds.flatMap(id=>{const el=document.getElementById(id);return el?[[id,el.type==='checkbox'?el.checked:el.value]]:[];}));}
export function writePresentation(values={}){
  // The coordinate-system handler creates the appropriate order options.
  const system=document.getElementById('coordinateSystem');
  if(system&&values.coordinateSystem&&system.value!==values.coordinateSystem){system.value=values.coordinateSystem;const order=document.getElementById('integralOrder');order.replaceChildren(...coordinateContext(system.value).orders.map(o=>{const el=document.createElement('option');el.value=o.value;el.textContent=o.label;return el;}));}
  for(const[id,value]of Object.entries(values)){const el=document.getElementById(id);if(!el)continue;if(el.type==='checkbox')el.checked=!!value;else if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===String(value)))el.value=value;}
}
export function connectWorkspace({dimension,getState,applyState,restored=null,onChange=()=>{}}){
  const history=new UndoHistory(getState());if(restored?.history)history.restore(restored.history);
  let applying=false;
  const undo=document.getElementById('undoButton'),redo=document.getElementById('redoButton');
  const update=()=>{undo.disabled=!history.past.length;redo.disabled=!history.future.length;};
  function commit(key){if(applying)return;history.commit(getState(),key);update();onChange();}
  const fields='#surfaceList textarea,#surfaceList input,#surfaceList select,#parameters input,#boundsInputs input,#showBody,#onlyBody,#showWire,#showGrid,#bodyColor,#bodyOpacity,#quality,'+presentationIds.map(id=>'#'+id).join(',');
  for(const type of['input','change'])document.addEventListener(type,e=>{
    if(applying||!e.target.matches?.(fields))return;
    // input and change belong to the same gesture; use the same key for both.
    const el=e.target,key=(el.closest('[data-id]')?.dataset.id||el.closest('[data-name]')?.dataset.name||'')+':'+(el.id||el.getAttribute('aria-label')||el.className);
    commit(key);
  });
  document.addEventListener('pointerdown',e=>{if(e.target.matches?.(fields))history.breakGroup();},true);
  document.addEventListener('click',e=>{if(applying)return;const b=e.target.closest?.('#addButton,#clearButton,#restoreButton,#fitBounds,.remove-surface,.load-preset,.append-preset,#keypad button');if(b)commit(null);});
  function travel(again,keepFocus=false){const active=document.activeElement,card=active?.closest('[data-id]'),param=active?.closest('[data-name]'),textMode=active?.tagName==='TEXTAREA';history.refresh(getState());const state=again?history.redo():history.undo();if(!state)return;applying=true;try{applyState(state);}finally{applying=false;}if(keepFocus){let target;if(card){const restored=document.querySelector(`[data-id="${CSS.escape(card.dataset.id)}"]`);if(restored){const input=restored.querySelector('textarea'),math=restored.querySelector('math-field');if(textMode){input.hidden=false;math.hidden=true;restored.querySelector('.formula-mode').textContent='切换数学输入';}target=textMode?input:math;}}else if(param)target=document.querySelector(`[data-name="${CSS.escape(param.dataset.name)}"] input[type="${active.type}"]`);else if(active?.id)target=document.getElementById(active.id);target?.focus({preventScroll:true});}update();onChange();}
  undo.onclick=()=>travel(false);redo.onclick=()=>travel(true);
  document.addEventListener('keydown',e=>{if(e.isComposing||e.altKey||!(e.ctrlKey||e.metaKey)||e.target.closest?.('#presetSearch'))return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopImmediatePropagation();travel(k==='y'||e.shiftKey,true);}},true);
  update();
  return{refresh(){if(!applying)history.refresh(getState());},serialize(){history.refresh(getState());return{state:getState(),history:history.serialize()};}};
}
export function bindDimensionNavigation(session,workspace){
  document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.hash)return;const path=url.pathname.replace(/\/$/,'');const dimension=/\/plane(?:\.html)?$/.test(path)?'2d':path===''||/\/index\.html$/.test(path)?'3d':null;if(dimension)session.leave(dimension,workspace.serialize());});
}
