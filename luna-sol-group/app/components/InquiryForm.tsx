"use client";

import { FormEvent, useState } from "react";

type FormStatus = "idle" | "sending" | "sent" | "fallback" | "error";

export function InquiryForm() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
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
        <small>Reviewed directly by Ryan</small>
      </div>
      <div className="field-grid">
        <label>
          <span>Name <small>Optional</small></span>
          <input name="name" autoComplete="name" maxLength={100} />
        </label>
        <label>
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={160} />
        </label>
      </div>
      <label>
        <span>What operating decision is on the table?</span>
        <textarea name="problem" required minLength={20} maxLength={2400} rows={6} placeholder="Describe the decision, scale, urgency, and what the current system cannot resolve." />
      </label>
      <label className="honeypot" aria-hidden="true">
        <span>Website</span>
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="form-actions">
        <button className="button" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send operating brief"} <span aria-hidden="true">→</span>
        </button>
        <a href={`mailto:${contactEmail}`}>Or email Ryan directly</a>
      </div>
      <p className={`form-status ${status}`} aria-live="polite">{message}</p>
    </form>
  );
}
