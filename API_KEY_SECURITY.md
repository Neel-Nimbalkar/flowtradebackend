# API Key Security - FlowGrid Trading Platform

## ✅ Security Status: SECURE

All API keys are user-provided through the platform UI. **NO hardcoded keys in the codebase.**

## How API Keys Are Handled

### 1. **Alpaca API Keys** (Trading Data)
Users enter their Alpaca API keys in the trading interface:
- **Frontend sends**: `alpacaKeyId` and `alpacaSecretKey` with each API request
- **Backend receives**: Keys from request parameters
- **Fallback**: Environment variables (for local development only)

**Code Example:**
```python
# backend.py - Line 494-495
alpaca_key_id = request.args.get('alpacaKeyId') or os.getenv('ALPACA_KEY_ID')
alpaca_secret_key = request.args.get('alpacaSecretKey') or os.getenv('ALPACA_SECRET_KEY')
```

### 2. **AI Provider Keys** (OpenAI, Gemini, Claude)
Users enter AI API keys in the AI Agent settings panel:
- **Frontend**: RightPanelContainer.jsx stores keys in localStorage
- **Backend**: ai_agent.py receives keys with each chat request
- **No defaults**: If no key provided, returns error to user

**Code Example:**
```javascript
// RightPanelContainer.jsx
const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '');

// Send to backend
const response = await fetch('http://localhost:8000/api/ai/chat', {
  body: JSON.stringify({ provider, model, api_key: apiKey, messages })
});
```

```python
# ai_agent.py - Line 225
api_key = data.get('api_key', '')
if not api_key:
    return jsonify({'error': f'API key required for {provider}'}), 400
```

## Environment Variables (Development Only)

`.env` files are used **ONLY** for local development/testing:
- ✅ Listed in `.gitignore` (will never be committed)
- ✅ `.env.example` templates provided (safe to commit)
- ✅ Production deployments use user-provided keys

**Location of .env files:**
```
FlowGrid-Trading/
├── .env                           # Git ignored
├── .env.example                   # Safe template
└── backendapi/backendapi/
    ├── .env                       # Git ignored  
    └── .env.example               # Safe template
```

## User API Key Entry Points

### Alpaca Keys
Users can enter Alpaca API keys in:
1. Trading dashboard settings
2. Strategy execution forms
3. Historical data requests

### AI Provider Keys
Users enter AI keys in:
1. **AI Agent Settings Panel** (⚙️ button in AI Agent)
   - Provider selection (OpenAI/Gemini/Claude)
   - Model selection
   - API Key input field
   - Keys stored in browser localStorage

## Security Best Practices Implemented

✅ **No hardcoded keys** - All keys from user input  
✅ **Environment isolation** - .env files ignored by git  
✅ **User control** - Users manage their own API keys  
✅ **Secure transmission** - Keys sent over HTTPS (in production)  
✅ **Client-side storage** - AI keys in localStorage (browser-level security)  
✅ **Fallback pattern** - Environment variables only for local dev  

## For Developers

### Adding Your Keys for Local Testing

1. Copy the example files:
   ```bash
   cp .env.example .env
   cp backendapi/backendapi/.env.example backendapi/backendapi/.env
   ```

2. Edit `.env` files with your API keys:
   ```env
   # Alpaca API
   ALPACA_API_KEY=your_key_here
   ALPACA_API_SECRET=your_secret_here
   
   # AI Providers (optional)
   OPENAI_API_KEY=your_openai_key_here
   ```

3. **NEVER commit** `.env` files to git (already in `.gitignore`)

### For End Users

Users provide their own API keys through the platform UI:
- **Alpaca**: Get keys from https://alpaca.markets/
- **OpenAI**: Get keys from https://platform.openai.com/api-keys
- **Anthropic**: Get keys from https://console.anthropic.com/
- **Google Gemini**: Get keys from https://aistudio.google.com/apikey

---

**Last Updated**: December 28, 2025  
**Status**: ✅ All security checks passed - No hardcoded keys found
