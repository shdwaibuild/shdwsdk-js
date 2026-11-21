// ============================================================================
// SHDWsdk Shared Supabase Database Types
// Strictly typed schema definitions shared across /packages/sdk & /apps/web
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

export type SubscriptionTier = "free" | "starter" | "scale";

/**
 * The model's vendor. The common ones are listed for autocompletion; any
 * lowercase id (mistral, cohere, meta, deepseek, ...) is accepted.
 */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "mistral"
  | "cohere"
  | "meta"
  | "deepseek"
  | "xai"
  | "alibaba"
  | "microsoft"
  | "amazon"
  | "custom"
  | (string & {});

/** Where the model ran. */
export type AIHosting = "vendor_api" | "azure" | "aws_bedrock" | "gcp_vertex" | "self_hosted" | "other";

/** The kind of model call. Energy for non-chat calls uses a FLOP-based estimate. */
export type AIOperation = "chat" | "embedding" | "rerank" | "transcription" | "speech" | "image" | "ocr" | "moderation";

export type EuAiRiskTier =
  | "minimal"
  | "limited"
  | "high"
  | "unacceptable"
  | "unclassified";

export type NistGovernanceStatus =
  | "not_started"
  | "in_progress"
  | "mapped"
  | "measured"
  | "managed"
  | "verified";

export type ComplianceAssessmentStatus =
  | "dormant"
  | "pending_review"
  | "compliant"
  | "action_required";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string | null;
          stripe_customer_id: string | null;
          subscription_status: SubscriptionStatus;
          subscription_tier: SubscriptionTier;
          default_grid_region: string;
          public_trust_enabled: boolean;
          trust_contact_email?: string | null;
          require_mfa?: boolean;
          sso_domain?: string | null;
          sso_provider_id?: string | null;
          require_sso?: boolean;
          /** The organization's own datacenter PUE for self-hosted models. */
          self_hosted_pue?: number | null;
          /** A platform account that manages client organizations. */
          is_partner?: boolean;
          /** The partner that manages this client organization. */
          partner_org_id?: string | null;
          /** Audit-log retention in months (13–120); null keeps everything. */
          retention_months?: number | null;
          legal_hold?: boolean;
          legal_hold_reason?: string | null;
          deletion_scheduled_for?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          subscription_tier?: SubscriptionTier;
          default_grid_region?: string;
          public_trust_enabled?: boolean;
          trust_contact_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          subscription_tier?: SubscriptionTier;
          default_grid_region?: string;
          public_trust_enabled?: boolean;
          trust_contact_email?: string | null;
          self_hosted_pue?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          org_id: string;
          key_hash: string;
          key_prefix: string;
          label: string;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          key_hash: string;
          key_prefix?: string;
          label?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          key_hash?: string;
          key_prefix?: string;
          label?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      model_prices: {
        Row: {
          id: string;
          /** null = SHDWsdk list price; set = the organization's own price. */
          org_id: string | null;
          provider: string;
          model_prefix: string;
          input_usd_per_mtok: number;
          output_usd_per_mtok: number;
          usd_per_audio_minute: number | null;
          usd_per_image: number | null;
          effective_from: string;
          source_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          provider: string;
          model_prefix: string;
          input_usd_per_mtok?: number;
          output_usd_per_mtok?: number;
          usd_per_audio_minute?: number | null;
          usd_per_image?: number | null;
          effective_from?: string;
          source_url?: string | null;
          notes?: string | null;
        };
        Update: {
          input_usd_per_mtok?: number;
          output_usd_per_mtok?: number;
          usd_per_audio_minute?: number | null;
          usd_per_image?: number | null;
          effective_from?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      token_logs: {
        Row: {
          id: string;
          org_id: string;
          model_name: string;
          provider: AIProvider;
          prompt_tokens: number;
          completion_tokens: number;
          estimated_energy_kwh: number;
          estimated_energy_kwh_min: number | null;
          estimated_energy_kwh_max: number | null;
          energy_model_match:
            | "exact"
            | "alias"
            | "normalized"
            | "family"
            | "fallback"
            | "flops_estimate"
            | "not_estimated"
            | null;
          energy_methodology: string | null;
          carbon_gco2e: number;
          grid_region: string;
          grid_intensity_gco2_kwh: number;
          is_streaming: boolean;
          latency_ms: number | null;
          sync_signature: string | null;
          timestamp: string;
          /** The organization's own customer this call served (pseudonymous id). */
          customer_ref?: string | null;
          ingest_source?: IngestSource | null;
          hosting?: AIHosting | null;
          operation?: AIOperation | null;
          audio_seconds?: number | null;
          image_count?: number | null;
          /** A matter/project under customer_ref. */
          matter_ref?: string | null;
          trace_id?: string | null;
          workflow_name?: string | null;
          cost_usd?: number | null;
          price_source?: "org" | "list" | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          model_name: string;
          provider: AIProvider;
          prompt_tokens: number;
          completion_tokens: number;
          estimated_energy_kwh: number;
          estimated_energy_kwh_min?: number | null;
          estimated_energy_kwh_max?: number | null;
          energy_model_match?: "exact" | "alias" | "normalized" | "family" | "fallback" | null;
          energy_methodology?: string | null;
          carbon_gco2e: number;
          grid_region?: string;
          grid_intensity_gco2_kwh?: number;
          is_streaming?: boolean;
          latency_ms?: number | null;
          sync_signature?: string | null;
          timestamp?: string;
          customer_ref?: string | null;
          ingest_source?: IngestSource | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          model_name?: string;
          provider?: AIProvider;
          prompt_tokens?: number;
          completion_tokens?: number;
          estimated_energy_kwh?: number;
          estimated_energy_kwh_min?: number | null;
          estimated_energy_kwh_max?: number | null;
          energy_model_match?: "exact" | "alias" | "normalized" | "family" | "fallback" | null;
          energy_methodology?: string | null;
          carbon_gco2e?: number;
          grid_region?: string;
          grid_intensity_gco2_kwh?: number;
          is_streaming?: boolean;
          latency_ms?: number | null;
          sync_signature?: string | null;
          timestamp?: string;
          customer_ref?: string | null;
          ingest_source?: IngestSource | null;
        };
        Relationships: [
          {
            foreignKeyName: "token_logs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_accounts: {
        Row: {
          org_id: string;
          customer_ref: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          customer_ref: string;
          display_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      questionnaire_answers: {
        Row: {
          org_id: string;
          question_id: string;
          answer: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          question_id: string;
          answer: string;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      disclosure_requests: {
        Row: {
          id: string;
          token: string;
          org_id: string | null;
          vendor_name: string;
          requester_name: string;
          requester_company: string;
          requester_email: string;
          requested_items: string[];
          message: string | null;
          status: "open" | "fulfilled" | "declined";
          vendor_response: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: Record<string, never>;
        Update: {
          status?: "open" | "fulfilled" | "declined";
          vendor_response?: string | null;
          responded_at?: string | null;
        };
        Relationships: [];
      };
      alert_destinations: {
        Row: {
          id: string;
          org_id: string;
          kind: "slack" | "webhook";
          url: string;
          label: string | null;
          events: string[];
          signing_secret: string;
          created_at: string;
          last_sent_at: string | null;
          last_status: number | null;
        };
        Insert: {
          org_id: string;
          kind: "slack" | "webhook";
          url: string;
          label?: string | null;
          events?: string[];
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      usage_reconciliations: {
        Row: {
          id: string;
          org_id: string;
          provider: AIProvider;
          period_start: string;
          period_end: string;
          provider_reported_tokens: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          provider: AIProvider;
          period_start: string;
          period_end: string;
          provider_reported_tokens: number;
          note?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      model_provenance: {
        Row: {
          id: string;
          org_id: string;
          workload_name: string;
          provider: AIProvider;
          model_version: string;
          base_model: string;
          weights_hash: string | null;
          vector_db_connected: boolean;
          vector_db_source_url: string | null;
          embedding_model_id: string | null;
          prompt_hash_version: string;
          eu_ai_risk_tier: EuAiRiskTier;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          workload_name?: string;
          provider?: AIProvider;
          model_version: string;
          base_model: string;
          weights_hash?: string | null;
          vector_db_connected?: boolean;
          vector_db_source_url?: string | null;
          embedding_model_id?: string | null;
          prompt_hash_version: string;
          eu_ai_risk_tier?: EuAiRiskTier;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          workload_name?: string;
          provider?: AIProvider;
          model_version?: string;
          base_model?: string;
          weights_hash?: string | null;
          vector_db_connected?: boolean;
          vector_db_source_url?: string | null;
          embedding_model_id?: string | null;
          prompt_hash_version?: string;
          eu_ai_risk_tier?: EuAiRiskTier;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "model_provenance_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      compliance_assessments: {
        Row: {
          id: string;
          org_id: string;
          eu_ai_risk_tier: EuAiRiskTier;
          nist_status: NistGovernanceStatus;
          nist_govern_controls: string[];
          nist_map_controls: string[];
          nist_measure_controls: string[];
          nist_manage_controls: string[];
          readiness_score: number;
          audit_date: string;
          status: ComplianceAssessmentStatus;
        };
        Insert: {
          id?: string;
          org_id: string;
          eu_ai_risk_tier: EuAiRiskTier;
          nist_status: NistGovernanceStatus;
          nist_govern_controls?: string[];
          nist_map_controls?: string[];
          nist_measure_controls?: string[];
          nist_manage_controls?: string[];
          readiness_score?: number;
          audit_date?: string;
          status?: ComplianceAssessmentStatus;
        };
        Update: {
          id?: string;
          org_id?: string;
          eu_ai_risk_tier?: EuAiRiskTier;
          nist_status?: NistGovernanceStatus;
          nist_govern_controls?: string[];
          nist_map_controls?: string[];
          nist_measure_controls?: string[];
          nist_manage_controls?: string[];
          readiness_score?: number;
          audit_date?: string;
          status?: ComplianceAssessmentStatus;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_assessments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          job_title: string;
          company_name: string;
          org_id: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          job_title?: string;
          company_name: string;
          org_id?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          job_title?: string;
          company_name?: string;
          org_id?: string | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      ingestion_rate_limits: {
        Row: {
          org_id: string;
          window_start: string;
          request_count: number;
        };
        Insert: {
          org_id: string;
          window_start: string;
          request_count?: number;
        };
        Update: {
          org_id?: string;
          window_start?: string;
          request_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ingestion_rate_limits_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      public_trust_summaries: {
        Row: {
          org_id: string;
          org_slug: string;
          org_name: string;
          default_grid_region: string;
          total_prompt_tokens: number;
          total_completion_tokens: number;
          total_tokens: number;
          total_energy_kwh: number;
          total_carbon_gco2e: number;
          active_models_count: number;
          log_events_count: number;
          last_synced_at: string | null;
          anonymized_sync_signatures: string[];
        };
        Relationships: [];
      };
    };
    Functions: {
      org_usage_breakdown: {
        Args: { p_org_id: string; p_start: string; p_end: string; p_dimension: string };
        /** JSON; see UsageBreakdown in the web app. */
        Returns: Record<string, unknown>;
      };
      partner_overview: {
        Args: { p_partner_org_id: string; p_days?: number };
        Returns: Record<string, unknown>;
      };
      partner_create_client_org: {
        Args: { p_partner_org_id: string; p_name: string; p_slug: string };
        Returns: Record<string, unknown>;
      };
      org_data_policy: { Args: { p_org_id: string }; Returns: Record<string, unknown> | null };
      set_org_data_policy: {
        Args: { p_org_id: string; p_retention_months: number | null; p_legal_hold: boolean; p_legal_hold_reason: string | null };
        Returns: Record<string, unknown>;
      };
      schedule_org_deletion: { Args: { p_org_id: string; p_confirm_slug: string }; Returns: Record<string, unknown> };
      cancel_org_deletion: { Args: { p_org_id: string }; Returns: Record<string, unknown> };
      export_token_logs: {
        Args: { p_org_id: string; p_after_seq?: number; p_limit?: number };
        Returns: Record<string, unknown>;
      };
      org_access_status: {
        Args: { p_org_id: string };
        /** JSON; see OrgAccessStatus in the web app. */
        Returns: Record<string, unknown>;
      };
      set_org_identity_policy: {
        Args: { p_org_id: string; p_require_mfa: boolean; p_sso_domain: string | null; p_require_sso: boolean };
        Returns: Record<string, unknown>;
      };
      claim_disclosure_request: {
        Args: { p_token: string; p_org_id: string };
        Returns: string;
      };
      org_monthly_activity: {
        Args: { p_org_id: string; p_start: string; p_end: string };
        Returns: Array<Record<string, unknown>>;
      };
      org_customer_emissions: {
        Args: { p_org_id: string; p_start: string; p_end: string };
        /** JSON; see CustomerEmissionsReport in the web app. */
        Returns: Record<string, unknown> | null;
      };
      org_dashboard_report: {
        Args: { p_org_id: string; p_days?: number };
        /** JSON report; see DashboardReport in the web app. */
        Returns: Record<string, unknown> | null;
      };
      get_org_trailing_30d_summary: {
        Args: { target_org_id: string };
        Returns: Array<{
          total_prompt_tokens: number;
          total_completion_tokens: number;
          total_tokens: number;
          total_energy_kwh: number;
          total_carbon_gco2e: number;
          active_models_count: number;
          log_events_count: number;
          last_synced_at: string | null;
        }>;
      };
      check_and_increment_ingest_rate_limit: {
        Args: {
          target_org_id: string;
          window_seconds?: number;
          max_requests?: number;
        };
        Returns: Array<{
          allowed: boolean;
          current_count: number;
          retry_after_seconds: number;
        }>;
      };
      compute_public_trust_summaries: {
        Args: Record<string, never>;
        Returns: Array<{
          org_id: string;
          org_slug: string;
          org_name: string;
          default_grid_region: string;
          total_prompt_tokens: number;
          total_completion_tokens: number;
          total_tokens: number;
          total_energy_kwh: number;
          total_carbon_gco2e: number;
          active_models_count: number;
          log_events_count: number;
          last_synced_at: string | null;
          anonymized_sync_signatures: string[];
        }>;
      };
      user_has_org_access: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}

export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type ApiKeyRow = Database["public"]["Tables"]["api_keys"]["Row"];
export type IngestSource = "sdk-js" | "sdk-python" | "otlp" | "litellm" | "api";
export type CustomerAccountRow = Database["public"]["Tables"]["customer_accounts"]["Row"];
export type UsageReconciliationRow = Database["public"]["Tables"]["usage_reconciliations"]["Row"];
export type TokenLogRow = Database["public"]["Tables"]["token_logs"]["Row"];
export type ModelProvenanceRow = Database["public"]["Tables"]["model_provenance"]["Row"];
export type ComplianceAssessmentRow =
  Database["public"]["Tables"]["compliance_assessments"]["Row"];

// ============================================================================
// AI-BOM Inventory & Regulatory Compliance Mapping Interfaces
// ============================================================================

export type NistRmfFunction = "GOVERN" | "MAP" | "MEASURE" | "MANAGE";

export interface NistRmfControlItem {
  id: string;
  functionCategory: NistRmfFunction;
  code: string;
  title: string;
  description: string;
  enabled: boolean;
  /** "automated": SHDWsdk data can serve as evidence; "attestation": self-attested only. */
  evidenceType?: "automated" | "attestation";
}

export interface RegulatoryComplianceMapping {
  orgId: string;
  orgName: string;
  orgSlug: string;
  euAiRiskTier: EuAiRiskTier;
  nistStatus: NistGovernanceStatus;
  governControls: string[];
  mapControls: string[];
  measureControls: string[];
  manageControls: string[];
  readinessScore: number;
  auditDate: string;
  status: ComplianceAssessmentStatus;
}

export interface AiBomInventoryItem {
  id: string;
  orgId: string;
  workloadName: string;
  provider: AIProvider;
  baseModel: string;
  modelVersion: string;
  weightsHash: string | null;
  vectorDbConnected: boolean;
  vectorDbSourceUrl: string | null;
  embeddingModelId: string | null;
  promptHashVersion: string;
  euAiRiskTier: EuAiRiskTier;
  updatedAt: string;
  estimatedEnergyKwh30d?: number;
  carbonGco2e30d?: number;
}

export interface CycloneDxMlBomComponent {
  type: "machine-learning-model" | "data" | "application";
  "bom-ref": string;
  name: string;
  version: string;
  supplier?: {
    name: string;
  };
  hashes?: Array<{
    alg: "SHA-256";
    content: string;
  }>;
  properties?: Array<{
    name: string;
    value: string;
  }>;
  modelCard?: {
    modelParameters?: {
      approach?: {
        type: "supervised" | "reinforcement-learning" | "foundation-model";
      };
      task?: string;
    };
    considerations?: {
      environmentalConsiderations?: {
        energyConsumptions?: Array<{
          activity: "inference";
          energyProvided: {
            value: number;
            unit: "kWh";
          };
          co2CostEquivalent?: {
            value: number;
            unit: "gCO2e";
          };
        }>;
      };
      ethicalConsiderations?: Array<{
        name: string;
        mitigationStrategy: string;
      }>;
    };
  };
}

export interface CycloneDxMlBomDocument {
  bomFormat: "CycloneDX";
  specVersion: "1.7";
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: {
      components: Array<{
        type: "application";
        name: string;
        version: string;
        vendor: string;
      }>;
    };
    component: {
      type: "application";
      "bom-ref": string;
      name: string;
      version: string;
    };
    properties: Array<{
      name: string;
      value: string;
    }>;
  };
  components: CycloneDxMlBomComponent[];
  dependencies: Array<{
    ref: string;
    dependsOn: string[];
  }>;
}

export interface Spdx3ElementNode {
  "@id": string;
  "@type":
    | "SpdxDocument"
    | "ai_AIPackage"
    | "dataset_DatasetPackage"
    | "Relationship";
  name?: string;
  creationInfo?: {
    created: string;
    specVersion: "3.0.1";
    createdBy: string[];
  };
  packageVersion?: string;
  suppliedBy?: string;
  verifiedUsing?: Array<{
    algorithm: "sha256";
    hashValue: string;
  }>;
  ai_autonomyType?: string;
  ai_domain?: string;
  ai_energyConsumption?: string;
  shdw_promptHashVersion?: string;
  shdw_euAiRiskTier?: EuAiRiskTier;
  dataset_datasetType?: string;
  dataset_dataCollectionProcess?: string;
  shdw_vectorDbSourceUrl?: string;
  shdw_embeddingModelId?: string;
  from?: string;
  to?: string[];
  relationshipType?: "dependsOn" | "trainedOn" | "describes";
}

export interface Spdx3AiBomDocument {
  "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld";
  "@graph": Spdx3ElementNode[];
}

