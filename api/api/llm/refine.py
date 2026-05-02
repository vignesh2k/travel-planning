from api.llm.client import make_client

REFINE_MODEL = "deepseek/deepseek-v4-flash"


def refine_document(document: str, instruction: str) -> str:
    client = make_client()
    response = client.chat.completions.create(
        model=REFINE_MODEL,
        max_tokens=8000,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a travel guide editor. Apply the user's instruction to refine "
                    "the travel guide. Return the complete updated guide in the same Markdown "
                    "structure. Return only the Markdown — no JSON, no extra commentary."
                ),
            },
            {
                "role": "user",
                "content": f"Travel guide:\n\n{document}\n\nInstruction: {instruction}",
            },
        ],
    )
    return response.choices[0].message.content.strip()
