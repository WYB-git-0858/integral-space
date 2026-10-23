import {compileExpression,compileSurface,normalize} from './engine.mjs';
export const geometryKey=({rows,params,bounds,n})=>JSON.stringify([rows.filter(r=>r.visible&&r.expr.trim()).map(r=>[r.id,r.expr,r.side]),params,bounds,n]);
// Translate the same restricted arithmetic grammar to vectorized NumPy code.
// Validate first, so identifiers can never inject Python source.
export function numpyExpression(raw){
  compileExpression(raw);
  const functions={sqrt:'sqrt',sin:'sin',cos:'cos',tan:'tan',asin:'arcsin',acos:'arccos',atan:'arctan',abs:'abs',exp:'exp',ln:'log',log:'log',log10:'log10',floor:'floor',ceil:'ceil',min:'minimum',max:'maximum',pow:'power'};
  const text=normalize(raw),tokens=[];let offset=0;
  while(offset<text.length){const s=text.slice(offset);let m;if(/^\s/.test(s)){offset++;continue;}if(m=s.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)){tokens.push({type:'num',value:Number(m[0])});offset+=m[0].length;continue;}if(m=s.match(/^[a-zA-Z_][a-zA-Z_0-9]*/)){const name=m[0];if(name.length>1&&/^[xyzabcRrh]+$/.test(name)&&!functions[name])for(const value of name)tokens.push({type:'id',value});else tokens.push({type:'id',value:name});offset+=name.length;continue;}tokens.push({type:text[offset],value:text[offset++]});}
  tokens.push({type:'end'});let i=0;
  function parse(min=0){let t=tokens[i++],left;
    if(t.type==='num'){if(!Number.isFinite(t.value))throw Error('公式中的数值超出有限实数范围');left=Number.isInteger(t.value)&&Math.abs(t.value)<1e21?t.value+'.0':String(t.value);}
    else if(t.type==='+'||t.type==='-')left='('+t.type+parse(25)+')';
    else if(t.type==='('){left=parse();i++;}
    else if(functions[t.value]){i++;const args=[parse()];while(tokens[i].type===','){i++;args.push(parse());}i++;left='np.'+functions[t.value]+'('+args.join(', ')+')';}
    else if(t.value==='pi'||t.value==='e')left='np.'+t.value;
    else if(['x','y','z'].includes(t.value))left=t.value;
    else left='parameters['+JSON.stringify(t.value)+']';
    while(true){let op=tokens[i].type,implicit=['num','id','('].includes(op);if(implicit)op='*';const prec=['+','-'].includes(op)?10:['*','/'].includes(op)?20:op==='^'?30:-1;if(prec<min)break;if(!implicit)i++;const right=parse(op==='^'?prec:prec+1);left=op==='^'?'np.power('+left+', '+right+')':'('+left+' '+op+' '+right+')';}
    return left;
  }
  return parse();
}
const palette=['#75c9aa','#83b7e5','#ce9edf','#e89187','#9dce77','#e5cf83','#8ed5dd','#df9bc1'];
function base64(bytes){let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(out);}
const quoted=s=>JSON.stringify(s);
function arrayCode(data,shape){const a=new Float64Array(data),bytes=new Uint8Array(a.buffer);return 'unpack(\n'+base64(bytes).match(/.{1,100}/g)?.map(s=>'    '+quoted(s)).join('\n')+'\n, '+quoted(shape)+')';}
export function buildPython({dimension,rows,params,bounds,options,result,selected='all',view=null,camera=null,title='自定义图形'}){
  if(!result||result.errors?.length)throw Error('请先生成没有公式错误的图像，再导出 Python');
  const visible=rows.filter(r=>r.visible&&r.expr.trim());if(!visible.length)throw Error('请先输入并生成至少一个可见函数');
  const meta={dimension,title,formulas:rows.filter(r=>r.expr.trim()).map(r=>({formula:r.expr,side:r.side,color:r.color,opacity:r.opacity,visible:r.visible})),parameters:params,bounds,options,selected};
  const metadata=base64(new TextEncoder().encode(JSON.stringify(meta)));
  let source=`# -*- coding: utf-8 -*-
"""积分空间：${dimension===3?'三维曲面与围成立体':'二维曲线与围成区域'}
安装依赖：python -m pip install numpy matplotlib
运行：python integral_space.py
保存图片：python integral_space.py --save graph.png --no-show

公式在下方以 NumPy 函数给出，可用来求值、研究边界。
绘图使用本次生成的网格快照，保留隐式曲面、裁剪边界、孔洞和颜色。
修改公式或参数不会改变快照；请在网站重新生成后再次导出。
面积、体积与几何均为数值近似，不是解析结论。
"""
import argparse
import base64
import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from matplotlib.colors import to_rgb
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

METADATA = json.loads(base64.b64decode(${quoted(metadata)}).decode("utf-8"))
PARAMETERS = METADATA["parameters"]
BOUNDS = np.asarray(METADATA["bounds"], dtype=float)

def unpack(encoded, shape):
    return np.frombuffer(base64.b64decode(encoded), dtype="<f8").reshape(shape)

def region_patch(loops, color, opacity):
    # A compound path avoids seams between the website's small triangles.
    # Orient holes opposite to their surrounding boundaries (nonzero fill).
    paths = []
    for i, points in enumerate(loops):
        depth = sum(Path(other).contains_point(points[0])
                    for j, other in enumerate(loops) if i != j)
        area = np.sum(points[:-1, 0] * points[1:, 1]
                      - points[1:, 0] * points[:-1, 1])
        if (area > 0) != (depth % 2 == 0):
            points = points[::-1]
        codes = np.full(len(points), Path.LINETO, dtype=np.uint8)
        codes[0], codes[-1] = Path.MOVETO, Path.CLOSEPOLY
        paths.append(Path(points, codes))
    return PathPatch(Path.make_compound_path(*paths), facecolor=color,
                     edgecolor="none", alpha=opacity)

`;
  for(const [i,row]of rows.filter(r=>r.expr.trim()).entries()){
    try{
    const c=compileSurface(dimension===2&&!/[=<>≤≥]/.test(row.expr)?'y='+row.expr:row.expr);
    source+=`# ${row.expr.replace(/[\r\n]/g,' ')} ; region side: ${row.side}\ndef function_${i+1}(x, y, z=0, parameters=None):\n    """F = left - right; the curve/surface satisfies F = 0."""\n    if parameters is None:\n        parameters = PARAMETERS\n    with np.errstate(all="ignore"):\n        return ${numpyExpression(c.lhs)} - (${numpyExpression(c.rhs)})\n\n`;
    }catch(e){if(row.visible)throw e;source+='# Hidden invalid formula omitted: '+row.expr.replace(/[\r\n]/g,' ')+'\n\n';}
  }
  source+=`def main():\n    parser = argparse.ArgumentParser(description="Integral Space plot snapshot")\n    parser.add_argument("--save", help="Save image, e.g. graph.png")\n    parser.add_argument("--no-show", action="store_true")\n    args = parser.parse_args()\n    fig = plt.figure(figsize=(10, 8), facecolor="#17322c")\n`;
  const body=dimension===3?result.body:null,regions=(dimension===3?body?.regions:result.regions)||[],chosen=regions.filter(r=>selected==='all'||String(r.index)===selected);
  const hasBody=dimension===3?!!body?.positions?.length:!!result.regions?.length;
  const showSurfaces=!(options.onlyBody&&options.showBody&&hasBody);
  if(dimension===3){source+=`    ax = fig.add_subplot(111, projection="3d", facecolor="#17322c")\n`;
    if(showSurfaces)for(const surface of result.surfaces){const row=visible.find(r=>r.id===surface.id);if(!row||!surface.positions.length)continue;source+=`    # ${row.expr.replace(/[\r\n]/g,' ')}\n    vertices = ${arrayCode(surface.positions,[-1,3,3]).replace(/\n/g,'\n    ')}\n    ax.add_collection3d(Poly3DCollection(vertices, facecolors=${quoted(row.color)}, alpha=${row.opacity}, edgecolors=${options.showWire?quoted(row.color):'"none"'}, linewidths=0.08))\n`;}
    if(options.showBody&&body?.positions?.length){const parts=regions.length?chosen:[{start:0,vertices:body.positions.length/3}];for(const r of parts){const data=body.positions.subarray(r.start*3,(r.start+r.vertices)*3);if(!data.length)continue;source+=`    # Closed region snapshot; same boundary mesh as the website.\n    vertices = ${arrayCode(data,[-1,3,3]).replace(/\n/g,'\n    ')}\n    ax.add_collection3d(Poly3DCollection(vertices, facecolors=${quoted(options.bodyColor)}, alpha=${options.bodyOpacity}, edgecolors="none"))\n`;}}
    source+=`    ax.set_xlim(*BOUNDS[0])\n    ax.set_ylim(*BOUNDS[1])\n    ax.set_zlim(*BOUNDS[2])\n    ax.set_box_aspect(np.ptp(BOUNDS, axis=1))\n    ax.set_zlabel("z", color="#9bbdd1")\n    ax.view_init(elev=${Number.isFinite(camera?.elev)?camera.elev:30}, azim=${Number.isFinite(camera?.azim)?camera.azim:-54})\n`;
  }else{source+=`    ax = fig.add_subplot(111, facecolor="#17322c")\n`;
    if(options.showBody)for(const r of chosen){if(!r.positions.length)continue;const color=r.index===0?options.bodyColor:palette[(r.index+2)%palette.length],span=Math.max(...r.bounds.map(b=>b[1]-b[0])),closed=r.loops?.length&&r.loops.every(p=>p.length>3&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<span*1e-7);if(closed){source+=`    # Closed contours preserve holes without triangle seams.\n    loops = [\n${r.loops.map(loop=>'        '+arrayCode(loop.flat(),[-1,2]).replace(/\n/g,'\n        ')).join(',\n')}\n    ]\n    ax.add_patch(region_patch(loops, ${quoted(color)}, ${options.bodyOpacity}))\n`;}else source+=`    triangles = ${arrayCode(r.positions,[-1,3,2]).replace(/\n/g,'\n    ')}\n    color = np.asarray(to_rgb(${quoted(color)})) * ${options.bodyOpacity} + np.asarray(to_rgb("#17322c")) * ${1-options.bodyOpacity}\n    ax.add_collection(PolyCollection(triangles, facecolors=color, edgecolors="none", antialiaseds=False))\n`;}
    if(showSurfaces)for(const curve of result.curves){const row=visible.find(r=>r.id===curve.id);if(!row||!curve.segments.length)continue;const flat=curve.segments.flat(2);source+=`    # ${row.expr.replace(/[\r\n]/g,' ')}\n    segments = ${arrayCode(flat,[-1,2,2]).replace(/\n/g,'\n    ')}\n    ax.add_collection(LineCollection(segments, colors=${quoted(row.color)}, alpha=${row.opacity}, linewidths=1.8))\n`;}
    else for(const r of chosen)for(const row of visible){const edges=r.boundary.filter(e=>result.curves[e.source]?.id===row.id);if(!edges.length)continue;source+=`    segments = ${arrayCode(edges.flatMap(e=>[...e.a,...e.b]),[-1,2,2]).replace(/\n/g,'\n    ')}\n    ax.add_collection(LineCollection(segments, colors=${quoted(row.color)}, linewidths=1.8))\n`;}
    if(options.showPoints&&result.points?.length)source+=`    points = np.asarray(${JSON.stringify(result.points.map(p=>p.p))})\n    ax.scatter(points[:, 0], points[:, 1], color="#ffe0a0", s=18, zorder=5)\n`;
    source+=`    ax.set_xlim(${(view||bounds)[0].join(', ')})\n    ax.set_ylim(${(view||bounds)[1].join(', ')})\n    ax.set_aspect("equal", adjustable="box")\n    ax.axhline(0, color="#94c295", linewidth=0.6, alpha=0.5)\n    ax.axvline(0, color="#ce9b8b", linewidth=0.6, alpha=0.5)\n`;
  }
  const labels=visible.map(row=>row.expr.replace(/\$/g,''));
  source+=`    ax.set_xlabel("x", color="#d4a99a")\n    ax.set_ylabel("y", color="#a7cb9c")\n    ax.tick_params(colors="#b4cbbd")\n    ax.grid(${options.showGrid?'True':'False'}, alpha=0.2)\n    ax.set_title(${quoted((dimension===3?'3D':'2D')+' / '+labels.join(' ; '))}, color="#d9e8dc", fontsize=11, pad=16)\n    fig.tight_layout()\n    if args.save:\n        fig.savefig(args.save, dpi=180, facecolor=fig.get_facecolor())\n        print("Saved:", args.save)\n    if not args.no_show:\n        plt.show()\n    else:\n        plt.close(fig)\n\nif __name__ == "__main__":\n    main()\n`;
  return source;
}
export function downloadPython(data){const source=buildPython(data),blob=new Blob([source],{type:'text/x-python;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='integral_space_'+data.dimension+'d.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
