"use client";

import { FormEvent, useState } from "react";

type FormStatus = "idle" | "sending" | "sent" | "fallback" | "error";

export function InquiryForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setMessage("Sending your confidential inquiry…");

    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok && result.ok) {
        form.reset();
        setStatus("sent");
        setMessage("Received. Ryan will reply directly.");
        return;
      }
      if (result.fallback && result.mailto) {
        setStatus("fallback");
        setMessage("Opening your email app with the inquiry prefilled.");
        window.location.href = result.mailto;
        return;
      }
      throw new Error("Submission failed");
    } catch {
      setStatus("error");
      setMessage("The secure form is unavailable. Please email Ryan directly.");
    }
  }

  return (
    <form className="inquiry-form" onSubmit={submit} aria-label="Confidential inquiry">
      <div className="form-head">
        <span className="section-label">Confidential intake</span>
        <small>Typically replies within one business day</small>
      </div>
      <div className="field-grid">
        <label>
          <span>Name</span>
          <input name="name" autoComplete="name" required maxLength={100} />
        </label>
        <label>
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={160} />
        </label>
      </div>
      <label>
        <span>Company</span>
        <input name="company" autoComplete="organization" maxLength={140} />
      </label>
      <label>
        <span>What decision or operating problem is on the table?</span>
        <textarea name="problem" required maxLength={2400} rows={5} placeholder="Include the scale, urgency, and what has already been tried." />
      </label>
      <label className="honeypot" aria-hidden="true">
        <span>Website</span>
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="form-actions">
        <button className="button" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send confidential inquiry"} <span aria-hidden="true">→</span>
        </button>
        <a href="mailto:Rmiller62785@gmail.com">Or email Ryan directly</a>
      </div>
      <p className={`form-status ${status}`} aria-live="polite">{message}</p>
    </form>
  );
}
