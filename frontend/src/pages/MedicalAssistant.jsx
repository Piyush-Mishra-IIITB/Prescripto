import { useState } from "react";

const MedicalAssistant = () => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!query.trim() || loading) return;

    const userMessage = query.trim();

    // Save user message in frontend chat
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userMessage,
      },
    ]);

    setQuery("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/rag/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: token,
          },
          body: JSON.stringify({
            query: userMessage,

            // Send previous conversation to RAG service
            history: messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to get response");
      }

      // Save assistant response
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources || [],
        },
      ]);
    } catch (error) {
      console.error("RAG error:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't connect to the medical assistant right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (loading) return;

    setMessages([]);
    setQuery("");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Medical Information Assistant
          </h1>

          <p className="text-gray-500 mt-2">
            Ask general medical questions and get information from our medical
            knowledge base.
          </p>

          <p className="text-sm text-red-500 mt-3">
            This assistant provides general medical information and does not
            diagnose or prescribe treatment.
          </p>
        </div>

        {/* Chat container */}
        <div className="bg-white rounded-xl shadow-md">
          {/* Chat header */}
          <div className="flex justify-between items-center border-b px-6 py-4">
            <div>
              <h2 className="font-semibold text-gray-700">Medical Assistant</h2>

              <p className="text-xs text-gray-400 mt-1">
                General medical information
              </p>
            </div>

            <button
              type="button"
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              className="text-sm border border-gray-300 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              New Chat
            </button>
          </div>

          {/* Messages */}
          <div className="h-[500px] overflow-y-auto p-6">
            {/* Empty state */}
            {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-32">
                <p className="text-lg text-gray-600 font-medium">
                  Ask a medical question
                </p>

                <p className="text-sm mt-2">
                  Example: What are the symptoms of diabetes?
                </p>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-5 flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-300">
                      <p className="text-sm font-semibold mb-2">Sources</p>

                      {[
                        ...new Map(
                          message.sources.map((source) => [source.url, source]),
                        ).values(),
                      ].map((source, sourceIndex) => (
                        <a
                          key={sourceIndex}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-sm text-blue-600 hover:underline"
                        >
                          {source.source}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start mb-5">
                <div className="bg-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <span>Thinking</span>

                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>

                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]"></span>

                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]"></span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="border-t p-4 flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a medical question..."
              disabled={loading}
              className="flex-1 border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
            />

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MedicalAssistant;
