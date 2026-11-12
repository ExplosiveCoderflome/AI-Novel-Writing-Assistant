import type {OutlineDocument} from "@ai-novel/shared/types/outline";
import {getOutlineNodes,getOutlineNodeTitle,localizeOutlineText} from "../outlineNodes";

/** Translate protocol fields and stable references, never infer story intent. */
export function presentOutlineOpenBookError(message:string,document:OutlineDocument) {
  const nodes=getOutlineNodes(document),titles=Object.fromEntries(nodes.map(node=>[node.nodeId,getOutlineNodeTitle(node)]));
  const referenced=nodes.map(node=>({node,index:message.indexOf(node.nodeId)})).filter(item=>item.index>=0).sort((a,b)=>a.index-b.index);
  const owner=referenced[0]?.node;
  return {message:localizeOutlineText(message,titles).replace("OUTLINE_OPEN_INVALID:","大纲结构需要调整："),nodeId:owner?.nodeId,nodeTitle:owner ? getOutlineNodeTitle(owner) : undefined};
}
