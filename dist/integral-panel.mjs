import {integrationModel,coordinateContext} from './coordinates.mjs';
import {asciiLatex,latexMarkup} from './formula.mjs';
const $=id=>document.getElementById(id),math=s=>latexMarkup(asciiLatex(s));
export function wireCoordinates(refresh){
  $('coordinateSystem').onchange=()=>{const model=coordinateContext($('coordinateSystem').value);$('integralOrder').replaceChildren(...model.orders.map(o=>{const el=document.createElement('option');el.value=o.value;el.textContent=o.label;return el;}));refresh();};
  $('integrandMode').onchange=refresh;
}
export function renderCoordinates(context){
  const system=$('coordinateSystem').value,model=integrationModel({...context,system,order:$('integralOrder').value}),details=$('coordinateDetails');details.hidden=system==='cartesian';
  if(system==='cartesian')return false;
  $('coordinateMapping').replaceChildren(...Object.entries(model.mapping).map(([k,v])=>{const el=document.createElement('div');el.innerHTML=math(k+'='+v);return el;}));
  const differential=[...model.order].map(k=>'\\,d'+asciiLatex(model.variables[k])).join('');
  $('volumeElement').innerHTML=latexMarkup('dV = '+asciiLatex(model.jacobian)+differential);
  $('coordinateConvention').textContent=model.convention+' 这是坐标取值约定，实际积分范围由区域决定。'+model.aliases.join('；');
  const integrand=($('integrandMode').value==='general'?'f\\!\\left('+Object.values(model.mapping).map(asciiLatex).join(',')+'\\right)\\,':'')+asciiLatex(model.jacobian);
  let template=model.ranges?[...model.order].reverse().map(k=>'\\int_{'+asciiLatex(model.ranges[k].lower)+'}^{'+asciiLatex(model.ranges[k].upper)+'}').join(''):'\\iiint_{\\Omega\u2032}';
  $('integralTemplate').innerHTML=latexMarkup('\\displaystyle '+template+' '+integrand+differential);
  $('coordinateRanges').replaceChildren();if(model.ranges)for(const k of [...model.order].reverse()){const v=model.variables[k],r=model.ranges[k],el=document.createElement('div');el.className='coordinate-range';el.innerHTML=math(r.lower+'<='+v+'<='+r.upper);$('coordinateRanges').append(el);}
  $('rangeCaption').textContent=model.known?'当前次序可直接使用的积分限'+(model.conditions?'（'+model.conditions+'）':''):'换元后的积分形式（Ω′ 的边界由下方约束确定）';
  $('boundaryList').replaceChildren(...model.constraints.map(c=>{const el=document.createElement('div');el.className='boundary-expression coordinate-constraint';el.innerHTML=math(c.left+(c.side==='le'?'<=':'>=')+c.right);return el;}));
  $('integralHint').textContent=(model.known?'体积取 f=1；积分其他函数时，需要同时代入换元关系并乘上雅可比因子。':'')+model.note+(context.region?' 面积、体积与屏幕几何仍为数值近似。':'');
  if(context.multiple)$('integralHint').textContent+=' 当前列出第一个区域的边界；请选择单一区域逐个核对。';
  return true;
}
