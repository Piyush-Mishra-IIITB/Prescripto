import json
from pathlib import Path

import faiss

from app.ingest import load_documents
from app.embeddings import generate_embeddings


VECTORSTORE_DIR = Path("vectorstore")

INDEX_PATH = VECTORSTORE_DIR / "index.faiss"
METADATA_PATH = VECTORSTORE_DIR / "metadata.json"


def build_index():
    VECTORSTORE_DIR.mkdir(exist_ok=True)

    # Load document chunks
    documents = load_documents()

    if not documents:
        raise ValueError("No documents found.")

    texts = [document["text"] for document in documents]

    # Generate embeddings
    embeddings = generate_embeddings(texts)

    # Convert embeddings to float32 for FAISS
    embeddings = embeddings.astype("float32")

    # Create FAISS index
    dimension = embeddings.shape[1]

    index = faiss.IndexFlatIP(dimension)

    # Add vectors
    index.add(embeddings)

    # Save FAISS index
    faiss.write_index(index, str(INDEX_PATH))

    # Save metadata
    metadata = []

    for document in documents:
        metadata.append({
            "filename": document["filename"],
            "chunk_id": document["chunk_id"],
            "text": document["text"],
            "metadata": document["metadata"]
        })

    with open(METADATA_PATH, "w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2, ensure_ascii=False)

    print(f"Documents: {len(documents)}")
    print(f"Embedding dimension: {dimension}")
    print(f"FAISS vectors: {index.ntotal}")
    print(f"Index saved to: {INDEX_PATH}")
    print(f"Metadata saved to: {METADATA_PATH}")


if __name__ == "__main__":
    build_index()