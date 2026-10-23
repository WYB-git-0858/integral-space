const p=(id,name,tag,formulas,bounds=[[-3,3],[-3,3]],params={},hint='拖动平移、滚轮缩放；切换积分次序，对照区域和截线。')=>({id,name,tag,formulas:formulas.map(f=>typeof f==='string'?[f,'auto']:f),bounds,params,hint,category:formulas.every(f=>Array.isArray(f)&&f[1]==='none')?'常见曲线':'积分区域'});
export const planePresets=[
 p('disk','圆盘','x² + y² ≤ R²',['x^2+y^2=R^2'],[[-2.6,2.6],[-2.6,2.6]],{R:2},'直角坐标：−R≤x≤R，−√(R²−x²)≤y≤√(R²−x²)。极坐标：0≤r≤R，0≤θ≤2π。'),
 p('ellipse','椭圆区域','x²/a² + y²/b² = 1',['x^2/a^2+y^2/b^2=1'],[[-3,3],[-2.5,2.5]],{a:2,b:1}),
 p('parabola','抛物线','y = ax²',[['y=a*x^2','none']],undefined,{a:1}),
 p('line','直线','y = ax + b',[['y=a*x+b','none']],undefined,{a:1,b:0}),
 p('sine','正弦曲线','y = a sin(bx)',[['y=a*sin(b*x)','none']],[[-7,7],[-2,2]],{a:1,b:1}),
 p('hyperbola','双曲线','xy = a',[['xy=a','none']],undefined,{a:1}),
 p('exponential','指数曲线','y = eˣ',[['y=exp(x)','none']],[[-3,2],[-1,5]]),
 p('logarithm','对数曲线','y = ln x',[['y=ln(x)','none']],[[-.5,5],[-3,2]]),
 p('lens','抛物线与直线','x² ≤ y ≤ x',['y=x^2','y=x'],[[-.3,1.4],[-.3,1.4]],{},'先 dy：0≤x≤1，x²≤y≤x。先 dx：0≤y≤1，y≤x≤√y。'),
 p('triangle','三角形','x≥0, y≥0, x+y≤a',[['x=0','ge'],['y=0','ge'],['x+y=a','le']],[[-.5,2.7],[-.5,2.7]],{a:2},'a>0 时：0≤x≤a，0≤y≤a−x；交换 x、y 得另一种积分次序。'),
 p('quarter','四分之一圆','第一象限的圆盘',[['x^2+y^2=R^2','le'],['x=0','ge'],['y=0','ge']],[[-.5,2.6],[-.5,2.6]],{R:2}),
 p('annulus','圆环','r² ≤ x²+y² ≤ R²',[['x^2+y^2=R^2','le'],['x^2+y^2=r^2','ge']],[[-2.6,2.6],[-2.6,2.6]],{R:2,r:1},'0<r<R 时圆环有一个孔。直角坐标截线可能分成两段；极坐标为 r≤ρ≤R，0≤θ≤2π。'),
 p('rectangle','矩形','0≤x≤a, 0≤y≤b',[['x=0','ge'],['x=a','le'],['y=0','ge'],['y=b','le']],[[-.5,3.5],[-.5,2.5]],{a:3,b:2}),
 p('two-parabolas','两条抛物线','x² ≤ y ≤ 2−x²',['y=x^2','y=2-x^2'],[[-1.5,1.5],[-.5,2.5]],{},'−1≤x≤1，x²≤y≤2−x²。换序时以 y=1 分段。'),
 p('side-parabolas','互为反函数的抛物线','y = x², x = y²',['y=x^2','x=y^2'],[[-.4,1.5],[-.4,1.5]],{},'第一象限：0≤x≤1，x²≤y≤√x。'),
 p('circle-cap','圆弓形','单位圆与 y = h',[['x^2+y^2=1','le'],['y=h','ge']],[[-1.5,1.5],[-1.3,1.5]],{h:.3}),
 p('two-circles','两圆公共区域','两个圆盘的交集',[['x^2+y^2=1','le'],['(x-a)^2+y^2=1','le']],[[-1.4,2.5],[-1.5,1.5]],{a:1}),
 p('cubic','三次曲线','y = x³',[['y=x^3','none']]),
 p('absolute','绝对值','y = |x|',[['y=abs(x)','none']]),
 p('sine-area','正弦下的区域','0≤x≤π, 0≤y≤sin x',[['y=sin(x)','ge'],['y=0','ge'],['x=0','ge'],['x=pi','le']],[[-.5,3.7],[-.4,1.5]])
];
// y ≤ sin x for the upper boundary of the last region.
planePresets.at(-1).formulas[0][1]='le';
