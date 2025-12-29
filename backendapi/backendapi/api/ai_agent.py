"""
AI Agent API - Multi-provider support for strategy building assistant
Supports: OpenAI (GPT-4), Google Gemini, Anthropic Claude
"""

import os
import json
import traceback
from flask import Blueprint, request, jsonify

ai_bp = Blueprint('ai', __name__)

# System prompt for the AI agent
SYSTEM_PROMPT = """You are FlowGrid AI, an expert trading strategy assistant integrated into a visual workflow builder.

## Your Capabilities:
1. **Explain** trading concepts, indicators (RSI, MACD, EMA, Bollinger Bands, etc.), and strategy logic
2. **Create** trading strategies by adding nodes to the canvas
3. **Modify** existing node settings and connections
4. **Analyze** strategy performance metrics and suggest improvements
5. **Debug** workflow issues and explain why signals might not be triggering

## Available Block Types:
- **input**: Data source (symbol, timeframe). Params: symbol (str), timeframe (str: 1m/5m/15m/1h/1d)
- **RSI**: Relative Strength Index. Params: period (int, default 14)
- **MACD**: Moving Average Convergence Divergence. Params: fast (int, 12), slow (int, 26), signal (int, 9)
- **EMA**: Exponential Moving Average. Params: period (int, default 20)
- **SMA**: Simple Moving Average. Params: period (int, default 20)
- **Bollinger**: Bollinger Bands. Params: period (int, 20), std_dev (float, 2.0)
- **ATR**: Average True Range. Params: period (int, 14)
- **VWAP**: Volume Weighted Average Price. No params.
- **volume_spike**: Detect volume spikes. Params: threshold (float, 2.0)
- **Compare**: Compare two values. Params: operator (str: >, <, >=, <=, ==), value (float)
- **AND**: Logical AND gate. Combines multiple conditions.
- **OR**: Logical OR gate. Combines multiple conditions.
- **NOT**: Logical NOT gate. Inverts a condition.
- **output**: Final signal output. Params: signal_type (str: BUY/SELL/HOLD)
- **note**: Add notes/comments to canvas. Params: text (str)

## Response Format:
Always respond with valid JSON in this format:
{
  "message": "Your explanation or response to the user",
  "actions": [
    {
      "type": "add_node",
      "block_type": "RSI",
      "params": {"period": 14},
      "position": {"x": 400, "y": 200}
    },
    {
      "type": "connect",
      "from_node_id": 1,
      "from_port": "output",
      "to_node_id": 2,
      "to_port": "input"
    },
    {
      "type": "update_node",
      "node_id": 1,
      "params": {"period": 21}
    }
  ]
}

## Action Types:
- **add_node**: Add a new node. Include block_type, params, position (x, y)
- **connect**: Connect two nodes. Include from_node_id, from_port, to_node_id, to_port
- **update_node**: Update node parameters. Include node_id and params
- **remove_node**: Remove a node. Include node_id
- **clear_canvas**: Clear all nodes (use sparingly, confirm with user first)

## Guidelines:
1. When creating strategies, place nodes logically (input on left, output on right)
2. Standard node spacing: 200px horizontal, 150px vertical
3. Always explain what you're doing and why
4. If the user's request is unclear, ask for clarification
5. Suggest improvements based on best practices
6. When analyzing, reference specific metrics (win rate, profit factor, etc.)

## Current Context:
The user is building trading strategies using a visual node-based workflow builder. They can drag and drop indicator blocks, connect them, and run backtests.
"""

def call_openai(messages, api_key, model="gpt-4o"):
    """Call OpenAI API"""
    import requests
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2000,
        "response_format": {"type": "json_object"}
    }
    
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60
    )
    
    if response.status_code != 200:
        raise Exception(f"OpenAI API error: {response.text}")
    
    result = response.json()
    return result["choices"][0]["message"]["content"]


def call_gemini(messages, api_key, model="gemini-2.0-flash"):
    """Call Google Gemini API"""
    import requests
    
    # Convert messages to Gemini format
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        if msg["role"] == "system":
            # Prepend system message to first user message
            continue
        contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
        })
    
    # Add system instruction
    system_instruction = next((m["content"] for m in messages if m["role"] == "system"), SYSTEM_PROMPT)
    
    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2000,
            "responseMimeType": "application/json"
        }
    }
    
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        json=payload,
        timeout=60
    )
    
    if response.status_code != 200:
        raise Exception(f"Gemini API error: {response.text}")
    
    result = response.json()
    return result["candidates"][0]["content"]["parts"][0]["text"]


def call_claude(messages, api_key, model="claude-sonnet-4-20250514"):
    """Call Anthropic Claude API"""
    import requests
    
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    }
    
    # Extract system message
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), SYSTEM_PROMPT)
    
    # Convert other messages
    claude_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages if m["role"] != "system"
    ]
    
    payload = {
        "model": model,
        "max_tokens": 2000,
        "system": system_msg + "\n\nIMPORTANT: Always respond with valid JSON only.",
        "messages": claude_messages
    }
    
    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers=headers,
        json=payload,
        timeout=60
    )
    
    if response.status_code != 200:
        raise Exception(f"Claude API error: {response.text}")
    
    result = response.json()
    return result["content"][0]["text"]


@ai_bp.route('/chat', methods=['POST'])
def ai_chat():
    """
    AI Chat endpoint
    
    Request body:
    {
        "message": "User's message",
        "provider": "openai" | "gemini" | "claude",
        "api_key": "user's API key for the provider",
        "context": {
            "nodes": [...],  // Current nodes on canvas
            "connections": [...],  // Current connections
            "metrics": {...},  // Strategy metrics if available
            "lastResults": {...}  // Last execution results
        },
        "history": [...]  // Previous messages in conversation
    }
    """
    try:
        data = request.get_json()
        
        user_message = data.get('message', '')
        provider = data.get('provider', 'openai')
        model = data.get('model', '')  # Specific model to use
        api_key = data.get('api_key', '')
        context = data.get('context', {})
        history = data.get('history', [])
        
        if not user_message:
            return jsonify({"error": "Message is required"}), 400
        
        if not api_key:
            return jsonify({"error": f"API key for {provider} is required"}), 400
        
        # Build context string
        context_str = ""
        if context.get('nodes'):
            context_str += f"\n\nCurrent Canvas ({len(context['nodes'])} nodes):\n"
            for node in context['nodes']:
                context_str += f"- Node {node.get('id')}: {node.get('type')} at ({node.get('x')}, {node.get('y')})"
                if node.get('params'):
                    context_str += f" params={json.dumps(node.get('params'))}"
                context_str += "\n"
        
        if context.get('connections'):
            context_str += f"\nConnections ({len(context['connections'])}):\n"
            for conn in context['connections']:
                context_str += f"- {conn.get('from')} -> {conn.get('to')}\n"
        
        if context.get('metrics'):
            context_str += f"\nStrategy Metrics:\n{json.dumps(context['metrics'], indent=2)}\n"
        
        if context.get('lastResults'):
            # Truncate large results
            results = context['lastResults']
            if 'blocks' in results and len(results['blocks']) > 5:
                results = {**results, 'blocks': results['blocks'][:5], '_truncated': True}
            context_str += f"\nLast Execution Results:\n{json.dumps(results, indent=2)}\n"
        
        # Build messages array
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + context_str}
        ]
        
        # Add conversation history
        for msg in history[-10:]:  # Keep last 10 messages for context
            messages.append({
                "role": msg.get('role', 'user'),
                "content": msg.get('content', '')
            })
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        # Call appropriate provider with model
        if provider == 'openai':
            selected_model = model if model else 'gpt-4o'
            response_text = call_openai(messages, api_key, selected_model)
        elif provider == 'gemini':
            selected_model = model if model else 'gemini-2.0-flash'
            response_text = call_gemini(messages, api_key, selected_model)
        elif provider == 'claude':
            selected_model = model if model else 'claude-sonnet-4-20250514'
            response_text = call_claude(messages, api_key, selected_model)
        else:
            return jsonify({"error": f"Unknown provider: {provider}"}), 400
        
        # Parse JSON response
        try:
            response_data = json.loads(response_text)
        except json.JSONDecodeError:
            # If not valid JSON, wrap in message format
            response_data = {
                "message": response_text,
                "actions": []
            }
        
        return jsonify({
            "success": True,
            "response": response_data
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "error": str(e),
            "success": False
        }), 500


@ai_bp.route('/providers', methods=['GET'])
def get_providers():
    """Get available AI providers and their configuration"""
    return jsonify({
        "providers": [
            {
                "id": "openai",
                "name": "OpenAI",
                "keyPlaceholder": "sk-...",
                "docsUrl": "https://platform.openai.com/api-keys",
                "models": [
                    {"id": "gpt-4o", "name": "GPT-4o", "description": "Most capable, best reasoning"},
                    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "description": "Fast & affordable"},
                    {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "description": "Previous gen, reliable"},
                    {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "description": "Cheapest, good for simple tasks"}
                ]
            },
            {
                "id": "gemini",
                "name": "Google Gemini",
                "keyPlaceholder": "AIza...",
                "docsUrl": "https://makersuite.google.com/app/apikey",
                "models": [
                    {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Latest, fast & capable"},
                    {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "description": "Fast, good for most tasks"},
                    {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "description": "Most capable Gemini"}
                ]
            },
            {
                "id": "claude",
                "name": "Anthropic Claude",
                "keyPlaceholder": "sk-ant-...",
                "docsUrl": "https://console.anthropic.com/settings/keys",
                "models": [
                    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "description": "Latest, best balance"},
                    {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "description": "Fast & capable"},
                    {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "description": "Most powerful"},
                    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "description": "Fastest, cheapest"}
                ]
            }
        ]
    })
