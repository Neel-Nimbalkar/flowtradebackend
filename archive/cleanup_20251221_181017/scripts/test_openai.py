import os
import sys
import argparse

# Requires: openai>=1.0.0
try:
    from openai import OpenAI
except Exception as e:
    print("❌ openai package not available. Install with: pip install openai")
    raise


def test_openai(api_key: str, model: str = "gpt-4o-mini", prompt: str = "write a haiku about ai") -> None:
    # Add client-level timeout to avoid hanging
    client = OpenAI(api_key=api_key, timeout=15.0)

    # Prefer Responses API (new), fall back to Chat Completions if needed
    text = None
    used_model = model

    # Normalize some UI model aliases to chat-compatible models
    aliases = {
        "o4-mini": "gpt-4o-mini",
        "gpt-4.1": "gpt-4o-mini",
        "gpt-4.1-mini": "gpt-4o-mini",
        "gpt-5-nano": "gpt-4o-mini",  # alias to a widely-available model
    }
    model = aliases.get(model, model)

    # Candidate list: requested first, then fallbacks
    candidates = [m for m in [model, "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo-0125"] if m]

    # Try Responses API
    last_err = None
    for m in candidates:
        try:
            print(f"Trying Responses API with model: {m}...")
            resp = client.responses.with_options(timeout=15.0).create(model=m, input=prompt, store=False)
            text = getattr(resp, "output_text", None) or str(resp)
            used_model = m
            break
        except Exception as e:
            last_err = e

    # If Responses failed, try Chat Completions
    if text is None:
        for m in candidates:
            try:
                print(f"Trying Chat Completions with model: {m}...")
                resp = client.chat.completions.create(
                    model=m,
                    messages=[
                        {"role": "system", "content": "You are a concise assistant."},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=200,
                    temperature=0.7,
                )
                text = resp.choices[0].message.content
                used_model = m
                break
            except Exception as e:
                last_err = e

    if text is None:
        err = str(last_err) if last_err else "Unknown error"
        if "api_key" in err.lower() or "invalid" in err.lower():
            print("❌ Invalid or unauthorized API key.")
        elif "model" in err.lower():
            print("❌ Model unavailable for this key. Try 'gpt-4o-mini'.")
        else:
            print(f"❌ OpenAI error: {err}")
        sys.exit(1)

    print(f"✅ Success with model: {used_model}")
    print("--- Output ---")
    print(text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test OpenAI key and model")
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
    parser.add_argument("--prompt", default="write a haiku about ai")
    parser.add_argument("--key", default=os.environ.get("OPENAI_API_KEY"))
    args = parser.parse_args()

    if not args.key:
        print("❌ Provide an API key via --key or OPENAI_API_KEY env var")
        sys.exit(1)

    test_openai(args.key, args.model, args.prompt)
