"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Eye, Send, Trash2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { applyMergeTags, audienceLabel, primaryTeamName, resolveRecipientUids } from "@/lib/audience";
import { callSendEmail } from "@/lib/email-client";
import { renderEmailHtml } from "@/lib/email-render";
import { MAX_RECIPIENTS_PER_SEND, type AudienceKind, type EmailAudience } from "@/lib/email-types";
import { deleteTemplate, saveTemplate, watchSentEmails, watchTemplates } from "@/lib/firestore";
import { canSendEmail, isAdmin } from "@/lib/permissions";
import type { EmailTemplate, SentEmail } from "@/lib/types";
import { btnGhost, btnPrimary, btnSecondary, card, inputCls, labelCls } from "@/lib/ui";
import PageHeader from "@/components/PageHeader";
import PersonPicker from "@/components/PersonPicker";
import TeamPicker from "@/components/TeamPicker";

const KIND_LABELS: Record<AudienceKind, string> = {
  everyone: "Everyone",
  teams: "Teams",
  role: "By role",
  people: "Specific people",
};

const ROLE_OPTIONS = [
  { value: "admin", label: "All admins" },
  { value: "director", label: "All directors" },
  { value: "lead", label: "All team leads" },
] as const;

function formatWhen(s: SentEmail): string {
  const d = s.sentAt?.toDate();
  return d ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "just now";
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { users, teams } = useData();
  const admin = isAdmin(user);

  const [kind, setKind] = useState<AudienceKind>("teams");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [role, setRole] = useState<"admin" | "director" | "lead">("lead");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const unsubs = [watchTemplates(setTemplates), watchSentEmails(admin ? null : uid, setSent)];
    return () => unsubs.forEach((u) => u());
  }, [uid, admin]);

  // Directors can only reach the teams they lead, and the people inside them.
  const allowedTeams = useMemo(
    () => (admin || !uid ? teams : teams.filter((t) => t.managerIds.includes(uid))),
    [teams, admin, uid]
  );
  const allowedPeople = useMemo(() => {
    if (admin) return users;
    const scope = new Set(
      resolveRecipientUids({ kind: "teams", teamIds: allowedTeams.map((t) => t.id) }, users, teams)
    );
    return users.filter((u) => scope.has(u.uid));
  }, [admin, users, teams, allowedTeams]);

  const audience: EmailAudience = useMemo(() => {
    if (kind === "everyone") return { kind };
    if (kind === "teams") return { kind, teamIds };
    if (kind === "role") return { kind, role };
    return { kind, userIds };
  }, [kind, teamIds, role, userIds]);

  const recipientCount = useMemo(
    () => resolveRecipientUids(audience, users, teams).length,
    [audience, users, teams]
  );
  const label = audienceLabel(audience, teams);

  const previewHtml = useMemo(() => {
    const person = {
      name: user?.name ?? "Alex Example",
      firstName: user?.firstName,
      teamName: user ? primaryTeamName(teams, user.uid) : "",
    };
    return renderEmailHtml({
      heading: applyMergeTags(subject || "Your subject line", person),
      body: applyMergeTags(body || "Your message will appear here.", person),
      senderName: user?.name ?? "You",
      appUrl: typeof window === "undefined" ? "" : window.location.origin,
    });
  }, [subject, body, user, teams]);

  if (!canSendEmail(user)) {
    return <p className="text-sm text-muted">Only admins and directors can send announcements.</p>;
  }

  function insertTag(tag: string) {
    setBody((b) => `${b}${b && !b.endsWith(" ") && !b.endsWith("\n") ? " " : ""}${tag}`);
  }

  function loadTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
      setTemplateName(t.name);
    } else {
      setTemplateName("");
    }
  }

  async function handleSaveTemplate() {
    if (!user || !templateName.trim() || !subject.trim() || !body.trim()) {
      setResult({ ok: false, text: "Give the template a name, subject and message first." });
      return;
    }
    try {
      await saveTemplate({
        id: templateId || undefined,
        name: templateName.trim(),
        subject: subject.trim(),
        body,
        createdBy: user.uid,
      });
      setResult({ ok: true, text: templateId ? "Template updated." : "Template saved." });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Could not save the template." });
    }
  }

  async function handleDeleteTemplate() {
    if (!templateId || !confirm("Delete this template?")) return;
    await deleteTemplate(templateId);
    setTemplateId("");
    setTemplateName("");
  }

  async function send(test: boolean) {
    if (!subject.trim() || !body.trim()) {
      setResult({ ok: false, text: "Add a subject and a message." });
      return;
    }
    if (!test) {
      if (recipientCount === 0) {
        setResult({ ok: false, text: "Choose at least one recipient." });
        return;
      }
      if (recipientCount > MAX_RECIPIENTS_PER_SEND) {
        setResult({ ok: false, text: `That's ${recipientCount} people. The limit is ${MAX_RECIPIENTS_PER_SEND} per send; send by division instead.` });
        return;
      }
      if (!confirm(`Send this email to ${recipientCount} ${recipientCount === 1 ? "person" : "people"} (${label})?`)) return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await callSendEmail({ mode: "announcement", audience, subject, body, test });
      const failed = res.failed > 0 ? ` ${res.failed} failed${res.errors?.length ? `: ${res.errors.join("; ")}` : "."}` : "";
      setResult({
        ok: res.failed === 0,
        text: test ? `Test sent to ${user?.email}. Check your inbox and spam.${failed}` : `Sent to ${res.sent} of ${res.recipientCount}.${failed}`,
      });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Could not send." });
    } finally {
      setBusy(false);
    }
  }

  const kinds = (Object.keys(KIND_LABELS) as AudienceKind[]).filter(
    (k) => admin || k === "teams" || k === "people"
  );

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle={admin ? "Email everyone, a team, or a role." : "Email the teams you lead."}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={clsx(card, "p-5")}>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">1. Who gets it</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {kinds.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-sm font-medium ring-1 transition",
                    kind === k ? "bg-ink text-gold ring-ink" : "bg-white text-muted ring-line hover:text-ink"
                  )}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            {kind === "teams" && (
              <div>
                {teamIds.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {teamIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-medium text-gold-dark">
                        {teams.find((t) => t.id === id)?.name ?? "?"}
                        <button onClick={() => setTeamIds((p) => p.filter((x) => x !== id))} aria-label="Remove team">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <TeamPicker
                  value=""
                  options={allowedTeams.filter((t) => !teamIds.includes(t.id))}
                  onChange={(id) => setTeamIds((p) => [...p, id])}
                  placeholder="Add a team (includes its subteams)…"
                />
              </div>
            )}
            {kind === "role" && (
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputCls}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {kind === "people" && <PersonPicker candidates={allowedPeople} selectedIds={userIds} onChange={setUserIds} />}
            {kind === "everyone" && <p className="text-sm text-muted">Every member who has signed in.</p>}

            <p className={clsx("mt-3 text-sm font-medium", recipientCount > MAX_RECIPIENTS_PER_SEND ? "text-red-700" : "text-ink")}>
              {recipientCount} {recipientCount === 1 ? "recipient" : "recipients"}
              {recipientCount > MAX_RECIPIENTS_PER_SEND && ` (limit ${MAX_RECIPIENTS_PER_SEND} per send)`}
            </p>
          </section>

          <section className={clsx(card, "p-5")}>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">2. Write it</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={templateId} onChange={(e) => loadTemplate(e.target.value)} className={clsx(inputCls, "w-auto")}>
                <option value="">Load a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {templateId && (
                <button onClick={handleDeleteTemplate} className={btnGhost} aria-label="Delete template">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <label className={labelCls}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder="e.g. General meeting this Thursday" />

            <div className="mb-1 mt-3 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>Message</label>
              <span className="flex gap-1 text-xs">
                {["{{firstName}}", "{{name}}", "{{teamName}}"].map((tag) => (
                  <button key={tag} onClick={() => insertTag(tag)} className="rounded bg-gold-tint px-1.5 py-0.5 font-mono text-gold-dark hover:bg-gold/40">
                    {tag}
                  </button>
                ))}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={inputCls}
              placeholder={"Hi {{firstName}},\n\nWrite your message here. Blank lines start a new paragraph and links are clickable."}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className={clsx(inputCls, "w-48")}
              />
              <button onClick={handleSaveTemplate} className={btnSecondary}>
                {templateId ? "Update template" : "Save as template"}
              </button>
            </div>
          </section>

          <section className={clsx(card, "p-5")}>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">3. Send</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => send(true)} disabled={busy} className={btnSecondary}>
                <Eye size={14} /> Send test to me
              </button>
              <button onClick={() => send(false)} disabled={busy || recipientCount === 0} className={btnPrimary}>
                <Send size={14} /> {busy ? "Sending…" : `Send to ${recipientCount}`}
              </button>
            </div>
            {result && (
              <p className={clsx("mt-3 text-sm", result.ok ? "text-emerald-700" : "text-red-700")}>{result.text}</p>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className={clsx(card, "overflow-hidden")}>
            <h2 className="border-b border-line px-5 py-3 font-display text-base font-semibold text-ink">Preview</h2>
            <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="h-[600px] w-full bg-white" />
          </section>

          <section className={clsx(card, "p-5")}>
            <h2 className="mb-3 font-display text-base font-semibold text-ink">Recently sent</h2>
            {sent.length === 0 ? (
              <p className="text-sm text-muted">Nothing sent yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {sent.map((s) => (
                  <li key={s.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-ink">{s.subject}</span>
                      <span className="shrink-0 text-xs text-muted">{formatWhen(s)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {s.audienceLabel} · {s.recipientCount - s.failedCount}/{s.recipientCount} delivered
                      {s.failedCount > 0 && <span className="text-red-700"> · {s.failedCount} failed</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
