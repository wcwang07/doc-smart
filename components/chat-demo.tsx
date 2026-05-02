"use client";

import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type JobResponse = {
  job_id: string;
  status: string;
  message: string;
  file_id?: string;
  filename?: string;
  processed_chunks?: number;
  total_chunks?: number;
};

type JobStatus = {
  job_id: string;
  status: string;
  message: string;
  file_id?: string;
  filename?: string;
  processed_chunks?: number;
  total_chunks?: number;
  error?: string | null;
};

type PresignResponse = {
  job_id: string;
  upload_url: string;
  upload_headers?: Record<string, string>;
};

type ErrorPayload = {
  detail?: string;
};

type DocumentItem = {
  file_id: string;
  job_id?: string;
  filename?: string;
  status?: string;
  message?: string;
  processed_chunks?: number;
  total_chunks?: number;
  created_at?: string;
};

const trackedJobsStorageKey = "doc-smart:indexing-jobs";
const incompleteStatuses = new Set(["pending_upload", "queued", "processing"]);

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isCompletedStatus(status?: string) {
  return status?.toLowerCase() === "completed";
}

function isFailedStatus(status?: string) {
  return status?.toLowerCase() === "failed";
}

function isDocumentReady(document?: DocumentItem | null) {
  return Boolean(document && (isCompletedStatus(document.status) || (!document.status && !document.job_id)));
}

function shouldPollStatus(status?: string) {
  return !status || incompleteStatuses.has(status.toLowerCase());
}

function formatJobProgress(item?: Pick<DocumentItem, "processed_chunks" | "total_chunks" | "status" | "message"> | null) {
  if (!item) {
    return "Select an indexed document before asking.";
  }

  const processed = item.processed_chunks;
  const total = item.total_chunks;
  if (typeof processed === "number" && typeof total === "number" && total > 0) {
    return `Indexing ${processed} of ${total} chunks`;
  }

  if (isCompletedStatus(item.status)) {
    return "Ready for chat.";
  }
  if (isFailedStatus(item.status)) {
    return item.message || "Indexing failed.";
  }

  return item.message || "Uploaded. Indexing in background.";
}

function formatUploadError(error: unknown, stage?: string) {
  const stageLabel = stage ? `${stage} failed. ` : "";
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return `${stageLabel}Could not complete the direct upload from the browser. If this happened during storage upload, check that the S3 upload URL is reachable and S3 CORS allows this origin plus the returned upload headers.`;
  }

  return error instanceof Error ? `${stageLabel}${error.message}` : `${stageLabel}Upload failed.`;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const data = (await response.json()) as T | ErrorPayload;
  if (!response.ok) {
    const errorPayload = data as ErrorPayload;
    throw new Error(errorPayload.detail || fallbackMessage);
  }

  return data as T;
}

function normalizeDocument(raw: unknown): DocumentItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const fileId = readString(record.file_id) || readString(record.fileId) || readString(record.id);
  const jobId = readString(record.job_id) || readString(record.jobId);
  if (!fileId) {
    return null;
  }

  return {
    file_id: fileId,
    job_id: jobId,
    filename: readString(record.filename) || readString(record.name) || readString(record.title),
    status: readString(record.status),
    message: readString(record.message),
    processed_chunks: readNumber(record.processed_chunks) ?? readNumber(record.processedChunks),
    total_chunks: readNumber(record.total_chunks) ?? readNumber(record.totalChunks),
    created_at: readString(record.created_at) || readString(record.createdAt)
  };
}

function normalizeDocuments(raw: unknown) {
  const source =
    Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).documents)
        ? ((raw as Record<string, unknown>).documents as unknown[])
        : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).files)
          ? ((raw as Record<string, unknown>).files as unknown[])
          : [];

  return source.map(normalizeDocument).filter((document): document is DocumentItem => Boolean(document));
}

function jobToDocument(job: JobStatus): DocumentItem {
  const fileId = job.file_id || job.job_id;
  return {
    file_id: fileId,
    job_id: job.job_id,
    filename: job.filename,
    status: job.status,
    message: job.message,
    processed_chunks: job.processed_chunks,
    total_chunks: job.total_chunks
  };
}

function readTrackedJobs() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(trackedJobsStorageKey) || "{}") as Record<string, JobStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTrackedJobs(jobs: Record<string, JobStatus>) {
  window.localStorage.setItem(trackedJobsStorageKey, JSON.stringify(jobs));
}

export function ChatDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [trackedJobs, setTrackedJobs] = useState<Record<string, JobStatus>>({});
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedDocuments = useMemo(() => {
    const merged = new Map<string, DocumentItem>();
    documents.forEach((document) => {
      merged.set(document.file_id, document);
    });
    Object.values(trackedJobs).forEach((job) => {
      const document = jobToDocument(job);
      const existing = merged.get(document.file_id);
      if (existing && isDocumentReady(existing) && !isCompletedStatus(document.status)) {
        return;
      }
      merged.set(document.file_id, { ...existing, ...document });
    });
    return Array.from(merged.values());
  }, [documents, trackedJobs]);

  const selectedDocument = useMemo(
    () => displayedDocuments.find((document) => document.file_id === fileId),
    [displayedDocuments, fileId]
  );
  const selectedDocumentReady = isDocumentReady(selectedDocument);
  const canAsk = useMemo(
    () => !asking && selectedDocumentReady && question.trim().length > 0,
    [asking, question, selectedDocumentReady]
  );
  const activeJob = activeJobId ? trackedJobs[activeJobId] || jobState : jobState;
  const showProcessingToast = Boolean(activeJob) && !isCompletedStatus(activeJob?.status) && !isFailedStatus(activeJob?.status);
  const processingMessage = formatJobProgress(activeJob);

  useEffect(() => {
    setTrackedJobs(readTrackedJobs());
    void loadDocuments();
  }, []);

  useEffect(() => {
    writeTrackedJobs(trackedJobs);
  }, [trackedJobs]);

  const refreshJob = useCallback(async (jobId: string) => {
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

    setTrackedJobs((current) => ({
      ...current,
      [jobId]: {
        ...current[jobId],
        ...data,
        job_id: data.job_id || jobId
      }
    }));
    setJobState(data);

    if (isCompletedStatus(data.status)) {
      const indexedFileId = data.file_id || jobId;
      console.log("[ui] polling completed", { jobId, fileId: indexedFileId });
      setFileId((currentFileId) => (currentFileId === jobId || !currentFileId ? indexedFileId : currentFileId));
      setActiveJobId((currentJobId) => (currentJobId === jobId ? null : currentJobId));
      await loadDocuments(indexedFileId);
    }
    if (isFailedStatus(data.status)) {
      console.error("[ui] polling failed", { jobId, data });
      setActiveJobId((currentJobId) => (currentJobId === jobId ? null : currentJobId));
    }
  }, []);

  useEffect(() => {
    const pollableJobIds = Object.values(trackedJobs).filter((job) => shouldPollStatus(job.status)).map((job) => job.job_id);
    if (pollableJobIds.length === 0) {
      return;
    }

    let cancelled = false;
    async function refreshPollableJobs() {
      await Promise.allSettled(
        pollableJobIds.map(async (jobId) => {
          if (!cancelled) {
            await refreshJob(jobId);
          }
        })
      );
    }

    const interval = window.setInterval(refreshPollableJobs, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshJob, trackedJobs]);

  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === "visible") {
        void loadDocuments(fileId || undefined);
        Object.values(readTrackedJobs())
          .filter((job) => shouldPollStatus(job.status))
          .forEach((job) => {
            void refreshJob(job.job_id);
          });
      }
    }

    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [fileId, refreshJob]);

  async function loadDocuments(preferredFileId?: string) {
    setLoadingDocuments(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = (await response.json()) as unknown;
      if (!response.ok) {
        const errorPayload = data as ErrorPayload;
        throw new Error(errorPayload.detail || "Document list failed.");
      }

      const nextDocuments = normalizeDocuments(data);
      setDocuments(nextDocuments);
      const nextFileId =
        preferredFileId && nextDocuments.some((document) => document.file_id === preferredFileId)
          ? preferredFileId
          : fileId && nextDocuments.some((document) => document.file_id === fileId)
            ? fileId
            : nextDocuments.find((document) => document.status?.toLowerCase() === "completed")?.file_id ||
              nextDocuments[0]?.file_id;

      if (nextFileId) {
        setFileId(nextFileId);
      }
    } catch (documentsError) {
      console.error("[ui] documents failed", documentsError);
    } finally {
      setLoadingDocuments(false);
    }
  }

  async function presignUpload(file: File) {
    const response = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size
      })
    });

    return readJsonResponse<PresignResponse>(response, "Upload presign failed.");
  }

  async function uploadToStorage(presign: PresignResponse, file: File) {
    const response = await fetch(presign.upload_url, {
      method: "PUT",
      headers: presign.upload_headers || {},
      body: file
    });

    if (!response.ok) {
      throw new Error(`Storage upload failed with status ${response.status}.`);
    }
  }

  async function completeUpload(jobId: string) {
    const response = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ job_id: jobId })
    });

    return readJsonResponse<JobResponse>(response, "Upload completion failed.");
  }

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

    let uploadStage = "Upload";
    try {
      uploadStage = "Presign";
      const presign = await presignUpload(file);
      console.log("[ui] upload presigned", { jobId: presign.job_id });

      uploadStage = "Storage upload";
      await uploadToStorage(presign, file);
      console.log("[ui] storage upload completed", { jobId: presign.job_id });

      uploadStage = "Complete";
      const data = await completeUpload(presign.job_id);
      console.log("[ui] upload complete response body", data);

      const jobId = data.job_id;
      const uploadedJob: JobStatus = {
        job_id: jobId,
        status: data.status || "queued",
        message: data.message || "Uploaded. Indexing in background.",
        file_id: data.file_id,
        filename: data.filename || file.name,
        processed_chunks: data.processed_chunks,
        total_chunks: data.total_chunks
      };
      setActiveJobId(jobId);
      setJobState(uploadedJob);
      setTrackedJobs((current) => ({ ...current, [jobId]: uploadedJob }));
      setFileId(uploadedJob.file_id || jobId);
      console.log("[ui] upload accepted", { jobId });
      void refreshJob(jobId).catch((pollError) => {
        console.error("[ui] initial job refresh failed", pollError);
      });
    } catch (uploadError) {
      console.error("[ui] upload failed", uploadError);
      setActiveJobId(null);
      setError(formatUploadError(uploadError, uploadStage));
    } finally {
      console.log("[ui] upload finished");
      setUploading(false);
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
    if (!fileId) {
      console.warn("[ui] ask blocked", {
        hasFileId: false
      });
      setError("Select a completed document before asking a question.");
      return;
    }
    if (!selectedDocumentReady) {
      setError(formatJobProgress(selectedDocument));
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
          system_prompt:
            "You are a concise assistant. Answer only from the selected document context. If the answer is not in the context, say you do not know.",
          top_k: 12,
          file_id: fileId,
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
            <p style={styles.toastTitle}>Uploaded. Indexing in background.</p>
            <p style={styles.toastText}>You can leave this page and return while indexing continues.</p>
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
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>
          <p style={styles.meta}>
            {jobState
              ? `${jobState.status}: ${formatJobProgress(jobState)}`
              : "Supported file types match the backend: .pdf and .txt"}
          </p>
          <label style={styles.selectLabel} htmlFor="document-select">
            Ask about
          </label>
          <select
            id="document-select"
            value={fileId || ""}
            onChange={(event) => {
              setFileId(event.target.value || null);
              setMessages([]);
            }}
            style={styles.select}
          >
            <option value="">{loadingDocuments ? "Loading documents..." : "Select a document"}</option>
            {displayedDocuments.map((document) => (
              <option key={document.file_id} value={document.file_id}>
                {document.filename || document.file_id} {isDocumentReady(document) ? "" : `(${document.status || "queued"})`}
              </option>
            ))}
          </select>
          {fileId ? (
            <p style={selectedDocumentReady ? styles.success : isFailedStatus(selectedDocument?.status) ? styles.errorInline : styles.warning}>
              {selectedDocument?.filename || fileId}: {formatJobProgress(selectedDocument)}
            </p>
          ) : null}
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
              placeholder={selectedDocumentReady ? "Ask about the uploaded document..." : "Chat unlocks when indexing completes."}
              rows={4}
              style={styles.textarea}
              disabled={!selectedDocumentReady}
            />
            <button disabled={!canAsk} style={styles.secondaryButton} type="submit">
              {asking ? "Thinking..." : "Send"}
            </button>
          </form>

          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      </section>

      <footer style={styles.footer}>
        <p style={styles.footerText}>
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/weicwang/"
            target="_blank"
            rel="noreferrer"
            style={styles.footerLink}
          >
            Wei C. Wang
          </a>
        </p>
      </footer>
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
  footer: {
    marginTop: "28px",
    paddingTop: "18px",
    borderTop: "1px solid rgba(44, 36, 30, 0.12)"
  },
  footerText: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "0.95rem"
  },
  footerLink: {
    color: "var(--accent-2)",
    fontWeight: 700,
    textDecoration: "none"
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
  selectLabel: {
    display: "block",
    margin: "18px 0 8px",
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  select: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid var(--line)",
    background: "#fff",
    color: "inherit"
  },
  success: {
    margin: "12px 0 0",
    color: "var(--success)"
  },
  warning: {
    margin: "12px 0 0",
    color: "var(--warning)"
  },
  errorInline: {
    margin: "12px 0 0",
    color: "#9f2d2d"
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
