import { auth } from "./firebase";
import type { SendEmailRequest, SendEmailResponse } from "./email-types";

/** Calls the server route with the signed-in user's Firebase ID token. */
export async function callSendEmail(payload: SendEmailRequest): Promise<SendEmailResponse> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("You are not signed in.");

  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data as SendEmailResponse;
}
