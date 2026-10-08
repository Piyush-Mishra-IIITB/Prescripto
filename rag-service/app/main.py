from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List

from app.retriever import retrieve
from app.generator import generate_answer, rewrite_query


app = FastAPI(
    title="Prescripto RAG Service",
    version="1.0.0"
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query: str
    history: List[Message] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    sources: list


@app.get("/")
def health_check():
    return {
        "message": "Prescripto RAG Service is running"
    }


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):

    # Convert Pydantic messages into dictionaries
    history = [
        {
            "role": message.role,
            "content": message.content
        }
        for message in request.history
    ]

    # Convert conversational question into a standalone
    # search query when necessary
    search_query = rewrite_query(
        request.query,
        history
    )

    print("Original query:", request.query)
    print("Rewritten query:", search_query)

    # Retrieve documents using the rewritten query
    documents = retrieve(
        search_query,
        top_k=3
    )

    # Generate final answer using the original user question
    # and the retrieved medical information
    answer = generate_answer(
        request.query,
        documents
    )

    # Prepare sources
    sources = []
    seen_sources = set()

    for document in documents:

        source = document["metadata"].get(
            "source",
            "Unknown"
        )

        source_url = document["metadata"].get(
            "source_url",
            ""
        )

        source_key = (
            source,
            source_url
        )

        if source_key not in seen_sources:

            sources.append({
                "source": source,
                "url": source_url
            })

            seen_sources.add(source_key)

    return {
        "answer": answer,
        "sources": sources
    }