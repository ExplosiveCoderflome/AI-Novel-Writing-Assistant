import {useMemo, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {getCharacterRelations} from "@/api/novel";
import {getCharacterDynamicsOverview} from "@/api/novelCharacterDynamics";
import {queryKeys} from "@/api/queryKeys";
import {CharacterRelationshipGraphPanel, buildRelationshipGraphModel, type RelationshipGraphMode} from "@/pages/novels/components/characterWorkspace/relationshipGraph";
import type {WorkspaceBook} from "../model";

export function CharacterGraphView({book, preview=false, onOpenCharacter}: {book:WorkspaceBook; preview?:boolean; onOpenCharacter:(id:string)=>void}) {
  const novelId = book.novel.id;
  const [mode, setMode] = useState<RelationshipGraphMode>("all");
  const [selectedId, setSelectedId] = useState("");
  const relations = useQuery({queryKey:queryKeys.novels.characterRelations(novelId),
    queryFn:async()=>{
      const response = await getCharacterRelations(novelId);
      if (!response.success || !Array.isArray(response.data)) throw new Error("本书关系资料未能读取。");
      return response;
    }, enabled:!preview && Boolean(novelId),
    staleTime:5_000, refetchInterval:15_000});
  const dynamics = useQuery({queryKey:queryKeys.novels.characterDynamicsOverview(novelId),
    queryFn:async()=>{
      const response = await getCharacterDynamicsOverview(novelId);
      if (!response.success || !Array.isArray(response.data?.relations)) throw new Error("本书动态关系未能读取。");
      return response;
    }, enabled:!preview && Boolean(novelId),
    staleTime:5_000, refetchInterval:15_000});
  const selected = book.materials.characters.find(character=>character.id===selectedId)?.id ?? "";
  const model = useMemo(()=>buildRelationshipGraphModel({characters:book.materials.characters,
    staticRelations:preview ? [] : relations.data?.data ?? [],
    dynamicRelations:preview ? [] : dynamics.data?.data?.relations ?? [],
    selectedCharacterId:selected,mode}),[book.materials.characters, relations.data, dynamics.data, preview, selected, mode]);
  const error = relations.error ?? dynamics.error;
  return <div className="min-w-0 space-y-4 px-2 sm:px-6">
    <div>
      <h2 className="text-2xl font-semibold">角色关系图</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">查看本书保存的关系与最新动态阶段。点击角色或连线查看详情，可筛选当前角色、高张力关系或动态阶段。图中展示全书最新资料，可能包含后续剧情。</p>
    </div>
    {error ? <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>角色关系读取失败，图中可能缺少关系资料。{error instanceof Error ? error.message : ""}</p>
      <button type="button" className="text-primary hover:underline" onClick={()=>{void relations.refetch(); void dynamics.refetch();}}>重新读取关系</button>
    </div> : null}
    {selected ? <button type="button" className="text-sm text-primary hover:underline focus-visible:underline" onClick={()=>onOpenCharacter(selected)}>查看角色档案</button> : null}
    <CharacterRelationshipGraphPanel model={model} mode={mode} onModeChange={setMode}
      selectedCharacterId={selected} onSelectedCharacterChange={setSelectedId}
      isLoading={!preview && (relations.isLoading || dynamics.isLoading)}/>
  </div>;
}
