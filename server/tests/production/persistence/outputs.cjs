function output(extra = {}) {
  return { summary: '主角交出钥匙并约定返回', concreteFacts: [{ text: '主角交出钥匙', category: 'completed' }],
    stateDeltas: { characterStates: [{ characterId: 'hero', characterName: '主角', currentGoal: '返回', summary: '离开城门' }],
      relationStates: [], informationStates: [{ holderType: 'reader', fact: '约定返回', status: 'known' }], foreshadowStates: [] },
    characterKnowledgeStates: [{ characterName: '主角', knownFacts: ['约定返回'], hiddenFacts: [] }],
    characterMindDeltas: [{ characterName: '主角', currentInterpretation: '必须返回', beliefs: [], misbeliefs: [], evidence: ['答应返回'], confidence: 0.9 }],
    factionUpdates: [{ characterName: '主角', factionLabel: '守城者', summary: '答应返回' }],
    relationDynamics: [], payoffDeltas: [{ ledgerKey: 'promise-return', title: '返回约定', summary: '答应返回', scopeType: 'book', currentStatus: 'setup' }],
    characterLocationDeltas: [{ characterId: 'hero', characterName: '主角', timeContext: 'present', movementType: 'stay', locationName: '城门',
      continuityStatus: 'consistent', evidence: '主角在城门', explanation: '正文确认位置' }],
    characterAppearances: [{ characterId: 'hero', characterName: '主角', kind: 'present', summary: '交出钥匙', evidence: '主角在城门' }],
    syncPlan: { stateSnapshot: 'write', characterResources: 'write', payoffLedger: 'delta', characterDynamics: 'write', reason: '回填' }, confidence: 1,
    ...extra };
}
module.exports = { output };
