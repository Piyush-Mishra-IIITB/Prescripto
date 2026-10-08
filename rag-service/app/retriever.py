import json
import re
from pathlib import Path

import faiss

from app.embeddings import generate_embeddings


VECTORSTORE_DIR = Path("vectorstore")

INDEX_PATH = VECTORSTORE_DIR / "index.faiss"
METADATA_PATH = VECTORSTORE_DIR / "metadata.json"


# ---------------------------------------------------------
# Load FAISS index
# ---------------------------------------------------------

index = faiss.read_index(str(INDEX_PATH))


# ---------------------------------------------------------
# Load metadata
# ---------------------------------------------------------

with open(METADATA_PATH, "r", encoding="utf-8") as file:
    metadata = json.load(file)


# ---------------------------------------------------------
# Text normalization
# ---------------------------------------------------------

def normalize_text(text):
    """
    Normalize text for keyword matching.

    The original document text is never modified.
    """

    text = text.lower()

    # Convert punctuation to spaces
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    # Remove extra whitespace
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ---------------------------------------------------------
# Keyword score
# ---------------------------------------------------------

def keyword_score(query, document):
    """
    Calculate a simple keyword relevance score.

    This complements semantic similarity from FAISS.
    """

    query_words = normalize_text(query).split()
    document_text = normalize_text(document)

    if not query_words:
        return 0.0

    matches = 0

    for word in query_words:

        # Ignore very small words
        if len(word) <= 2:
            continue

        if word in document_text.split():
            matches += 1

    useful_words = [
        word
        for word in query_words
        if len(word) > 2
    ]

    if not useful_words:
        return 0.0

    return matches / len(useful_words)


# ---------------------------------------------------------
# Retrieval
# ---------------------------------------------------------

def retrieve(query, top_k=3):
    """
    Hybrid retrieval:

    1. FAISS semantic similarity
    2. Keyword matching
    3. Combine both scores
    """

    # -----------------------------------------------------
    # Generate query embedding
    # -----------------------------------------------------

    query_embedding = generate_embeddings([query])

    query_embedding = query_embedding.astype("float32")


    # -----------------------------------------------------
    # Retrieve more candidates than needed
    # -----------------------------------------------------

    candidate_k = min(
        max(top_k * 3, 10),
        index.ntotal
    )

    scores, indices = index.search(
        query_embedding,
        candidate_k
    )


    # -----------------------------------------------------
    # Calculate hybrid scores
    # -----------------------------------------------------

    results = []

    for semantic_score, index_id in zip(
        scores[0],
        indices[0]
    ):

        if index_id == -1:
            continue

        result = metadata[index_id].copy()

        text = result["text"]

        semantic_score = float(semantic_score)

        keyword = keyword_score(
            query,
            text
        )


        # -------------------------------------------------
        # Hybrid score
        #
        # 70% semantic similarity
        # 30% keyword relevance
        # -------------------------------------------------

        final_score = (
            0.70 * semantic_score
            + 0.30 * keyword
        )


        result["semantic_score"] = semantic_score
        result["keyword_score"] = keyword
        result["score"] = final_score

        results.append(result)


    # -----------------------------------------------------
    # Sort by final score
    # -----------------------------------------------------

    results.sort(
        key=lambda x: x["score"],
        reverse=True
    )


    return results[:top_k]


# ---------------------------------------------------------
# Test retrieval
# ---------------------------------------------------------

if __name__ == "__main__":

    test_queries = [

        # Hypertension
        "What are the symptoms of high blood pressure?",
        "What causes high blood pressure?",

        # Diabetes
        "What are the symptoms of diabetes?",
        "What causes diabetes?",
        "How is diabetes diagnosed?",
        "How is diabetes treated?",

        # Asthma
        "What are the symptoms of asthma?",
        "What triggers asthma?",
        "How is asthma diagnosed?",
        "How is asthma treated?",

        # GERD
        "What are the symptoms of GERD?",
        "What causes GERD?",
        "How is GERD diagnosed?",

        # Migraine
        "What are the symptoms of migraine?",
        "What can trigger a migraine?",
        "How is migraine treated?",

        # Common cold
        "What are the symptoms of a common cold?",
        "How long does a common cold last?",
        "How is a common cold treated?",

        # Pneumonia
        "What are the symptoms of pneumonia?",
        "How is pneumonia diagnosed?",
        "How is pneumonia treated?",
    ]


    for query in test_queries:

        print("\n")

        print("=" * 80)
        print(f"QUERY: {query}")
        print("=" * 80)


        results = retrieve(
            query,
            top_k=3
        )


        for i, result in enumerate(
            results,
            start=1
        ):

            print("\n" + "-" * 80)

            print(f"Result {i}")

            print(
                f"Final Score: "
                f"{result['score']:.4f}"
            )

            print(
                f"Semantic Score: "
                f"{result['semantic_score']:.4f}"
            )

            print(
                f"Keyword Score: "
                f"{result['keyword_score']:.4f}"
            )

            print(
                f"Source: "
                f"{result['metadata'].get('source', 'Unknown')}"
            )

            print(
                f"File: "
                f"{result['filename']}"
            )

            print(
                f"Chunk: "
                f"{result['chunk_id']}"
            )

            print(
                f"Section:\n"
                f"{result['text']}"
            )