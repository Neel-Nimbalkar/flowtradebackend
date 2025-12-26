import os, json, sys, time
try:
    import google.generativeai as gen
except ImportError:
    print("google-generativeai not installed. Install with: pip install google-generativeai")
    sys.exit(1)

def main():
    # Prefer explicit arg: python test_gemini.py YOUR_KEY
    api_key = None
    if len(sys.argv) > 1:
        api_key = sys.argv[1].strip()
    api_key = api_key or os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        print("Missing Gemini API key. Provide as arg or set GEMINI_API_KEY.")
        sys.exit(2)

    model_name = os.environ.get('GEMINI_MODEL', 'gemini-1.5-flash')
    prompt = "Provide a concise bullish/bearish/neutral assessment for SPY based on generic market context: price rising steadily with moderate volume. Return 2 short sentences and one recommended action (buy/hold/sell)."
    print(f"Using model: {model_name}")
    gen.configure(api_key=api_key)
    model = gen.GenerativeModel(model_name, generation_config={
        'temperature': 0.7,
        'max_output_tokens': 200,
    })
    t0 = time.time()
    try:
        resp = model.generate_content(prompt)
    except Exception as e:
        print(f"Gemini request failed: {e}")
        sys.exit(3)
    dt = (time.time() - t0) * 1000
    text = getattr(resp, 'text', '').strip() if resp else ''
    if not text:
        print("Empty response from Gemini.")
        sys.exit(4)
    print("--- Gemini Response ---")
    print(text)
    print("-----------------------")
    print(f"Latency: {dt:.1f} ms")

if __name__ == '__main__':
    main()
