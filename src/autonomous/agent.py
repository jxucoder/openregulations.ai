"""
Autonomous Agent System

Behavior is controlled by:
- config/agent.yaml  → Agent settings, tools, safety
- prompts/*.md       → Task instructions

To change behavior: edit the YAML/markdown files, not this code.
"""

import os
import yaml
import json
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass
import anthropic


# ============================================================================
# CONFIG LOADING
# ============================================================================

@dataclass
class AgentConfig:
    """Loaded from config/agent.yaml"""
    name: str
    model: dict
    system_prompt: str
    tools: list[dict]
    safety: dict
    
    @classmethod
    def load(cls, config_path: str = None) -> "AgentConfig":
        if config_path is None:
            config_path = Path(__file__).parent / "config" / "agent.yaml"
        
        with open(config_path) as f:
            data = yaml.safe_load(f)
        
        return cls(
            name=data.get("name", "Agent"),
            model=data.get("model", {}),
            system_prompt=data.get("system_prompt", ""),
            tools=data.get("tools", []),
            safety=data.get("safety", {}),
        )


def load_prompt(task_name: str) -> str:
    """Load a prompt template from prompts/*.md"""
    prompt_path = Path(__file__).parent / "prompts" / f"{task_name}.md"
    
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found: {prompt_path}")
    
    return prompt_path.read_text()


# ============================================================================
# TOOL DEFINITIONS (Claude format)
# ============================================================================

TOOL_DEFINITIONS = [
    {
        "name": "query_database",
        "description": "Query the PostgreSQL database. Only SELECT queries allowed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "SQL SELECT query"}
            },
            "required": ["sql"]
        }
    },
    {
        "name": "fetch_comments",
        "description": "Fetch comments from Regulations.gov API",
        "input_schema": {
            "type": "object",
            "properties": {
                "docket_id": {"type": "string", "description": "Docket ID"},
                "limit": {"type": "integer", "description": "Max comments", "default": 100}
            },
            "required": ["docket_id"]
        }
    },
    {
        "name": "save_analysis",
        "description": "Save analysis results to database",
        "input_schema": {
            "type": "object",
            "properties": {
                "docket_id": {"type": "string"},
                "analysis": {"type": "object", "description": "Analysis results to save"}
            },
            "required": ["docket_id", "analysis"]
        }
    },
    {
        "name": "run_python",
        "description": "Execute Python code in sandbox. Use for data analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to execute"},
                "description": {"type": "string", "description": "What this code does"}
            },
            "required": ["code"]
        }
    },
    {
        "name": "send_alert",
        "description": "Send an alert about important findings",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Alert message"},
                "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
                "docket_id": {"type": "string", "description": "Related docket if any"}
            },
            "required": ["message"]
        }
    },
    {
        "name": "analyze_text",
        "description": "Use LLM to analyze text (themes, sentiment, etc.)",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "Analysis task (e.g., 'extract_themes')"},
                "text": {"type": "string", "description": "Text to analyze"}
            },
            "required": ["task", "text"]
        }
    }
]


# ============================================================================
# TOOL IMPLEMENTATIONS
# ============================================================================

class ToolExecutor:
    """Executes tools. Implementations can be swapped without changing agent."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.client = anthropic.Anthropic()
        # In production, these would connect to real services
        self.db = MockDatabase()
        self.api = RegulationsAPI()
    
    def execute(self, name: str, inputs: dict) -> Any:
        """Route tool call to implementation."""
        
        print(f"  🔧 {name}({json.dumps(inputs)[:100]}...)")
        
        if name == "query_database":
            return self.db.query(inputs["sql"])
        
        elif name == "fetch_comments":
            return self.api.fetch_comments(
                inputs["docket_id"], 
                inputs.get("limit", 100)
            )
        
        elif name == "save_analysis":
            return self.db.save_analysis(inputs["docket_id"], inputs["analysis"])
        
        elif name == "run_python":
            return self.run_python_sandboxed(inputs["code"])
        
        elif name == "send_alert":
            return self.send_alert(
                inputs["message"],
                inputs.get("severity", "info"),
                inputs.get("docket_id")
            )
        
        elif name == "analyze_text":
            return self.analyze_text(inputs["task"], inputs["text"])
        
        else:
            return {"error": f"Unknown tool: {name}"}
    
    def run_python_sandboxed(self, code: str) -> str:
        """Execute Python in sandbox."""
        import subprocess
        import tempfile
        
        timeout = self.config.safety.get("max_python_timeout", 30)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            filepath = f.name
        
        try:
            result = subprocess.run(
                ["python", filepath],
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return result.stdout or result.stderr
        except subprocess.TimeoutExpired:
            return "Error: Execution timed out"
        finally:
            os.unlink(filepath)
    
    def send_alert(self, message: str, severity: str, docket_id: str = None) -> dict:
        """Send alert (mock for now)."""
        print(f"  🚨 ALERT [{severity}]: {message}")
        return {"sent": True, "severity": severity}
    
    def analyze_text(self, task: str, text: str) -> dict:
        """Use LLM for text analysis sub-task."""
        prompt_template = load_prompt(task)
        
        response = self.client.messages.create(
            model=self.config.model.get("name", "claude-sonnet-4-20250514"),
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": f"{prompt_template}\n\n## Text to Analyze:\n{text}"
            }]
        )
        
        # Try to parse as JSON
        result_text = response.content[0].text
        try:
            start = result_text.find('{')
            end = result_text.rfind('}') + 1
            if start >= 0:
                return json.loads(result_text[start:end])
        except:
            pass
        return {"raw": result_text}


# ============================================================================
# MOCK IMPLEMENTATIONS (replace with real in production)
# ============================================================================

class MockDatabase:
    """Mock database - replace with real PostgreSQL."""
    
    def __init__(self):
        self.data = {}
    
    def query(self, sql: str) -> list[dict]:
        print(f"    DB Query: {sql[:80]}...")
        # Return empty for now
        return []
    
    def save_analysis(self, docket_id: str, analysis: dict) -> dict:
        self.data[docket_id] = analysis
        print(f"    DB Save: {docket_id}")
        return {"saved": True}


class RegulationsAPI:
    """Regulations.gov API client."""
    
    def __init__(self):
        self.api_key = os.environ.get("REGULATIONS_API_KEY")
        self.base_url = "https://api.regulations.gov/v4"
    
    def fetch_comments(self, docket_id: str, limit: int) -> list[dict]:
        import requests
        import time
        
        headers = {"X-Api-Key": self.api_key}
        comments = []
        
        # Fetch comment list
        response = requests.get(
            f"{self.base_url}/comments",
            headers=headers,
            params={"filter[docketId]": docket_id, "page[size]": min(limit, 250)}
        )
        
        if response.status_code != 200:
            return []
        
        comment_list = response.json().get("data", [])
        
        # Fetch details for each
        for c in comment_list[:limit]:
            detail_resp = requests.get(
                f"{self.base_url}/comments/{c['id']}",
                headers=headers
            )
            if detail_resp.status_code == 200:
                comments.append(detail_resp.json().get("data", {}))
            time.sleep(0.3)
        
        return comments


# ============================================================================
# AUTONOMOUS AGENT
# ============================================================================

class AutonomousAgent:
    """
    The main agent. Behavior controlled by config + prompts.
    
    Usage:
        agent = AutonomousAgent()
        result = agent.run("analyze_docket", {"docket_id": "NHTSA-2025-0491"})
    """
    
    def __init__(self, config_path: str = None):
        self.config = AgentConfig.load(config_path)
        self.client = anthropic.Anthropic()
        self.tools = ToolExecutor(self.config)
    
    def run(self, task: str, inputs: dict = None) -> dict:
        """
        Run a task.
        
        Args:
            task: Name of task (matches prompts/{task}.md)
            inputs: Variables to pass to the task
        """
        inputs = inputs or {}
        
        # Load task prompt
        try:
            task_prompt = load_prompt(task)
        except FileNotFoundError:
            task_prompt = task  # Allow raw task strings
        
        # Format with inputs
        for key, value in inputs.items():
            task_prompt = task_prompt.replace(f"{{{key}}}", str(value))
        
        print(f"🤖 Starting task: {task}")
        print(f"   Inputs: {inputs}")
        
        # Initialize conversation
        messages = [{"role": "user", "content": task_prompt}]
        iteration = 0
        max_iterations = self.config.safety.get("max_iterations", 15)
        
        # Agent loop
        while iteration < max_iterations:
            iteration += 1
            print(f"\n📍 Iteration {iteration}")
            
            # Call Claude
            response = self.client.messages.create(
                model=self.config.model.get("name", "claude-sonnet-4-20250514"),
                max_tokens=self.config.model.get("max_tokens", 4096),
                system=self.config.system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages
            )
            
            # Check if done
            if response.stop_reason == "end_turn":
                final_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text
                
                print(f"\n✅ Task complete after {iteration} iterations")
                return {"success": True, "result": final_text, "iterations": iteration}
            
            # Process tool calls
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = self.tools.execute(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result) if isinstance(result, (dict, list)) else str(result)
                    })
            
            # Add to conversation
            messages.append({"role": "assistant", "content": response.content})
            if tool_results:
                messages.append({"role": "user", "content": tool_results})
        
        print(f"\n⚠️ Max iterations ({max_iterations}) reached")
        return {"success": False, "error": "Max iterations reached", "iterations": iteration}


# ============================================================================
# CLI
# ============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Run autonomous agent")
    parser.add_argument("task", help="Task name (e.g., analyze_docket, daily_scan)")
    parser.add_argument("--docket-id", help="Docket ID for analysis tasks")
    parser.add_argument("--config", help="Path to config file")
    args = parser.parse_args()
    
    agent = AutonomousAgent(args.config)
    
    inputs = {}
    if args.docket_id:
        inputs["docket_id"] = args.docket_id
    
    result = agent.run(args.task, inputs)
    
    print("\n" + "="*60)
    print("RESULT")
    print("="*60)
    print(json.dumps(result, indent=2)[:2000])


if __name__ == "__main__":
    main()
