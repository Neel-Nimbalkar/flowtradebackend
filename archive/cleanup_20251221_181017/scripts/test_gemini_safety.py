import os, sys
import google.generativeai as gen

key = os.environ.get('GEMINI_API_KEY')
if not key:
    print("Set GEMINI_API_KEY env var")
    sys.exit(1)

gen.configure(api_key=key)

# Simulated strategy prompt (matching what backend sends)
prompt = """Symbol: SPY\nTimeframe: 1Hour\nLookback Days: 7
Latest Data: {"open": 585.23, "high": 586.12, "low": 584.90, "close": 585.78, "volume": 45123000}

Condition Blocks:
- rsi: passed | RSI=58.3 within neutral range
- macd: passed | MACD histogram positive, bullish momentum

User Script:
You are an AI trading assistant. Analyze the provided strategy components and market snapshot, then produce:
1. High-level rationale
2. Strengths & weaknesses
3. Missing confirmations
4. Risk considerations
5. One actionable improvement.

User Comments:


Task: Act as a trading strategy analyst. Provide:
1. Concise market context relative to conditions.
2. Interpretation of each passed/failed condition.
3. Actionable next step (entry, wait, adjust).
Avoid generic disclaimers, keep focused, no unverified claims."""

models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']

for model_name in models:
    print(f"\n{'='*60}\nTesting {model_name}...\n{'='*60}")
    try:
        model = gen.GenerativeModel(model_name, generation_config={'temperature': 0.3, 'max_output_tokens': 300})
        resp = model.generate_content(prompt)
        
        # Extract text safely
        text = None
        if resp and hasattr(resp, 'candidates') and resp.candidates:
            for cand in resp.candidates:
                finish = getattr(cand, 'finish_reason', None)
                print(f"finish_reason: {finish}")
                
                # Safety ratings
                if hasattr(cand, 'safety_ratings'):
                    print("Safety ratings:")
                    for r in cand.safety_ratings:
                        print(f"  {r.category}: {r.probability}")
                
                # Extract parts
                content = getattr(cand, 'content', None)
                if content and hasattr(content, 'parts'):
                    parts_text = []
                    for p in content.parts:
                        if hasattr(p, 'text') and p.text:
                            parts_text.append(p.text)
                    if parts_text:
                        text = '\n'.join(parts_text)
                        break
        
        if text:
            print(f"\n✅ SUCCESS:\n{text[:300]}...")
            break
        else:
            print("❌ No text extracted")
    except Exception as e:
        print(f"❌ Exception: {e}")
        # Try sanitized fallback
        if 'finish_reason' in str(e).lower() and '2' in str(e):
            print("\n🛑 Safety blocked. Trying neutral prompt...")
            try:
                safe_prompt = "Provide neutral educational summary of SPY with RSI=58 and positive MACD. State: context, alignment, bias, next observation step. Avoid advice words."
                resp2 = model.generate_content(safe_prompt)
                text2 = None
                if resp2 and hasattr(resp2, 'candidates') and resp2.candidates:
                    for cand2 in resp2.candidates:
                        content2 = getattr(cand2, 'content', None)
                        if content2 and hasattr(content2, 'parts'):
                            parts2 = []
                            for p2 in content2.parts:
                                if hasattr(p2, 'text') and p2.text:
                                    parts2.append(p2.text)
                            if parts2:
                                text2 = '\n'.join(parts2)
                                break
                if text2:
                    print(f"✅ RECOVERED:\n{text2[:300]}...")
                    break
                else:
                    print("❌ Sanitized also blocked")
            except Exception as e2:
                print(f"❌ Retry exception: {e2}")

print("\n" + "="*60)
print("Test complete")
