import { adminDb as db } from "./firebaseAdmin";

export async function calculateMRR(date: Date = new Date()) {
  let mrr = 0;
  try {
    const tenantsSnap = await db
      .collection("tenants")
      .where("status", "==", "active")
      .get();
    tenantsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.subscription?.monthly_price) {
        mrr += Number(data.subscription.monthly_price);
      } else if (data.plan === "enterprise") {
        mrr += 1500;
      } else if (data.plan === "pro") {
        mrr += 500;
      } else if (data.plan === "starter") {
        mrr += 200;
      }
    });
  } catch (e) {
    console.error("Error calculating MRR", e);
  }
  return mrr;
}

export async function calculateChurnRate(monthDate: Date = new Date()) {
  try {
    const startOfMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1,
    );
    const endOfMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    );

    const allTenantsSnap = await db.collection("tenants").get();

    let activeAtStart = 0;
    let canceledInMonth = 0;

    allTenantsSnap.forEach((doc) => {
      const data = doc.data();
      const createdAt =
        data.createdAt?.toDate() || data.created_at?.toDate() || new Date(0);
      const canceledAt =
        data.canceledAt?.toDate() || data.canceled_at?.toDate();

      if (createdAt < startOfMonth) {
        if (!canceledAt || canceledAt >= startOfMonth) {
          activeAtStart++;
        }
      }

      if (
        canceledAt &&
        canceledAt >= startOfMonth &&
        canceledAt <= endOfMonth
      ) {
        canceledInMonth++;
      }
    });

    if (activeAtStart === 0) return 0;
    return canceledInMonth / activeAtStart;
  } catch (e) {
    console.error("Error calculating churn rate", e);
    return 0;
  }
}

export async function calculateLTV(tenantId?: string) {
  try {
    const churnRate = await calculateChurnRate();
    const safeChurnRate = churnRate === 0 ? 0.05 : churnRate; // Assumes 5% base churn if none yet

    let averageMrr = 0;

    if (tenantId) {
      const doc = await db.collection("tenants").doc(tenantId).get();
      if (doc.exists) {
        const data = doc.data()!;
        if (data.subscription?.monthly_price) {
          averageMrr = Number(data.subscription.monthly_price);
        } else if (data.plan === "enterprise") {
          averageMrr = 1500;
        } else if (data.plan === "pro") {
          averageMrr = 500;
        } else if (data.plan === "starter") {
          averageMrr = 200;
        }
      }
    } else {
      const mrr = await calculateMRR();
      const tenantsSnap = await db
        .collection("tenants")
        .where("status", "==", "active")
        .get();
      const activeCount = tenantsSnap.size;
      averageMrr = activeCount > 0 ? mrr / activeCount : 0;
    }

    return averageMrr * (1 / safeChurnRate);
  } catch (e) {
    console.error("Error calculating LTV", e);
    return 0;
  }
}

export async function snapshotSaasMetrics() {
  try {
    const now = new Date();
    const mrr = await calculateMRR(now);
    const churnRate = await calculateChurnRate(now);
    const ltv = await calculateLTV();

    const docId = `${now.getFullYear()}-${now.getMonth() + 1}`;

    await db.collection("saas_metrics").doc(docId).set(
      {
        date: now,
        mrr,
        churnRate,
        ltv,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    console.log(
      `SaaS Metrics snapshot updated for ${docId} - MRR: ${mrr}, Churn: ${churnRate}, LTV: ${ltv}`,
    );
  } catch (e) {
    console.error("Error writing metrics snapshot", e);
  }
}
