"use client";

import { type CSSProperties, type FormEvent, useMemo, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type JobResponse = {
  job_id: string;
  status: string;
  message: string;
};

type JobStatus = {
  job_id: string;
  status: string;
  message: string;
  error?: string | null;
};

type ErrorPayload = {
  detail?: string;
};

export function ChatDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Upload a PDF first, then ask a question about its contents."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = useMemo(() => !!fileId && !asking && question.trim().length > 0, [asking, fileId, question]);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Choose a PDF or text file first.");
      return;
    }

    setUploading(true);
    setError(null);
    setFileId(null);
    setJobState(null);

    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: payload
      });

      const data = (await response.json()) as JobResponse | ErrorPayload;
      if (!response.ok || !("job_id" in data)) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Upload failed.");
      }

      const jobId = data.job_id;
      await pollJob(jobId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function pollJob(jobId: string) {
    for (;;) {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const data = (await response.json()) as JobStatus | ErrorPayload;
      if (!response.ok || !("status" in data)) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Job polling failed.");
      }

      setJobState(data);
      if (data.status === "completed") {
        setFileId(jobId);
        return;
      }
      if (data.status === "failed") {
        throw new Error(data.error || data.message || "Indexing failed.");
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileId || !question.trim()) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: question.trim() }];
    setMessages(nextMessages);
    setQuestion("");
    setAsking(true);
    setError(null);

    try {
      const response = await fetch("/api/conversation-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: "You are a concise assistant.",
          top_k: 5,
          file_id: fileId,
          messages: nextMessages
        })
      });

      const data = (await response.json()) as { response?: string; detail?: string };
      if (!response.ok || !data.response) {
        throw new Error(data.detail || "Conversation request failed.");
      }

      setMessages((current) => [...current, { role: "assistant", content: data.response! }]);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Conversation request failed.");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setAsking(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.kicker}>DocSmartAnswer</p>
        <h3 style={styles.title}>Chat with Your PDFs</h3>
        <p style={styles.subtitle}>
          Uploads and chat requests go through server-side proxy routes before reaching
          the RAG backend.
        </p>
      </section>

      <section style={styles.grid}>
        <div style={styles.panel}>
          <h2 style={styles.heading}>1. Upload a document</h2>
          <form onSubmit={onUpload} style={styles.stack}>
            <input name="file" type="file" accept=".pdf,.txt" />
            <button disabled={uploading} style={styles.primaryButton} type="submit">
              {uploading ? "Uploading..." : "Upload and index"}
            </button>
          </form>
          <p style={styles.meta}>
            {jobState
              ? `Status: ${jobState.status} — ${jobState.message}`
              : "Supported file types match the backend: .pdf and .txt"}
          </p>
          {fileId ? <p style={styles.success}>Indexed file ID: {fileId}</p> : null}
        </div>

        <div style={styles.panelTall}>
          <h2 style={styles.heading}>2. Ask the chatbot</h2>
          <div style={styles.messages}>
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                style={message.role === "assistant" ? styles.assistantBubble : styles.userBubble}
              >
                <strong style={styles.messageLabel}>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                <p style={styles.messageText}>{message.content}</p>
              </article>
            ))}
          </div>

          <form onSubmit={onAsk} style={styles.chatForm}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about the uploaded document..."
              rows={4}
              style={styles.textarea}
            />
            <button disabled={!canAsk} style={styles.secondaryButton} type="submit">
              {asking ? "Thinking..." : "Send"}
            </button>
          </form>

          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: "1180px",
    margin: "0 auto",
    padding: "48px 20px 80px"
  },
  hero: {
    marginBottom: "28px"
  },
  kicker: {
    color: "var(--accent-2)",
    fontSize: "0.92rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    margin: "0 0 12px"
  },
  title: {
    margin: 0,
    maxWidth: "920px",
    fontSize: "clamp(2.2rem, 5vw, 4.7rem)",
    lineHeight: 1.02
  },
  subtitle: {
    margin: "18px 0 0",
    maxWidth: "700px",
    color: "var(--muted)",
    fontSize: "1.08rem",
    lineHeight: 1.6
  },
  grid: {
    display: "grid",
    gap: "22px",
    gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)"
  },
  panel: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "24px",
    boxShadow: "var(--shadow)",
    padding: "24px"
  },
  panelTall: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "24px",
    boxShadow: "var(--shadow)",
    padding: "24px",
    minHeight: "640px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  },
  heading: {
    margin: "0 0 16px",
    fontSize: "1.3rem"
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  meta: {
    color: "var(--muted)",
    lineHeight: 1.5,
    margin: "18px 0 0"
  },
  success: {
    margin: "12px 0 0",
    color: "var(--success)"
  },
  messages: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    minHeight: "340px",
    overflowY: "auto",
    paddingRight: "6px"
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "#fff5e8",
    border: "1px solid #eed7b8",
    borderRadius: "18px 18px 18px 6px",
    padding: "14px 16px",
    maxWidth: "82%"
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#edf4fb",
    border: "1px solid #c8d8e8",
    borderRadius: "18px 18px 6px 18px",
    padding: "14px 16px",
    maxWidth: "82%"
  },
  messageLabel: {
    display: "block",
    marginBottom: "6px",
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--muted)"
  },
  messageText: {
    margin: 0,
    whiteSpace: "pre-wrap",
    lineHeight: 1.55
  },
  chatForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  textarea: {
    width: "100%",
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid var(--line)",
    background: "#fff"
  },
  primaryButton: {
    border: 0,
    borderRadius: "999px",
    padding: "12px 16px",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer"
  },
  secondaryButton: {
    alignSelf: "flex-end",
    border: 0,
    borderRadius: "999px",
    padding: "12px 20px",
    background: "var(--accent-2)",
    color: "#fff",
    cursor: "pointer"
  },
  error: {
    color: "#9f2d2d",
    margin: 0
  }
};
