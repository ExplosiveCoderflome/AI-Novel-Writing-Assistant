function assessmentResult(patch={}) {
 const score={coherence:90,repetition:90,pacing:90,voice:90,engagement:90,overall:90};
 const assessment={status:'accepted',score,summary:'已核对当前稿',blockingIssues:[],missingObligations:[],repairDirectives:[],
  repairability:'none',decisionReason:'当前稿可保留',riskTags:[],
  assetSyncRecommendation:{priority:'normal',reason:'保存当前稿',requiresFullPayoffReconcile:false},continuePolicy:'continue',...patch};
 return {assessment,score:assessment.score,issues:[],auditReports:[]};
}
module.exports={assessmentResult};
