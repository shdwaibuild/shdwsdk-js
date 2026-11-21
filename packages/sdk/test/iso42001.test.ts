import { describe, expect, it } from "vitest";
import { evaluateIso42001, ISO_42001_ANNEX_A } from "../src/index.js";

describe("ISO/IEC 42001 Annex A", () => {
  it("lists the 38 Annex A controls once each", () => {
    expect(ISO_42001_ANNEX_A).toHaveLength(38);
    expect(new Set(ISO_42001_ANNEX_A.map((c) => c.id)).size).toBe(38);
  });

  it("never claims organization-process controls", () => {
    const all = evaluateIso42001({
      aibom_inventory: true, aibom_tooling: true, aibom_data_sources: true, hosting_recorded: true,
      live_telemetry: true, audit_chain: true, retention_policy: true, public_trust_page: true, customer_statements: true,
    });
    expect(all.find((r) => r.control.id === "A.5.2")!.support).toBe("organization_process");
    expect(all.find((r) => r.control.id === "A.2.2")!.support).toBe("organization_process");
    expect(all.filter((r) => r.support === "supporting_evidence").length).toBe(12);
  });

  it("reports partial evidence and what's missing", () => {
    const r = evaluateIso42001({ audit_chain: true }).find((x) => x.control.id === "A.6.2.8")!;
    expect(r.support).toBe("partial_evidence");
    expect(r.missing).toEqual(["retention_policy"]);
    expect(evaluateIso42001({}).find((x) => x.control.id === "A.4.2")!.support).toBe("available_not_set_up");
  });
});
