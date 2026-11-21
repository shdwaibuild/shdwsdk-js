// ============================================================================
// ISO/IEC 42001:2023 Annex A: which controls SHDWsdk records support, and which
// stay with the organization. SHDWsdk never claims a control is "met": an
// auditor decides that. It reports where its records are evidence.
// ============================================================================

export type Iso42001Support = "supporting_evidence" | "partial_evidence" | "available_not_set_up" | "organization_process";

export interface Iso42001Control {
  id: string;
  objective: string;
  title: string;
  /** What SHDWsdk contributes, if anything. */
  shdw?: { evidence: Iso42001EvidenceKey[]; describe: string };
}

export type Iso42001EvidenceKey =
  | "aibom_inventory"
  | "aibom_tooling"
  | "aibom_data_sources"
  | "hosting_recorded"
  | "live_telemetry"
  | "audit_chain"
  | "retention_policy"
  | "public_trust_page"
  | "customer_statements";

export const ISO_42001_REFERENCE_URL = "https://www.iso.org/standard/81230.html";

export const ISO_42001_ANNEX_A: readonly Iso42001Control[] = [
  { id: "A.2.2", objective: "A.2 Policies related to AI", title: "AI policy" },
  { id: "A.2.3", objective: "A.2 Policies related to AI", title: "Alignment with other organizational policies" },
  { id: "A.2.4", objective: "A.2 Policies related to AI", title: "Review of the AI policy" },
  { id: "A.3.2", objective: "A.3 Internal organization", title: "AI roles and responsibilities" },
  { id: "A.3.3", objective: "A.3 Internal organization", title: "Reporting of concerns" },
  {
    id: "A.4.2",
    objective: "A.4 Resources for AI systems",
    title: "Resource documentation",
    shdw: { evidence: ["aibom_inventory"], describe: "The AI-BOM lists every model and workload seen in production." },
  },
  {
    id: "A.4.3",
    objective: "A.4 Resources for AI systems",
    title: "Data resources",
    shdw: { evidence: ["aibom_data_sources"], describe: "Connected retrieval sources and embedding models are recorded in the AI-BOM." },
  },
  {
    id: "A.4.4",
    objective: "A.4 Resources for AI systems",
    title: "Tooling resources",
    shdw: { evidence: ["aibom_tooling"], describe: "Model vendors, vector stores and integrations in use are recorded automatically." },
  },
  {
    id: "A.4.5",
    objective: "A.4 Resources for AI systems",
    title: "System and computing resources",
    shdw: {
      evidence: ["hosting_recorded", "live_telemetry"],
      describe: "Where each model ran (vendor API, cloud, self-hosted), grid region and estimated energy per call.",
    },
  },
  { id: "A.4.6", objective: "A.4 Resources for AI systems", title: "Human resources" },
  { id: "A.5.2", objective: "A.5 Assessing impacts of AI systems", title: "AI system impact assessment process" },
  { id: "A.5.3", objective: "A.5 Assessing impacts of AI systems", title: "Documentation of AI system impact assessments" },
  { id: "A.5.4", objective: "A.5 Assessing impacts of AI systems", title: "Assessing AI system impact on individuals or groups of individuals" },
  { id: "A.5.5", objective: "A.5 Assessing impacts of AI systems", title: "Assessing societal impacts of AI systems" },
  { id: "A.6.1.2", objective: "A.6 AI system life cycle", title: "Objectives for responsible development of AI system" },
  { id: "A.6.1.3", objective: "A.6 AI system life cycle", title: "Processes for responsible AI system design and development" },
  { id: "A.6.2.2", objective: "A.6 AI system life cycle", title: "AI system requirements and specification" },
  { id: "A.6.2.3", objective: "A.6 AI system life cycle", title: "Documentation of AI system design and development" },
  { id: "A.6.2.4", objective: "A.6 AI system life cycle", title: "AI system verification and validation" },
  { id: "A.6.2.5", objective: "A.6 AI system life cycle", title: "AI system deployment" },
  {
    id: "A.6.2.6",
    objective: "A.6 AI system life cycle",
    title: "AI system operation and monitoring",
    shdw: { evidence: ["live_telemetry"], describe: "Continuous telemetry of every model call, with delivery health in the developer console." },
  },
  {
    id: "A.6.2.7",
    objective: "A.6 AI system life cycle",
    title: "AI system technical documentation",
    shdw: { evidence: ["aibom_inventory"], describe: "Exportable AI-BOM (CycloneDX ML-BOM and SPDX 3 AI) per workload." },
  },
  {
    id: "A.6.2.8",
    objective: "A.6 AI system life cycle",
    title: "AI system recording of event logs",
    shdw: {
      evidence: ["audit_chain", "retention_policy"],
      describe: "Hash-chained, append-only log of every call with a defined retention period and checkpoints.",
    },
  },
  { id: "A.7.2", objective: "A.7 Data for AI systems", title: "Data for development and enhancement of AI system" },
  { id: "A.7.3", objective: "A.7 Data for AI systems", title: "Acquisition of data" },
  { id: "A.7.4", objective: "A.7 Data for AI systems", title: "Quality of data for AI systems" },
  {
    id: "A.7.5",
    objective: "A.7 Data for AI systems",
    title: "Data provenance",
    shdw: { evidence: ["aibom_data_sources"], describe: "Retrieval sources and embedding models per workload, with registered weight digests." },
  },
  { id: "A.7.6", objective: "A.7 Data for AI systems", title: "Data preparation" },
  {
    id: "A.8.2",
    objective: "A.8 Information for interested parties of AI systems",
    title: "System documentation and information for users",
    shdw: { evidence: ["public_trust_page"], describe: "A public trust page with models in use, methodology and figures." },
  },
  { id: "A.8.3", objective: "A.8 Information for interested parties of AI systems", title: "External reporting" },
  { id: "A.8.4", objective: "A.8 Information for interested parties of AI systems", title: "Communication of incidents" },
  {
    id: "A.8.5",
    objective: "A.8 Information for interested parties of AI systems",
    title: "Information for interested parties",
    shdw: {
      evidence: ["public_trust_page", "customer_statements"],
      describe: "Per-customer emissions statements, buyer disclosure requests and the trust page.",
    },
  },
  { id: "A.9.2", objective: "A.9 Use of AI systems", title: "Processes for responsible use of AI systems" },
  { id: "A.9.3", objective: "A.9 Use of AI systems", title: "Objectives for responsible use of AI system" },
  { id: "A.9.4", objective: "A.9 Use of AI systems", title: "Intended use of the AI system" },
  { id: "A.10.2", objective: "A.10 Third-party and customer relationships", title: "Allocating responsibilities" },
  {
    id: "A.10.3",
    objective: "A.10 Third-party and customer relationships",
    title: "Suppliers",
    shdw: { evidence: ["aibom_tooling"], describe: "Every model vendor and hosting provider in use, from live traffic." },
  },
  {
    id: "A.10.4",
    objective: "A.10 Third-party and customer relationships",
    title: "Customers",
    shdw: { evidence: ["customer_statements"], describe: "Usage, cost and emissions attributed to each customer, ready to share." },
  },
] as const;

export type Iso42001Evidence = Partial<Record<Iso42001EvidenceKey, boolean>>;

export interface Iso42001Result {
  control: Iso42001Control;
  support: Iso42001Support;
  /** Evidence SHDWsdk would contribute that isn't in place yet. */
  missing: Iso42001EvidenceKey[];
}

/**
 * For each Annex A control: "supporting_evidence" when every SHDWsdk record it
 * relies on is in place, "partial_evidence" when some are, "available_not_set_up"
 * when SHDWsdk could support it but has no data yet, and "organization_process"
 * when it is the organization's own policy or process.
 */
export function evaluateIso42001(evidence: Iso42001Evidence): Iso42001Result[] {
  return ISO_42001_ANNEX_A.map((control) => {
    if (!control.shdw) return { control, support: "organization_process", missing: [] };
    const missing = control.shdw.evidence.filter((k) => !evidence[k]);
    const support: Iso42001Support =
      missing.length === 0
        ? "supporting_evidence"
        : missing.length < control.shdw.evidence.length
          ? "partial_evidence"
          : "available_not_set_up";
    return { control, support, missing };
  });
}

export const ISO_42001_EVIDENCE_LABELS: Record<Iso42001EvidenceKey, string> = {
  aibom_inventory: "AI-BOM inventory",
  aibom_tooling: "Model vendors and tooling in the AI-BOM",
  aibom_data_sources: "Retrieval sources in the AI-BOM",
  hosting_recorded: "Hosting recorded on calls",
  live_telemetry: "Telemetry in the last 7 days",
  audit_chain: "Intact audit log",
  retention_policy: "Retention period set",
  public_trust_page: "Public trust page",
  customer_statements: "Customer attribution (customer_ref)",
};
