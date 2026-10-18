import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPremiumGrants,
  getPremiumGrantHistory,
  managePremiumGrant,
} from "@/lib/premium-grants.functions";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
export function PremiumGrantsDashboard() {
  const { user } = useSession();
  const qc = useQueryClient();
  const grants = useQuery({
    queryKey: ["premium-grants", user?.id],
    queryFn: () => getPremiumGrants(),
  });
  const [email, setEmail] = useState("");
  const [duration, setDuration] = useState("30");
  const [custom, setCustom] = useState(30);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [historyEmail, setHistoryEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const history = useQuery({
    queryKey: ["premium-grant-history", user?.id, historyEmail],
    queryFn: () => getPremiumGrantHistory({ data: { email: historyEmail } }),
    enabled: !!historyEmail,
  });
  async function change(action: "grant" | "extend" | "revoke") {
    setBusy(true);
    setMessage("");
    try {
      const result = await managePremiumGrant({
        data: {
          action,
          email,
          days: duration === "custom" ? custom : Number(duration),
          reason,
          note,
        },
      });
      setMessage(
        `Complimentary access ${action === "revoke" ? "revoked" : "saved"}: ${result.status}.`,
      );
      await qc.invalidateQueries({ queryKey: ["premium-grants"] });
      await qc.invalidateQueries({ queryKey: ["premium-grant-history"] });
      await qc.invalidateQueries({ queryKey: ["entitlement"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't update access.");
    } finally {
      setBusy(false);
    }
  }
  const rows = (grants.data?.grants ?? []).filter(
    (g) =>
      g.email.includes(search.trim().toLowerCase()) && (filter === "all" || filter === g.status),
  );
  return (
    <section className="space-y-6">
      <h2 className="font-display text-2xl">Complimentary Premium</h2>
      {grants.isLoading && <p role="status">Loading grants…</p>}
      {grants.error && (
        <p role="alert">
          Couldn't load grants. <button onClick={() => void grants.refetch()}>Retry</button>
        </p>
      )}
      {grants.data && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(grants.data.counts).map(([label, value]) => (
            <div className="rounded-xl border p-4" key={label}>
              <dt className="capitalize">{label}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <form
        className="space-y-4 rounded-2xl border p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void change("grant");
        }}
      >
        <h3 className="font-semibold">Grant Premium by email</h3>
        <p className="text-sm">
          People who haven't signed up receive a pending grant. Its duration starts only after they
          sign in with the matching verified email. No payment method or subscription is created.
        </p>
        <label className="block">
          Email address
          <input
            className="onboarding-input"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          Duration
          <select
            className="onboarding-input"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            {[7, 14, 30, 60, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
            <option value="custom">Custom duration</option>
          </select>
        </label>
        {duration === "custom" && (
          <label className="block">
            Custom duration in days
            <input
              className="onboarding-input"
              type="number"
              min={1}
              max={3650}
              required
              value={custom}
              onChange={(e) => setCustom(Number(e.target.value))}
            />
          </label>
        )}
        <label className="block">
          Reason or campaign (optional)
          <input
            className="onboarding-input"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="block">
          Internal admin note (optional)
          <textarea
            className="onboarding-input"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !email}>Grant Premium</Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !email}
            onClick={() => void change("extend")}
          >
            Extend Premium
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !email}
            onClick={() => void change("revoke")}
          >
            Revoke complimentary access
          </Button>
        </div>
        <p className="text-sm">
          Extend adds the selected days to the remaining access. Revocation affects complimentary
          access only.
        </p>
        {message && <p role="status">{message}</p>}
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Search email
          <input
            className="onboarding-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            className="onboarding-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["all", "active", "pending", "expired", "revoked"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <h3 className="font-semibold">Recently granted access</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Email", "Start", "Expiry", "Status", "Granted by", "Actions"].map((text) => (
                <th className="p-3" key={text}>
                  {text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((grant) => (
              <tr className="border-t" key={grant.id}>
                <td className="p-3">
                  {grant.email}
                  <p className="text-xs">{grant.reason}</p>
                </td>
                <td className="p-3">
                  {grant.starts_at
                    ? new Date(grant.starts_at).toLocaleDateString()
                    : "After verification"}
                </td>
                <td className="p-3">
                  {grant.expires_at
                    ? new Date(grant.expires_at).toLocaleDateString()
                    : `${grant.duration_days} days after activation`}
                </td>
                <td className="p-3">{grant.status}</td>
                <td className="max-w-40 break-all p-3">{grant.created_by}</td>
                <td className="space-x-2 p-3">
                  <button
                    className="underline"
                    onClick={() => {
                      setEmail(grant.email);
                      setReason(grant.reason);
                      setNote(grant.note);
                    }}
                  >
                    Manage
                  </button>
                  <button className="underline" onClick={() => setHistoryEmail(grant.email)}>
                    History
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !grants.isLoading && <p>No matching grants.</p>}
      </div>
      {historyEmail && (
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold">History · {historyEmail}</h3>
          {history.isLoading && <p>Loading history…</p>}
          {history.error && <p role="alert">Could not load history.</p>}
          <ul>
            {history.data?.map((event) => (
              <li className="border-b py-3 text-sm" key={event.id}>
                {event.action} · {new Date(event.occurredAt).toLocaleString()} · {event.days} days
                <br />
                Administrator / actor: {event.actorId}
                {event.expiresAt && <p>Expiry: {new Date(event.expiresAt).toLocaleString()}</p>}
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => setHistoryEmail("")}>
            Close history
          </Button>
        </section>
      )}
    </section>
  );
}
