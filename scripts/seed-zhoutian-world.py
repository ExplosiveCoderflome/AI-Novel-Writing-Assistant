import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

API_BASE = 'http://localhost:3000/api'

def http_get(endpoint):
    req = urllib.request.urlopen(f"{API_BASE}{endpoint}")
    return json.loads(req.read().decode('utf-8'))

def http_post(endpoint, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f"{API_BASE}{endpoint}",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def http_put(endpoint, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f"{API_BASE}{endpoint}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def main():
    print("=== 获取所有 22 篇周天知识库文档 ===")
    docs_res = http_get("/knowledge/documents")
    docs = docs_res.get("data", [])
    zhoutian_docs = [d for d in docs if any(k in (d["title"] + d["fileName"]) for k in ["周天", "天巡记", "镐京云", "桫椤城"])]
    doc_ids = [d["id"] for d in zhoutian_docs]
    print(f"选中 {len(doc_ids)} 篇周天知识库文档。")

    print("\n=== 构建「周天大世界」结构化世界手册 ===")
    structure = {
        "profile": {
            "name": "周天大世界",
            "worldType": "东方玄幻 / 仙侠古风",
            "oneSentence": "以周朝礼乐与封建天巡为外表、暗藏九州神魔角力与古老天机大阴谋的宏大玄幻世界。",
            "tone": "庄严苍凉 · 阴谋交织 · 诡谲奇谭",
            "keywords": ["天巡记", "镐京云", "堰都城", "乘黄鬼仙", "镜弓劫", "卜月潭", "桫椤城"]
        },
        "rules": {
            "summary": "天地以周天为序，分风风帆与浮空舟行于云海，天机不可泄露，法术与精怪遵循古老神木与天地律令。",
            "axioms": [
                {
                    "id": "rule_1",
                    "name": "云海与浮空舟律",
                    "summary": "浮空舟依靠六张分风帆与顺逆罡风穿行于昆仑十七主脉与各洲云海，风向逆乱则舟沉身死。",
                    "cost": "需大量操舟法力与精疲力竭之风险",
                    "boundary": "不可突破万丈高空极冷罡风带"
                },
                {
                    "id": "rule_2",
                    "name": "周天神怪契约",
                    "summary": "乘黄、鬼仙、山女、虹蛇等异闻怪偶受古老巫诅与天地法则束缚，不可轻干人间朝纲。",
                    "cost": "违反则遭受九天雷劫与法力耗尽",
                    "boundary": "仅在月圆与奇域方能显化全貌"
                },
                {
                    "id": "rule_3",
                    "name": "宗周命脉与破国箭",
                    "summary": "镐京王气与有苏国运息息相关，神箭破国则气运倾泻，九路仙门与诸侯蜂起。",
                    "cost": "消耗国本与帝王寿元",
                    "boundary": "因果轮转，不可逆转"
                }
            ]
        },
        "forces": [
            {
                "id": "force_1",
                "name": "宗周王朝 (镐京)",
                "type": "中央朝廷 / 统治势力",
                "role": "表面统治九州，内防诸侯造反，外御昆仑魔瘴与外族",
                "currentObjective": "维系周王室天子权威，压制有苏国与东海异动",
                "pressure": "诸侯并起，浮空舟交通被雪暴切断，王气衰微"
            },
            {
                "id": "force_2",
                "name": "天巡司 / 操舟卫",
                "type": "官方侦办与巡视机构",
                "role": "巡视九州云海，调查异闻怪事与妖异动向",
                "currentObjective": "保障昆仑与八隅城航线安全，搜寻流失的神念珠",
                "pressure": "天巡记各篇章中屡屡遭遇不可名状之古怪与背叛"
            },
            {
                "id": "force_3",
                "name": "有苏氏与山夷诸国",
                "type": "古老边陲方国",
                "role": "传承太古化龙秘法与狐道异术，对宗周怀有复仇之志",
                "currentObjective": "破国箭发，化龙冲天，摆脱周天锁链",
                "pressure": "受到宗周王师压制与内部派系分歧"
            },
            {
                "id": "force_4",
                "name": "桫椤城与东海诸岛",
                "type": "海外隐世仙城与散修集合体",
                "role": "掌控蜃景幻象与噬魂山脊古老秘密",
                "currentObjective": "守护百错锦与琴自鸣等太古奇宝",
                "pressure": "各方觊觎其太古遗产"
            }
        ],
        "locations": [
            {
                "id": "loc_1",
                "name": "镐京 (宗周都城)",
                "type": "王都 / 政治中心",
                "directionHint": "九州腹地",
                "terrain": "宫阙巍峨，城池高耸，云气萦绕",
                "riskLevel": 3,
                "storyRelevance": "王权核心，阴谋与政治斗争集中之地"
            },
            {
                "id": "loc_2",
                "name": "昆仑山脉 (第十七主脉)",
                "type": "神山禁地 / 险境",
                "directionHint": "西北边陲",
                "terrain": "万丈雪尘，漫天冰风，峭壁林立",
                "riskLevel": 5,
                "storyRelevance": "浮空舟遇险、古老奇谭与盘古躯体化身之发源地"
            },
            {
                "id": "loc_3",
                "name": "堰都城",
                "type": "要塞防城",
                "directionHint": "祁洲平原交界",
                "terrain": "水陆要冲，城垣坚固",
                "riskLevel": 4,
                "storyRelevance": "兵家必争之地，军事攻略与智谋角逐中心"
            },
            {
                "id": "loc_4",
                "name": "卜月潭",
                "type": "秘境水域",
                "directionHint": "山夷国境内",
                "terrain": "深潭幽深，星月倒影，常年薄雾",
                "riskLevel": 4,
                "storyRelevance": "预言与秘术占卜之所"
            }
        ],
        "relations": {
            "forceRelations": [
                {
                    "sourceForceId": "force_1",
                    "targetForceId": "force_3",
                    "relation": "敌对镇压",
                    "tension": "极其紧张",
                    "detail": "宗周以大军压境，有苏氏密谋破国箭复仇"
                },
                {
                    "sourceForceId": "force_2",
                    "targetForceId": "force_4",
                    "relation": "试探合作",
                    "tension": "中等",
                    "detail": "天巡司借桫椤城调查东海异闻，但互不信任"
                }
            ]
        }
    }

    create_payload = {
        "name": "周天大世界",
        "description": "基于全量 22 篇周天系列小说与异闻录共同构建的东方玄幻与奇谭大世界。",
        "worldType": "东方玄幻",
        "background": "以周朝礼乐与天巡为外表，暗藏九州神魔角力与古老天机大阴谋。包含镐京云、天巡记、桫椤城、堰都城及各篇周天异闻录全量设定。",
        "geography": "昆仑十七主脉雪尘万丈，九州平原连通东海噬魂山脊，浮空舟穿行于各洲云海航线。",
        "magicSystem": "周天律法、化龙神秘、浮空舟操舟术、乘黄鬼仙与太古奇宝（百错锦、琴自鸣、神念珠）。",
        "factions": "宗周王室 (镐京)、天巡司操舟卫、有苏氏与山夷诸国、桫椤城与东海散修。",
        "knowledgeDocumentIds": doc_ids,
        "structure": structure
    }

    print("\n=== 创建「周天大世界」样本 ===")
    res = http_post("/worlds", create_payload)
    world = res.get("data", {})
    world_id = world.get("id")
    print(f"✔ 成功创建「周天大世界」！ID: {world_id}")

    print("\n=== 绑定 22 篇周天知识库文档 ===")
    bind_res = http_put(f"/worlds/{world_id}/knowledge-documents", {"documentIds": doc_ids})
    bound_docs = bind_res.get("data", [])
    print(f"✔ 成功将 {len(bound_docs)} 份周天知识库文档绑定到该世界！")

    print("\n==========================================")
    print("🎉 周天大世界构建完成！可以在 Web App 直接访问：")
    print(f"👉 http://localhost:5173/worlds/{world_id}/workspace")
    print("==========================================")

if __name__ == "__main__":
    main()
