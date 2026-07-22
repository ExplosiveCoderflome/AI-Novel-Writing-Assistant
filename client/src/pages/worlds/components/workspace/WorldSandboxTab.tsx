import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface LocationNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  temp: number;
  tension: number;
  weather: string;
  flora: number;
}

interface Character {
  id: string;
  name: string;
  locationId: string;
  hunger: number;
  energy: number;
  sanity: number;
  stress: number;
}

export default function WorldSandboxTab({ worldId }: { worldId: string }) {
  // Simulator State
  const [isPlaying, setIsPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const [pacing, setPacing] = useState<"normal" | "micro" | "macro">("normal");
  
  // Custom Property Forms
  const [newPropName, setNewPropName] = useState("");
  const [newPropLabel, setNewPropLabel] = useState("");
  const [newPropType, setNewPropType] = useState<"number" | "string" | "boolean">("number");
  const [schemas, setSchemas] = useState<any[]>([]);

  // Selected details
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);

  // Mock initial sandbox data
  const [locations, setLocations] = useState<LocationNode[]>([
    { id: "loc_1", name: "荣国府正堂", latitude: 39.9, longitude: 116.4, elevation: 50, temp: 24, tension: 35, weather: "晴", flora: 0.4 },
    { id: "loc_2", name: "潇湘馆竹林", latitude: 39.91, longitude: 116.39, elevation: 48, temp: 22, tension: 20, weather: "微风", flora: 0.9 },
    { id: "loc_3", name: "蘅芜苑花厅", latitude: 39.89, longitude: 116.41, elevation: 52, temp: 23, tension: 25, weather: "晴", flora: 0.75 },
    { id: "loc_4", name: "大观园假山", latitude: 39.92, longitude: 116.42, elevation: 85, temp: 19, tension: 80, weather: "阴", flora: 0.2 }
  ]);

  const [characters, setCharacters] = useState<Character[]>([
    { id: "char_1", name: "林黛玉", locationId: "loc_2", hunger: 20, energy: 75, sanity: 85, stress: 3 },
    { id: "char_2", name: "贾宝玉", locationId: "loc_1", hunger: 15, energy: 80, sanity: 90, stress: 2 },
    { id: "char_3", name: "薛宝钗", locationId: "loc_3", hunger: 10, energy: 85, sanity: 95, stress: 2 },
    { id: "char_4", name: "焦大", locationId: "loc_4", hunger: 60, energy: 15, sanity: 25, stress: 8 }
  ]);

  // SVG dimensions
  const width = 600;
  const height = 400;
  const padding = 50;

  // Lat / Lng boundaries
  const latMin = 39.88;
  const latMax = 39.93;
  const lngMin = 116.38;
  const lngMax = 116.43;

  // Project Lat/Lng to Screen coordinate
  const projectX = (lng: number) => {
    return padding + ((lng - lngMin) / (lngMax - lngMin)) * (width - 2 * padding);
  };
  const projectY = (lat: number) => {
    return padding + (1 - (lat - latMin) / (latMax - latMin)) * (height - 2 * padding);
  };

  // VCR Simulation tick hook
  const runBackendTick = async (currentTick: number) => {
    try {
      const res = await fetch(`/api/worlds/${worldId}/sandbox/tick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tickIndex: currentTick,
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setLocations(result.data.locations);
        setCharacters(result.data.characters);
        if (result.data.events && result.data.events.length > 0) {
          result.data.events.forEach((evt: string) => {
            toast.success(`事件: ${evt}`);
          });
        }
        return true;
      }
    } catch (e) {
      console.error("Failed to run tick on backend", e);
    }
    return false;
  };

  // VCR Simulation tick hook
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(async () => {
        const nextTick = tick + 1;
        const success = await runBackendTick(tick);
        if (success) {
          setTick(nextTick);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, tick, worldId]);

  // Fetch schema lists on load
  const loadSchemas = async () => {
    try {
      const res = await fetch(`/api/worlds/${worldId}/sandbox/schema`);
      const payload = await res.json();
      if (payload.success) {
        setSchemas(payload.data);
      }
    } catch {
      // Offline mock fallback
    }
  };

  useEffect(() => {
    loadSchemas();
  }, [worldId]);

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropName || !newPropLabel) return;
    
    try {
      const res = await fetch(`/api/worlds/${worldId}/sandbox/schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "character",
          propertyName: newPropName,
          propertyLabel: newPropLabel,
          dataType: newPropType,
          description: "Custom sandbox attribute"
        })
      });
      const payload = await res.json();
      if (payload.success) {
        toast.success("自定义属性架构注册成功");
        setNewPropName("");
        setNewPropLabel("");
        loadSchemas();
      } else {
        toast.error(payload.error || "注册失败");
      }
    } catch {
      toast.success("注册成功（离线模拟）");
      setSchemas(prev => [...prev, { propertyName: newPropName, propertyLabel: newPropLabel, dataType: newPropType }]);
      setNewPropName("");
      setNewPropLabel("");
    }
  };

  const handleGodOverride = (nodeId: string, tempChange: number, tension: number) => {
    if (isPlaying) {
      toast.error("必须暂停沙盒模拟后才能直接干预物理环境");
      return;
    }
    setLocations(prev =>
      prev.map(loc => (loc.id === nodeId ? { ...loc, temp: loc.temp + tempChange, tension } : loc))
    );
    toast.success("上帝参数干预完成");
  };

  const selectedNode = locations.find(n => n.id === selectedNodeId);
  const selectedChar = characters.find(c => c.id === selectedCharId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Visual Map and VCR controls */}
      <div className="space-y-6 lg:col-span-2">
        <Card className="overflow-hidden bg-slate-950 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800">
            <CardTitle className="text-lg font-bold">🌍 世界沙盘物理生态仿真板</CardTitle>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-800 px-2.5 py-1 text-xs font-mono">Tick: {tick}</span>
              <span className="rounded bg-indigo-900 px-2 py-0.5 text-xs text-indigo-200">
                Pacing: {pacing.toUpperCase()}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* SVG Visual Sandtable */}
            <div className="relative aspect-[3/2] w-full bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
                {/* Connection links */}
                <line x1={projectX(116.4)} y1={projectY(39.9)} x2={projectX(116.39)} y2={projectY(39.91)} stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />
                <line x1={projectX(116.39)} y1={projectY(39.91)} x2={projectX(116.42)} y2={projectY(39.92)} stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />
                <line x1={projectX(116.4)} y1={projectY(39.9)} x2={projectX(116.41)} y2={projectY(39.89)} stroke="#475569" strokeWidth="2" strokeDasharray="4 4" />
                
                {/* Location Nodes */}
                {locations.map(loc => {
                  const x = projectX(loc.longitude);
                  const y = projectY(loc.latitude);
                  const isSelected = selectedNodeId === loc.id;
                  
                  // Heat/tension color representation (low = blue, high = red)
                  const nodeColor = loc.tension >= 75 ? "#ef4444" : loc.temp > 22 ? "#f59e0b" : "#3b82f6";
                  
                  return (
                    <g key={loc.id} className="cursor-pointer" onClick={() => setSelectedNodeId(loc.id)}>
                      <circle
                        cx={x}
                        cy={y}
                        r={16 + loc.elevation * 0.05}
                        fill={nodeColor}
                        fillOpacity="0.25"
                        stroke={isSelected ? "#ffffff" : nodeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                        className="transition-all hover:fill-opacity-50"
                      />
                      <circle cx={x} cy={y} r="5" fill={nodeColor} />
                      <text
                        x={x}
                        y={y - 22}
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize="11"
                        fontWeight="semibold"
                        className="pointer-events-none select-none drop-shadow-md"
                      >
                        {loc.name}
                      </text>
                      <text
                        x={x}
                        y={y + 26}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="9"
                        className="pointer-events-none select-none font-mono"
                      >
                        {loc.temp}℃ / {loc.weather}
                      </text>
                    </g>
                  );
                })}

                {/* Character markers */}
                {characters.map(char => {
                  const loc = locations.find(l => l.id === char.locationId);
                  if (!loc) return null;
                  const x = projectX(loc.longitude) + (Math.random() * 20 - 10);
                  const y = projectY(loc.latitude) + (Math.random() * 20 - 10);
                  
                  return (
                    <g key={char.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedCharId(char.id); }}>
                      <circle
                        cx={x}
                        cy={y}
                        r="6"
                        fill="#ec4899"
                        stroke="#ffffff"
                        strokeWidth="1"
                        className="animate-pulse"
                      />
                      <text
                        x={x + 8}
                        y={y + 3}
                        fill="#f472b6"
                        fontSize="9"
                        fontWeight="bold"
                        className="pointer-events-none select-none font-sans"
                      >
                        {char.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Simulation controls (VCR Panel) */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={isPlaying ? "destructive" : "default"}
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-24 font-semibold"
                >
                  {isPlaying ? "⏸ 暂停" : "▶ 启动模拟"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPlaying}
                  onClick={async () => {
                    const success = await runBackendTick(tick);
                    if (success) {
                      setTick(prev => prev + 1);
                      toast.success("单步步进 (1 Tick) 成功");
                    } else {
                      toast.error("单步步进失败");
                    }
                  }}
                >
                  ⏭ 单步进
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">时间流速换挡:</span>
                <div className="flex rounded-md bg-slate-800 p-0.5">
                  <Button
                    variant={pacing === "micro" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPacing("micro")}
                  >
                    微观 (1t)
                  </Button>
                  <Button
                    variant={pacing === "normal" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPacing("normal")}
                  >
                    标准 (6t)
                  </Button>
                  <Button
                    variant={pacing === "macro" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPacing("macro")}
                  >
                    宏观 (24t)
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control panel and inspector card */}
      <div className="space-y-6">
        {/* God Intervention Inspector */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-400">🔍 局部物理与上帝干预</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedNode ? (
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-200">{selectedNode.name}</h4>
                  <p className="text-xs text-slate-400">海拔高度: {selectedNode.elevation}m | 实时温度: {selectedNode.temp}℃</p>
                </div>
                <div className="rounded-md bg-slate-950 p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span>地表植被度:</span>
                    <span className="font-mono text-emerald-400">{(selectedNode.flora * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>局部剧情张力:</span>
                    <span className={`font-mono ${selectedNode.tension >= 70 ? 'text-red-400' : 'text-slate-300'}`}>
                      {selectedNode.tension} / 100
                    </span>
                  </div>
                </div>
                
                {/* God-Mode override actions */}
                <div className="pt-2 space-y-2">
                  <label className="text-xs text-slate-400 font-semibold">上帝维度强干预 (仅暂停时生效)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-slate-300 border-slate-700 hover:bg-slate-800"
                      onClick={() => handleGodOverride(selectedNode.id, 5, selectedNode.tension)}
                    >
                      🌡 局部升温 (+5℃)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-slate-300 border-slate-700 hover:bg-slate-800"
                      onClick={() => handleGodOverride(selectedNode.id, -5, selectedNode.tension)}
                    >
                      ❄ 局部降温 (-5℃)
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="col-span-2 text-xs"
                      onClick={() => handleGodOverride(selectedNode.id, 0, 90)}
                    >
                      💥 激化冲突 (引爆张力)
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">在地图上点击节点进行查看和物理修改。</p>
            )}
          </CardContent>
        </Card>

        {/* Character Inspector */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-400">👤 人物 Agent 实时属性</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedChar ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-pink-400">{selectedChar.name}</h4>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">LOD 2 (行为树)</span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span>体力 (Energy):</span>
                    <span>{selectedChar.energy} / 100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>饥饿度 (Hunger):</span>
                    <span>{selectedChar.hunger} / 100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>心智理智 (Sanity):</span>
                    <span>{selectedChar.sanity} / 100</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">在地图上选择粉色人物标记检视状态。</p>
            )}
          </CardContent>
        </Card>

        {/* Custom Property Registry Schema Form */}
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-400">⚙️ 世界模型自定义属性注册</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProperty} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">属性代码 (英文标识)</label>
                <Input
                  id="propName"
                  value={newPropName}
                  onChange={e => setNewPropName(e.target.value)}
                  placeholder="e.g., martialPower, wealth"
                  className="h-8 bg-slate-950 border-slate-800 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400">属性标签 (显示名称)</label>
                <Input
                  id="propLabel"
                  value={newPropLabel}
                  onChange={e => setNewPropLabel(e.target.value)}
                  placeholder="e.g., 战力, 财富值"
                  className="h-8 bg-slate-950 border-slate-800 text-xs mt-1"
                />
              </div>
              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-400">数据类型</label>
                  <select
                    value={newPropType}
                    onChange={e => setNewPropType(e.target.value as any)}
                    className="block w-full h-8 px-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-slate-300 mt-1"
                  >
                    <option value="number">数字 (Number)</option>
                    <option value="string">文本 (String)</option>
                    <option value="boolean">布尔 (Boolean)</option>
                  </select>
                </div>
                <Button type="submit" size="sm" className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-xs">
                  + 注册架构
                </Button>
              </div>
            </form>
            
            {/* List of custom properties */}
            {schemas.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5">
                <label className="text-xs text-slate-500 font-semibold">已注册属性：</label>
                {schemas.map(s => (
                  <div key={s.propertyName} className="flex justify-between items-center text-xs bg-slate-950 px-2 py-1 rounded">
                    <span>{s.propertyLabel} ({s.propertyName})</span>
                    <span className="text-slate-400 font-mono text-[10px]">{s.dataType}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
