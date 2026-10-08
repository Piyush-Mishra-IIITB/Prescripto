from sentence_transformers import SentenceTransformer


MODEL_NAME = "BAAI/bge-small-en-v1.5"

model = SentenceTransformer(MODEL_NAME)


def generate_embeddings(texts):
    embeddings = model.encode(
        texts,
        normalize_embeddings=True
    )

    return embeddings


if __name__ == "__main__":
    test_texts = [
        "High blood pressure is also called hypertension.",
        "Hypertension can increase the risk of stroke."
    ]

    embeddings = generate_embeddings(test_texts)

    print("Number of embeddings:", len(embeddings))
    print("Embedding dimension:", embeddings.shape[1])
    print("First embedding:", embeddings[0][:5])