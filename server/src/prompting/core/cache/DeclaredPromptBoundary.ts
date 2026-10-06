import type {BaseMessage} from "@langchain/core/messages";
import type {PromptAsset} from "../promptTypes";
import {declarePromptCacheBoundary} from "../../../platform/llm/cache";
export function registerPromptCacheBoundary(asset:Pick<PromptAsset<unknown,unknown>,"cacheBoundary"|"structuredOutputHint">,rendered:BaseMessage[],messages:BaseMessage[]):void {
 if(!asset.cacheBoundary)return;
 let boundary=asset.cacheBoundary;
 // An inserted static schema is explicitly reusable; preserve dynamic examples and untouched advanced arrays.
 const firstUser=rendered.findIndex(m=>m.type!=="system");
 if(boundary.messageIndex===0 && asset.structuredOutputHint?.placement==="stable_prefix" && messages.length===rendered.length+1
    && firstUser>0 && messages[firstUser]!==rendered[firstUser] && messages[firstUser+1]===rendered[firstUser]){
  boundary={messageIndex:firstUser,contentBlockIndex:0};
 }
 declarePromptCacheBoundary(messages,boundary);
}
