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
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"HTTPError {e.code}: {err_body}")
        raise

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
    print("=== 第一步：拉取知识库中所有「周天」相关文档 ===")
    docs_res = http_get("/knowledge/documents")
    docs = docs_res.get("data", [])
    zhoutian_docs = [d for d in docs if "周天" in d["title"] or "周天" in d["fileName"] or "天巡记" in d["title"] or "镐京云" in d["title"] or "桫椤城" in d["title"]]
    
    doc_ids = [d["id"] for d in zhoutian_docs]
    print(f"找到 {len(zhoutian_docs)} 份周天相关知识库文档，IDs: {len(doc_ids)} 个。")
    for d in zhoutian_docs:
        print(f"  - {d['title']} ({d['fileName']})")
        
    print("\n=== 第二步：发起灵感分析与概念提取 ===")
    analyze_payload = {
        "mode": "reference",
        "referenceMode": "adapt_world",
        "knowledgeDocumentIds": doc_ids,
        "input": "融合所有周天经典设定、奇谭异闻、宗周大阴谋与山海神异，构建宏大严密、阴谋交织的周天东方玄幻大世界。",
        "preserveElements": ["山海异兽", "周朝古风神韵", "修仙与神话杂糅的世界背景"],
        "allowedChanges": ["增强势力角逐与九路仙门对抗逻辑"],
        "forbiddenElements": ["避免现代科技与赛博朋克元素"],
        "refinementLevel": "standard",
        "optionsCount": 6
    }
    
    print("正在调用 AI 分析提取周天作品锚点与概念卡...")
    analyze_res = http_post("/worlds/inspiration/analyze", analyze_payload)
    concept_data = analyze_res.get("data", {})
    concept = concept_data.get("concept", {})
    property_options = concept_data.get("propertyOptions", [])
    
    print(f"✔ 灵感分析完成！概念卡:")
    print(f"  类型: {concept.get('worldType')}")
    print(f"  基调: {concept.get('tone')}")
    print(f"  一句话总结: {concept.get('oneSentence')}")
    print(f"  关键词: {' / '.join(concept.get('keywords', []))}")
    print(f"  提取属性选项: {len(property_options)} 项")

    print("\n=== 第三步：生成完整世界骨架（规则、势力、地点、关系） ===")
    skeleton_payload = {
        "idea": concept.get("oneSentence", "周天东方玄幻大世界"),
        "worldType": concept.get("worldType", "东方玄幻"),
        "referenceContext": {
            "concept": concept,
            "selectedPropertyOptions": property_options,
            "referenceAnchors": concept_data.get("referenceAnchors", [])
        }
    }
    
    skeleton_res = http_post("/worlds/skeleton/generate", skeleton_payload)
    skeleton = skeleton_res.get("data", {})
    structured = skeleton.get("structuredData", {})
    
    print(f"✔ 世界骨架生成成功！")
    print(f"  - 完整度得分: {skeleton.get('assessment', {}).get('completenessScore')}")
    print(f"  - 世界法则数: {len(structured.get('rules', {}).get('axioms', []))}")
    print(f"  - 核心势力数: {len(structured.get('forces', []))}")
    print(f"  - 标志地点数: {len(structured.get('locations', []))}")
    print(f"  - 势力关系数: {len(structured.get('relations', {}).get('forceRelations', []))}")

    print("\n=== 第四步：保存创建「周天大世界」样本 ===")
    create_world_payload = {
        "name": "周天大世界",
        "description": concept.get("oneSentence", "整合周天系列全量小说与异闻录的东方玄幻大世界"),
        "worldType": concept.get("worldType", "东方玄幻"),
        "background": concept.get("summary", concept.get("oneSentence", "周天东方玄幻大世界")),
        "knowledgeDocumentIds": doc_ids,
        "structure": structured
    }
    
    world_res = http_post("/worlds", create_world_payload)
    created_world = world_res.get("data", {})
    world_id = created_world.get("id")
    print(f"✔ 世界样本创建成功！ID: {world_id}, 名称: {created_world.get('name')}")

    print("\n=== 第五步：为「周天大世界」绑定全量 22 篇周天知识库文档 ===")
    bind_res = http_put(f"/worlds/{world_id}/knowledge-documents", {"documentIds": doc_ids})
    bound_docs = bind_res.get("data", [])
    print(f"✔ 成功将 {len(bound_docs)} 份周天知识库文档与「周天大世界」完成绑定！")
    
    print("\n==========================================")
    print(f"🎉 周天大世界样本构建完成！")
    print(f"世界 ID: {world_id}")
    print(f"可在 Web App 访问: http://localhost:5173/worlds/{world_id}/workspace")
    print("==========================================")

if __name__ == "__main__":
    main()
