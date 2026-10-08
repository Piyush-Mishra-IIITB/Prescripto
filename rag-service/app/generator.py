import os
from dotenv import load_dotenv
from google import genai

from app.retriever import retrieve


load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set.")

client = genai.Client(api_key=GEMINI_API_KEY)


MODEL_NAME = "gemini-flash-latest"


SYSTEM_PROMPT = """
You are a medical information assistant inside a Retrieval-Augmented
Generation (RAG) system.

Your job is to answer the user's question using ONLY the provided context.

Rules:

1. Use the retrieved context as the primary source of truth.

2. Do not invent, assume, or add medical facts that are not present
   in the provided context.

3. If the provided context does not contain enough information to
   answer the question, say:
   "I don't have enough information in my knowledge base to answer that."

4. Provide general medical information for educational purposes only.

5. Do not diagnose the user or determine what condition they have.

6. Do not prescribe medicines, recommend specific medications,
   provide dosages, or create personalized treatment plans.

7. Do not refer to internal retrieval labels such as "SOURCE 1",
   "SOURCE 2", "SOURCE 3", etc.

8. Do not mention the retrieval process, embeddings, FAISS, chunks,
   context, or RAG system in the answer.

9. Answer directly and clearly using natural language.

10. If the context contains the answer, do not unnecessarily state
    that the information came from the context.

11. If the question asks for personalized medical advice, explain
    that the knowledge base provides general medical information
    and that a healthcare professional should be consulted.

12. Keep the answer concise unless the question requires more detail.
"""


def extract_subject(history):
    """
    Extract the main subject from the most recent relevant user question.
    """

    for message in reversed(history):

        if message["role"] != "user":
            continue

        text = message["content"].strip()
        lower_text = text.lower()

        patterns = [
            "what is ",
            "what are ",
            "what's ",
            "tell me about ",
            "explain ",
            "define ",
        ]

        for pattern in patterns:

            if lower_text.startswith(pattern):

                subject = text[len(pattern):].strip()
                subject = subject.rstrip("?.!")

                if subject:
                    return subject

    return None


def rewrite_query(query, history):
    """
    Convert simple conversational follow-up questions
    into standalone search queries.
    """

    if not history:
        return query

    subject = extract_subject(history)

    if not subject:
        return query

    lower_query = query.strip().lower()

    # Replace conversational references
    if (
        "its " in lower_query
        or "it " in lower_query
        or lower_query.startswith("its")
        or lower_query.startswith("it")
        or "this " in lower_query
        or "that " in lower_query
    ):

        rewritten_query = query

        replacements = [
            ("its", subject),
            ("it", subject),
            ("this", subject),
            ("that", subject),
        ]

        for old_word, new_word in replacements:

            rewritten_query = rewritten_query.replace(
                old_word,
                new_word,
                1
            )

            rewritten_query = rewritten_query.replace(
                old_word.capitalize(),
                new_word,
                1
            )

        print("Original query:", query)
        print("Rewritten query:", rewritten_query)

        return rewritten_query

    follow_up_phrases = [
        "symptoms include",
        "symptoms are",
        "what about the symptoms",
        "what about symptoms",
        "what causes it",
        "what causes this",
        "how is it diagnosed",
        "how is this diagnosed",
        "how can it be prevented",
        "how can this be prevented",
    ]

    for phrase in follow_up_phrases:

        if lower_query == phrase:

            rewritten_query = f"{phrase} {subject}"

            print("Original query:", query)
            print("Rewritten query:", rewritten_query)

            return rewritten_query

    print("Original query:", query)
    print("Rewritten query:", query)

    return query


def generate_answer(query, retrieved_documents):

    context_parts = []

    for document in retrieved_documents:

        context_parts.append(
            f"""
Title:
{document["metadata"].get("title", "Unknown")}

Source:
{document["metadata"].get("source", "Unknown")}

Source URL:
{document["metadata"].get("source_url", "")}

Content:
{document["text"]}
"""
        )

    context = "\n".join(context_parts)

    prompt = f"""
{SYSTEM_PROMPT}

Context:

{context}

User question:

{query}

Answer the question using only the provided context.

Do not mention sources by number.
Do not say "Source 1", "Source 2", etc.
Do not mention the retrieval process.
"""

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )

    return response.text