import {writeFileSync,mkdirSync} from 'node:fs';
import {computePlane} from '../dist/plane-engine.mjs';
import {planePresets} from '../dist/plane-presets.mjs';
mkdirSync(new URL('../dist/previews2d/',import.meta.url),{recursive:true});
for(const p of planePresets){const r=computePlane(p.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true})),p.params,p.bounds,90),w=280,h=160,b=p.bounds,s=Math.min((w-32)/(b[0][1]-b[0][0]),(h-24)/(b[1][1]-b[1][0])),xy=q=>[(w/2+(q[0]-(b[0][0]+b[0][1])/2)*s).toFixed(2),(h/2-(q[1]-(b[1][0]+b[1][1])/2)*s).toFixed(2)],path=q=>'M'+q.map(x=>xy(x).join(',')).join('L');let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160" viewBox="0 0 280 160"><rect width="280" height="160" fill="#19352e"/><g stroke="#567a6355" stroke-width=".6"><path d="${path([[b[0][0],0],[b[0][1],0]])}"/><path d="${path([[0,b[1][0]],[0,b[1][1]]])}"/></g>`;
  for(const reg of r.regions){let d='';for(let i=0;i<reg.positions.length;i+=6)d+=path([[reg.positions[i],reg.positions[i+1]],[reg.positions[i+2],reg.positions[i+3]],[reg.positions[i+4],reg.positions[i+5]]])+'Z';svg+=`<path d="${d}" fill="#c9ab6b" opacity=".5"/>`;}
  for(const [i,c]of r.curves.entries())svg+=`<path d="${c.segments.map(s=>path(s)).join('')}" fill="none" stroke="${['#9ad8b6','#8abde8','#dbaedb','#e1a69c'][i%4]}" stroke-width="1.5"/>`;svg+='</svg>';writeFileSync(new URL('../dist/previews2d/'+p.id+'.svg',import.meta.url),svg);console.log(p.id);
}
