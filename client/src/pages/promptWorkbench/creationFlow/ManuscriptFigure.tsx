import type { ReactNode } from "react";

const paper = "var(--atlas-stock)";
const ink = "var(--atlas-ink)";
const tint = "var(--atlas-tint)";
const proof = "var(--atlas-proof)";

function Leaf({ x, y, w = 42, h = 50, fill = paper, children }: {
  x: number; y: number; w?: number; h?: number; fill?: string; children?: ReactNode;
}) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={w} height={h} rx="1.5" fill={fill} />{children}
  </g>;
}
function Lines({ x = 6, y = 10, w = 28, rows = 4 }: { x?: number; y?: number; w?: number; rows?: number }) {
  return <g opacity=".63">{Array.from({ length: rows }, (_, i) =>
    <path key={i} d={`M ${x} ${y + i * 6} h ${i === rows - 1 ? w * 0.62 : w}`} />)}</g>;
}
function Letter({ x, y, children, size = 13, color = ink }: {
  x: number; y: number; children: ReactNode; size?: number; color?: string;
}) {
  return <text x={x} y={y} fill={color} stroke="none" fontFamily="Georgia, 'Songti SC', SimSun, serif" fontSize={size} textAnchor="middle">{children}</text>;
}
const tick = <path d="m0 5 5 5L16 -3" fill="none" stroke={proof} strokeWidth="3" />;
function Folios({ checked = false }: { checked?: boolean }) {
  return <><Leaf x={55} y={9} fill={tint} /><Leaf x={49} y={14} /><Leaf x={43} y={19}>
    <path d="M6 10h17" strokeWidth="3" /><Lines y={20} /></Leaf>
    {checked && <g transform="translate(90 42)">{tick}</g>}</>;
}
function FigureDrawing({ id }: { id: string }) {
  switch (id) {
    case "idea": return <><g transform="rotate(-6 72 39)"><Leaf x={42} y={14} w={58} h={49}><Lines w={39} y={16} /></Leaf></g>
      <g transform="rotate(32 98 32)"><path d="M94 6h6v41l-3 9-3-9Z" fill={tint} /><path d="M94 12h6m-5 35h4" /></g></>;
    case "directions": return <><circle cx="26" cy="40" r="6" fill={ink} /><path d="M32 40h16c16 0 12-21 30-21h18m-48 21c16 0 12 21 30 21h18" strokeWidth="2" />
      <Leaf x={96} y={8} w={32} h={22} fill={tint}><Letter x={16} y={16}>A</Letter></Leaf>
      <Leaf x={96} y={50} w={32} h={22}><Letter x={16} y={16}>B</Letter></Leaf></>;
    case "candidates": return <><g transform="rotate(-8 56 40)"><Leaf x={31} y={17} w={43} h={48} fill={tint}><Letter x={11} y={15}>A</Letter><Lines y={24} /></Leaf></g>
      <g transform="rotate(5 97 39)"><Leaf x={78} y={11} w={46} h={52}><Letter x={12} y={17}>B</Letter><Lines y={26} w={32} /></Leaf></g></>;
    case "titles": return <><Leaf x={29} y={13} w={86} h={16} fill={tint}><Lines x={7} y={8} w={66} rows={1} /></Leaf>
      <Leaf x={39} y={32} w={90} h={20}><Letter x={45} y={15}>书　名</Letter></Leaf><path d="M33 60h72m-72 4h43" opacity=".5" /></>;
    case "choose": return <><Leaf x={44} y={14} w={69} h={52}><path d="M7 0v52M17 16h33m-33 7h24" /></Leaf>
      <path d="M94 12h10v24l-5-4-5 4Z" fill={ink} /><g transform="translate(72 47)">{tick}</g></>;
    case "story": return <><path d="M20 62h119" opacity=".35" /><path d="M22 56c12 0 15-24 29-24s14 16 25 12 20-28 33-28 15 7 25 2" strokeWidth="2.6" />
      {[[22,56],[51,32],[76,44],[109,16],[134,18]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="3.5" fill={paper} />)}</>;
    case "contract": return <><Leaf x={49} y={9} w={57} h={60}><Lines x={9} y={13} w={39} rows={5} /></Leaf>
      <circle cx="102" cy="55" r="11" fill={tint} /><g transform="translate(96 52) scale(.65)">{tick}</g></>;
    case "world": return <><path d="m22 22 38-10 38 12 37-10v43l-37 11-38-12-38 10Z" fill={tint} /><path d="M60 12v44m38-32v44" />
      <path d="m27 49 15-16 11 9 15-16 16 17 10-9m7 19 12-13 12 6" fill="none" /><circle cx="112" cy="29" r="3" fill={proof} stroke="none" /></>;
    case "cast": return <><path d="m35 53 42-32 42 30-43 12Zm42-32-1 42M35 53l84-2" />
      {[[35,53,8],[77,21,12],[119,51,9],[76,63,6]].map(([x,y,r], i) => <circle key={x} cx={x} cy={y} r={r} fill={i === 1 ? ink : tint} />)}</>;
    case "strategy": return <><path d="M22 57h31V42h37V25h44" strokeWidth="2.5" />
      {[30,64,102].map((x,i) => <g key={x} transform={`translate(${x} ${50-i*16})`}><path d="M0 0v-15l15 3-15 5" fill={tint} /></g>)}</>;
    case "critique": case "review": case "check-mission": return <><Leaf x={42} y={11} w={61} h={56}><Lines y={13} w={43} rows={6} /></Leaf>
      <path d="M53 33q6-4 12 0t12 0m26-2 14-8h12" stroke={proof} /><g transform="translate(104 48)">{tick}</g></>;
    case "skeleton": return <>{[0,1,2].map((i) => <g key={i} transform={`translate(${38+i*27} ${15-i%2*4})`}>
      <rect width="22" height="51" rx="2" fill={i===1 ? tint : paper} /><path d="M4 0v51m3-8h11" /><Letter x={13} y={23} size={10}>{["I","II","III"][i]}</Letter></g>)}</>;
    case "beats": return <><path d="M20 58h121" opacity=".4" /><path d="m22 51 17-12 15 5 19-24 14 13 25-19 21 12" strokeWidth="2.5" />
      {[39,73,112].map((x,i) => <g key={x}><path d={`M${x} ${[39,20,14][i]}V58`} strokeDasharray="2 4" /><circle cx={x} cy={[39,20,14][i]} r="4" fill={tint} /></g>)}</>;
    case "chapter-list": return <><Leaf x={38} y={10} w={77} h={59}>{[0,1,2].map(i => <g key={i} transform={`translate(9 ${10+i*16})`}><rect width="9" height="9" fill={tint} /><path d="M16 3h39m-39 5h24" /></g>)}</Leaf></>;
    case "mission": return <>{[0,1,2].map(i => <g key={i} transform={`translate(${23+i*36} ${16+i*3})`}><rect width="32" height="40" fill={i===1?tint:paper} /><path d="M4 8h15m-15 23h23" /><Letter x={16} y={24}>{i+1}</Letter></g>)}</>;
    case "sync": return <><Leaf x={28} y={14} w={39}><Lines w={25} /></Leaf><Leaf x={94} y={17} w={40} fill={tint}><Lines w={26} /></Leaf>
      <path d="M58 42h41m-7-7 7 7-7 7" strokeWidth="2.4" /></>;
    case "materials": return <><path d="M26 26h32l6 6h62v29H26Z" fill={tint} /><Leaf x={50} y={10} w={49} h={40}><Lines w={32} /></Leaf><path d="M29 38h106l-10 26H22Z" fill={tint} /></>;
    case "draft": return <><Leaf x={37} y={12} w={75} h={58}><Letter x={20} y={20} size={15}>章</Letter><Lines x={12} y={30} w={50} /></Leaf>
      <path d="m97 44 25-27 5 5-25 27-9 3Z" fill={tint} /></>;
    case "save": return <Folios checked />;
    case "extract": return <><Leaf x={22} y={18} w={46} h={45}><Lines y={12} /></Leaf><path d="M68 41h12m0-20v39m0-39h20m-20 20h20m-20 19h20" />
      {[16,36,55].map(y=><rect key={y} x="100" y={y} width="30" height="10" rx="2" fill={tint} />)}</>;
    case "finish": return <><path d="M19 24c21-8 40-6 60 4 21-10 40-12 62-4v37c-20-5-40-4-62 6-20-9-40-11-60-6Z" fill={tint} />
      <path d="M22 19c21-7 38-5 57 5 20-10 38-12 59-5v36c-21-4-39-2-59 7-21-9-37-11-57-7Z" fill={paper} /><path d="M79 24v38m-47-32q17-4 36 3m-36 5q17-4 36 3m22-8q18-7 35-4m-35 12q18-7 35-4" /><path d="M109 16v22l5-5 5 2V14" fill={proof} stroke="none" /></>;
    default: return <Folios />;
  }
}

export function ManuscriptFigure({ id }: { id: string }) {
  return <svg viewBox="0 0 160 80" aria-hidden="true" focusable="false" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <FigureDrawing id={id} />
  </svg>;
}
