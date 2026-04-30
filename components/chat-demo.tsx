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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = useMemo(() => !asking && question.trim().length > 0, [asking, question]);
  const showProcessingToast =
    uploading && Boolean(activeJobId) && jobState?.status !== "completed" && jobState?.status !== "failed";
  const processingMessage = jobState?.message || "Processing upload and polling job status...";

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    console.log("[ui] upload submit", {
      hasFile: Boolean(file),
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    });
    if (!file) {
      setError("Choose a PDF or text file first.");
      return;
    }

    setUploading(true);
    setError(null);
    setFileId(null);
    setActiveJobId(null);
    setJobState(null);

    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: payload
      });
      console.log("[ui] upload response received", {
        ok: response.ok,
        status: response.status
      });

      const data = (await response.json()) as JobResponse | ErrorPayload;
      console.log("[ui] upload response body", data);
      if (!response.ok || !("job_id" in data)) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Upload failed.");
      }

      const jobId = data.job_id;
      setActiveJobId(jobId);
      console.log("[ui] upload accepted", { jobId });
      await pollJob(jobId);
    } catch (uploadError) {
      console.error("[ui] upload failed", uploadError);
      setActiveJobId(null);
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      console.log("[ui] upload finished");
      setUploading(false);
    }
  }

  async function pollJob(jobId: string) {
    console.log("[ui] polling started", { jobId });
    for (;;) {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      console.log("[ui] polling response received", {
        jobId,
        ok: response.ok,
        status: response.status
      });
      const data = (await response.json()) as JobStatus | ErrorPayload;
      console.log("[ui] polling response body", { jobId, data });
      if (!response.ok || !("status" in data)) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Job polling failed.");
      }

      setJobState(data);
      if (data.status === "completed") {
        console.log("[ui] polling completed", { jobId });
        setFileId(jobId);
        setActiveJobId(null);
        return;
      }
      if (data.status === "failed") {
        console.error("[ui] polling failed", { jobId, data });
        setActiveJobId(null);
        throw new Error(data.error || data.message || "Indexing failed.");
      }

      console.log("[ui] polling retry scheduled", { jobId, nextPollMs: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log("[ui] ask submit", {
      fileId,
      question,
      canAsk
    });
    if (!question.trim()) {
      console.warn("[ui] ask blocked", {
        hasQuestion: Boolean(question.trim())
      });
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: question.trim() }];
    console.log("[ui] ask payload prepared", {
      fileId,
      messageCount: nextMessages.length,
      question: question.trim()
    });
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
          ...(fileId ? { file_id: fileId } : {}),
          messages: nextMessages
        })
      });
      console.log("[ui] ask response received", {
        ok: response.ok,
        status: response.status
      });

      const data = (await response.json()) as { response?: string } | ErrorPayload;
      console.log("[ui] ask response body", data);
      if (!response.ok || !("response" in data) || !data.response) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Conversation request failed.");
      }

      console.log("[ui] ask completed", {
        responseLength: data.response.length
      });
      setMessages((current) => [...current, { role: "assistant", content: data.response! }]);
    } catch (askError) {
      console.error("[ui] ask failed", askError);
      setError(askError instanceof Error ? askError.message : "Conversation request failed.");
      setMessages((current) => current.slice(0, -1));
    } finally {
      console.log("[ui] ask finished");
      setAsking(false);
    }
  }

  return (
    <main style={styles.page}>
      {showProcessingToast ? (
        <div style={styles.toast} role="status" aria-live="polite">
          <div style={styles.toastDot} />
          <div>
            <p style={styles.toastTitle}>Processing document</p>
            <p style={styles.toastText}>Polling `/jobs/{activeJobId}` until the job is completed.</p>
            <p style={styles.toastMeta}>{processingMessage}</p>
          </div>
        </div>
      ) : null}

      <section style={styles.hero}>
        <p style={styles.kicker}>DocSmartAnswer</p>
        <h3 style={styles.title}>Instant Document Intelligence</h3>
        <p style={styles.subtitle}>
          Smart upload for better document understanding.
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
            {messages.length === 0 ? (
              <article style={styles.assistantBubble}>
                <strong style={styles.messageLabel}>Assistant</strong>
                <p style={styles.messageText}>Upload a PDF first, then ask a question about its contents.</p>
              </article>
            ) : null}
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
  toast: {
    position: "sticky",
    top: "18px",
    zIndex: 20,
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    margin: "0 0 20px",
    padding: "14px 16px",
    borderRadius: "18px",
    background: "#183a2d",
    color: "#f7fbf8",
    boxShadow: "0 18px 40px rgba(12, 33, 25, 0.18)"
  },
  toastDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    marginTop: "6px",
    background: "#9ff0be",
    boxShadow: "0 0 0 6px rgba(159, 240, 190, 0.18)"
  },
  toastTitle: {
    margin: "0 0 2px",
    fontSize: "0.95rem",
    fontWeight: 700
  },
  toastText: {
    margin: "0 0 2px",
    fontSize: "0.9rem",
    lineHeight: 1.45
  },
  toastMeta: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.45,
    color: "rgba(247, 251, 248, 0.8)"
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
    maxWidth: "100%",
    fontSize: "clamp(2rem, 5.2vw, 3.9rem)",
    lineHeight: 1,
    letterSpacing: "-0.04em",
    whiteSpace: "nowrap"
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
