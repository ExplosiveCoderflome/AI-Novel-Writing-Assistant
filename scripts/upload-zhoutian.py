import os
import sys
import re
import json
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

FOLDER = r'C:\Users\lilin\Downloads\周天'
API_URL = 'http://localhost:3000/api/knowledge/documents'

def clean_title(fname):
    name, _ = os.path.splitext(fname)
    name = name.strip()
    name = re.sub(r'^[《\(（]', '', name)
    name = re.sub(r'[》\)\)]$ me', '', name)
    return name

def read_file_content(fpath):
    if fpath.endswith('.doc'):
        data = open(fpath, 'rb').read()
        utf16_chunks = []
        pattern = re.compile(rb'(?:[\x00-\xff][\x4e-\x9f]){4,}')
        for match in pattern.finditer(data):
            try:
                txt = match.group(0).decode('utf-16le', errors='ignore').strip()
                if len(txt) > 5:
                    utf16_chunks.append(txt)
            except Exception:
                pass
        return '\n'.join(utf16_chunks)
    
    raw = open(fpath, 'rb').read()
    for enc in ['utf-8-sig', 'utf-8', 'gb18030', 'gbk']:
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('gb18030', errors='ignore')

def upload_document(title, file_name, content):
    payload = json.dumps({
        "title": title,
        "fileName": file_name,
        "content": content
    }).encode('utf-8')
    
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            if res_json.get('success'):
                doc_data = res_json.get('data', {})
                print(f"✔ [成功] {title} ({file_name}) - ID: {doc_data.get('id')}, Status: {doc_data.get('latestIndexStatus')}")
                return True
            else:
                print(f"❌ [失败] {title}: {res_json}")
                return False
    except Exception as e:
        print(f"❌ [异常] {title} ({file_name}): {e}")
        return False

def main():
    print(f"开始扫描目录: {FOLDER}")
    files = sorted(os.listdir(FOLDER))
    print(f"找到 {len(files)} 个待加载文件。\n")
    
    success_count = 0
    fail_count = 0
    
    for idx, fname in enumerate(files, 1):
        fpath = os.path.join(FOLDER, fname)
        if not os.path.isfile(fpath):
            continue
            
        print(f"[{idx}/{len(files)}] 读取文件: {fname} ...")
        content = read_file_content(fpath)
        if not content.strip():
            print(f"⚠️ 文件内容为空: {fname}")
            fail_count += 1
            continue
            
        title = clean_title(fname)
        print(f"    标题: {title}, 字符数: {len(content)}")
        
        ok = upload_document(title, fname, content)
        if ok:
            success_count += 1
        else:
            fail_count += 1
            
    print(f"\n==========================================")
    print(f"上传完成! 成功: {success_count}, 失败: {fail_count}, 总计: {len(files)}")
    print(f"==========================================")

if __name__ == '__main__':
    main()
