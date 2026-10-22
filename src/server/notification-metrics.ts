import { AggregateField, type Firestore } from "firebase-admin/firestore";

export async function campaignMetrics(db: Firestore, id: string) {
  const base = db.collectionGroup("notifications").where("announcementId", "==", id);
  // Count separately: legacy notifications may not yet have outcome fields.
  const [count, outcomes, pending] = await Promise.all([
    base.count().get(),
    base
      .aggregate({
        accepted: AggregateField.sum("pushAcceptedTokens"),
        failed: AggregateField.sum("pushFailedTokens"),
      })
      .get(),
    base.where("pushStatus", "==", "pending").count().get(),
  ]);
  return {
    recipientCount: count.data().count,
    pushAcceptedTokens: outcomes.data().accepted,
    pushFailedTokens: outcomes.data().failed,
    pushAttemptedTokens: outcomes.data().accepted + outcomes.data().failed,
    pendingCount: pending.data().count,
  };
}
