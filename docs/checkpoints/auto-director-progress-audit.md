# Auto Director Progress Audit

鏇存柊鏃堕棿锛?026-04-13

## 鐩爣

杩欎唤鏂囨。鐢ㄤ簬娌跨潃鈥滆嚜鍔ㄥ婕斿垱寤衡€濅粠鐢ㄦ埛濉啓琛ㄥ崟鍚庣殑閾捐矾鍋氫竴娆″畬鏁村璐︼紝閲嶇偣鍥炵瓟涓変欢浜嬶細

- 鑷姩瀵兼紨鐪熷疄鐨勭敓鎴愰摼璺幇鍦ㄥ埌搴曡蛋浜嗗摢浜涙楠ゃ€?
- 杩欎簺姝ラ鍒嗗埆鍐欏埌浜嗗摢浜涗换鍔＄姸鎬佸拰杩涘害瀛楁閲屻€?
- 鍝簺鍔ㄤ綔鐜板湪铏界劧宸茬粡鍦ㄥ悗绔彂鐢熶簡锛屼絾鍓嶇浠嶇劧鍙槸闅愭€у畬鎴愶紝瀹规槗璁╃敤鎴疯浠ヤ负鍗′綇銆?

鏈鍙鐩栤€滀粠鍒涘缓椤佃繘鍏ヨ嚜鍔ㄥ婕斺€濈殑鏂板缓椤圭洰閾捐矾锛涚幇鏈夐」鐩帴绠′細澶嶇敤鍏朵腑鐨勫ぇ閮ㄥ垎涓婚摼锛屼絾鍏ュ彛涓庤捣濮嬮樁娈典笉鍚屻€?

## 鍏ュ彛涓庝换鍔″缓绔?

### 1. 鍒涘缓椤佃〃鍗曡繘鍏ヨ嚜鍔ㄥ婕斿脊绐?

鍓嶇鍏ュ彛鍦?[client/src/pages/novels/components/NovelAutoDirectorDialog.tsx](../../client/src/pages/novels/components/NovelAutoDirectorDialog.tsx)銆?

- 鐢ㄦ埛濉啓鍩虹寮€涔︿俊鎭€佺伒鎰熴€佽繍琛屾柟寮忋€?
- 鍓嶇鍏堣皟鐢?`POST /novel-workflows/bootstrap` 寤虹珛鎴栧鐢ㄤ竴鏉?`lane=auto_director` 鐨勫伐浣滄祦浠诲姟銆?
- 浠诲姟鍒濆鐘舵€佹潵鑷?`NovelWorkflowService.createWorkflow()`锛?
  - `currentStage=AI 鑷姩瀵兼紨`
  - `currentItemKey=auto_director`
  - `currentItemLabel=绛夊緟鐢熸垚鍊欓€夋柟鍚慲
- 寮圭獥鎵撳紑鏈熼棿浼氭瘡 2 绉掕疆璇竴娆′换鍔¤鎯呫€?

### 2. 鍊欓€夐樁娈垫帴鍙?

鑷姩瀵兼紨鍊欓€夐樁娈垫湁 4 绫绘帴鍙ｏ紝鍏ㄩ儴鍦?[server/src/routes/novelDirector.ts](../../server/src/routes/novelDirector.ts) 鏆撮湶锛?

- `POST /novels/director/candidates`
- `POST /novels/director/refine`
- `POST /novels/director/patch-candidate`
- `POST /novels/director/refine-titles`

瀵瑰簲鍚庣鏈嶅姟鍦?[server/src/services/novel/director/novelDirectorCandidateStage.ts](../../server/src/services/novel/director/novelDirectorCandidateStage.ts)銆?

## 瀹屾暣鐢熸垚閾捐矾

### A. 鍊欓€夐樁娈?

鍊欓€夐樁娈靛綋鍓嶆湁 4 涓槑纭啓鍏ヤ换鍔＄姸鎬佺殑瀛愭楠わ細

| 椤哄簭 | `currentItemKey` | 浠诲姟鏂囨 | 鍚庣鍔ㄤ綔 |
| --- | --- | --- | --- |
| 1 | `candidate_seed_alignment` | 鏁寸悊椤圭洰璁惧畾/璇诲彇涓婁竴杞柟妗?| 鏁寸悊鐏垫劅銆佸熀纭€琛ㄥ崟銆佷笂涓€杞壒娆′笌淇鎰忚 |
| 2 | `candidate_project_framing` | 瀵归綈涔︾骇 framing | 瀵归綈鍗栫偣銆佸墠 30 绔犳壙璇恒€佹皵璐ㄧ害鏉熺瓑涓婁笅鏂?|
| 3 | `candidate_direction_batch` | 鐢熸垚涔︾骇鏂规 | 杩愯缁撴瀯鍖栨彁绀鸿瘝锛岀敓鎴?2 濂椾功绾ф柟鍚戝€欓€?|
| 4 | `candidate_title_pack` | 寮哄寲鏍囬缁?| 涓烘瘡濂楁柟鍚戣ˉ涔﹀悕缁勶紝鎴栧彧閲嶅仛鎸囧畾鏂规鐨勬爣棰樼粍 |

瀹屾垚鍚庤繘鍏ユ鏌ョ偣锛?

- `checkpointType=candidate_selection_required`
- `status=waiting_approval`
- `currentItemLabel=绛夊緟纭涔︾骇鏂瑰悜`

涔熷氨鏄锛屽垱寤洪〉閲屸€滈€夋柟鍚戔€濆墠鐨勫畬鏁撮摼璺笉鏄崟娆＄敓鎴愶紝鑰屾槸锛?

1. 鏁寸悊杈撳叆
2. 瀵归綈 framing
3. 鐢熸垚鏂瑰悜鍊欓€?
4. 涓烘瘡濂楁柟鍚戣ˉ鏍囬缁?
5. 鍋滃湪绛夊緟纭

### B. 鏂规纭涓庡缓涔?

鐢ㄦ埛纭鏌愪釜鍊欓€夋柟鍚戝悗锛屽墠绔皟鐢?`POST /novels/director/confirm`锛屽搴旈€昏緫鍦?[server/src/services/novel/director/NovelDirectorService.ts](../../server/src/services/novel/director/NovelDirectorService.ts)銆?

杩欓噷鐨勭湡瀹為摼璺槸锛?

1. `claimAutoDirectorNovelCreation()`
   - 鎶㈠崰鈥滃缓涔︹€濊繖涓€姝ワ紝閬垮厤閲嶅纭瀵艰嚧閲嶅寤洪」鐩€?
2. `resolveDirectorBookFraming()`
   - 鍦ㄧ湡姝ｅ垱寤哄皬璇村墠锛屽厛琛ラ綈鐩爣璇昏€呫€佸崠鐐广€佸鏍囨皵璐ㄣ€佸墠 30 绔犳壙璇虹瓑 framing銆?
3. `createNovel()`
   - 鍒涘缓灏忚璁板綍銆?
4. `attachNovelToTask()`
   - 鎶婃柊灏忚鎸傚埌褰撳墠鑷姩瀵兼紨浠诲姟涓娿€?
5. `bootstrapTask()`
   - 鎶婁换鍔?seed payload 鏇存柊涓衡€滃凡杩涘叆 story macro 闃舵鈥濄€?
6. `scheduleBackgroundRun()`
   - 鍚庡彴缁х画鍚姩涓婚摼锛屼笉闃诲鍓嶇銆?

杩欎竴姝ュ畬鎴愬悗锛屼换鍔′細浠庘€滅函鍊欓€変换鍔♀€濆彉鎴愨€滅粦瀹氬叿浣?novelId 鐨勮嚜鍔ㄥ婕斾富浠诲姟鈥濄€?

### C. 涓婚摼闃舵鎬昏

鏂规纭鍚庣殑鍚庡彴涓婚摼鐢?`runDirectorPipeline()` 涓茶捣鏉ワ紝椤哄簭濡備笅锛?

1. `story_macro`
2. `character_setup`
3. `volume_strategy`
4. `structured_outline`
5. `chapter_execution / quality_repair`
   鏉′欢锛氬彧鏈?`runMode=auto_to_execution` 鎴栫敤鎴峰湪 `chapter_batch_ready/chapter_batch_ready` 鍚庣户缁嚜鍔ㄦ墽琛屾椂鎵嶈繘鍏?

### D. 鏁呬簨瀹忚瑙勫垝闃舵

瀵瑰簲鏂囦欢锛?

- [server/src/services/novel/director/novelDirectorStoryMacroPhase.ts](../../server/src/services/novel/director/novelDirectorStoryMacroPhase.ts)

鐪熷疄鎵ц椤哄簭锛?

| 椤哄簭 | `currentItemKey` | 鍚庣鍔ㄤ綔 |
| --- | --- | --- |
| 1 | `story_macro` | 鐢熸垚鏁呬簨瀹忚瑙勫垝 |
| 2 | `constraint_engine` | 鏋勫缓绾︽潫寮曟搸 |
| 3 | `book_contract` | 鐢熸垚 Book Contract |
| 4 | 鏃犲崟鐙姸鎬?| `bookContractService.upsert()` 鎸佷箙鍖?Book Contract |

### E. 瑙掕壊鍑嗗闃舵

瀵瑰簲鏂囦欢锛?

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)

鐪熷疄鎵ц椤哄簭锛?

| 椤哄簭 | `currentItemKey` | 鍚庣鍔ㄤ綔 |
| --- | --- | --- |
| 1 | `character_setup` | 鐢熸垚鑷姩鍙敤鐨勮鑹查樀瀹瑰€欓€?|
| 2 | 鏃犲崟鐙姸鎬?| 璇勪及瑙掕壊璐ㄩ噺锛屽垽鏂槸鍚﹀厑璁歌嚜鍔ㄥ簲鐢?|
| 3 | `character_cast_apply` | 搴旂敤瑙掕壊闃靛鍒板皬璇磋鑹茶祫浜?|
| 4 | `character_setup_required` 妫€鏌ョ偣 | 杩愯鏂瑰紡涓?`stage_review` 鏃跺仠涓嬪鏍革紱鎴栬川閲忎笉杩囧叧鏃跺己鍒跺仠涓?|

### F. 鍗锋垬鐣ラ樁娈?

瀵瑰簲鏂囦欢锛?

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- [server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)

鐪熷疄鎵ц椤哄簭锛?

| 椤哄簭 | `currentItemKey` | 鍚庣鍔ㄤ綔 |
| --- | --- | --- |
| 1 | `volume_strategy` | 鐢熸垚鍗锋垬鐣?|
| 2 | `volume_strategy` | 鍗锋垬鐣ョ殑 `load_context` 瀛愰樁娈?|
| 3 | `volume_skeleton` | 鐢熸垚鍗烽鏋?|
| 4 | `volume_skeleton` | 鍗烽鏋剁殑 `load_context` 瀛愰樁娈?|
| 5 | 鏃犲崟鐙姸鎬?| `updateVolumes()` 鎸佷箙鍖栧嵎鎴樼暐宸ヤ綔鍖?|
| 6 | `volume_strategy_ready` 妫€鏌ョ偣 | 杩愯鏂瑰紡涓?`stage_review` 鏃跺仠涓嬪鏍?|

### G. 缁撴瀯鍖栨媶绔犻樁娈?

瀵瑰簲鏂囦欢锛?

- [server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- [server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)

杩欐槸褰撳墠鏈€瀹规槗鈥滃悗鍙板仛浜嗗緢澶氾紝鍓嶇杩樻槸鍍忓仠浣忊€濈殑闃舵銆?

鐪熷疄鎵ц椤哄簭锛?

1. 寰幆闇€瑕佸噯澶囩殑鍗枫€?
2. 瀵规瘡涓€鍗锋墽琛岋細
   - `beat_sheet`
   - `chapter_list`
   - `rebalance`
3. 閽堝绔犺妭鏍囬鍋氬鏍锋€ф鏌ワ紝骞舵妸 notice 鍐欒繘浠诲姟 seed payload銆?
4. `chapter_sync`
   - 鍚屾鍗峰伐浣滃尯鍒扮珷鑺傛墽琛屽尯銆?
5. 閫夊嚭鍚庣画鑷姩鎵ц鑼冨洿銆?
6. 瀵归€変腑绔犺妭閫愮珷鎵ц 3 绉嶇粏鍖栨ā寮忥細
   - `purpose`
   - `boundary`
   - `task_sheet`
7. 鍐嶆鎸佷箙鍖栧伐浣滃尯骞跺悓姝ョ珷鑺傘€?
8. 鏇存柊灏忚鏁翠綋鐘舵€佷负 `in_progress`銆?
9. 鍐欏叆 `chapter_batch_ready` 妫€鏌ョ偣銆?

杩欓噷鐨勪换鍔＄姸鎬佸啓鍏ョ偣涓昏鏄細

| `currentItemKey` | 璇存槑 |
| --- | --- |
| `beat_sheet` | 鑺傚鏉跨敓鎴愪腑 |
| `chapter_list` | 绔犺妭鍒楄〃鐢熸垚涓?|
| `chapter_list` | 鐩搁偦鍗疯鎺ユ牎鍑嗕篃澶嶇敤杩欎釜 key |
| `chapter_sync` | 绔犺妭璧勬簮鍚屾涓?|
| `chapter_detail_bundle` | 绔犺妭鎵归噺缁嗗寲涓?|
| `chapter_batch_ready` | 宸插叿澶囪繘鍏ョ珷鑺傛墽琛岀殑鍑嗗 |

### H. 鑷姩鎵ц绔犺妭闃舵

瀵瑰簲鏂囦欢锛?

- [server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts](../../server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts)
- [server/src/services/novel/director/novelDirectorAutoExecution.ts](../../server/src/services/novel/director/novelDirectorAutoExecution.ts)

杩涘叆鏂瑰紡鏈変袱绉嶏細

- 鍒涘缓鏃剁洿鎺ラ€夋嫨 `auto_to_execution`
- 宸插埌 `chapter_batch_ready` 鎴?`chapter_batch_ready` 鍚庯紝鐢ㄦ埛缁х画鑷姩鎵ц

鐪熷疄鎵ц椤哄簭锛?

1. `resolveRangeAndState()`
   - 瑙ｆ瀽鏈瑕佽窇鐨勭珷鑺傝寖鍥翠笌鍓╀綑绔犺妭鐘舵€併€?
2. `syncAutoExecutionTaskState()`
   - 鏇存柊浠诲姟 seed payload銆乺esume target銆乻cope label銆?
3. 澶嶇敤宸叉湁 pipeline job 鎴栨柊寤轰竴鏉＄珷鑺傛祦姘寸嚎浠诲姟銆?
4. 杞 pipeline job锛?
   - 鐢熸垚姝ｆ枃鏃舵槧灏勪负 `chapter_execution`
   - 瀹℃牎鏃舵槧灏勪负 `quality_repair`
   - 淇鏃舵槧灏勪负 `quality_repair`
5. 鏍规嵁缁撴灉杩涘叆涓夌鍑哄彛涔嬩竴锛?
   - `workflow_completed`
   - `chapter_batch_ready`
   - `failed/cancelled + chapter_batch_ready`

## 褰撳墠鍓嶇鐪熸娑堣垂鍒扮殑绮掑害

### 1. 鑷姩瀵兼紨寮圭獥杩涘害闈㈡澘

鍓嶇鏂囦欢锛?

- [client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx](../../client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx)

褰撳墠鍙湁涓ゅ鍥哄畾姝ラ鍗★細

- 鍊欓€夐樁娈碉細4 姝?
- 鎵ц闃舵锛? 姝?

鎵ц闃舵鐨?6 姝ユ槸锛?

1. 鍒涘缓椤圭洰
2. Book Contract + 鏁呬簨瀹忚瑙勫垝
3. 瑙掕壊鍑嗗
4. 鍗锋垬鐣?+ 鍗烽鏋?
5. 绗?1 鍗疯妭濂忔澘 + 绔犺妭鍒楄〃
6. 绔犺妭鎵归噺缁嗗寲

杩欐剰鍛崇潃锛?

- `rebalance`
- `chapter_sync`
- 澶氬嵎寰幆
- 绔犺妭鎵ц涓殑鐢熸垚/瀹℃牎/淇

铏界劧鍦ㄥ悗绔槸鐙珛鍔ㄤ綔锛屼絾鍦ㄦ楠ゅ崱涓婁笉浼氶暱鍑烘柊鐨勫彲瑙侀樁娈点€?

### 2. 浠诲姟涓績 / 灏忚鍒楄〃 / 宸ヤ綔鍖轰换鍔￠潰鏉?

鐩稿叧鏂囦欢锛?

- [server/src/services/task/novelWorkflowExplainability.ts](../../server/src/services/task/novelWorkflowExplainability.ts)
- [server/src/services/task/novelWorkflowDetailSteps.ts](../../server/src/services/task/novelWorkflowDetailSteps.ts)
- [client/src/lib/novelWorkflowTaskUi.ts](../../client/src/lib/novelWorkflowTaskUi.ts)

杩欎簺鍏ュ彛浼氳繘涓€姝ユ妸 `currentItemKey` 鎶樺彔鍥為樁娈电骇鐘舵€侊紝渚嬪锛?

- `candidate_seed_alignment`
- `candidate_project_framing`
- `candidate_direction_batch`
- `candidate_title_pack`

閮戒細琚悊瑙ｆ垚鈥滆嚜鍔ㄥ婕旈樁娈碘€濄€?

鍚屾牱鍦帮細

- `beat_sheet`
- `chapter_list`
- `chapter_sync`
- `chapter_detail_bundle`

閮戒細琚悊瑙ｆ垚鈥滅粨鏋勫寲鎷嗙珷/绔犺妭鍑嗗闃舵鈥濄€?

鍥犳锛屼换鍔′腑蹇冪被鍏ュ彛姣斿脊绐楄繘搴﹂潰鏉挎洿绮椼€?

## 褰撳墠浠嶇劧闅愭€у畬鎴愭垨灞曠ず涓嶈冻鐨勫姩浣?

### A. 宸叉湁鐪熷疄鍚庣鍔ㄤ綔锛屼絾姝ラ鍗′笉鍗囩淮

1. 鍗锋垬鐣?`load_context -> prompt`
   - 鍚庣纭疄浼氬厛鏁寸悊涓婁笅鏂囧啀鍙?prompt銆?
   - 鍓嶇鍙湅鍒板悓涓€涓€滃嵎鎴樼暐鈥濇楠ゃ€?

2. 鍗烽鏋?`load_context -> prompt`
   - 涓庝笂闈㈠悓鐞嗐€?

3. 鑺傚鏉?`load_context -> prompt`
   - 鏂囨鍙兘鍙樺寲锛屼絾姝ラ鍗′粛鍋滃湪鈥滅 1 鍗疯妭濂忔澘 + 绔犺妭鍒楄〃鈥濄€?

4. 绔犺妭鍒楄〃 `load_context -> prompt`
   - 涓庝笂闈㈠悓鐞嗐€?

5. `rebalance`
   - 鍚庣鏄庣‘瀛樺湪鈥滄牎鍑嗙浉閭诲嵎琛旀帴鈥濆姩浣滐紝浣嗗墠绔病鏈夊崟鐙楠わ紝鍙鐢?`chapter_list`銆?

6. `chapter_sync`
   - 鈥滄妸鎷嗙珷缁撴灉鍚屾鍒扮珷鑺傛墽琛屽尯鈥濇槸涓€涓嫭绔嬪姩浣滐紝浣嗕粛琚姌鍙犲湪缁撴瀯鍖栨媶绔犵殑澶ф楠ら噷銆?

7. 澶氬嵎寰幆
   - 濡傛灉鑷姩鎵ц鑼冨洿璺ㄥ鍗凤紝鍚庣浼氫竴鍗蜂竴鍗峰噯澶囥€?
   - 鍓嶇姝ラ鍗′粛鍙湁涓€涓€滆妭濂忔澘 + 绔犺妭鍒楄〃鈥濆拰涓€涓€滅珷鑺傛壒閲忕粏鍖栤€濄€?

8. 绔犺妭鎵ц涓殑鈥滅敓鎴?/ 瀹℃牎 / 淇鈥?
   - 鍚庣宸茬粡鑳藉尯鍒?`chapter_execution`銆乣reviewing`銆乣repairing`銆?
   - 浣嗗脊绐楁楠ゅ崱涓嶄細浠庘€滅珷鑺傛壒閲忕粏鍖栤€濆垏鎴愨€滅珷鑺傜敓鎴愨€濃€滆嚜鍔ㄥ鏍♀€濃€滆嚜鍔ㄤ慨澶嶁€濅笁娈点€?

### B. 鍚庣宸茬粡鍙戠敓锛屼絾鍓嶇鐜板湪鍩烘湰鍙潬鏂囨鎴栨牴鏈病鍗曠嫭鏆撮湶

1. 纭鏂规鍚庡厛鍋?`resolveDirectorBookFraming()`
   - 鐢ㄦ埛鐪嬪埌鐨勬槸鈥滄鍦ㄥ垱寤哄皬璇撮」鐩€濄€?
   - 浣嗗垱寤哄墠鍏跺疄杩樹細琛ヤ竴杞?framing銆?

2. Book Contract 鎸佷箙鍖?
   - 鐢熸垚瀹屾垚鍚庤繕鏈?`bookContractService.upsert()`銆?
   - 褰撳墠娌℃湁鍗曠嫭鐘舵€併€?

3. 瑙掕壊璐ㄩ噺璇勪及涓庘€滄槸鍚﹁嚜鍔ㄨ惤搴撯€濈殑鍒ゆ柇
   - 杩欐槸鑷姩瀵兼紨鑳藉惁缁х画鎺ㄨ繘鐨勫叧閿棬妲涖€?
   - 褰撳墠涓嶆槸鐙珛杩涘害姝ラ銆?

4. 鍊欓€夐樁娈电粰姣忓鏂规閫愪釜澧炲己鏍囬缁?
   - 鍚庣浼氬姣忎釜鍊欓€夊仛鏍囬澧炲己銆?
   - 鍓嶇鍙湅鍒颁竴涓€荤殑 `candidate_title_pack`銆?

5. 绔犺妭鏍囬澶氭牱鎬ф鏌?
   - 鍚庣浼氬湪绔犺妭鍒楄〃鐢熸垚鍚庡啓鍏?`taskNotice`銆?
   - 浣嗚繘搴﹂潰鏉挎病鏈夋妸杩欎竴姝ユ姮鎴愮嫭绔嬫彁绀恒€?

6. 鑷姩鎵ц鍓嶇殑鈥滃鐢ㄥ凡鏈?pipeline job / 鎭㈠宸叉湁鑼冨洿鐘舵€佲€?
   - 鍚庣鍦ㄨ繘鍏ョ珷鑺傛祦姘寸嚎鍓嶄細鍋氫竴杞璐︿笌鎺ョ銆?
   - 杩欓儴鍒嗙洰鍓嶄富瑕佷綋鐜板湪鏃ュ織閲屻€?

### C. 鏈€瀹规槗璁╃敤鎴疯浠ヤ负鈥滃崱浣忊€濈殑杩涘害鍐荤粨鐐?

1. `book_contract` 鐨勮繘搴﹀€奸『搴忓綋鍓嶆湁闂
   - `DIRECTOR_PROGRESS.bookContract=0.14`
   - 浣嗙湡瀹炴墽琛岄『搴忔槸 `story_macro(0.22) -> constraint_engine(0.30) -> book_contract(0.14)`
   - 鐢变簬 `markTaskRunning()` 浼氬彇 `Math.max(existing.progress, input.progress)`锛屾墍浠ョ敓鎴?Book Contract 鏃舵暟鍊间笉浼氬墠杩涳紝瀹规槗鐪嬭捣鏉ュ崱鍦?30%銆?

2. 鍊欓€夐樁娈垫病鏈?heartbeat
   - 鍊欓€夐樁娈电洿鎺ョ敤 `markTaskRunning()`锛屾病鏈夊鐢?`runDirectorTrackedStep()` 鐨勭瓑寰呮椂闀垮埛鏂般€?
   - 涓€鏃︾粨鏋勫寲鐢熸垚鎴栨爣棰樺寮鸿€楁椂杈冮暱锛屾枃妗堜笌鐧惧垎姣旈兘鍙兘闀挎椂闂翠笉鍔ㄣ€?

3. `generateVolumes()` 鍐呴儴鐨勯暱 prompt 鍙湁闃舵鍒囨崲锛屾病鏈夋寔缁?heartbeat
   - `load_context` 鍜?`prompt` 鍙互鏇存柊涓€娆＄姸鎬併€?
   - 浣嗙湡姝?prompt 璺戝緢涔呮椂锛屼笉浼氭寔缁ˉ鈥滃凡绛夊緟 xx 绉掆€濄€?

4. 绔犺妭缁嗗寲鍗曟鍙兘寰堥暱
   - `chapter_detail_bundle` 铏界劧浼氭寜绔犺妭鍜岀粏鍖栨ā寮忓墠杩涖€?
   - 浣嗗崟娆?`purpose/boundary/task_sheet` 鐢熸垚涓病鏈夌嫭绔?heartbeat銆?

5. 浠诲姟鎽樿鎶婅繍琛屼腑鐨勭珷鑺傝嚜鍔ㄦ墽琛屽帇鎴愮粺涓€鐘舵€?
   - `buildWorkflowExplainability()` 浼氭妸 `chapter_batch_ready/chapter_batch_ready` 涓嬬殑杩愯涓换鍔＄粺涓€鏄剧ず鎴愨€滃墠 10 绔犺嚜鍔ㄦ墽琛屼腑鈥濄€?
   - 杩欎細涓㈡帀褰撳墠鍒板簳鏄€滅敓鎴愪腑鈥濃€滃鏍′腑鈥濃€滀慨澶嶄腑鈥濓紝涔熶細涓㈡帀鐪熷疄鑼冨洿鏄惁鏄€滅 11-20 绔犫€濇垨鈥滅 2 鍗封€濄€?

6. 澶氫釜鍓嶇鍏ュ彛瀵瑰悓涓€浠诲姟鐨勭矑搴︿笉涓€鑷?
   - 寮圭獥鑳界湅鍒?`currentItemLabel`銆?
   - 浠诲姟涓績銆佸垪琛ㄥ窘鏍囧拰鎽樿鏂囨浼氳繘涓€姝ユ姌鍙犮€?
   - 鐢ㄦ埛鍒囨崲椤甸潰鍚庯紝缁忓父浼氭劅瑙夆€滄€庝箞鍙堝彉鍥炰竴涓緢绗肩粺鐨勭姸鎬佲€濄€?

## 褰撳墠缁撹

浠庝唬鐮侀摼璺湅锛岃嚜鍔ㄥ婕斿悗绔殑瀹為檯鍔ㄤ綔宸茬粡鏄庢樉姣斿墠绔富杩涘害鏉″睍绀哄緱鏇寸粏銆?

褰撳墠鏈€鍏抽敭鐨勫彲瑙佹€х己鍙ｄ笉鏄€滃畬鍏ㄦ病鏈夌姸鎬佲€濓紝鑰屾槸锛?

1. 鍚庣宸茬粡鏈変笉灏戠湡瀹炲瓙姝ラ锛屼絾鍓嶇姝ラ鍗¤繕鍋滅暀鍦ㄩ樁娈电骇绮楃矑搴︺€?
2. 閮ㄥ垎闃舵鍙湁鏂囨鍙橈紝娌℃湁鐧惧垎姣斿彉銆?
3. 灏戞暟鍏抽敭鍔ㄤ綔鐢氳嚦鍙瓨鍦ㄤ簬鏃ュ織鍜屽悗绔姸鎬佹祦杞噷锛屾病鏈夎鎶垚鐢ㄦ埛鍙劅鐭ョ殑杩涘害鑺傜偣銆?
4. `book_contract` 杩欎竴姝ヨ繕瀛樺湪鏄庣‘鐨勮繘搴﹀€兼帓搴忛棶棰橈紝浼氱洿鎺ュ埗閫犫€滆繘搴︿笉鍔ㄢ€濈殑閿欒銆?

## 鍏抽敭浠ｇ爜閿氱偣

- 鍒涘缓寮圭獥涓庤疆璇細[client/src/pages/novels/components/NovelAutoDirectorDialog.tsx](../../client/src/pages/novels/components/NovelAutoDirectorDialog.tsx)
- 鑷姩瀵兼紨杩涘害闈㈡澘锛歔client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx](../../client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx)
- 鍊欓€夐樁娈垫湇鍔★細[server/src/services/novel/director/novelDirectorCandidateStage.ts](../../server/src/services/novel/director/novelDirectorCandidateStage.ts)
- 纭涓庝富閾剧紪鎺掞細[server/src/services/novel/director/NovelDirectorService.ts](../../server/src/services/novel/director/NovelDirectorService.ts)
- 鏁呬簨瀹忚瑙勫垝锛歔server/src/services/novel/director/novelDirectorStoryMacroPhase.ts](../../server/src/services/novel/director/novelDirectorStoryMacroPhase.ts)
- 瑙掕壊/鍗锋垬鐣?鎷嗙珷涓婚樁娈碉細[server/src/services/novel/director/novelDirectorPipelinePhases.ts](../../server/src/services/novel/director/novelDirectorPipelinePhases.ts)
- 绔犺妭鑷姩鎵ц杩愯鏃讹細[server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts](../../server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts)
- 鍗风敓鎴愮紪鎺掑櫒锛歔server/src/services/novel/volume/volumeGenerationOrchestrator.ts](../../server/src/services/novel/volume/volumeGenerationOrchestrator.ts)
- 浠诲姟鐘舵€佷笌妫€鏌ョ偣鍐欏叆锛歔server/src/services/novel/workflow/NovelWorkflowService.ts](../../server/src/services/novel/workflow/NovelWorkflowService.ts)
- 浠诲姟鎽樿鎶樺彔閫昏緫锛歔server/src/services/task/novelWorkflowExplainability.ts](../../server/src/services/task/novelWorkflowExplainability.ts)
- 浠诲姟璇︽儏姝ラ鎶樺彔閫昏緫锛歔server/src/services/task/novelWorkflowDetailSteps.ts](../../server/src/services/task/novelWorkflowDetailSteps.ts)

