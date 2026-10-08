from pathlib import Path
import re


DOCUMENTS_DIR = Path("data/documents")

MIN_CHUNK_WORDS = 40
MAX_CHUNK_WORDS = 220


def extract_frontmatter(content):
    match = re.match(
        r"^---\s*\n(.*?)\n---\s*\n(.*)$",
        content,
        re.DOTALL
    )

    if not match:
        return {}, content

    frontmatter = match.group(1)
    body = match.group(2)

    metadata = {}

    for line in frontmatter.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            metadata[key.strip()] = value.strip().strip('"')

    return metadata, body


def split_into_sections(text):
    sections = re.split(
        r"(?=^#{1,3}\s)",
        text,
        flags=re.MULTILINE
    )

    return [
        section.strip()
        for section in sections
        if section.strip()
    ]


def count_words(text):
    return len(text.split())


def is_title_section(section):
    lines = section.splitlines()

    return (
        len(lines) == 1
        and lines[0].startswith("# ")
    )


def create_chunks(sections):
    chunks = []
    current = ""

    for section in sections:

        # Ignore document title
        if is_title_section(section):
            continue

        section_words = count_words(section)

        # If section itself is too large,
        # split it into smaller chunks.
        if section_words > MAX_CHUNK_WORDS:

            if current:
                chunks.append(current)
                current = ""

            words = section.split()

            for i in range(0, len(words), MAX_CHUNK_WORDS):
                chunk = " ".join(
                    words[i:i + MAX_CHUNK_WORDS]
                )

                chunks.append(chunk)

            continue

        # First section
        if not current:
            current = section
            continue

        combined = current + "\n\n" + section

        # Combine small sections with nearby content
        if (
            count_words(current) < MIN_CHUNK_WORDS
            or count_words(section) < MIN_CHUNK_WORDS
        ):
            if count_words(combined) <= MAX_CHUNK_WORDS:
                current = combined
            else:
                chunks.append(current)
                current = section

        # Keep normal-sized sections separate
        else:
            chunks.append(current)
            current = section

    if current:
        chunks.append(current)

    return chunks


def load_documents():
    documents = []

    for file_path in sorted(DOCUMENTS_DIR.glob("*.md")):

        content = file_path.read_text(
            encoding="utf-8"
        )

        metadata, body = extract_frontmatter(content)

        sections = split_into_sections(body)

        chunks = create_chunks(sections)

        for chunk_id, chunk in enumerate(chunks):

            documents.append({
                "filename": file_path.name,
                "chunk_id": chunk_id,
                "text": chunk,
                "metadata": metadata
            })

    return documents


if __name__ == "__main__":

    documents = load_documents()

    print(f"Created {len(documents)} chunks")

    for document in documents:

        print("\n" + "=" * 70)

        print(f"File: {document['filename']}")

        print(f"Chunk: {document['chunk_id']}")

        print("-" * 70)

        print(document["text"])