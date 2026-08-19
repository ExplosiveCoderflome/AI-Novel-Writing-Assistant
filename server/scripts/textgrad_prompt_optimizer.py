#!/usr/bin/env python3
import os
import sys
import json
import sqlite3
import argparse
import urllib.request

def call_llm(endpoint, model, api_key, system_prompt, user_prompt, temperature=0.7):
    url = endpoint
    if not url.endswith('/chat/completions'):
        url = url.rstrip('/') + '/chat/completions'
        
    headers = {
        'Content-Type': 'application/json'
    }
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
        
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        'temperature': temperature
    }
    
    req = urllib.request.Request(
        url, 
        data=json.dumps(payload).encode('utf-8'), 
        headers=headers, 
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            res_data = response.read().decode('utf-8')
            res_json = json.loads(res_data)
            return res_json['choices'][0]['message']['content']
    except Exception as e:
        print(f"Error calling LLM at {url}: {e}", file=sys.stderr)
        raise e

def call_anthropic(api_key, system_prompt, user_prompt, model="claude-3-5-sonnet-20241022", temperature=0.7):
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01'
    }
    payload = {
        'model': model,
        'system': system_prompt,
        'messages': [
            {'role': 'user', 'content': user_prompt}
        ],
        'max_tokens': 4000,
        'temperature': temperature
    }
    req = urllib.request.Request(
        url, 
        data=json.dumps(payload).encode('utf-8'), 
        headers=headers, 
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            res_data = response.read().decode('utf-8')
            res_json = json.loads(res_data)
            return res_json['content'][0]['text']
    except Exception as e:
        print(f"Error calling Anthropic: {e}", file=sys.stderr)
        raise e

def load_llm_config(db_path):
    config = {
        "provider": "ollama",
        "model": "gemma4:e4b",
        "baseURL": "http://localhost:11434/v1",
        "apiKey": None
    }
    
    if not db_path or not os.path.exists(db_path):
        print(f"DB path '{db_path}' not found, using default fallback config.", file=sys.stderr)
        return config

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check ModelRouteConfig
        cursor.execute("SELECT provider, model FROM ModelRouteConfig WHERE taskType = 'writer' OR taskType = 'default' LIMIT 1")
        route = cursor.fetchone()
        if route:
            config["provider"] = route[0]
            config["model"] = route[1]
            
        # Get APIKey for the provider
        cursor.execute("SELECT key, baseURL, model FROM APIKey WHERE provider = ? LIMIT 1", (config["provider"],))
        key_row = cursor.fetchone()
        if key_row:
            if key_row[0]:
                config["apiKey"] = key_row[0]
            if key_row[1]:
                config["baseURL"] = key_row[1]
            if key_row[2]:
                config["model"] = key_row[2]
                
        conn.close()
    except Exception as e:
        print(f"Warning: Could not read LLM config from DB: {e}. Using defaults.", file=sys.stderr)
        
    # Check env overrides
    if os.environ.get("ANTHROPIC_API_KEY"):
        config["provider"] = "anthropic"
        config["apiKey"] = os.environ.get("ANTHROPIC_API_KEY")
        config["model"] = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    elif os.environ.get("OPENAI_API_KEY"):
        config["provider"] = "openai"
        config["apiKey"] = os.environ.get("OPENAI_API_KEY")
        config["model"] = os.environ.get("OPENAI_MODEL", "gpt-4o")
        config["baseURL"] = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        
    return config

def invoke_llm(config, system_prompt, user_prompt, temperature=0.7):
    provider = config.get("provider", "ollama")
    model = config.get("model", "gemma4:e4b")
    base_url = config.get("baseURL", "http://localhost:11434/v1")
    api_key = config.get("apiKey")
    
    print(f"Invoking LLM provider={provider}, model={model}, baseURL={base_url}", file=sys.stderr)
    
    if provider == "anthropic":
        return call_anthropic(api_key, system_prompt, user_prompt, model=model, temperature=temperature)
    else:
        return call_llm(base_url, model, api_key, system_prompt, user_prompt, temperature=temperature)

def get_trajectory_data(db_path, run_id):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT seq, agentName, stepType, status, inputJson, outputJson, error 
        FROM AgentStep 
        WHERE runId = ? 
        ORDER BY seq ASC
    """, (run_id,))
    
    steps = cursor.fetchall()
    conn.close()
    
    if not steps:
        raise ValueError(f"No steps found for runId: {run_id}")

    writer_input = None
    writer_output = None
    audit_output = None
    run_error = None
    
    for seq, agent_name, step_type, status, input_json, output_json, error in steps:
        if error:
            run_error = error
        
        # Identify writer step
        if step_type == 'writer' or agent_name == 'writer':
            try:
                writer_input = json.loads(input_json) if input_json else None
            except:
                writer_input = input_json
            try:
                writer_output = json.loads(output_json) if output_json else None
            except:
                writer_output = output_json
                
        # Identify audit / review step
        if step_type in ('review', 'critical_review') or agent_name in ('review', 'critical_review'):
            try:
                audit_output = json.loads(output_json) if output_json else None
            except:
                audit_output = output_json
                
    return {
        "writer_input": writer_input,
        "writer_output": writer_output,
        "audit_output": audit_output,
        "run_error": run_error
    }

def compute_gradient(config, system_prompt, input_context, draft, critique):
    sys_msg = (
        "You are an expert AI prompt engineering auditor. "
        "Your task is to analyze why a system prompt template led to a generated draft that failed quality control."
    )
    
    user_msg = (
        "We have a system prompt template, an input context, the generated text draft, and the critique of the failure.\n\n"
        f"--- SYSTEM PROMPT TEMPLATE ---\n{system_prompt}\n\n"
        f"--- INPUT CONTEXT ---\n{input_context}\n\n"
        f"--- GENERATED DRAFT ---\n{draft}\n\n"
        f"--- CRITIQUE (FAILURE REASON) ---\n{critique}\n\n"
        "Please perform a prompt diagnosis (textual gradient computation):\n"
        "1. Identify specifically which instruction, missing constraint, or ambiguity in the SYSTEM PROMPT TEMPLATE allowed/caused the model to fail in this way.\n"
        "2. Formulate a concrete suggestion (what instruction should be modified, added, or clarified) to prevent this issue in the future.\n"
        "Be extremely direct, specific, and concise. Only output the diagnosis and modification suggestion."
    )
    
    return invoke_llm(config, sys_msg, user_msg, temperature=0.2)

def update_prompt(config, original_prompt, gradient):
    sys_msg = (
        "You are an expert prompt optimizer. "
        "Your task is to modify a prompt template to address a diagnosed failure, preserving all existing structure and constraints."
    )
    
    user_msg = (
        f"--- ORIGINAL SYSTEM PROMPT ---\n{original_prompt}\n\n"
        f"--- DIAGNOSED FAILURE & FIX SUGGESTION ---\n{gradient}\n\n"
        "Please update the ORIGINAL SYSTEM PROMPT to incorporate the fix suggestion.\n"
        "Make a precise, targeted edit. Do not delete other constraints or rewrite the entire prompt structure unless necessary.\n"
        "Keep any placeholders like {{lengthBlock}}, {{continuityBlock}}, {{continuationBlock}} intact.\n"
        "Return ONLY the updated prompt text. Do not output markdown code blocks (e.g. ```markdown), do not output explanations or notes. Just return the raw prompt content."
    )
    
    updated = invoke_llm(config, sys_msg, user_msg, temperature=0.1)
    
    # Clean output
    updated = updated.strip()
    if updated.startswith("```markdown"):
        updated = updated[len("```markdown"):].strip()
    elif updated.startswith("```"):
        updated = updated[3:].strip()
    if updated.endswith("```"):
        updated = updated[:-3].strip()
        
    return updated

def main():
    parser = argparse.ArgumentParser(description="Aegis Loop 1 TextGrad Prompt Self-Healing Optimizer")
    parser.add_argument("--prompt_path", required=True, help="Path to the prompt markdown file to optimize")
    parser.add_argument("--db_path", help="Path to SQLite database file")
    parser.add_argument("--run_id", help="UUID of the failed AgentRun")
    parser.add_argument("--chapter_id", help="Chapter UUID to find the most recent AgentRun")
    parser.add_argument("--mock_path", help="Path to a mock JSON file containing failure details")
    
    args = parser.parse_args()
    
    # Load LLM config
    config = load_llm_config(args.db_path)
    
    # Get current prompt
    if not os.path.exists(args.prompt_path):
        print(f"Error: Prompt file not found: {args.prompt_path}", file=sys.stderr)
        sys.exit(1)
        
    with open(args.prompt_path, "r", encoding="utf-8") as f:
        original_prompt = f.read()

    # Get failure details
    draft = ""
    critique = ""
    input_context = ""
    
    if args.mock_path:
        print(f"Reading mock data from {args.mock_path}", file=sys.stderr)
        with open(args.mock_path, "r", encoding="utf-8") as f:
            mock_data = json.load(f)
        draft = mock_data.get("draft", "")
        critique = mock_data.get("critique", "")
        input_context = mock_data.get("input_context", "Mock Input Context")
    else:
        if not args.run_id and args.chapter_id and args.db_path:
            print(f"No runId provided, looking up most recent AgentRun for chapterId: {args.chapter_id} from {args.db_path}", file=sys.stderr)
            try:
                conn = sqlite3.connect(args.db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM AgentRun WHERE chapterId = ? ORDER BY createdAt DESC LIMIT 1", (args.chapter_id,))
                row = cursor.fetchone()
                if row:
                    args.run_id = row[0]
                    print(f"Found runId: {args.run_id}", file=sys.stderr)
                else:
                    print(f"Warning: No AgentRun found for chapterId: {args.chapter_id}", file=sys.stderr)
                conn.close()
            except Exception as e:
                print(f"Error looking up AgentRun: {e}", file=sys.stderr)

        if args.run_id and args.db_path:
            print(f"Querying trajectory for runId: {args.run_id} from {args.db_path}", file=sys.stderr)
            traj = get_trajectory_data(args.db_path, args.run_id)
            
            # Get draft
            writer_out = traj.get("writer_output")
            if isinstance(writer_out, dict):
                draft = writer_out.get("content") or writer_out.get("text") or str(writer_out)
            else:
                draft = str(writer_out or "")
                
            # Get input context
            writer_in = traj.get("writer_input")
            if isinstance(writer_in, dict):
                input_context = json.dumps(writer_in)
            else:
                input_context = str(writer_in or "")

            # Get critique
            audit_out = traj.get("audit_output")
            if audit_out:
                if isinstance(audit_out, dict):
                    blocking_issues = audit_out.get("blockingIssues") or audit_out.get("issues")
                    critique = json.dumps(blocking_issues) if blocking_issues else json.dumps(audit_out)
                else:
                    critique = str(audit_out)
            else:
                critique = traj.get("run_error") or "Unknown run failure critique"
        else:
            print("Error: Must specify either --mock_path or both --db_path and --run_id/--chapter_id", file=sys.stderr)
            sys.exit(1)
        
    print("--- Failure Details Captured ---", file=sys.stderr)
    print(f"Critique Length: {len(critique)} chars", file=sys.stderr)
    print(f"Draft Length: {len(draft)} chars", file=sys.stderr)
    
    # 1. Compute Textual Gradient
    print("Computing textual gradient...", file=sys.stderr)
    gradient = compute_gradient(config, original_prompt, input_context, draft, critique)
    print(f"\n--- Diagnosed Gradient ---\n{gradient}\n", file=sys.stderr)
    
    # 2. Update Prompt
    print("Optimizing system prompt...", file=sys.stderr)
    optimized_prompt = update_prompt(config, original_prompt, gradient)
    
    # 3. Write back
    with open(args.prompt_path, "w", encoding="utf-8") as f:
        f.write(optimized_prompt)
        
    print(f"Successfully optimized and saved prompt to: {args.prompt_path}")

if __name__ == "__main__":
    main()
