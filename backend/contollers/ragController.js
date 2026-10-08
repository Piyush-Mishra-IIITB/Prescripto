const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://127.0.0.1:8001";

export const ragChat = async (req, res) => {
  try {
    const { query, history } = req.body;
    console.log("History received:", history);
    console.log("1. RAG request received:", query);

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    console.log("2. Calling RAG service:", RAG_SERVICE_URL);

    const response = await fetch(`${RAG_SERVICE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.trim(),
        history: history || [],
      }),
    });

    console.log("3. RAG response received:", response.status);

    const data = await response.json();

    console.log("4. RAG data parsed");

    return res.status(200).json({
      success: true,
      answer: data.answer,
      sources: data.sources || [],
    });
  } catch (error) {
    console.error("RAG controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to connect to RAG service",
      error: error.message,
    });
  }
};
