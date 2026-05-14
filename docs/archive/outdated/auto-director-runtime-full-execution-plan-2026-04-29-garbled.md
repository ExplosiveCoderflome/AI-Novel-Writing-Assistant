# 鑷姩瀵兼紨缁熶竴杩愯鏃跺畬鏁存墽琛岃鍒?

鏇存柊鏃ユ湡锛?026-04-29

鍏宠仈鏂囨。锛?

- [鑷姩瀵兼紨缁熶竴杩愯鏃堕噸鏋勬柟妗圿(./auto-director-unified-runtime-refactor-plan.md)
- [鑷姩瀵兼紨缁熶竴杩愯鏃?MVP 钀藉湴鍒囩墖鏂规](./auto-director-mvp-migration-plan.md)
- [鑷姩瀵兼紨鎵ц闈㈤殧绂讳笌 API 淇濇椿璁″垝](./auto-director-execution-plane-isolation-plan.md)
- [鎻愮ず璇嶅伐浣滃彴銆佷笂涓嬫枃瑁呴厤涓庣粺涓€姝ラ杩愯鏃舵柟妗圿(./prompt-workbench-context-and-step-runtime-plan.md)
- [Auto Director Progress Audit](../checkpoints/auto-director-progress-audit.md)

## 1. 鏂囨。瀹氫綅

鏈枃鍩轰簬 `codex/auto-director-runtime-mvp-plan` 褰撳墠瀹炵幇杩涘害锛屽畾涔夎嚜鍔ㄥ婕旂粺涓€杩愯鏃剁殑瀹屾暣鎵ц璁″垝銆?

鏈鍒掍笉鎸夆€滃仛瀹屼竴闃舵鍐嶅喅瀹氫笅涓€闃舵鈥濈殑鏂瑰紡鎺ㄨ繘锛岃€屾寜涓€娆″畬鏁存敼閫犱氦浠樻潵缁勭粐銆傛墍鏈夋墽琛屽煙閮藉睘浜庡悓涓€涓氦浠樼洰鏍囷細鎶婂綋鍓嶈嚜鍔ㄥ婕斾粠鈥滄棫閾捐矾鏃佹寕 runtime 璁板綍鈥濇帹杩涗负鈥滃彲鎺у埗銆佸彲鎭㈠銆佸彲瑙ｉ噴銆佸彲鎵╁睍鐨勭粺涓€灏忚鐢熶骇杩愯鏃垛€濄€?

宸ョ▼涓婁粛蹇呴』閬靛畧渚濊禆椤哄簭锛屼緥濡傚啓鍏ュ瀷鑺傜偣蹇呴』鍏堟帴鍏?PolicyEngine锛屽墠绔繘搴﹀繀椤诲厛鏈夊彲鎶曞奖浜嬩欢锛屽垱浣滀腑鏋笉鑳界粫杩?DirectorRuntime 鐩存帴璋冪敤鏃ф湇鍔°€傝繖浜涢『搴忎笉鏄垎闃舵楠屾敹锛岃€屾槸鍚屼竴娆″畬鏁翠氦浠樺唴鐨勫疄鏂戒緷璧栥€?

瀹屾暣浜や粯瀹屾垚鍚庯紝绯荤粺搴旇揪鍒帮細

- 鑷姩瀵兼紨鏂板缓銆佹帴绠°€佺户缁€佸け璐ユ仮澶嶃€佹墜鍔ㄧ紪杈戝悗缁х画锛岄兘杩涘叆鍚屼竴濂?DirectorRuntime銆?
- 鍏抽敭鍐欏叆鍔ㄤ綔閮介€氳繃 NodeRunner 鍜?PolicyEngine锛屼笉鍐嶇洿鎺ユ暎钀藉湪鏃?service 鍒嗘敮閲屻€?
- 浜х墿璐︽湰鑳芥敮鎸佺己澶卞垽鏂€佺増鏈潵婧愩€佷緷璧栥€乻tale銆佺敤鎴峰唴瀹逛繚鎶ゅ拰灞€閮ㄦ仮澶嶃€?
- Runtime event 鑳芥姇褰卞埌浠诲姟涓績銆佽嚜鍔ㄥ婕旇繘搴﹂潰鏉垮拰鍒涗綔涓灑銆?
- 绔犺妭鎵ц鍜岃川閲忎慨澶嶈兘灞€閮ㄥけ璐ャ€佸眬閮ㄤ慨澶嶏紝涓嶅喕缁撴暣鏈功銆?
- 鐢ㄦ埛鎵嬪姩淇敼鍚庯紝绯荤粺鑳界敤 AI 缁撴瀯鍖栧垎鏋愬奖鍝嶈寖鍥村拰鏈€灏忎慨澶嶈矾寰勩€?
- 鍒涗綔涓灑鑳介€氳繃 runtime API 瑙ｉ噴鍜屾帶鍒惰嚜鍔ㄥ婕旓紝鑰屼笉鏄洿鎺ヨ皟鐢ㄦ棫闃舵鍑芥暟銆?
- Context Broker銆丳rompt Catalog 鍜屽彧璇?Prompt Preview 涓烘彁绀鸿瘝宸ヤ綔鍙版墦涓嬪熀纭€銆?
- LangGraph 鍙綔涓轰綆椋庨櫓缂栨帓璇曠偣鎺ュ叆锛屼笉鍚炴帀杩愯鏃躲€佺瓥鐣ャ€佷骇鐗╁拰鑺傜偣杈圭晫銆?
- 绗竴鎵圭綉鏂囪川閲忔ā鍧楄繘鍏ョ粺涓€杩愯鏃讹紝甯姪鏂版墜鎸佺画鍐欏畬鏁存湰涔︺€?

## 2. 褰撳墠鍩虹嚎

褰撳墠宸茬粡瀹屾垚锛?

- 鍏变韩杩愯鏃跺绾︼細`DirectorRuntimeSnapshot`銆乣DirectorStepRun`銆乣DirectorEvent`銆乣DirectorArtifactRef`銆乣DirectorWorkspaceAnalysis`銆乣DirectorPolicyDecision`銆?
- `DirectorRuntimeService` 闂ㄩ潰锛氭敮鎸佸垵濮嬪寲杩愯銆佽幏鍙栧揩鐓с€佸伐浣滃尯鍒嗘瀽銆佺瓥鐣ユ洿鏂般€佽妭鐐硅繍琛屽叆鍙ｃ€?
- `DirectorRuntimeStore`锛氭殏瀛?runtime snapshot 鍒?`NovelWorkflowTask.seedPayloadJson.directorRuntime`锛屽苟璁板綍 step銆乪vent銆乤rtifact銆?
- `DirectorWorkspaceAnalyzer`锛氬厛鍋氱‘瀹氭€?inventory锛屽啀閫氳繃娉ㄥ唽 PromptAsset 鍋?AI 缁撴瀯鍖栬В閲娿€?
- `DirectorPolicyEngine`锛氬凡鏈?`suggest_only`銆乣run_next_step`銆乣run_until_gate`銆乣auto_safe_scope` 鍥涚妯″紡涓庝竴娆¤嚜鍔ㄤ慨澶嶉绠椼€?
- `DirectorNodeRunner`锛氬凡鏈夋爣鍑嗚妭鐐瑰绾﹀拰绛栫暐鍒ゆ柇鍏ュ彛銆?
- 鑷姩瀵兼紨鍊欓€夈€佺‘璁ゅ缓涔︺€佸凡鏈夊皬璇存帴绠°€乣story_macro`銆乣book_contract`銆佽鑹插噯澶囥€佸嵎瑙勫垝銆佺粨鏋勫寲鎷嗙珷銆佺珷鑺傛墽琛屻€佽川閲忔鏌ャ€佷慨澶嶃€佺姸鎬佹彁浜ゃ€佷紡绗斿悓姝ュ拰瑙掕壊璧勬簮鍚屾宸茶繘鍏ョ粺涓€ Step Module 鍐欏叆鍚堝悓锛屽苟閫氳繃 NodeRunner / PolicyEngine 璺緞鎵ц鎴栧彈鎺ф姇褰便€?
- `story_macro` 涓?`book_contract` 宸叉媶涓虹嫭绔嬫仮澶嶈妭鐐癸紱宸叉湁鏁呬簨瀹忚瑙勫垝浣嗙己灏戜功绾у垱浣滅害瀹氭椂锛屼細浠庝功绾х害瀹氱户缁紝涓嶅啀璺宠繃鍒拌鑹插噯澶囥€?
- 鍚庣璺敱鍜屽墠绔?API wrapper 宸叉彁渚?workspace analysis銆乺untime snapshot銆乸olicy update銆乺untime continue锛屼换鍔′腑蹇冦€佽繘搴﹂潰鏉垮拰灏忚宸ヤ綔鍙颁晶鏍忓凡寮€濮嬫秷璐?runtime projection銆?
- 鍒涗綔涓灑宸查€氳繃 director runtime tools 璇诲彇鐘舵€併€佽В閲婁笅涓€姝ャ€佽瘎浼版敼鏂囧奖鍝嶅拰璇锋眰缁х画鎺ㄨ繘锛涘綋鍓嶅睘浜庡伐鍏风骇鎺ュ叆锛屼笉鏄畬鏁翠腑鏋富瀵肩紪鎺掋€?
- Context Broker銆丳rompt Workbench 鍙鐩綍 / 棰勮銆乺untime context resolver 宸茶惤鍦帮紝绔犺妭鍐欎綔銆佺珷鑺傚鏍″拰 director workspace analysis 宸插紑濮嬪叡鐢ㄤ笂涓嬫枃鍧楃粍缁囨柟寮忋€?
- `DirectorLangGraphPilot` 宸插疄鐜颁綆椋庨櫓鍥撅紝瑕嗙洊 workspace analyze銆乺ecommend next action銆乺un next step銆乤pproval interrupt锛屽苟閫氳繃鍗曟祴楠岃瘉 interrupt / resume / trace锛涗絾灏氭湭鎺ュ叆鑷姩瀵兼紨涓婚摼銆?
- 鍚姩鎭㈠绛栫暐宸叉槑纭负鏈嶅姟閲嶅惎鍚庡厛鏍囪涓哄緟鎵嬪姩鎭㈠锛岀敤鎴风‘璁ゅ悗鍐嶄粠鐪熷疄璧勪骇鏂偣缁х画锛屼笉鍋氬悗鍙伴潤榛樿嚜鍔ㄧ画璺戙€?
- 瀹氬悜娴嬭瘯宸茶鐩?runtime policy銆丯odeRunner銆丄rtifact Ledger銆丒vent Projection銆丩angGraph Pilot銆丼tep Module銆丳rompt Workbench銆丆ontext Broker銆乨irector runtime tools 鍜屽惎鍔ㄦ仮澶嶅垵濮嬪寲銆?

褰撳墠鏈畬鎴愪絾蹇呴』绾冲叆瀹屾暣浜や粯锛?

- 鑷姩瀵兼紨鎵ц闈㈠凡瀹屾垚绗竴鐗?Worker 鍖栵細`continue / resume_from_checkpoint / retry / takeover` 宸茶繘鍏?`DirectorRunCommand` 闃熷垪骞剁敱鐙珛 Director Worker 鎵ц锛屽墠绔繍琛屾€佷篃宸叉敼涓鸿交閲?projection 杞銆備絾鍊欓€夌‘璁ゃ€佹爣棰樹慨澶嶇瓑鏃у叆鍙ｄ粛鏈夊悓姝ュ噯澶囨垨鏃у紡鍚庡彴璋冨害锛孲QLite 鍐欓攣銆佽繍琛屾€?delta 鎸佷箙鍖栧拰鐪熷疄 Prisma 闀块摼璺洖褰掍粛鏄悗缁敹鍙ｉ噸鐐癸紝涓嶈兘鎶?route 鍐?fire-and-forget 褰撲綔鏂板鑳藉姏鎺ュ叆鏂瑰紡銆?
- Step Module / NodeRunner / PolicyEngine 鍐欏叆鍚堝悓宸茶鐩栬嚜鍔ㄥ婕斿叧閿啓鍏ラ潰锛涗笅涓€姝ラ噸鐐硅浆涓虹湡瀹炴暟鎹仮澶嶃€乴edger 鐪熺浉灞傘€佽川閲忛棴鐜拰鐘舵€侀┍鍔?replan銆?
- `PolicyEngine` 杩樹笉鏄墍鏈夊啓鍏ュ姩浣溿€佽鐩栧姩浣滃拰楂樻垚鏈鏍″姩浣滅殑纭?gate銆?
- Artifact Ledger 浠嶆槸 seed payload wrapper 绱㈠紩锛岀己鐙珛鎸佷箙鍖栬〃銆佸畬鏁寸敓鍛藉懆鏈熴€佽法浠诲姟渚濊禆婕旇繘鍜屽彲鎭㈠鏌ヨ鑳藉姏銆?
- 绔犺妭鎵ц銆佽川閲忎慨澶嶃€乸ipeline job 宸插紑濮嬫爣鍑嗚妭鐐瑰寲锛屼絾杩樻病鏈夊畬鍏ㄨ揪鍒板彲缁勫悎銆佸彲閲嶆斁銆佸彲瀹¤鐨勭粺涓€ Step Runtime銆?
- `reader_promise`銆乣chapter_retention_contract`銆乣continuity_state`銆乣rolling_window_review`銆乣character_governance_state` 绛夎川閲忎骇鐗╁凡杩涘叆绱㈠紩鍜屼緷璧栭摼锛屼絾杩樻病鏈夊舰鎴愮ǔ瀹氱殑璇勪及 -> 淇 -> 鍐嶈瘎浼伴棴鐜€?
- 鍒涗綔涓灑鎺ュ叆浠嶅亸宸ュ叿绾э紱杩樻病鏈夊舰鎴愨€滀腑鏋㈣鍒?-> director runtime -> step execution -> projection -> 鐢ㄦ埛纭鈥濈殑瀹屾暣闂幆浣撻獙銆?
- 鑷姩瀵兼紨涓绘墽琛岄摼褰撳墠涓嶄娇鐢?LangGraph锛汱angGraph 鍙兘浣滀负鍚庣画缂栨帓澹虫帴鍏ワ紝涓嶈兘鏇夸唬 runtime銆乸olicy銆乴edger 鍜?step contract銆?
- `server/src/prompting/workflows/workflowRegistry.ts` 宸茶秴杩?700 琛岀‖闃堝€硷紝鍚庣画缁х画鎵╁睍 intent 鍓嶅簲鎷嗗嚭鎸夊煙 workflow definitions銆?
- 鐪熷疄 Prisma 绔埌绔洖褰掍粛涓嶈冻锛屽挨鍏舵槸鏃ч」鐩帴绠°€佹湇鍔￠噸鍚悗鎵嬪姩鎭㈠銆佺珷鑺傛壒閲忔墽琛屻€佹敼鏂囧悗灞€閮ㄤ慨澶嶅拰澶氬嵎闀垮懆鏈熸帹杩涖€?
- `NovelDirectorService.ts` 浠嶇劧杩囬暱锛屽繀椤荤户缁妸鎵ц鍩熶笅娌夊埌 runtime orchestration銆乤dapters 鍜?step modules銆?

褰撳墠瀹屾垚搴﹀垽鏂細

- 鎸?MVP 搴曞骇琛￠噺锛氱害 `85%` 宸插畬鎴愩€?
- 鎸夊畬鏁寸粺涓€杩愯鏃惰　閲忥細绾?`70%` 宸插畬鎴愩€?
- 鎸夊畬鏁?P0鈥滆鏂版墜绋冲畾瀹屾垚鏁存湰灏忚鈥濅骇鍝佺洰鏍囪　閲忥細绾?`55%-60%` 宸插畬鎴愩€?
- 鍓╀綑椋庨櫓涓嶅湪鈥滄槸鍚︿娇鐢?LangGraph鈥濓紝鑰屽湪鎵ц闈簩娆￠殧绂绘槸鍚﹀交搴曘€佷骇鐗╃湡鐩告槸鍚﹀彲鎭㈠銆佺湡瀹炴暟鎹摼璺槸鍚︾ǔ瀹氥€佽川閲忛棴鐜槸鍚﹁兘灞€閮ㄤ慨澶嶏紝浠ュ強鐘舵€侀┍鍔?replan 鏄惁鐪熸鎴愪负榛樿鍒ゆ柇銆?

## 2.0.1 2026-04-30 鍒嗘敮闃舵鎬荤粨

褰撳墠 `codex/auto-director-runtime-mvp-plan` 鍒嗘敮鐩稿浼樺寲鍓嶅凡缁忓畬鎴愪互涓嬪叧閿崌绾э細

- 浠庢棫鑷姩瀵兼紨闀挎祦绋嬪嚱鏁版帹杩涗负缁熶竴杩愯鏃惰竟鐣岋細`DirectorRuntimeService / NodeRunner / PolicyEngine / Step Module / Runtime Projection / DirectorEvent` 宸叉垚涓轰富楠ㄦ灦銆?
- 浠?Web API 鐩存帴鎵ц閲嶅瀷閾捐矾鎺ㄨ繘涓虹涓€鐗堟墽琛岄潰闅旂锛歚DirectorRunCommand`銆佺嫭绔?`Director Worker`銆佺绾︺€佺画绉熴€佸け璐ヨ惤鎬佸拰杞婚噺 projection 杞宸茶惤鍦般€?
- 鎭㈠閾句粠鈥滃け璐ュ悗浜哄伐鐚滄祴鈥濇帹杩涗负浠庣湡瀹炶祫浜ф柇鐐规仮澶嶏細鏈嶅姟閲嶅惎銆佺绾﹁繃鏈熴€佹畫鐣?running step銆佺己澶?outline銆佸巻鍙叉帴绠′换鍔″拰涓婁笅鏂囦涪澶辩户缁兘宸叉湁閽堝鎬у鐞嗐€?
- 浠诲姟鐘舵€佷粠鍚庡彴瀛楁鎺ㄨ繘鍒扮敤鎴峰彲瑙ｉ噴鐘舵€侊細浠诲姟涓績銆佺紪杈戦〉銆佸皬璇村垪琛ㄥ拰鎭㈠寮圭獥寮€濮嬪睍绀哄綋鍓嶉樁娈点€侀樆濉炲師鍥犮€佹仮澶嶅姩浣滃拰鏈€杩戝仴搴烽樁娈点€?
- 涔︾骇鑷姩鍖栫姸鎬佹姇褰卞凡钀藉湴绗竴鐗堬細鑷姩瀵兼紨浠诲姟銆佸懡浠ゃ€佽繍琛屼簨浠躲€佽嚜鍔ㄧ‘璁よ褰曞拰浜х墿姒傚喌鍙互鎸?`novelId` 鑱氬悎涓轰功绾ч┚椹惰埍锛屼换鍔′腑蹇冪户缁綔涓烘墽琛岃鎯呭叆鍙ｃ€?
- 绔犺妭鎵ц浜ゆ帴浠庘€滄媶绔犵‘璁ゆ€佲€濇帹杩涘埌鐪熷疄鎵ц鎬侊細姝ｆ枃寮€濮嬬敓鎴愬悗锛屼晶鏍忔祦绋嬪拰 checkpoint 浼氳窡闅忕珷鑺傛墽琛岄樁娈碉紝閬垮厤鐢ㄦ埛鐪嬪埌鈥滃凡缁忓啓姝ｆ枃浣嗘祦绋嬩粛寰呮媶绔犫€濈殑閿欎綅銆?
- Artifact Ledger銆丳rompt Workbench銆丆ontext Broker 鍜?runtime tools 宸茶繘鍏ョ粺涓€杩愯鏃讹紝鍚庣画鍙互缁х画鎵挎帴浜х墿鐪熺浉銆佹彁绀鸿瘝娌荤悊鍜屽垱浣滀腑鏋㈡帶鍒躲€?

褰撳墠浠嶄笉瑙嗕负瀹屾垚鐨勫唴瀹癸細

- 鎵ц闈㈤殧绂讳粛闇€浜屾鏀跺彛锛歋QLite WAL / busy timeout銆佽繍琛屾€?delta 鎸佷箙鍖栥€佸彲瑙佸伐浣滃尯鍒锋柊杈圭晫锛屼互鍙婂€欓€夌‘璁ゃ€佹爣棰樹慨澶嶇瓑鏃у叆鍙?command 鍖栥€?
- 鐪熷疄 Prisma 鎶芥牱鍥炲綊浠嶉渶瑕嗙洊鏃ч」鐩帴绠°€佹湇鍔￠噸鍚仮澶嶃€佺珷鑺傛壒娆℃仮澶嶃€佸彇娑堝悗閲嶈瘯銆佺珷鑺傛墽琛屽拰鐘舵€佺増鏈€?
- 绔犺妭缁嗗寲璐ㄩ噺闂ㄧ宸插畬鎴愮涓€鍒€锛宍purpose / boundary / taskSheet / sceneCards` 浼氬厛缁忚繃缁撴瀯鏍￠獙鍜?AI 璇箟鍙敤鎬ц瘎浼帮紝鍧忎换鍔″崟涓嶅緱鐩存帴杩涘叆绔犺妭鍚屾鎴栨墽琛岄摼銆傜珷鑺備慨澶嶇瓥鐣ヤ篃宸插畬鎴?`patch_first` 绗竴鍒€锛岃川閲忛棴鐜?MVP 宸茶兘鎶婄暀瀛樸€佽繛缁€у拰婊氬姩绐楀彛鐘舵€佽褰曞埌绔犺妭椋庨櫓鏍囪锛汚rtifact Ledger 鏌ヨ鐪熺浉灞傚凡鑳戒负涔︾骇椹鹃┒鑸辨彁渚?active/stale/protected/dependency/content hash 鍩虹鐘舵€侊紱瀹為檯 Replan 鎵ц绐楀彛宸插垏鍒?AI 缁撴瀯鍖栧喅绛栥€傚悗缁己鍙ｈ浆涓鸿ˉ涓佸け璐ヨ鏁般€佷繚鎶ゆ鏂?gate銆佸啓鍏ヤ簨浠跺叏瑕嗙洊銆侀樁娈电骇妯″瀷璺敱銆佽鑹叉不鐞嗙姸鎬佸拰鏂版墜鍏ュ彛鏀舵暃銆?

## 2.1 涓嬩竴杞渶楂樹紭鍏堢骇寮€鍙戦槦鍒?

浠ヤ笅 14 椤逛綔涓?`codex/auto-director-runtime-mvp-plan` 鍒嗘敮鐨勪笅涓€杞嵆灏嗗紑鍙戦」鐩紝浼樺厛绾ч珮浜庡悗缁墿鍏ュ彛銆佸垱浣滀腑鏋富瀵肩紪鎺掑拰 LangGraph 涓婚摼鍖栥€?

1. **鎵ц闈㈤殧绂讳笌 API 淇濇椿浜屾鏀跺彛**锛氬湪绗竴鐗堝懡浠ゅ寲鍏ュ彛銆佺嫭绔?Director Worker 鍜岃交閲?runtime projection 鍩虹涓婏紝缁х画鏀跺彛 SQLite WAL / busy timeout銆佽繍琛屾€?delta 鎸佷箙鍖栥€佸彲瑙佸伐浣滃尯鍒锋柊杈圭晫锛屼互鍙婂€欓€夌‘璁ゃ€佹爣棰樹慨澶嶇瓑鏃у叆鍙?command 鍖栵紱绂佹 Web API route 鏂板鐩存帴鎵ц鑷姩瀵兼紨閲嶅瀷閾捐矾銆?
2. **瑙勫垝鎭㈠閾剧ǔ瀹?*锛氬湪 Worker 璇箟涓嬭ˉ榻?`volume_strategy` 骞傜瓑閲嶆斁銆佹寔涔呭寲鍗疯鍒掓仮澶嶅埌 `structured_outline` 鐨勭湡瀹炴暟鎹洖褰掞紱纭繚宸叉湁璧勪骇涓嶄細琚噸澶嶇敓鎴愭垨璺宠繃銆?
3. **鐪熷疄 Prisma 鎶芥牱鍥炲綊**锛氬彧璇诲璁″凡瑕嗙洊鏃ч」鐩帴绠°€佹湇鍔￠噸鍚墜鍔ㄦ仮澶嶃€佺珷鑺傛壒閲忔墽琛屻€佸€欓€夌‘璁ゃ€佹爣棰樹慨澶嶅け璐ラ殧绂汇€乺etry/resume/continue/cancel 鍛戒护銆佹墜鍔ㄦ敼鏂囧奖鍝嶅拰缂烘鏂囪处鏈熀绾匡紱鍚庣画琛ョ湡瀹炲壇鏈?E2E 鏍锋湰鎵ц璁板綍锛岄噸鐐归獙璇?`migration -> 绔犺妭鍐欏叆 -> 鍊欓€夊彉鏇?-> 鐘舵€佺増鏈琡銆?
4. **Artifact Ledger 鐪熺浉灞?*锛氱涓€鍒€宸插畬鎴愩€備功绾ф姇褰卞彲鐩存帴璇诲彇鎸佷箙鍖栬处鏈殑 active/stale/protected/dependency/content hash 鍩虹鐘舵€侊紝骞跺悜 AI 椹鹃┒鑸辨彁渚涙寜绫诲瀷姹囨€诲拰鏈€杩戜骇鐗╄褰曪紱鍚庣画琛ラ綈鍐欏叆浜嬩欢鍏ㄨ鐩栥€乴egacy backfill 瀹¤鍜屽眬閮ㄦ仮澶嶈兘鍔涖€?
5. **PolicyEngine 纭?gate 娣卞寲**锛氶珮鎴愭湰瀹℃牎銆侀珮椋庨櫓淇銆佸ぇ鑼冨洿鑷姩鎵ц銆佽鐩栫敤鎴峰唴瀹圭瓑鍦烘櫙蹇呴』鍦ㄥ啓鍏ュ墠缁忚繃绛栫暐鍒ゆ柇鍜屽鎵硅竟鐣屻€?
6. **璐ㄩ噺浜х墿闂幆**锛氱涓€鍒€宸插畬鎴愩€俙chapter_retention_contract / continuity_state / rolling_window_review` 浼氬湪绔犺妭瀹℃牎鍜屾壒閲忔墽琛屽悗褰㈡垚缁熶竴璇勪及鐘舵€佸苟鍐欏叆绔犺妭椋庨櫓鏍囪锛涘悗缁妸璇ョ姸鎬佸啓鍏?Ledger 鐪熺浉灞傦紝琛ラ綈杩炵画淇澶辫触璁℃暟銆佽鑹叉不鐞嗙姸鎬佸拰鑷姩鍐嶈瘎浼拌Е鍙戙€?
7. **Planner / Replan 鐘舵€侀┍鍔ㄥ寲**锛氱涓€鍒€宸插畬鎴愩€俙PlannerService.replan` 鐨勫疄闄呮墽琛岀獥鍙ｇ敱 PromptAsset 缁撴瀯鍖?AI 鍐崇瓥娑堣垂 canonical state銆佺珷鑺傜洰鏍囥€佸鏍℃姤鍛婂拰浼忕瑪璐︽湰锛岀‘瀹氭€т唬鐮佸彧鍋氬彲鐢ㄧ珷鑺傝繃婊ゅ拰绐楀彛涓婇檺鏍￠獙锛涘悗缁妸 Replan 缁撴灉鍐欏叆 Ledger 浜嬩欢骞堕┍鍔ㄥ悗缁壒娆¤嚜鍔ㄧ画璺戙€?
8. **绔犺妭浠诲姟鍗曡川閲忛棬绂?*锛氱涓€鍒€宸插畬鎴愩€俙purpose / boundary / taskSheet / sceneCards` 宸叉湁 shared 鍚堝悓銆佹湇鍔＄缁撴瀯鏍￠獙銆丄I 璇箟鍙敤鎬ц瘎浼板拰鍚屾鍓嶉樆鏂紱鍚庣画鎶婅川閲忕粨璁哄啓鍏?Ledger 鐪熺浉灞傦紝骞舵帴鍏ュ眬閮ㄤ慨澶嶉棴鐜€?
9. **绔犺妭淇绛栫暐**锛氱涓€鍒€宸插畬鎴愩€傜珷鑺傝嚜鍔ㄤ慨澶嶅拰鎵嬪姩淇鍏ュ彛榛樿鍏堣蛋 `patch_first` 灞€閮ㄨˉ涓侊紝`heavy_repair` 鎵嶈繘鍏ユ暣绔犱慨澶嶏紱鍚庣画琛ラ綈杩炵画琛ヤ竵澶辫触鍗囩骇銆佷繚鎶ゆ鏂?gate銆佷慨澶嶈褰曞叆 Ledger锛屼互鍙婂姩鎬佽鑹茬郴缁熻繘鍏ユ墽琛屾湡瑙掕壊绛涢€夈€佷慨澶嶈竟鐣屽拰 replan 鍒ゆ柇銆?
10. **妯″瀷璺敱缁嗗寲**锛氫粠 `planner / writer / review / repair` 绮楃矑搴︽帹杩涘埌灏忚鐢熶骇闃舵绾ц矾鐢变笌 fallback銆?
11. **鍗风骇宸ヤ綔鍙版秷璐归摼**锛氭妸 `critique / rebalance / uncertainty / canonical payoff ledger` 鎺ユ垚鍗风骇宸ヤ綔鍙伴粯璁ゆ秷璐归摼锛屽苟璁╁嵎绾ц处鏈鍥炬垚涓轰富瑙嗗浘銆?
12. **鏂版墜鍏ュ彛鏀舵暃**锛氶椤点€佸垱寤洪〉銆佺┖鐘舵€佺粺涓€涓衡€淎I 鑷姩瀵兼紨鎺ㄨ崘鍏ュ彛 + 鎵嬪姩楂樼骇鍏ュ彛鈥濓紱鍏抽敭鑺傜偣鍙繚鐣欎竴涓帹鑽愪笅涓€姝ャ€?
13. **鎷嗕功浠诲姟鍚堝悓**锛氳ˉ榻?`scope / pause / resume / coverage`锛屽舰鎴愨€滃墠 N 鐗囨璇曡窇 -> 鎵╄寖鍥寸户缁€濈殑娓愯繘寮忔祦绋嬨€?
14. **鎶€鏈€烘敹鍙?*锛氭媶鍒?`workflowRegistry.ts`锛岀户缁槮韬?`NovelDirectorService` 鍜?`DirectorRuntimeStore`锛岄伩鍏嶆柊鑳藉姏缁х画鍫嗗洖涓?service銆?

## 3. 鎵ц鍘熷垯

### 3.1 涓€娆″畬鏁翠氦浠?

鏈鍒掓寜瀹屾暣鏀归€犱氦浠樻墽琛岋紝涓嶆媶鎴愬彲闀挎湡鍋滅暀鐨勫崐鎴愬搧闃舵銆傚厑璁稿湪鍚屼竴娆′氦浠樺唴鎸変緷璧栧厛鍚庡疄鏂斤紝浣嗘渶缁堥獙鏀跺繀椤昏鐩栧叏閾捐矾銆?

涓嶆帴鍙楃殑瀹屾垚鐘舵€侊細

- 鍙湁 runtime 璁板綍锛屾病鏈夌瓥鐣ユ帴绠°€?
- 鍙湁鍚庣 snapshot锛屾病鏈夊墠绔彲瑙佽繘搴︺€?
- 鍙湁宸ヤ綔鍖哄垎鏋愶紝娌℃湁鎵嬪姩缂栬緫褰卞搷鍒嗘瀽銆?
- 鍙湁绔犺妭鎵ц璁板綍锛屾病鏈夊眬閮ㄥけ璐ュ拰 repair ticket銆?
- 鍙湁鍒涗綔涓灑宸ュ叿澹版槑锛屽嵈浠嶇洿鎺ョ鏃ц嚜鍔ㄥ婕旈樁娈靛嚱鏁般€?
- 鍙湁 Context Broker 鑽夋锛屽嵈娌℃湁浠讳綍鐪熷疄 prompt 鎴?step 娑堣垂銆?

### 3.2 AI-first

宸ヤ綔鍖洪樁娈靛垽鏂€佹墜鍔ㄧ紪杈戝奖鍝嶅垎鏋愩€佷笅涓€姝ユ帹鑽愩€佽川閲忛闄╁垽鏂€佷慨澶嶈矾寰勫缓璁紝蹇呴』閫氳繃 AI 缁撴瀯鍖栫悊瑙ｅ畬鎴愩€?

鍏佽纭畾鎬т唬鐮佸仛锛?

- 璧勪骇瀛樺湪鎬ф壂鎻忋€?
- 杈撳叆鏍￠獙銆?
- 骞傜瓑銆侀攣銆佹潈闄愬拰瑕嗙洊淇濇姢銆?
- AI 杈撳嚭鍚庣殑鑼冨洿妫€鏌ュ拰瀹夊叏杩囨护銆?

涓嶅厑璁哥敤鍏抽敭璇嶃€佹鍒欍€佺‖缂栫爜鍒嗘敮鏇夸唬鏍稿績鍒ゆ柇銆?

### 3.3 鏂版墜瀹屾垚鏁存湰涔︿紭鍏?

鎵€鏈?UI銆佺瓥鐣ュ拰杩愯鏃惰兘鍔涢兘鏈嶅姟浜庝竴涓洰鏍囷細璁╁畬鍏ㄥ啓浣滄柊鎵嬬煡閬撲笅涓€姝ヨ鍋氫粈涔堬紝骞惰兘鎸佺画鎺ㄨ繘鍒板畬鏁村皬璇淬€?

鍥犳瀹屾暣浜や粯蹇呴』璁╃敤鎴风湅鍒帮細

- 褰撳墠灏忚鍋氬埌鍝噷銆?
- 绯荤粺鎺ㄨ崘涓嬩竴姝ユ槸浠€涔堛€?
- 涓轰粈涔堟帹鑽愯繖涓€姝ャ€?
- 鍝簺鍐呭浼氳淇濇姢銆?
- 鍝簺椋庨櫓鍙奖鍝嶅眬閮ㄨ寖鍥淬€?
- 澶辫触鍚庡浣曠户缁€?

### 3.4 鍏堟敹鍙ｅ啀鎵╁睍锛屼絾鍚屽睘涓€娆′氦浠?

Reader Promise銆丆hapter Retention Contract銆丷olling Window Review銆乄orld Skeleton銆丆haracter Governance 绛夊垱浣滆川閲忔ā鍧楁渶缁堣杩涘叆缁熶竴杩愯鏃躲€?

浣嗗畠浠笉鑳界粫杩?runtime銆乸olicy銆乤rtifact銆乪vent 杈圭晫鍗曠嫭鍫嗗姛鑳姐€傚畬鏁翠氦浠樼殑鎵ц椤哄簭蹇呴』鍏堝缓绔嬭竟鐣岋紝鍐嶆妸璐ㄩ噺妯″潡鎺ヨ繘杈圭晫銆?

### 3.5 鏁版嵁瀹夊叏

瀹屾暣鎵ц鏈熼棿濡傛秹鍙婃暟鎹簱杩佺Щ锛岄粯璁ゅ彧鍏佽 additive schema change銆?

浠讳綍鍒犻櫎銆侀噸缃€佽鐩栨棫鏁版嵁銆侀噸绠楀苟瑕嗙洊鐢ㄦ埛鍐呭鐨勬搷浣滐紝蹇呴』婊¤冻椤圭洰鏁版嵁淇濇姢瑙勫垯锛?

- 鏄庣‘鐢ㄦ埛鎵瑰噯銆?
- 鏈夊彲楠岃瘉澶囦唤璺緞銆?
- 鏈夋仮澶嶉獙璇佹垨鑷冲皯澶囦唤瀛樺湪鎬т笌澶у皬妫€鏌ャ€?

## 4. 瀹屾暣鐩爣鏋舵瀯

```text
鑷姩瀵兼紨鍏ュ彛 / 鎺ョ鍏ュ彛 / 缁х画鍏ュ彛 / 鍒涗綔涓灑鍏ュ彛 / 鎵嬪姩淇敼鍚庣户缁?
  鈫?
DirectorRuntimeService
  鈫?
PolicyEngine
  鈫?
NodeRunner
  鈫?
Legacy Stage Adapter / Step Module
  鈫?
Context Broker
  鈫?
Prompt Runner
  鈫?
Artifact Ledger
  鈫?
DirectorEvent
  鈫?
Task Center / Auto Director UI / Creative Hub Projection / Prompt Trace
```

妯″潡鑱岃矗锛?

| 妯″潡 | 瀹屾暣浜や粯鑱岃矗 |
| --- | --- |
| DirectorRuntimeService | 缁熶竴杩愯鍏ュ彛銆佽繍琛岀姸鎬併€佺瓥鐣ュ垏鎹€佽妭鐐硅皟搴︺€佹仮澶嶈涔?|
| PolicyEngine | 鑷姩/鎵嬪姩绛栫暐銆佽鐩栦繚鎶ゃ€佷慨澶嶉绠椼€佸け璐ヨ寖鍥存帶鍒躲€佸鎵硅姹?|
| NodeRunner | 鏍囧噯鑺傜偣鎵ц銆佸箓绛夈€乻tep/event/artifact 鍐欏叆銆侀敊璇褰?|
| Legacy Stage Adapter | 鍖呰鏃у€欓€夈€佽鍒掋€佹媶绔犮€佹帴绠°€佺珷鑺傛墽琛屽拰淇鑳藉姏 |
| Step Module | 鏂拌兘鍔涚殑鏍囧噯鎵ц鍗曞厓锛屼緵鑷姩瀵兼紨銆佺珷鑺傛祦姘寸嚎鍜屽垱浣滀腑鏋㈠鐢?|
| Context Broker | 缁熶竴鍙栨暟銆侀绠椼€佸揩鐓у拰涓婁笅鏂囧潡鐢熸垚 |
| Prompt Runner | 缁х画浣滀负浜у搧绾?prompt 璋冪敤鍏ュ彛锛屾墽琛屾敞鍐屻€佺粨鏋勫寲杈撳嚭鍜屾牎楠?|
| Artifact Ledger | 淇濆瓨浜х墿绱㈠紩銆佹潵婧愩€佺増鏈€佷緷璧栥€乻tale銆佷繚鎶ょ姸鎬?|
| DirectorEvent Projection | 鎶婅繍琛屼簨瀹炴姇褰卞埌鐢ㄦ埛鍙杩涘害銆佷换鍔′腑蹇冨拰鍒涗綔涓灑 |
| LangGraph Pilot | 鍙礋璐ｄ綆椋庨櫓缂栨帓銆乮nterrupt銆乺esume 鍜?trace |

## 5. 瀹屾暣鎵ц鑼冨洿

### 5.1 Runtime 鎺ョ鏃ч樁娈?

蹇呴』瀹屾垚锛?

- 寤虹珛 runtime adapters锛?
  - `CandidateStageNodeAdapter`
  - `PlanningStageNodeAdapter`
  - `StructuredOutlineNodeAdapter`
  - `TakeoverNodeAdapter`
  - `ChapterExecutionNodeAdapter`
  - `QualityRepairNodeAdapter`
- 鏃ч樁娈甸€氳繃 `DirectorNodeRunner.run()` 鎵ц锛屼笉鍐嶅彧鎵嬪姩璁板綍 step銆?
- 姣忎釜 adapter 澹版槑锛?
  - reads
  - writes
  - mayModifyUserContent
  - requiresApprovalByDefault
  - supportsAutoRetry
  - affectedScope resolver
- `NovelDirectorService` 淇濈暀 API facade 鍜屽吋瀹瑰叆鍙ｏ紝涓荤紪鎺掕亴璐ｄ笅娌夊埌 runtime orchestration 鍜?adapters銆?

瀹屾垚鏍囧噯锛?

- 鍊欓€夈€佷功绾ц鍒掋€佽鑹插噯澶囥€佸垎鍗风瓥鐣ャ€佺粨鏋勫寲鎷嗙珷銆佹帴绠°€佺珷鑺傛墽琛屻€佽川閲忎慨澶嶉兘鑷冲皯鏈夋爣鍑?adapter銆?
- 鍐欏叆鍨嬭妭鐐规墽琛屽墠蹇呴』缁忚繃 PolicyEngine銆?
- `suggest_only` 妯″紡涓嬩笉鎵ц鍐欏叆鑺傜偣銆?
- 鐢ㄦ埛姝ｆ枃鐩稿叧鑺傜偣鍦ㄦ湭鍏佽瑕嗙洊鏃惰繘鍏ョ‘璁ゆ垨闃绘柇鑼冨洿銆?
- `NovelDirectorService.ts` 涓嶇户缁闀匡紝骞跺紑濮嬫媶鍑烘槑鏄捐亴璐ｃ€?

### 5.2 PolicyEngine 纭帴鍏?

蹇呴』瀹屾垚锛?

- 灏嗙瓥鐣ュ垽鏂帴鍒版墍鏈夊啓鍏ュ瀷 NodeRunner 鑺傜偣銆?
- 鏀寔绛栫暐锛?
  - `suggest_only`
  - `run_next_step`
  - `run_until_gate`
  - `auto_safe_scope`
- 鏀寔瀹℃壒鍒ゆ柇锛?
  - 瑕嗙洊鐢ㄦ埛鍐呭銆?
  - 閲嶇畻涓嬫父浜х墿銆?
  - 鑷姩鎵ц澶ц寖鍥寸珷鑺傘€?
  - 楂橀闄╀慨澶嶃€?
- 鏀寔璐ㄩ噺澶辫触澶勭悊锛?
  - `repair_once`
  - `pause_for_manual`
  - `continue_with_risk`
  - `block_scope`
- 鑷姩淇棰勭畻鍥哄畾涓轰竴娆★紝鍚庣画鎵╁睍蹇呴』鏄惧紡璁捐銆?

瀹屾垚鏍囧噯锛?

- PolicyEngine 涓嶅啀鍙槸鍗曟祴瀵硅薄锛岃€屾槸瀹為檯闃绘涓嶇鍚堢瓥鐣ョ殑鍐欏叆鍔ㄤ綔銆?
- 鍗曠珷澶辫触鍙奖鍝嶅彈褰卞搷绔犺妭鎴栬寖鍥达紝涓嶅喕缁撳叏涔︺€?
- 楂橀闄╄鐩栭粯璁ら渶瑕佺‘璁ゃ€?
- 闈炵牬鍧忔€ч棶棰樺厑璁歌褰曢闄╁悗缁х画銆?

### 5.3 Artifact Ledger 瀹屾暣 wrapper

蹇呴』瀹屾垚锛?

- 绱㈠紩鏍稿績浜х墿锛?
  - `book_contract`
  - `story_macro`
  - `character_cast`
  - `volume_strategy`
  - `chapter_task_sheet`
  - `chapter_draft`
  - `audit_report`
  - `repair_ticket`
  - `reader_promise`
  - `character_governance_state`
  - `world_skeleton`
  - `source_knowledge_pack`
  - `chapter_retention_contract`
  - `continuity_state`
  - `rolling_window_review`
- 缁?artifact 澧炲姞锛?
  - source
  - sourceStepRunId
  - promptAssetKey / promptVersion
  - contentHash 鎴?contentSignature
  - dependsOn
  - status: draft / active / superseded / stale / rejected
  - protectedUserContent marker
- Workspace Analyzer 璇诲彇 ledger 鍒ゆ柇锛?
  - missing
  - active
  - stale
  - protected user edited
  - needs repair

瀹屾垚鏍囧噯锛?

- 宸叉湁灏忚鑳?backfill 鍩虹 artifact 绱㈠紩銆?
- 鏂扮敓鎴愪骇鐗╁啓鏃т笟鍔¤〃鍚庡悓姝ュ啓 ledger wrapper銆?
- 鐢ㄦ埛缂栬緫绔犺妭姝ｆ枃鍚庯紝瀵瑰簲 draft 琚瘑鍒负鍙椾繚鎶ゅ唴瀹广€?
- 绔犵翰渚濊禆涓婃父瑙掕壊銆佸垎鍗枫€佷笘鐣岃鍒欙紱姝ｆ枃渚濊禆绔犵翰锛涗慨澶嶇エ鎹緷璧栧鏍告姤鍛婂拰姝ｆ枃銆?
- Analyzer 鐨勬帹鑽愬姩浣滆兘鍩轰簬 ledger 缂哄け銆乻tale銆佷繚鎶ょ姸鎬佽緭鍑恒€?

### 5.4 DirectorEvent 鎶曞奖鍜岀敤鎴峰彲瑙佽繘搴?

蹇呴』瀹屾垚锛?

- 寤虹珛 `DirectorEventProjectionService`銆?
- Runtime events 鎶曞奖鍒帮細
  - task center detail step銆?
  - auto director progress panel銆?
  - workflow explainability summary銆?
  - creative hub message/tool result銆?
- 闀挎楠?heartbeat锛?
  - 鍊欓€夌敓鎴愩€?
  - 闀?prompt 璋冪敤銆?
  - volume generation銆?
  - chapter detail bundle銆?
  - chapter execution / review / repair銆?
- 淇宸茬煡杩涘害闂锛?
  - `book_contract` 杩涘害涓嶈兘浣庝簬鍓嶇疆 `constraint_engine`銆?
  - 浠诲姟涓績鍜屽脊绐椾笉搴旀樉绀轰簰鐩稿啿绐佺殑闃舵銆?

瀹屾垚鏍囧噯锛?

- 鑷姩瀵兼紨杩愯瓒呰繃 30 绉掓椂锛岀敤鎴蜂粛鑳界湅鍒板綋鍓嶉樁娈点€佺瓑寰呰鏄庡拰鏈€杩戜簨浠躲€?
- 绔犺妭鎵ц涓殑鐢熸垚銆佸鏍°€佷慨澶嶈兘鍦?UI 鎴栦换鍔¤鎯呬腑鍖哄垎銆?
- `chapter_batch_ready`銆乣chapter_batch_ready`銆乣workflow_completed` 鏈夋槑纭笅涓€姝ュ缓璁€?
- 鐢ㄦ埛鐪嬪埌鐨勬槸浠诲姟璇█锛屼笉鏄悗绔縼绉绘垨閲嶆瀯璇█銆?

### 5.5 绔犺妭鎵ц涓庤川閲忎慨澶嶆爣鍑嗚妭鐐?

蹇呴』瀹屾垚锛?

- 鏂板鏍囧噯鑺傜偣锛?
  - `chapter_execution_node`
  - `chapter_quality_review_node`
  - `chapter_repair_node`
  - `chapter_state_commit_node`
  - `payoff_ledger_sync_node`
  - `character_resource_sync_node`
- Pipeline job 淇濈暀涓哄瓙鎵ц鍣紝浣嗗叆鍙ｃ€佺粨鏋溿€佸け璐ャ€佹仮澶嶉兘鐢?NodeRunner 绠＄悊銆?
- 瀹℃牳缁撴灉鍐欏叆 `audit_report` 鍜屽繀瑕佺殑 `repair_ticket`銆?
- 淇澶辫触鍚庤繘鍏ヤ汉宸ヤ慨澶嶆垨甯﹂闄╃户缁€?

瀹屾垚鏍囧噯锛?

- 绗?5 绔犲鏍稿け璐ユ椂鐢熸垚 repair ticket锛屼笉鍐荤粨鏁存湰涔︺€?
- 鑷姩淇涓€娆″け璐ュ悗杩涘叆浜哄伐淇鎴栧甫椋庨櫓缁х画銆?
- 缁х画绗?6 绔犳椂涓嶄細閲嶅鍒涘缓绗?5 绔?pipeline job銆?
- 鏈嶅姟閲嶅惎鍚庡厛鎻愮ず鐢ㄦ埛鎵嬪姩鎭㈠锛涚敤鎴风‘璁ゆ仮澶嶅悗浠庢渶鍚庢垚鍔?step / artifact 缁х画锛屼笉閲嶅鍐欐鏂囥€?

### 5.6 鎵嬪姩缂栬緫褰卞搷鍒嗘瀽

蹇呴』瀹屾垚锛?

- 鎵╁睍 Workspace Analyzer schema锛?
  - `manualEditImpact`
  - `affectedArtifacts`
  - `minimalRepairPath`
  - `safeToContinue`
  - `requiresApproval`
- 澧炲姞纭畾鎬?edit inventory锛?
  - 鏈€杩戜慨鏀圭珷鑺傘€?
  - 淇敼鍚庣殑 contentHash銆?
  - 鐩稿叧涓嬫父 task sheet / draft / audit report銆?
  - 鐩稿叧 reader promise / payoff / character state銆?
- 鏆撮湶 runtime API锛?
  - 鍙互浣滀负 workspace analysis mode銆?
  - 鎴栨柊澧?`evaluate-manual-edit-impact` 璺敱銆?
- 鍓嶇鍜屽垱浣滀腑鏋㈠睍绀猴細
  - 褰撳墠鏀瑰姩褰卞搷浜嗕粈涔堛€?
  - 鎺ㄨ崘涓嬩竴姝ャ€?
  - 鏄惁鍙互鐩存帴缁х画銆?
  - 鏄惁闇€瑕佺‘璁ゅ眬閮ㄩ噸绠椼€?

瀹屾垚鏍囧噯锛?

- 鐢ㄦ埛鍙鼎鑹茬 3 绔犳鏂囨椂锛岀郴缁熶笉閲嶅仛瀹忚瑙勫垝锛屽彧寤鸿瀹℃牳鎴栨洿鏂拌繛缁€с€?
- 鐢ㄦ埛鏀逛富瑙掑姩鏈烘椂锛岀郴缁熷缓璁鏍歌鑹叉不鐞嗐€佸嵎鐩爣鍜屽悗缁珷绾层€?
- 鐢ㄦ埛鍒犻櫎鍏抽敭浼忕瑪鏃讹紝绯荤粺鎸囧嚭褰卞搷鍚庣画 payoff 鎴栫浉鍏崇珷鑺備换鍔°€?
- 鎺ㄨ崘鏉ヨ嚜 AI 缁撴瀯鍖栬緭鍑猴紝纭畾鎬т唬鐮佸彧鍋氳寖鍥翠繚鎶ゅ拰瀹夊叏杩囨护銆?

### 5.7 鍒涗綔涓灑鎺ュ叆 DirectorRuntime

蹇呴』瀹屾垚锛?

- 鍒涗綔涓灑鏂板鑷姩瀵兼紨宸ュ叿锛?
  - `analyze_director_workspace`
  - `get_director_run_status`
  - `explain_director_next_action`
  - `run_director_next_step`
  - `run_director_until_gate`
  - `switch_director_policy`
  - `evaluate_manual_edit_impact`
- 宸ュ叿鍙皟鐢?DirectorRuntime 鍏紑 API銆?
- 楂橀闄╁姩浣滆繘鍏ュ垱浣滀腑鏋?approval gate銆?
- 涓灑鍥炵瓟蹇呴』闈㈠悜鏂版墜锛?
  - 褰撳墠灏忚鐘舵€併€?
  - 鎺ㄨ崘涓嬩竴姝ャ€?
  - 椋庨櫓鍜屽奖鍝嶈寖鍥淬€?
  - 鏄惁闇€瑕佺敤鎴风‘璁ゃ€?

瀹屾垚鏍囧噯锛?

- 鐢ㄦ埛鍦ㄥ垱浣滀腑鏋㈤棶鈥滆繖鏈功鐜板湪璇ュ仛浠€涔堚€濓紝绯荤粺鑳藉熀浜?runtime/workspace analysis 鍥炲銆?
- 鐢ㄦ埛瑕佹眰缁х画鑷姩瀵兼紨鏃讹紝涓灑閫氳繃 runtime policy 鍜?continue API 鎵ц銆?
- 涓灑涓嶇洿鎺ヨ皟鐢?`runStructuredOutlinePhase()`銆乣continueTakeoverExecution()` 绛夋棫鍐呴儴鍑芥暟銆?
- 瑕嗙洊鐢ㄦ埛鍐呭銆侀噸绠椾笅娓搞€佸ぇ鑼冨洿鑷姩鎵ц閮借繘鍏?approval gate銆?

### 5.8 Context Broker 鍜?Prompt Catalog

蹇呴』瀹屾垚锛?

- 鏂板 Context Resolver Registry銆?
- 棣栨壒 resolver锛?
  - `book_contract`
  - `story_macro`
  - `chapter_mission`
  - `volume_window`
  - `participant_subset`
  - `local_state`
  - `style_contract`
  - `world_slice`
  - `recent_chapters`
  - `rag_context`
  - `creative_hub.bindings`
  - `creative_hub.recent_messages`
- 鏂板 Context Broker锛?
  - 鏀寔 snapshot / fresh / hybrid銆?
  - 鏀寔 token 棰勭畻銆?
  - 杈撳嚭 PromptContextBlock銆?
- 鏂板鍙 Prompt Catalog API锛?
  - prompt id
  - version
  - taskType
  - mode
  - contextPolicy
  - outputSchema presence
- 鏂板 Prompt Preview API锛?
  - 缁欏畾 scope 鍜?prompt id 娓叉煋鏈€缁?messages銆?
  - 涓嶈皟鐢ㄦā鍨嬨€?
  - 涓嶄繚瀛?override銆?

瀹屾垚鏍囧噯锛?

- 绔犺妭鍐欎綔銆佺珷鑺傚鏍搞€亀orkspace analysis 鑷冲皯鍚勬湁涓€涓皟鐢ㄨ矾寰勪娇鐢?Context Broker銆?
- Prompt Catalog 鑳藉垪鍑烘敞鍐?prompt銆?
- Prompt Preview 鑳藉睍绀烘渶缁堜笂涓嬫枃鍧楀拰娑堟伅銆?
- 涓嶅紑鏀捐嚜鐢辩紪杈戝畬鏁?prompt銆?

### 5.9 缁熶竴 Step Module Runtime

蹇呴』瀹屾垚锛?

- 寤虹珛 `WorkflowStepModule` 濂戠害銆?
- 灏嗘棫鑷姩瀵兼紨 adapter 鍜岀珷鑺?pipeline 鑺傜偣瀵归綈涓?Step Module銆?
- 寤虹珛 Workflow Plan 缁撴瀯锛?
  - goal
  - policy
  - steps
  - dependencies
  - approval requirement
- 绔犺妭娴佹按绾垮彉鎴?Workflow Template銆?
- 鑷姩瀵兼紨鍙樻垚 Workflow Planner锛岃緭鍑烘垨璋冩暣 Workflow Plan銆?

瀹屾垚鏍囧噯锛?

- 鑷姩瀵兼紨鍜岀珷鑺傛祦姘寸嚎涓嶅啀闀挎湡鍒嗘垚涓ゅ鎵ц璇箟銆?
- 鎵嬪姩鎸夐挳銆佽嚜鍔ㄥ婕斿拰鍒涗綔涓灑鑳借繘鍏ュ悓涓€鎵?Step Module銆?
- 鏂板鑳藉姏閫氳繃 Step Module銆丆ontext Resolver銆丳romptAsset銆丄rtifact 绫诲瀷鎺ュ叆銆?

### 5.10 浣庨闄?LangGraph 璇曠偣

蹇呴』瀹屾垚锛?

- 閫夋嫨涓€涓綆椋庨櫓鍥撅細

```text
workspace_analyze
  鈫?
recommend_next_action
  鈫?
run_next_step
  鈫?
gate
```

鎴栵細

```text
candidate_generation
  鈫?
title_pack
  鈫?
candidate_selection_required interrupt
```

- LangGraph 鍙礋璐ｏ細
  - 涓嬩竴姝ュ幓鍝€?
  - interrupt銆?
  - resume銆?
  - trace銆?
- 涓氬姟鐘舵€佷粛鏉ヨ嚜锛?
  - DirectorRuntime銆?
  - PolicyEngine銆?
  - Artifact Ledger銆?
  - NodeRunner銆?

瀹屾垚鏍囧噯锛?

- interrupt / resume 鍚庝笉浼氶噸澶嶆墽琛屽凡鎴愬姛鑺傜偣銆?
- 鍥捐瘯鐐瑰け璐ヤ笉褰卞搷鏃у叆鍙ｆ甯歌繍琛屻€?
- LangGraph 涓嶇洿鎺ユ壙杞戒骇鐗╃湡鐩稿拰瑕嗙洊绛栫暐銆?

### 5.11 绗竴鎵圭綉鏂囪川閲忔ā鍧?

蹇呴』瀹屾垚锛?

1. Reader Promise Ledger
   - 涔︾骇鎵胯銆?
   - 鍗风骇鎵胯銆?
   - 鑺傚娈垫壙璇恒€?
   - 绔犺妭鎵胯銆?
   - 瀹℃牳鎵胯鍏戠幇搴︺€?
2. Chapter Retention Contract
   - 鏈珷鐩爣銆?
   - 鏂颁俊鎭€?
   - 鍙鍙樺寲銆?
   - 灏忓洖鎶ャ€?
   - 鏈В鍘嬪姏銆?
   - 绔犳湯閽╁瓙绫诲瀷銆?
   - 瑙掕壊椹卞姩鍔涖€?
   - 涓栫晫瑙勫垯浣跨敤銆?
3. Rolling Window Review
   - 鏈€杩?5 绔犳槸鍚﹀悓璐ㄣ€?
   - 涓昏鐩爣鏈夋病鏈夋帹杩涖€?
   - 璇昏€呮壙璇烘湁娌℃湁鍏戠幇鎴栧姞鐮併€?
   - 缁撳熬閽╁瓙鏄惁閲嶅銆?
   - 瑙掕壊鍏崇郴鏄惁鍋滄粸銆?
   - 涓栫晫瑙勫垯鏄惁鍙備笌鍐茬獊銆?
4. World Skeleton V1
   - 娌℃湁缁戝畾涓栫晫瑙傛椂锛屾寜棰樻潗鍒ゆ柇鏄惁鐢熸垚椤圭洰绾т笘鐣岃鍒欓鏋躲€?
   - 涓栫晫瑙勫垯蹇呴』杞寲涓哄啿绐併€佷唬浠枫€佽祫婧愩€佺鍖恒€佺粍缁囨垨鍦扮偣銆?
5. Character Governance V1
   - 涓昏闃舵鐩爣銆佽鍖恒€佷唬浠峰拰鐘舵€併€?
   - 閰嶈鍔熻兘銆佸叧绯绘帹杩涖€佸嚭鍦鸿矗浠汇€?
   - 绔犺妭浠诲姟蹇呴』璇存槑鍏抽敭瑙掕壊甯︽潵鐨勫啿绐佹垨閫夋嫨銆?

瀹屾垚鏍囧噯锛?

- 姣忕珷浠诲姟鍗曚笉鍙鏄庝簨浠讹紝杩樿鏄庤鑰呰幏寰楁劅鍜岃拷璇荤悊鐢便€?
- 鏈€杩?5 绔犻噸澶嶆垨鍋滄粸鏃讹紝绯荤粺鑳界敓鎴愬叿浣撲慨澶嶅缓璁€?
- 涓栫晫瑙備笉鍙槸鑳屾櫙璧勬枡锛岃€岃兘鍙備笌绔犺妭鍐茬獊銆?
- 瑙掕壊涓嶅彧鏄弬涓庤€咃紝鑰岃兘椹卞姩姣忕珷鍐茬獊鍜岄€夋嫨銆?
- 瀹℃牳澶辫触杈撳嚭 affected scope锛屼笉鍐荤粨鍏ㄤ功銆?

## 6. 绔埌绔墽琛屼富绾?

瀹屾暣浜や粯鎸夎繖鏉′富绾挎敹鏉燂細

```text
鐢ㄦ埛鍏ュ彛
  鈫?
Runtime 鍒濆鍖栨垨鎭㈠
  鈫?
Workspace Analyzer 璇诲彇 Ledger + Inventory
  鈫?
AI 缁撴瀯鍖栧垽鏂敓浜ч樁娈点€侀闄┿€佹帹鑽愬姩浣?
  鈫?
PolicyEngine 鍒ゆ柇鏄惁鍙墽琛屻€佹槸鍚﹂渶瀹℃壒銆佹槸鍚︿繚鎶ょ敤鎴峰唴瀹?
  鈫?
NodeRunner 鎵ц鏍囧噯鑺傜偣鎴栨棫闃舵 Adapter
  鈫?
Context Broker 缁勮涓婁笅鏂?
  鈫?
Prompt Runner 璋冪敤娉ㄥ唽 prompt
  鈫?
鏃т笟鍔¤〃鍐欏叆 + Artifact Ledger 绱㈠紩
  鈫?
DirectorEvent 璁板綍浜嬪疄
  鈫?
Projection 鏇存柊浠诲姟涓績銆佽嚜鍔ㄥ婕?UI銆佸垱浣滀腑鏋?
  鈫?
澶辫触鏃舵牴鎹?affected scope 灞€閮ㄤ慨澶嶃€佷汉宸ョ‘璁ゆ垨甯﹂闄╃户缁?
```

杩欐潯涓荤嚎蹇呴』瑕嗙洊锛?

- 鏂板缓灏忚銆?
- AI 鎺ョ宸叉湁灏忚銆?
- 鎵嬪姩淇敼鍚庣户缁€?
- 澶辫触鎭㈠銆?
- 鑷姩鎵ц绔犺妭銆?
- 璐ㄩ噺瀹℃牳鍜屼慨澶嶃€?
- 鍒涗綔涓灑璇㈤棶鍜屾帶鍒躲€?

## 7. 闈炵洰鏍?

瀹屾暣鎵ц鏈熼棿涓嶅仛锛?

- 涓嶉噸缃暟鎹簱銆?
- 涓嶅垹闄ゆ垨鎵归噺杩佺Щ鏃т笟鍔℃暟鎹€?
- 涓嶆妸鑷姩瀵兼紨涓婚摼涓€娆℃€у叏閲?LangGraph 鍖栥€?
- 涓嶅紑鏀捐嚜鐢辩紪杈戝畬鏁?prompt銆?
- 涓嶈鍒涗綔涓灑鐩存帴璋冪敤鑷姩瀵兼紨鏃у唴閮ㄩ樁娈靛嚱鏁般€?
- 涓嶇敤鍏抽敭璇嶃€佹鍒欍€佺‖缂栫爜 fallback 鏇夸唬 AI 缁撴瀯鍖栧垽鏂€?
- 涓嶅湪娌℃湁澶囦唤楠岃瘉鐨勬儏鍐典笅鎵ц浠讳綍 destructive data operation銆?

## 8. 鏁版嵁妯″瀷绛栫暐

鐭湡缁х画娌跨敤锛?

- `NovelWorkflowTask`
- `seedPayloadJson.directorRuntime`
- 鏃т笟鍔¤〃锛欱ookContract銆丼toryMacroPlan銆乂olumePlan銆丆hapter銆丵ualityReport銆丄uditReport 绛夈€?

瀹屾暣浜や粯涓彲浠ラ€氳繃 additive migration 澧炲姞锛?

- `DirectorRun`
- `DirectorStepRun`
- `DirectorEvent`
- `DirectorArtifact`
- `DirectorArtifactDependency`
- `ContextSnapshot`
- `PromptRunTrace`

鏂板鐙珛琛ㄧ殑瑙﹀彂鏉′欢锛?

- seed payload 瀛樺偍宸茬粡褰卞搷鏌ヨ銆佹姇褰便€佹仮澶嶆垨浣撶Н鎺у埗銆?
- artifact dependency 闇€瑕佽法浠诲姟鏌ヨ銆?
- prompt trace 鍜?context snapshot 闇€瑕佸彲閲嶆斁銆?
- runtime event 闇€瑕佺ǔ瀹氭姇褰卞埌澶氫釜鍏ュ彛銆?

杩佺Щ绾︽潫锛?

- 鍙仛 additive migration銆?
- 杩佺Щ鍓嶈鏄庡浠借矾寰勩€?
- 涓嶅垹闄ゆ棫瀛楁銆?
- 鏃т换鍔′粛鑳借鍙栥€?

## 9. 缁熶竴楠屾敹鍦烘櫙

瀹屾暣浜や粯蹇呴』瑕嗙洊浠ヤ笅鍦烘櫙锛?

1. 涓€鍙ヨ瘽鐏垫劅鏂板缓灏忚锛岀敓鎴愬€欓€夊苟鍋滃湪鍊欓€夌‘璁ゃ€?
2. 纭鍊欓€夊悗鐢熸垚 Book Contract銆佽鑹层€佸嵎瑙勫垝銆佸墠 10 绔犱换鍔″崟銆?
3. 宸叉湁灏忚鏈夎鑹插拰鍓?8 绔犳鏂囷紝鎺ョ鍚庡厛鍒嗘瀽宸ヤ綔鍖猴紝鍐嶆帹鑽愯ˉ绗?9-20 绔犱换鍔″崟銆?
4. 鐢ㄦ埛淇敼涓昏鍔ㄦ満锛岀郴缁熷垽鏂鑹层€佸嵎鐩爣鍜屽悗缁珷绾查渶瑕佸鏍搞€?
5. 鐢ㄦ埛鍙鼎鑹茬 3 绔犳鏂囷紝绯荤粺涓嶉噸鍋氬畯瑙傝鍒掞紝鍙缓璁鏍告垨鏇存柊杩炵画鎬с€?
6. 鐢ㄦ埛鍒犻櫎鍏抽敭浼忕瑪锛岀郴缁熸寚鍑哄悗缁?payoff 鍜岀珷鑺備换鍔″奖鍝嶈寖鍥淬€?
7. 绗?5 绔犲鏍稿け璐ワ紝鐢熸垚 repair ticket锛屼笉鍐荤粨鏁存湰涔︺€?
8. 鑷姩淇涓€娆″け璐ュ悗锛岃繘鍏ヤ汉宸ヤ慨澶嶆垨甯﹂闄╃户缁€?
9. 鏈嶅姟閲嶅惎鍚庡厛鏍囪涓哄彲鎵嬪姩鎭㈠锛涚敤鎴风‘璁ゆ仮澶嶅悗锛屼粠鏈€鍚庢垚鍔?artifact / step 缁х画锛屼笉閲嶅鍒涘缓绔犺妭鎴?pipeline job銆?
10. 鐢ㄦ埛鍦ㄥ垱浣滀腑鏋㈣闂€滅幇鍦ㄨ鎬庝箞鍔炩€濓紝绯荤粺鑳藉熀浜?runtime snapshot 鍜?workspace analysis 缁欏嚭寤鸿銆?
11. 鐢ㄦ埛鍦ㄥ垱浣滀腑鏋㈣姹傜户缁嚜鍔ㄥ婕旓紝绯荤粺閫氳繃 runtime policy 鍜?approval gate 鎵ц銆?
12. 鑷姩瀵兼紨闀挎椂闂磋繍琛屾椂锛屽墠绔粛鏄剧ず褰撳墠姝ラ銆佹渶杩戜簨浠跺拰鍙悊瑙ｇ瓑寰呰鏄庛€?
13. 鏈€杩?5 绔犲嚭鐜伴噸澶嶆帹杩涙椂锛孯olling Window Review 鐢熸垚淇寤鸿銆?
14. 娌℃湁缁戝畾涓栫晫瑙傛椂锛岀郴缁熻兘鍒ゆ柇鏄惁闇€瑕侀」鐩骇涓栫晫瑙勫垯楠ㄦ灦銆?
15. 绔犺妭浠诲姟鍗曡兘璇存槑鏈珷杩借鐞嗙敱銆佽鑹查┍鍔ㄥ姏鍜屼笘鐣岃鍒欎娇鐢ㄣ€?

## 10. 璐ㄩ噺闂?

瀹屾暣浜や粯鍓嶅繀椤婚€氳繃锛?

- `pnpm --filter @ai-novel/shared build`
- `pnpm --filter @ai-novel/server build`
- `pnpm --filter @ai-novel/client typecheck`
- Runtime / Policy / NodeRunner 鍗曟祴銆?
- Workspace Analyzer schema 鍜?prompt output validation 娴嬭瘯銆?
- Artifact Ledger dependency / stale / protection 鍗曟祴銆?
- Event Projection 鍗曟祴銆?
- Chapter execution / repair failure recovery 闆嗘垚娴嬭瘯銆?
- Creative Hub runtime tool tests銆?
- Context Broker resolver tests銆?
- LangGraph pilot resume / interrupt tests銆?
- 鑷姩瀵兼紨鏂板缓閾捐矾 smoke test銆?
- 鑷姩瀵兼紨鎺ョ閾捐矾 smoke test銆?
- 鎵嬪姩缂栬緫鍚庣户缁?smoke test銆?
- 浠诲姟涓績鍜岃嚜鍔ㄥ婕旇繘搴﹀睍绀?smoke test銆?

濡傛灉鏀瑰姩褰卞搷妗岄潰鍚姩鎴栨墦鍖咃紝杩樺繀椤昏ˉ锛?

- 妗岄潰鍚姩 smoke test銆?
- 鐩稿叧妗岄潰 packaging verification銆?

## 11. 椋庨櫓涓庣紦瑙?

| 椋庨櫓 | 褰卞搷 | 缂撹В |
| --- | --- | --- |
| Runtime 缁х画鍙槸璁板綍鍣?| 鏃ч摼璺粛鐒跺壊瑁?| 鏃ч樁娈靛繀椤婚€氳繃 NodeRunner adapter 鎵ц |
| PolicyEngine 娌℃湁纭帴鍏?| 瑕嗙洊淇濇姢褰㈠悓铏氳 | 鎵€鏈夊啓鍏ュ瀷鑺傜偣鍏堣繃 policy decision |
| Ledger 淇℃伅涓嶈冻 | 鎵嬪姩缂栬緫鍚庝粛鏃犳硶鍒ゆ柇褰卞搷 | 澧炲姞 hash銆乻ource銆乨ependsOn銆乻tale銆乸rotected marker |
| 鍓嶇涓嶆秷璐?runtime | 鐢ㄦ埛浠嶈寰楀崱浣?| Runtime event 蹇呴』鎶曞奖鍒颁换鍔′腑蹇冨拰鑷姩瀵兼紨闈㈡澘 |
| 绔犺妭鎵ц浠嶆槸鏃ч粦绠?| 鍗曠珷澶辫触浠嶅彲鑳藉喕缁撳叏閾?| 绔犺妭鎵ц鍜屼慨澶嶅繀椤绘垚涓烘爣鍑嗚妭鐐?|
| 鍒涗綔涓灑缁曡繃 runtime | 涓ゅ鎺у埗璇箟缁х画鍒嗚 | 涓灑宸ュ叿鍙兘璋冪敤 DirectorRuntime 鍏紑 API |
| 杩囨棭 LangGraph 鍖?| 鎶婃棫澶嶆潅搴︽惉杩涘浘 | LangGraph 鍙仛浣庨闄╄瘯鐐癸紝涓氬姟鐘舵€佷笉杩涘浘 |
| Prompt 宸ヤ綔鍙拌繃鏃╁紑鏀剧紪杈?| 鐮村潖缁撴瀯鍖栬緭鍑?| 鍏堝彧璇?catalog / preview锛屼笉鍋氳嚜鐢?override |
| `NovelDirectorService` 缁х画鑶ㄨ儉 | 鍚庣画缁存姢鍥伴毦 | 姣忎釜鎵ц鍩熼兘蹇呴』鍑忓皯涓?service 鑱岃矗 |

## 12. 浜や粯瀹屾垚瀹氫箟

瀹屾暣鏀归€犲畬鎴愮殑鍒ゆ柇鏍囧噯锛?

- 鑷姩瀵兼紨鍏ュ彛閮借兘浠庣粺涓€ runtime 鑾峰彇鐘舵€併€?
- 鍏抽敭鍐欏叆鍔ㄤ綔閮介€氳繃 NodeRunner 鍜?PolicyEngine銆?
- 鐢ㄦ埛鑳界湅鍒板綋鍓嶆楠ゃ€佺瓑寰呭師鍥犮€侀闄╁拰涓嬩竴姝ャ€?
- 鐢ㄦ埛鎵嬪啓鍐呭琚粯璁や繚鎶ゃ€?
- 鍗曠珷澶辫触鑳藉眬閮ㄥ鐞嗭紝涓嶅喕缁撴暣鏈功銆?
- 鎵嬪姩缂栬緫鍚庣郴缁熻兘鍒ゆ柇褰卞搷鑼冨洿鍜屾渶灏忎慨澶嶈矾寰勩€?
- 鍒涗綔涓灑鍙互瑙ｉ噴鍜屾帶鍒惰嚜鍔ㄥ婕旓紝浣嗕笉缁曡繃 runtime銆?
- Context Broker 琚湡瀹?prompt / step 浣跨敤銆?
- Prompt Catalog 鍜?Preview 鍙敤浜庡彧璇绘帓鏌ャ€?
- 浣庨闄?LangGraph 璇曠偣楠岃瘉 interrupt / resume锛屼絾涓嶆壙杞戒笟鍔＄湡鐩搞€?
- Reader Promise銆丆hapter Retention銆丷olling Window Review銆乄orld Skeleton銆丆haracter Governance 杩涘叆缁熶竴浜х墿鍜岃妭鐐逛綋绯汇€?
- 鍚庣画鏂板鍒涗綔鑳藉姏鍙互閫氳繃 Step Module銆丆ontext Resolver銆丳romptAsset 鍜?Artifact 绫诲瀷鎺ュ叆锛岃€屼笉鏄敼鏃т富 service 鍒嗘敮銆?

涓€鍙ヨ瘽锛氭湰璁″垝鎸夊畬鏁存墽琛屼氦浠樻帹杩涳紝鐩爣鏄竴娆℃€ф妸鑷姩瀵兼紨鏀归€犳垚缁熶竴銆佸彲鎭㈠銆佸彲瑙ｉ噴銆佽兘鎸佺画甯姪鏂版墜瀹屾垚鏁存湰灏忚鐨?AI 鍘熺敓杩愯鏃躲€?

