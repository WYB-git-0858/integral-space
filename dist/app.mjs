import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {compileSurface} from './engine.mjs';
import {presets} from './presets.mjs';
import {mathEditor,insertMath} from './formula.mjs';
import {createExplorer} from './explorer.mjs';
import {createComputeClient} from './compute-client.mjs';
import {enterWorkspace,connectWorkspace,bindDimensionNavigation,readPresentation,writePresentation} from './workspace-state.mjs';
import {geometryKey,downloadPython} from './python-export.mjs';
const $=id=>document.getElementById(id);
const colors=['#75c9aa','#83b7e5','#ce9edf','#e89187','#9dce77','#e5cf83','#8ed5dd','#df9bc1'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatVolume(value){if(value===0)return '0';if(Math.abs(value)>=.001&&Math.abs(value)<1e6)return value.toFixed(3);const [coefficient,exponent]=value.toExponential(3).split('e'),sup={'-':'⁻','+':'','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};return coefficient+' × 10'+[...exponent].map(c=>sup[c]).join('');}
let serial=0,activeId=null,currentPreset=presets[0],rows=[],params={},bounds=[],lastResult=null,worker=null,requestId=0,timer=null,filter='全部';
let scene,camera,renderer,controls,surfaceGroup,bodyGroup,axisGroup,grid,webgl=true;
let explorer=null,cameraMode='perspective';
let computeClient=null,renderedSurfaceRequest=null,workspace=null,requestedKey=null,resultKey=null,pendingPresentation=null;
let customScene=true,canSaveScene=false,savedWorkspace=null;
const blankBounds=()=>[[-3,3],[-3,3],[-3,3]];
let options={showBody:true,onlyBody:false,showWire:true,showGrid:true,bodyColor:'#efba69',bodyOpacity:.85,quality:44};
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}
function save(){if(!canSaveScene)return;try{localStorage.setItem('integral-space-v2',JSON.stringify({rows,params,bounds,options,customScene,preset:currentPreset.id}));}catch{}}
function markCustom(){canSaveScene=true;customScene=true;sceneInfo();}
function makeRow(expr='',side='auto'){return{id:'f'+(++serial)+'-'+Date.now().toString(36),expr,side,color:colors[rows.length%colors.length],opacity:.3,visible:true};}
function setPreset(p,append=false){
  currentPreset=p;customScene=append;canSaveScene=true;
  if(!append){rows=[];params={...p.params};bounds=p.bounds.map(b=>[...b]);for(const [expr,side]of p.formulas)rows.push(makeRow(expr,side));options.onlyBody=false;$('onlyBody').checked=false;}
  else{if(rows.length+p.formulas.length>12){toast('最多同时显示 12 张曲面，请先移除一些');return;}Object.entries(p.params).forEach(([k,v])=>{if(!(k in params))params[k]=v;});for(const [expr,side]of p.formulas)rows.push(makeRow(expr,side));toast('已叠加 '+p.name+'；共享字母参数，绘图区间保持当前设置');}
  activeId=rows.at(-1)?.id;renderRows();syncParameters();renderBounds();sceneInfo();renderPresets();schedule(0);if(camera&&!append){rebuildAxes();setView('iso');}save();
}
function sceneInfo(){
  const empty=!rows.some(r=>r.expr.trim());$('emptyCanvas').hidden=!empty;
  if(empty){$('sceneTitle').textContent='空白坐标系';$('sceneTag').textContent='自由绘图';$('sceneHint').textContent='添加空白输入框并写入方程，或主动从图鉴载入模型。曲面默认自动参与围成立体的识别。';$('insightTitle').textContent='从你自己的公式开始';return;}
  if(customScene){$('sceneTitle').textContent='自定义曲面组合';$('sceneTag').textContent='自由绘图';$('sceneHint').textContent='方程默认自动识别围成的有界区域；不等式和手动选择的方向用于限制内部。多个区域可分别查看。';$('insightTitle').textContent='你的空间 · 自由探索';return;}
  $('sceneTitle').textContent=currentPreset.name;$('sceneTag').textContent=currentPreset.category;$('sceneHint').textContent=currentPreset.hint||currentPreset.desc;$('insightTitle').textContent=currentPreset.tag+' · '+currentPreset.name;
}
function renderRows(){
  $('surfaceCount').textContent=rows.length;
  $('surfaceList').innerHTML=rows.map((r,i)=>`<article class="surface-card" data-id="${r.id}"><div class="surface-card-head"><input type="checkbox" class="visible-input" aria-label="显示曲面 ${i+1}" ${r.visible?'checked':''}><input type="color" class="surface-color" value="${r.color}" aria-label="曲面 ${i+1} 颜色"><span>曲面 ${String(i+1).padStart(2,'0')}</span><button class="remove-surface" title="移除曲面" aria-label="移除曲面 ${i+1}">×</button></div><textarea class="formula-input" spellcheck="false" rows="1" aria-label="曲面 ${i+1} 公式" placeholder="输入你的曲面方程">${esc(r.expr)}</textarea><div class="surface-settings"><select class="side-select" aria-label="曲面 ${i+1} 立体内部"><option value="auto" ${r.side==='auto'?'selected':''}>自动识别围成区域</option><option value="none" ${r.side==='none'?'selected':''}>仅曲面，不参与立体</option><option value="le" ${r.side==='le'?'selected':''}>左侧 ≤ 右侧</option><option value="ge" ${r.side==='ge'?'selected':''}>左侧 ≥ 右侧</option></select><small>透明度</small><input type="range" class="opacity-input" min="0.05" max="1" step="0.05" value="${r.opacity}" aria-label="曲面 ${i+1} 透明度"></div><div class="formula-error" role="status"></div></article>`).join('');
  for(const card of $('surfaceList').children){const r=rows.find(r=>r.id===card.dataset.id),input=card.querySelector('textarea');
    mathEditor(input,()=>activeId=r.id);
    input.addEventListener('focus',()=>activeId=r.id);
    input.addEventListener('input',()=>{r.expr=input.value;markCustom();if(!r.expr.trim()){card.querySelector('.formula-error').textContent='';syncParameters();schedule(500);return;}try{const c=compileSurface(r.expr);if(c.relation.includes('<'))r.side='le';if(c.relation.includes('>'))r.side='ge';card.querySelector('select').value=r.side;card.querySelector('.formula-error').textContent='';}catch(e){card.querySelector('.formula-error').textContent=e.message;}syncParameters();schedule(500);});
    card.querySelector('.visible-input').addEventListener('change',e=>{r.visible=e.target.checked;markCustom();schedule();});
    card.querySelector('.surface-color').addEventListener('input',e=>{r.color=e.target.value;restyle();save();});
    card.querySelector('.opacity-input').addEventListener('input',e=>{r.opacity=+e.target.value;restyle();save();});
    card.querySelector('.side-select').addEventListener('change',e=>{r.side=e.target.value;markCustom();schedule();});
    card.querySelector('.remove-surface').addEventListener('click',()=>{rows=rows.filter(s=>s.id!==r.id);if(activeId===r.id)activeId=rows.at(-1)?.id;markCustom();renderRows();syncParameters();schedule();});
  }
}
function syncParameters(){
  const names=new Set();for(const r of rows){try{compileSurface(r.expr).params.forEach(n=>names.add(n));}catch{}}
  const old=[...$('parameters').querySelectorAll('.param-row')].map(el=>el.dataset.name).join(',');
  if(old===[...names].join(',')&&$('parameters').children.length)return;
  $('parameters').replaceChildren();
  if(!names.size){$('parameters').innerHTML='<div class="empty-params">当前公式没有可调字母参数</div>';return;}
  for(const name of names){if(!(name in params))params[name]=name==='a'?2:1;const value=params[name],lo=Math.min(-5,Math.floor(value-1)),hi=Math.max(5,Math.ceil(value+1));
    const el=document.createElement('div');el.className='param-row';el.dataset.name=name;
    el.innerHTML=`<div class="param-head"><label>${esc(name)}</label><input type="number" step="0.1" value="${value}" aria-label="参数 ${esc(name)} 数值"></div><input class="param-slider" type="range" min="${lo}" max="${hi}" step="0.05" value="${value}" aria-label="参数 ${esc(name)} 滑块"><div class="param-endpoints"><span>${lo}</span><span>${hi}</span></div>`;
    const number=el.querySelector('[type=number]'),slider=el.querySelector('[type=range]');
    number.addEventListener('input',()=>{if(number.value&&Number.isFinite(+number.value)){params[name]=+number.value;slider.min=Math.min(+slider.min,+number.value-1);slider.max=Math.max(+slider.max,+number.value+1);slider.value=number.value;el.querySelector('.param-endpoints span').textContent=slider.min;el.querySelector('.param-endpoints span:last-child').textContent=slider.max;schedule(200);}});
    slider.addEventListener('input',()=>{params[name]=+slider.value;number.value=slider.value;schedule(170);});
    number.addEventListener('change',()=>{if(!number.value||!Number.isFinite(+number.value)){number.value=params[name];toast('参数需要是有限实数');return;}const v=+number.value;params[name]=v;if(v<+slider.min){slider.min=Math.floor(v-1);el.querySelector('.param-endpoints span').textContent=slider.min;}if(v>+slider.max){slider.max=Math.ceil(v+1);el.querySelector('.param-endpoints span:last-child').textContent=slider.max;}slider.value=v;schedule(0);});
    $('parameters').append(el);
  }
}
function renderBounds(){
  $('boundsInputs').innerHTML=bounds.map((b,i)=>`<div class="bound-row"><span>${'xyz'[i]}</span><input type="number" step="0.5" value="${b[0]}" data-axis="${i}" data-end="0" aria-label="${'xyz'[i]} 最小值"><b>—</b><input type="number" step="0.5" value="${b[1]}" data-axis="${i}" data-end="1" aria-label="${'xyz'[i]} 最大值"></div>`).join('');
  for(const input of $('boundsInputs').querySelectorAll('input'))input.addEventListener('change',()=>{const next=bounds.map(b=>[...b]);next[+input.dataset.axis][+input.dataset.end]=Number(input.value);if(!input.value||!next.every(b=>b.every(Number.isFinite)&&b[1]>b[0]&&b[1]-b[0]<10000)){toast('每个坐标区间需要有限数值，且上限大于下限，跨度小于 10000');renderBounds();return;}bounds=next;rebuildAxes();schedule(0);});
}
function showTab(library){$('editorPanel').hidden=library;$('libraryPanel').hidden=!library;$('editorTab').classList.toggle('active',!library);$('galleryTab').classList.toggle('active',library);}
function presetCard(p,small=false){return `<article class="preset-card ${!customScene&&currentPreset.id===p.id?'active':''}" data-preset="${p.id}"><button class="load-preset" title="载入 ${p.name}"><img src="./previews/${p.id}.svg" alt="${p.name}三维预览" loading="lazy"><div class="preset-copy"><strong>${p.name}</strong><small>${p.tag}</small></div><span class="preset-arrow">↗</span></button>${small?'<button class="append-preset" title="叠加此模型到当前坐标系">＋ 叠加</button>':''}</article>`;}
function renderPresets(){
  const quick=['sphere','cone','cylinder','paraboloid','saddle','bowl'].map(id=>presets.find(p=>p.id===id));
  $('quickPresets').innerHTML=quick.map(p=>presetCard(p)).join('');
  const search=$('presetSearch').value.trim();const items=presets.filter(p=>(filter==='全部'||p.category===filter)&&(!search||[p.name,p.tag,p.desc,...p.formulas.map(f=>f[0])].join(' ').includes(search)));
  $('libraryList').innerHTML=items.map(p=>presetCard(p,true)).join('')||'<p class="small-note">没有匹配的图形，试试“球”或“柱”。</p>';
  for(const card of document.querySelectorAll('[data-preset]')){const p=presets.find(p=>p.id===card.dataset.preset);card.querySelector('.load-preset').onclick=()=>setPreset(p);const add=card.querySelector('.append-preset');if(add)add.onclick=()=>{setPreset(p,true);showTab(false);};}
}
const keys=[['x','x'],['y','y'],['z','z'],['a','a'],['b','b'],['R','R'],['√','sqrt'],['( )','paren'],['x²','square'],['xⁿ','power'],['a/b','frac'],['π','pi'],['＋','+'],['−','-'],['×','*'],['÷','/'],['=','='],['≤','<='],['sin','sin'],['cos','cos'],['tan','tan'],['eˣ','exp'],['ln','ln'],['|x|','abs']];
function insertToken(token){
  if(!rows.length){rows.push(makeRow(''));activeId=rows[0].id;renderRows();}
  let card=document.querySelector(`[data-id="${activeId}"]`)||$('surfaceList').firstElementChild;const input=card.querySelector('textarea');if(insertMath(input,token))return;const start=input.selectionStart,end=input.selectionEnd,selected=input.value.slice(start,end);let text=token,cursor;
  if(['sqrt','sin','cos','tan','exp','ln','abs'].includes(token)){text=token+'('+selected+')';cursor=selected?text.length:token.length+1;}
  else if(token==='paren'){text='('+selected+')';cursor=selected?text.length:1;}
  else if(token==='square'){text=selected?'('+selected+')^2':'^2';cursor=text.length;}
  else if(token==='power'){text=selected?'('+selected+')^()':'^()';cursor=text.length-1;}
  else if(token==='frac'){text='('+(selected||'1')+')/()';cursor=text.length-1;}
  else cursor=text.length;
  input.setRangeText(text,start,end,'end');input.focus();input.setSelectionRange(start+cursor,start+cursor);input.dispatchEvent(new Event('input',{bubbles:true}));
}
function initThree(){
  const el=$('viewport');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(39,1,.01,2000);camera.up.set(0,0,1);
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}catch(e){webgl=false;$('renderError').hidden=false;$('renderError').textContent='无法启动 WebGL。请使用支持硬件加速的现代浏览器重新打开。';$('busy').hidden=true;return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;el.prepend(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.autoRotateSpeed=.8;controls.minDistance=.1;controls.maxDistance=1000;
  scene.add(new THREE.AmbientLight(0xffffff,1.7));const light=new THREE.DirectionalLight(0xffeed7,2.3);light.position.set(3,-5,8);scene.add(light);const fill=new THREE.DirectionalLight(0xa4d6e5,1.3);fill.position.set(-4,2,3);scene.add(fill);
  surfaceGroup=new THREE.Group();bodyGroup=new THREE.Group();axisGroup=new THREE.Group();scene.add(surfaceGroup,bodyGroup,axisGroup);rebuildAxes();setView('iso');
  new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(w&&h){renderer.setSize(w,h);if(camera.isPerspectiveCamera)camera.aspect=w/h;else{const size=camera.userData.size||6;camera.left=-size*w/h;camera.right=size*w/h;camera.top=size;camera.bottom=-size;}camera.updateProjectionMatrix();}}).observe(el);
  explorer=createExplorer({scene,renderer,controls,surfaceGroup,bodyGroup,label,getCamera:()=>camera,getRows:()=>rows,getParams:()=>params,getBounds:()=>bounds,getPreset:()=>customScene?null:currentPreset,getColor:()=>options.bodyColor});
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}
function disposeGroup(group){while(group?.children.length){const c=group.children[0];group.remove(c);c.traverse(o=>{o.geometry?.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.map?.dispose();m.dispose();});}});}}
function label(text,color,size=.16){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');ctx.font='72px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,128,64);const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(size*2,size,1);return sprite;}
function rebuildAxes(){
  if(!axisGroup)return;disposeGroup(axisGroup);
  const span=Math.max(...bounds.map(b=>b[1]-b[0])),s=span*.5,center=bounds.map(b=>(b[0]+b[1])/2);
  camera.near=span*.0005;camera.far=span*50;camera.updateProjectionMatrix();if(controls){controls.minDistance=span*.04;controls.maxDistance=span*25;}
  if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose();}
  grid=new THREE.GridHelper(span,12,0x668c76,0x44685a);grid.rotation.x=Math.PI/2;grid.position.set(center[0],center[1],Math.max(bounds[2][0],Math.min(0,bounds[2][1])));grid.material.transparent=true;grid.material.opacity=.28;grid.visible=options.showGrid;scene.add(grid);
  ['x','y','z'].forEach((axis,i)=>{
    const a=[0,0,0],b=[0,0,0];a[i]=Math.min(bounds[i][0],0)-span*.03;b[i]=Math.max(bounds[i][1],0)+span*.09;
    const axisColor=[0xce9b8b,0x94c295,0x96bdd6][i];const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);axisGroup.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:axisColor,transparent:true,opacity:.65})));
    const dir=new THREE.Vector3();dir.setComponent(i,1);const arrow=new THREE.ArrowHelper(dir,new THREE.Vector3(...b).addScaledVector(dir,-span*.06),span*.06,axisColor,span*.035,span*.015);axisGroup.add(arrow);
    const l=label(axis,['#d4a99a','#a7cb9c','#9bbdd1'][i],span*.09);l.position.set(...b);l.position.setComponent(i,b[i]+span*.035);axisGroup.add(l);
    const raw=span/6,step=10**Math.floor(Math.log10(raw)),ratio=raw/step,tick=step*(ratio<=1?1:ratio<=2?2:ratio<=5?5:10);
    for(let v=Math.ceil(bounds[i][0]/tick)*tick;v<=bounds[i][1]+tick*.001;v+=tick){if(Math.abs(v)<tick*.01)continue;const p=[0,0,0];p[i]=v;p[(i+1)%3]=-span*.026;const t=label(Number(v.toFixed(4)).toString(),'#749487',span*.052);t.position.set(...p);axisGroup.add(t);}
  });
  const origin=label('O','#829e8d',span*.065);origin.position.set(-span*.025,-span*.025,-span*.035);axisGroup.add(origin);
}
function setView(view){if(!controls)return;const center=bounds.map(b=>(b[0]+b[1])/2),span=Math.max(...bounds.map(b=>b[1]-b[0]));controls.target.set(...center);const dirs={iso:[1.22,-1.65,1.12],top:[0,-.0001,2.45],front:[0,-2.45,.0001],side:[2.45,0,.0001]},d=dirs[view]||dirs.iso;camera.position.set(...center.map((v,i)=>v+d[i]*span));controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
function fitSelected(){if(!camera)return;const box=new THREE.Box3();for(const m of bodyGroup.children)if(m.visible)box.expandByObject(m);if(box.isEmpty())for(const m of surfaceGroup.children)if(m.visible)box.expandByObject(m);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,1e-6),direction=camera.position.clone().sub(controls.target).normalize(),aspect=$('viewport').clientWidth/$('viewport').clientHeight;controls.target.copy(center);if(camera.isPerspectiveCamera){const fov=camera.fov*Math.PI/180,angle=Math.min(fov,2*Math.atan(Math.tan(fov/2)*aspect));camera.position.copy(center).addScaledVector(direction,radius/Math.sin(angle/2)*1.2);}else{const s=Math.max(size.length()/2,size.length()/2/aspect)*1.15;camera.userData.size=s;camera.left=-s*aspect;camera.right=s*aspect;camera.top=s;camera.bottom=-s;camera.zoom=1;camera.position.copy(center).addScaledVector(direction,radius*4);}camera.near=Math.max(radius*.0001,1e-8);camera.far=radius*100+camera.position.distanceTo(center);controls.minDistance=radius*.03;controls.maxDistance=radius*60;camera.updateProjectionMatrix();controls.update();}
function switchCamera(){if(!camera)return;const old=camera,aspect=$('viewport').clientWidth/$('viewport').clientHeight;cameraMode=$('cameraMode').value;if(cameraMode==='orthographic'){const size=old.position.distanceTo(controls.target)*Math.tan(39*Math.PI/360);camera=new THREE.OrthographicCamera(-size*aspect,size*aspect,size,-size,old.near,old.far);camera.userData.size=size;}else camera=new THREE.PerspectiveCamera(39,aspect,old.near,old.far);camera.position.copy(old.position);camera.up.set(0,0,1);camera.lookAt(controls.target);controls.object=camera;camera.updateProjectionMatrix();controls.update();}
function schedule(delay=200){clearTimeout(timer);timer=setTimeout(generate,delay);save();}
function generate(){
  if(!webgl)return;
  if(!computeClient)computeClient=createComputeClient('./worker.mjs',{result:data=>{$('busy').hidden=true;document.querySelector('.analysis-workbench').removeAttribute('aria-busy');lastResult=data;resultKey=requestedKey;applyResult(data);},preview:data=>{applySurfaces(data);surfaceGroup.visible=true;bodyGroup.visible=false;$('busy').lastChild.textContent='计算围成立体…';$('volumeValue').textContent='计算中…';$('bodyStatus').textContent='曲面已显示，后台计算围成立体；可继续旋转观察。';$('renderState').textContent='曲面已显示 · 正在计算立体…';},error:message=>{$('busy').hidden=true;document.querySelector('.analysis-workbench').removeAttribute('aria-busy');$('renderState').textContent='生成失败';toast(message);}});
  requestedKey=geometryKey({rows,params,bounds,n:options.quality});const submitted=computeClient.submit({rows,params,bounds,n:options.quality});if(!submitted){if(pendingPresentation&&lastResult)applyResult(lastResult);$('renderState').textContent='图像已是最新 · 无需重算';return;}explorer?.pending();$('busy').lastChild.textContent='后台计算…';$('busy').hidden=false;$('renderState').textContent='后台计算中…';document.querySelector('.analysis-workbench').setAttribute('aria-busy','true');
  for(const el of document.querySelectorAll('.formula-error'))el.textContent='';
}
function geometry(positions,normals=null){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));if(normals?.length===positions.length)g.setAttribute('normal',new THREE.BufferAttribute(normals,3));else g.computeVertexNormals();return g;}
function applySurfaces(result){
  if(renderedSurfaceRequest===result.id)return;renderedSurfaceRequest=result.id;disposeGroup(surfaceGroup);
  for(const s of result.surfaces){if(!s.positions.length)continue;const r=rows.find(r=>r.id===s.id);if(!r)continue;const g=geometry(s.positions),group=new THREE.Group();group.userData.rowId=s.id;
    const mesh=new THREE.Mesh(g,new THREE.MeshPhongMaterial({color:r.color,transparent:true,opacity:r.opacity,side:THREE.DoubleSide,depthWrite:false,shininess:45}));mesh.renderOrder=1;group.add(mesh);
    const wire=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:r.color,wireframe:true,transparent:true,opacity:.07,depthWrite:false}));wire.userData.wire=true;wire.visible=options.showWire;wire.renderOrder=2;group.add(wire);surfaceGroup.add(group);
  }
}
function applyResult(result){
  applySurfaces(result);disposeGroup(bodyGroup);
  if(result.body?.positions.length){const b=result.body,regions=b.regions?.length?b.regions:[{index:0,start:0,vertices:b.positions.length/3}];for(const region of regions){const mesh=new THREE.Mesh(geometry(b.positions.subarray(region.start*3,(region.start+region.vertices)*3),b.normals?.subarray(region.start*3,(region.start+region.vertices)*3)),new THREE.MeshPhongMaterial({color:options.bodyColor,transparent:true,opacity:options.bodyOpacity,side:THREE.DoubleSide,shininess:45,depthWrite:true}));mesh.userData.regionIndex=region.index;mesh.renderOrder=0;bodyGroup.add(mesh);}}
  for(const e of result.errors){const card=document.querySelector(`[data-id="${e.id}"]`);if(card)card.querySelector('.formula-error').textContent=e.message;}
  const b=result.body,status=$('bodyStatus');status.classList.remove('warn');let msg;
  if(result.errors.length){msg='有公式未能解析，立体计算已暂停。请修正对应曲面。';status.classList.add('warn');}
  else if(!rows.some(r=>r.visible&&r.expr.trim())){msg='输入曲面方程后自动识别围成的有界立体。';}
  else if(!b){msg='这些曲面未参与立体计算。请在曲面下方选择“自动识别围成区域”或指定内部方向。';}
  else if(!b.count){msg=b.automatic?'当前采样未找到完整围成的有界区域。请检查范围与精度；开放区域不会当成立体填充。':'当前采样未检测到公共内部。请检查不等式方向、参数或提高精度。';status.classList.add('warn');}
  else if(b.touches){msg='公共区域接触绘图边界，可能未封闭或被截断。请扩大区间，或补充边界曲面。';status.classList.add('warn');}
  else if(b.automatic){msg=`自动识别到 ${b.totalRegions} 个有界区域${b.totalRegions>12?'，显示其中最大的 12 个':''}${b.openComponents?'；已排除开放区域':''}。勾选“仅查看立体”可单独观察。`;}
  else msg=`${b.constraints} 个不等式的公共区域，采样未检测到接触绘图边界。可勾选“仅查看立体”观察。`;
  status.textContent=msg;
  const regionSelect=$('regionSelect'),previous=regionSelect.value;regionSelect.innerHTML='<option value="all">全部围成区域</option>'+(b?.regions||[]).map((r,i)=>`<option value="${r.index}">区域 ${i+1} · 体积 ≈ ${formatVolume(r.volume)}</option>`).join('');regionSelect.value=[...regionSelect.options].some(o=>o.value===previous)?previous:'all';$('regionChoice').hidden=!(b?.regions?.length>1);
  updateVolume();
  $('volumeNote').textContent=b?.touches?'仅为当前绘图盒内体积；边界网格近似':'边界网格几何近似，非解析结果';
  $('renderState').textContent=`${result.surfaces.length} 张曲面 · ${result.n}³ 采样`;
  if(pendingPresentation)writePresentation(pendingPresentation.presentation);restyle();explorer?.update(result);if(pendingPresentation){restoreCamera(pendingPresentation.camera);pendingPresentation=null;}else if($('autoFit').checked&&result.body?.positions.length)fitSelected();workspace?.refresh();save();
}
function restyle(){
  if(!surfaceGroup)return;const hasBody=bodyGroup.children.length>0&&options.showBody;
  surfaceGroup.visible=!(options.onlyBody&&hasBody);
  for(const group of surfaceGroup.children){const r=rows.find(r=>r.id===group.userData.rowId);if(!r)continue;group.visible=r.visible;for(const m of group.children){m.material.color.set(r.color);m.material.opacity=m.userData.wire?.07:r.opacity;if(m.userData.wire)m.visible=options.showWire;}}
  bodyGroup.visible=options.showBody;for(const m of bodyGroup.children){m.material.color.set(options.bodyColor);m.material.opacity=options.bodyOpacity;m.visible=$('regionSelect').value==='all'||String(m.userData.regionIndex)===$('regionSelect').value;}
  $('onlyBody').disabled=!options.showBody;
  $('legend').innerHTML=(surfaceGroup.visible?rows.filter(r=>r.visible&&r.expr.trim()).map(r=>`<div><i style="background:${r.color}"></i><span>${esc(r.expr)}</span></div>`).join(''):'')+(hasBody?`<div><i style="background:${options.bodyColor};height:7px;width:7px;border-radius:2px"></i><span>围成立体 Ω</span></div>`:'');
}
function updateVolume(){const b=lastResult?.body,selected=$('regionSelect').value,region=selected!=='all'?b?.regions?.find(r=>String(r.index)===selected):null,value=region?.volume??b?.volume;$('volumeValue').textContent=b?.count&&!lastResult.errors.length?(b.touches?'区间内 ≈ ':'≈ ')+formatVolume(value):'—';}
function initUI(){
  $('editorTab').onclick=()=>showTab(false);$('galleryTab').onclick=()=>showTab(true);for(const id of ['openGallery','allPresets'])$(id).onclick=()=>{showTab(true);$('libraryPanel').scrollIntoView({behavior:'smooth',block:'nearest'});};
  $('presetSearch').oninput=renderPresets;
  for(const name of ['全部','常见曲面','积分区域','自定义示例']){const b=document.createElement('button');b.textContent=name;b.className=name===filter?'active':'';b.onclick=()=>{filter=name;[...b.parentNode.children].forEach(el=>el.classList.toggle('active',el===b));renderPresets();};$('categoryFilters').append(b);}
  $('keypad').innerHTML=keys.map(([label,token])=>`<button type="button" data-token="${esc(token)}" title="插入 ${label}">${label}</button>`).join('');
  for(const b of $('keypad').children){b.onmousedown=e=>e.preventDefault();b.onclick=()=>insertToken(b.dataset.token);}
  $('addButton').onclick=()=>{if(rows.length>=12){toast('最多同时显示 12 张曲面');return;}const r=makeRow();rows.push(r);activeId=r.id;markCustom();renderRows();syncParameters();document.querySelector(`[data-id="${r.id}"] textarea`).mathfield.focus();schedule();};
  $('clearButton').onclick=()=>{rows=[];activeId=null;markCustom();renderRows();syncParameters();schedule(0);toast('已清空曲面，可添加公式或载入图鉴');};
  $('drawButton').onclick=()=>{clearTimeout(timer);generate();};document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();generate();}});
  for(const id of ['showBody','onlyBody','showWire','showGrid']){$(id).checked=options[id];$(id).onchange=e=>{options[id]=e.target.checked;if(grid)grid.visible=options.showGrid;restyle();save();};}
  for(const id of ['bodyColor','bodyOpacity']){$(id).value=options[id];$(id).oninput=e=>{options[id]=id==='bodyOpacity'?+e.target.value:e.target.value;restyle();explorer?.refresh();save();};}
  $('quality').value=options.quality;$('quality').onchange=e=>{options.quality=+e.target.value;schedule(0);};
  $('resetView').onclick=()=>setView('iso');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('rotateButton').onclick=()=>{if(!controls)return;controls.autoRotate=!controls.autoRotate;$('rotateButton').classList.toggle('active',controls.autoRotate);};
  const zoom=f=>{if(!camera)return;if(camera.isOrthographicCamera){camera.zoom/=f;camera.updateProjectionMatrix();}else camera.position.sub(controls.target).multiplyScalar(f).add(controls.target);};$('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);
  $('fitBounds').onclick=()=>{bounds=customScene?blankBounds():currentPreset.bounds.map(b=>[...b]);renderBounds();rebuildAxes();setView('iso');schedule(0);};
  $('regionSelect').onchange=()=>{restyle();updateVolume();explorer?.select();if($('autoFit').checked)fitSelected();};
  $('focusBody').onclick=fitSelected;$('cameraMode').onchange=switchCamera;
  $('restoreButton').onclick=()=>{if(!savedWorkspace)return;applyWorkspace({...savedWorkspace,activeId:savedWorkspace.rows[0]?.id,canSaveScene:true,presentation:readPresentation()});$('restoreButton').hidden=true;};
  $('fullButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{toast('当前浏览器不支持全屏，请使用窗口放大');}};
  $('exportButton').onclick=()=>{if(!renderer)return;renderer.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#17322c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);const scale=canvas.width/$('viewport').clientWidth;ctx.font=`${12*scale}px sans-serif`;ctx.fillStyle='#c0d2bc';ctx.fillText('积分空间 / '+currentPreset.name,20*scale,25*scale);let y=50;rows.filter(r=>r.visible).forEach(r=>{ctx.fillStyle=r.color;ctx.fillText(r.expr,20*scale,y*scale);y+=19;});const a=document.createElement('a');a.download='积分空间-'+currentPreset.id+'.png';a.href=canvas.toDataURL('image/png');a.click();toast('三维图像已导出');};
  $('exportImagePanel').onclick=()=>$('exportButton').click();
  $('exportPython').onclick=()=>{if(!lastResult||resultKey!==geometryKey({rows,params,bounds,n:options.quality})){toast('请先等待当前图像生成完成，再导出 Python');return;}try{const d=camera.position.clone().sub(controls.target);downloadPython({dimension:3,rows,params,bounds,options,result:lastResult,selected:$('regionSelect').value,camera:{elev:Math.atan2(d.z,Math.hypot(d.x,d.y))*180/Math.PI,azim:Math.atan2(d.y,d.x)*180/Math.PI}});toast('Python 已导出，运行需要 NumPy 和 Matplotlib');}catch(e){toast(e.message);}};
  $('helpButton').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=$('helpStart').onclick=()=>$('helpDialog').close();$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
}
try{const current=localStorage.getItem('integral-space-v2'),s=JSON.parse(current||localStorage.getItem('integral-space-v1'));if(s&&Array.isArray(s.rows)&&s.rows.some(r=>r.expr?.trim())&&s.rows.length<=12&&s.bounds?.length===3&&s.bounds.every(b=>Array.isArray(b)&&b.length===2&&b.every(Number.isFinite)&&b[1]>b[0])&&(current||s.customScene===true)){savedWorkspace={...s,rows:s.rows.filter(r=>typeof r.expr==='string'&&r.expr.length<=500).map(r=>({...r,color:/^#[a-f0-9]{6}$/i.test(r.color)?r.color:colors[0],side:!current&&r.side==='none'?'auto':['auto','none','le','ge'].includes(r.side)?r.side:'auto'})),params:s.params||{}};}}catch{}
bounds=blankBounds();$('restoreButton').hidden=!savedWorkspace;
function captureWorkspace(){return JSON.parse(JSON.stringify({rows,params,bounds,options,customScene,preset:currentPreset.id,activeId,canSaveScene,presentation:readPresentation(),camera:camera&&controls?{mode:cameraMode,position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,size:camera.userData.size,near:camera.near,far:camera.far}:null}));}
function restoreCamera(state){if(!state||!camera||!controls)return;if(cameraMode!==state.mode){$('cameraMode').value=state.mode;switchCamera();}camera.position.set(...state.position);controls.target.set(...state.target);camera.zoom=state.zoom||1;camera.near=state.near;camera.far=state.far;if(camera.isOrthographicCamera){const size=state.size||6,aspect=$('viewport').clientWidth/$('viewport').clientHeight;camera.userData.size=size;camera.left=-size*aspect;camera.right=size*aspect;camera.top=size;camera.bottom=-size;}camera.updateProjectionMatrix();controls.update();}
function applyWorkspace(s){clearTimeout(timer);rows=structuredClone(s.rows);params={...s.params};bounds=s.bounds.map(b=>[...b]);options={...options,...s.options};customScene=s.customScene!==false;currentPreset=presets.find(p=>p.id===s.preset)||presets[0];activeId=s.activeId||rows[0]?.id;canSaveScene=s.canSaveScene!==false;pendingPresentation=s;renderRows();$('parameters').replaceChildren();syncParameters();renderBounds();sceneInfo();renderPresets();for(const id of ['showBody','onlyBody','showWire','showGrid'])$(id).checked=options[id];for(const id of ['bodyColor','bodyOpacity','quality'])$(id).value=options[id];writePresentation(s.presentation);if(grid)grid.visible=options.showGrid;rebuildAxes();restoreCamera(s.camera);if(!s.camera)setView('iso');restyle();schedule(0);}
let sessionStore;try{sessionStore=sessionStorage;}catch{}
const session=enterWorkspace('3d',{storage:sessionStore,navigation:performance.getEntriesByType('navigation')[0]?.type||'navigate',historyState:history.state});
history.replaceState({...history.state,integralVisit:session.visit},'');
initUI();renderRows();syncParameters();renderBounds();sceneInfo();renderPresets();initThree();
if(session.restored?.state){applyWorkspace(session.restored.state);$('restoreButton').hidden=true;}else generate();
workspace=connectWorkspace({dimension:'3d',getState:captureWorkspace,applyState:applyWorkspace,restored:session.restored});bindDimensionNavigation(session,workspace);
controls?.addEventListener('end',()=>workspace.refresh());
// Small, read-only diagnostics for browser verification.
window.integralSpace={getState:()=>({rows:JSON.parse(JSON.stringify(rows)),params:{...params},bounds:bounds.map(b=>[...b]),options:{...options},result:lastResult?{errors:lastResult.errors,surfaces:lastResult.surfaces.map(s=>({id:s.id,vertices:s.positions.length/3})),body:lastResult.body?{volume:lastResult.body.volume,touches:lastResult.body.touches,count:lastResult.body.count}:null}:null})};
