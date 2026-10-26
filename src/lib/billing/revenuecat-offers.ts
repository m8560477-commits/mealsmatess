import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

export function approvedOffer(pkg: PurchasesPackage, allowed: string[]) {
  if (!["MONTHLY", "ANNUAL"].includes(pkg.packageType) || !allowed.includes(pkg.product.identifier))
    return false;
  const option = pkg.product.defaultOption;
  if (!option || option.isPrepaid || option.installmentsInfo || !option.pricingPhases.length)
    return false;
  const phases = option.pricingPhases;
  const last = phases[phases.length - 1];
  const period = pkg.packageType === "MONTHLY" ? "P1M" : "P1Y";
  return (
    last.recurrenceMode === 1 &&
    last.billingPeriod.iso8601 === period &&
    phases.every(
      (p) =>
        !!p.price.formatted &&
        !!p.price.currencyCode &&
        !!p.billingPeriod.iso8601 &&
        (p === last || (p.billingCycleCount != null && p.billingCycleCount > 0)),
    )
  );
}

/** Trial acquisition must match the advertised offer, rather than immediately charging. */
export function hasSevenDayTrial(pkg: PurchasesPackage) {
  const phases = pkg.product.defaultOption?.pricingPhases;
  const first = phases?.[0];
  if (!phases || phases.length < 2 || !first) return false;
  const sevenDays =
    (first.billingPeriod.iso8601 === "P7D" &&
      first.billingPeriod.unit === "DAY" &&
      first.billingPeriod.value === 7) ||
    (first.billingPeriod.iso8601 === "P1W" &&
      first.billingPeriod.unit === "WEEK" &&
      first.billingPeriod.value === 1);
  return (
    first.price.amountMicros === 0 &&
    first.recurrenceMode === 2 &&
    first.billingCycleCount === 1 &&
    sevenDays &&
    phases.slice(1).every((phase) => phase.price.amountMicros > 0)
  );
}

export function offerPrice(pkg: PurchasesPackage) {
  return pkg.product
    .defaultOption!.pricingPhases.map((phase) => {
      const period = phase.billingPeriod;
      const unit = period.unit.toLowerCase();
      const duration = `${period.value} ${unit}${period.value === 1 ? "" : "s"}`;
      const recurring = phase.recurrenceMode === 1;
      return `${phase.price.formatted} ${phase.price.currencyCode} per ${duration}${recurring ? ", renewing until cancelled" : ` for ${phase.billingCycleCount} payment period(s)`}`;
    })
    .join("; then ");
}
