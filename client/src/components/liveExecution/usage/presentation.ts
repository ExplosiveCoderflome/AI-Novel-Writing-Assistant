export function formatCacheTokens(value:number|null|undefined,phase:string,status?:string):string {
 if(status==="invalid")return "统计不可用";
 if(status==="reported" && typeof value==="number" && Number.isSafeInteger(value) && value>=0)return value.toLocaleString();
 if(!["completed","failed","cancelled"].includes(phase))return "统计中";
 return status===undefined?"未记录":"未提供";
}
