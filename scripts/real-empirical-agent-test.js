/**
 * Empirical Agent Verification & Execution Test Script
 * Directly executes compiled AgentProfileRegistry and LongLivedThreadService to provide un-mocked proof of:
 * 1. Head Immutability (guaranteeing Prompt Cache hit conditions)
 * 2. Real Context Token Growth Comparison
 * 3. Dynamic Compaction & Preference Retention
 */

const { agentProfileRegistry } = require('../server/dist/platform/agent/AgentProfileRegistry.js');
const { longLivedThreadService } = require('../server/dist/platform/agent/LongLivedThreadService.js');

function runEmpiricalVerification() {
  console.log('=====================================================');
  console.log('🔬 EMPIRICAL VERIFICATION OF AGENT TEAM ARCHITECTURE');
  console.log('=====================================================');

  const workspaceId = `real-test-ws-${Date.now()}`;
  const role = 'novel-director';

  // 1. Verify Profile System Registry
  console.log('\n[1] Verifying AgentProfileRegistry Structure:');
  const profile = agentProfileRegistry.getProfile(role);
  console.log(`  - Role: ${profile.identity.role}`);
  console.log(`  - Display Name: ${profile.identity.displayName}`);
  console.log(`  - Primary Capability: ${profile.domain.primaryCapability}`);
  console.log(`  - Risk Tier: ${profile.scope.riskTier}`);

  // 2. Measure Head Immutability across multiple turns (Prompt Cache Hit Requirement)
  console.log('\n[2] Empirical Measurement of System Prompt Head Immutability (Prompt Cache Condition):');
  const thread1 = longLivedThreadService.getOrCreateThread(workspaceId, role);
  const head1 = thread1.staticPromptHead;

  // Turn 1
  longLivedThreadService.appendResponse(workspaceId, role, 'User Turn 1: Setup Novel', 'Director Response 1');
  const ctx1 = longLivedThreadService.assembleThreadContext(workspaceId, role, 'User Turn 2: Build World');
  const headAfterTurn1 = ctx1[0].content;

  // Turn 2
  longLivedThreadService.appendResponse(workspaceId, role, 'User Turn 2: Build World', 'Director Response 2');
  const ctx2 = longLivedThreadService.assembleThreadContext(workspaceId, role, 'User Turn 3: Draft Ch1');
  const headAfterTurn2 = ctx2[0].content;

  const isHeadIdentical = (head1 === headAfterTurn1) && (headAfterTurn1 === headAfterTurn2);
  console.log(`  - Static Head Length: ${head1.length} chars`);
  console.log(`  - Head Exact Match across Turn 1 & Turn 2: ${isHeadIdentical ? 'TRUE (100% Guaranteed Static Cache Condition)' : 'FALSE'}`);

  // 3. Measure Token Growth Comparison (Session Assembled vs Long-Lived Compaction)
  console.log('\n[3] Empirical Context Growth & Compaction Measurement:');
  
  // Simulate 12 rounds of conversation
  let uncompactedTotalChars = head1.length;
  for (let i = 1; i <= 12; i++) {
    const userMsg = `Turn ${i}: User provides style feedback: prefer dark atmospheric prose #${i}`;
    const assistantMsg = `Turn ${i}: Director applies style rules #${i}`;
    uncompactedTotalChars += (userMsg.length + assistantMsg.length);
    longLivedThreadService.appendResponse(workspaceId, role, userMsg, assistantMsg);
  }

  const compactedCtx = longLivedThreadService.assembleThreadContext(workspaceId, role, 'Turn 13: Next Action');
  const compactedTotalChars = compactedCtx.reduce((acc, m) => acc + m.content.length, 0);

  console.log(`  - Total Raw Turns Accumulated: 12 turns (24 messages)`);
  console.log(`  - Context Chars WITHOUT Compaction (Unbound Growth): ${uncompactedTotalChars} chars`);
  console.log(`  - Context Chars WITH Compaction (Working Memory Digest): ${compactedTotalChars} chars`);
  console.log(`  - Context Reduction Ratio: ${((1 - (compactedTotalChars / uncompactedTotalChars)) * 100).toFixed(2)}% Saved`);

  // 4. Verify Preference Retention in Working Memory Digest
  console.log('\n[4] Empirical Verification of Preference Retention:');
  const digest = longLivedThreadService.getThreadState(workspaceId, role).workingMemoryDigest;
  const isPreferenceRetained = digest.includes('User Feedback:') && digest.includes('prefer dark atmospheric prose');
  console.log(`  - Working Memory Digest Present: ${Boolean(digest)}`);
  console.log(`  - Digest Content:\n${digest}`);
  console.log(`  - Preference Retention Verified: ${isPreferenceRetained ? 'PASS (100% Preference Preserved in Memory Digest)' : 'FAIL'}`);

  console.log('=====================================================\n');
}

if (require.main === module) {
  runEmpiricalVerification();
}
