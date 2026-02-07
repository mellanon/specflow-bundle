/**
 * SpecFlow Type Definitions
 * Core types for feature queue management and agent orchestration
 */

// =============================================================================
// Feature Status
// =============================================================================

/**
 * Status of a feature in the queue
 */
export type FeatureStatus = "pending" | "in_progress" | "complete" | "skipped" | "blocked" | "evolving";

/**
 * Reason for skipping a feature
 * Required when marking a feature as skipped
 */
export type SkipReason =
  | "duplicate"           // Feature is a duplicate of another
  | "deferred"            // Feature deferred to a later milestone
  | "blocked"             // Feature blocked by external dependency
  | "out_of_scope"        // Feature determined to be out of scope
  | "superseded";         // Feature replaced by different approach

/**
 * SpecFlow phase for a feature
 * Each feature must progress through: specify -> plan -> tasks -> implement -> harden -> review -> approve
 */
export type SpecPhase = "none" | "specify" | "plan" | "tasks" | "implement" | "harden" | "review" | "approve";

// =============================================================================
// Feature
// =============================================================================

/**
 * A unit of work in the feature queue
 */
export interface Feature {
  /** Unique feature ID (e.g., "F-1", "F-2") */
  id: string;
  /** Short feature name */
  name: string;
  /** Description of what this feature does */
  description: string;
  /** Priority (lower = higher priority, implement first) */
  priority: number;
  /** Current status */
  status: FeatureStatus;
  /** Current SpecFlow phase (none -> specify -> plan -> tasks -> implement -> harden -> review -> release) */
  phase: SpecPhase;
  /** Path to detailed spec directory (if specified) */
  specPath: string | null;
  /** When the feature was created */
  createdAt: Date;
  /** When implementation started */
  startedAt: Date | null;
  /** When implementation completed */
  completedAt: Date | null;
  /** Original ID from SpecKit registry migration (e.g., "035") */
  migratedFrom: string | null;
  /** Whether this feature was specified in quick mode */
  quickStart: boolean;

  // ==========================================================================
  // Rich Decomposition Fields (for batch mode)
  // Populated from decomposition when available
  // ==========================================================================

  /** What type of problem this solves */
  problemType?: ProblemType;
  /** Why this is needed now */
  urgency?: UrgencyType;
  /** Who uses this feature */
  primaryUser?: PrimaryUserType;
  /** How it integrates with existing systems */
  integrationScope?: IntegrationScopeType;
  /** How often the feature is used */
  usageContext?: UsageContextType;
  /** What data the feature needs */
  dataRequirements?: DataRequirementsType;
  /** Performance requirements */
  performanceRequirements?: PerformanceRequirementsType;
  /** What matters most for this feature */
  priorityTradeoff?: PriorityTradeoffType;
  /** Fields where decomposition couldn't determine a value */
  uncertainties?: string[];
  /** Free-form notes on what needs human input */
  clarificationNeeded?: string;

  // ==========================================================================
  // Skip Audit Trail (populated when status = skipped)
  // ==========================================================================

  /** Why the feature was skipped */
  skipReason?: SkipReason;
  /** Detailed justification for the skip decision */
  skipJustification?: string;
  /** When the skip was validated */
  skipValidatedAt?: Date;
  /** If duplicate, which feature it duplicates */
  skipDuplicateOf?: string;

  // ==========================================================================
  // Evolve Fields (F-017)
  // ==========================================================================

  /** When the feature was evolved to brownfield mode */
  evolvedAt?: Date;
  /** Path to baseline directory */
  baselinePath?: string | null;
}

// =============================================================================
// App Context
// =============================================================================

/**
 * Application-level context shared with all feature implementations
 */
export interface AppContext {
  /** Absolute path to project root */
  projectPath: string;
  /** Path to app-level specification */
  appSpecPath: string;
  /** Path to .specify/memory/ directory */
  memoryPath: string;
  /** Technology stack (e.g., ["TypeScript", "Bun", "SQLite"]) */
  stack: string[];
  /** Architectural patterns from spec */
  patterns: string[];
}

// =============================================================================
// Run Session
// =============================================================================

/**
 * Tracks current execution session state
 */
export interface RunSession {
  /** When this run session started */
  startedAt: Date;
  /** Currently executing feature ID (if any) */
  currentFeatureId: string | null;
  /** Number of features completed in this session */
  featuresCompleted: number;
  /** Last error message (if any) */
  lastError: string | null;
}

// =============================================================================
// Feature Stats
// =============================================================================

/**
 * Aggregate statistics about the feature queue
 */
export interface FeatureStats {
  /** Total number of features */
  total: number;
  /** Features not yet started */
  pending: number;
  /** Features currently being implemented */
  inProgress: number;
  /** Features successfully completed */
  complete: number;
  /** Features skipped/deferred */
  skipped: number;
  /** Percentage complete (0-100) */
  percentComplete: number;
}

// =============================================================================
// Decomposed Feature
// =============================================================================

/**
 * Problem type from interview question 1.1
 * Maps to: "What specific problem does this feature solve?"
 */
export type ProblemType =
  | "manual_workaround"    // Users do this manually but it's painful/slow
  | "impossible"           // Users simply cannot do this today
  | "scattered"            // Multiple tools/processes that should be unified
  | "quality_issues";      // Current approach leads to errors or inconsistency

/**
 * Urgency type from interview question 1.2
 * Maps to: "Why is solving this problem important NOW?"
 */
export type UrgencyType =
  | "external_deadline"    // Regulation, contract, or market timing
  | "growing_pain"         // Problem is getting worse as usage increases
  | "blocking_work"        // Can't proceed with other priorities until done
  | "user_demand";         // Users are explicitly requesting this

/**
 * Primary user type from interview question 2.1
 * Maps to: "Who is the PRIMARY user of this feature?"
 */
export type PrimaryUserType =
  | "developers"           // Technical users building or integrating
  | "end_users"            // Non-technical users of the application
  | "admins"               // System administrators or operations team
  | "mixed";               // Multiple user types with different needs

/**
 * Integration scope from interview question 3.1
 * Maps to: "What existing systems does this feature need to integrate with?"
 */
export type IntegrationScopeType =
  | "standalone"           // Completely new, minimal dependencies
  | "extends_existing"     // Adds to an existing feature or module
  | "multiple_integrations" // Needs to connect several systems
  | "external_apis";       // Requires third-party service integration

/**
 * Usage context from interview question 2.2 (optional)
 */
export type UsageContextType =
  | "daily"                // Part of regular, frequent tasks
  | "occasional"           // Used periodically when needed
  | "one_time"             // Configure once and rarely touch again
  | "emergency";           // Only used in specific situations

/**
 * Data requirements from interview question 3.2 (optional)
 */
export type DataRequirementsType =
  | "existing_only"        // Uses data already in the system
  | "new_model"            // Requires new database tables/schemas
  | "external_data"        // Needs to fetch data from external sources
  | "user_generated";      // Users will create/input new data

/**
 * Performance requirements from interview question 4.1 (optional)
 */
export type PerformanceRequirementsType =
  | "realtime"             // Must respond instantly (<100ms)
  | "interactive"          // Fast enough for smooth UX (<1s)
  | "background"           // Can process asynchronously
  | "none";                // Performance is not critical

/**
 * Priority tradeoff from interview question 4.2 (optional)
 */
export type PriorityTradeoffType =
  | "speed"                // Ship fast, iterate later
  | "quality"              // Well-architected, maintainable
  | "completeness"         // All requirements before release
  | "ux";                  // Polish and ease of use

/**
 * Feature as output from decomposition (before adding to queue)
 */
export interface DecomposedFeature {
  /** Feature ID (e.g., "F-1") */
  id: string;
  /** Short feature name */
  name: string;
  /** Description of what this feature does */
  description: string;
  /** IDs of features this depends on */
  dependencies: string[];
  /** Priority (derived from dependencies) */
  priority: number;

  // ==========================================================================
  // Rich Decomposition Fields (for batch mode)
  // Required for --batch flag
  // ==========================================================================

  /** What type of problem this solves (required for batch) */
  problemType?: ProblemType;
  /** Why this is needed now (required for batch) */
  urgency?: UrgencyType;
  /** Who uses this feature (required for batch) */
  primaryUser?: PrimaryUserType;
  /** How it integrates with existing systems (required for batch) */
  integrationScope?: IntegrationScopeType;

  // ==========================================================================
  // Optional Rich Fields (for richer specs)
  // ==========================================================================

  /** How often the feature is used */
  usageContext?: UsageContextType;
  /** What data the feature needs */
  dataRequirements?: DataRequirementsType;
  /** Performance requirements */
  performanceRequirements?: PerformanceRequirementsType;
  /** What matters most for this feature */
  priorityTradeoff?: PriorityTradeoffType;

  // ==========================================================================
  // Uncertainty Handling (for fallback mechanism)
  // ==========================================================================

  /** Fields where decomposition couldn't determine a value */
  uncertainties?: string[];
  /** Free-form notes on what needs human input */
  clarificationNeeded?: string;
}

/**
 * Required fields for batch mode specification
 */
export const BATCH_REQUIRED_FIELDS = [
  "problemType",
  "urgency",
  "primaryUser",
  "integrationScope",
] as const;

/**
 * Type guard to check if a feature has all required batch fields
 */
export function isBatchReady(feature: DecomposedFeature): feature is DecomposedFeature & {
  problemType: ProblemType;
  urgency: UrgencyType;
  primaryUser: PrimaryUserType;
  integrationScope: IntegrationScopeType;
} {
  return (
    feature.problemType !== undefined &&
    feature.urgency !== undefined &&
    feature.primaryUser !== undefined &&
    feature.integrationScope !== undefined
  );
}

/**
 * Get missing batch fields for a feature
 */
export function getMissingBatchFields(feature: DecomposedFeature): string[] {
  const missing: string[] = [];
  if (!feature.problemType) missing.push("problemType");
  if (!feature.urgency) missing.push("urgency");
  if (!feature.primaryUser) missing.push("primaryUser");
  if (!feature.integrationScope) missing.push("integrationScope");
  return missing;
}

// =============================================================================
// Spec Versioning & Deltas
// =============================================================================

/**
 * Change type for spec delta records
 */
export type SpecChangeType = "ADDED" | "MODIFIED" | "REMOVED";

/**
 * A version snapshot of a feature's specification
 */
export interface SpecVersion {
  /** Auto-incrementing ID */
  id: number;
  /** Feature this version belongs to */
  featureId: string;
  /** Version number (1, 2, 3, ...) */
  version: number;
  /** When this version was created */
  createdAt: Date;
  /** SHA-256 hash of the spec content at this version */
  contentHash: string;
}

/**
 * A delta record tracking a change between two spec versions
 */
export interface SpecDelta {
  /** Auto-incrementing ID */
  id: number;
  /** Feature this delta belongs to */
  featureId: string;
  /** Source version number */
  fromVersion: number;
  /** Target version number */
  toVersion: number;
  /** Type of change */
  changeType: SpecChangeType;
  /** Dot-separated path to the changed section (e.g., "requirements.functional.auth") */
  sectionPath: string;
  /** Diff content describing the change */
  diffContent: string | null;
}

// =============================================================================
// Pipeline Progress
// =============================================================================

export interface PipelinePhaseEntry {
  name: string;
  status: "pending" | "running" | "complete" | "error";
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  artifacts_produced: string[];
}

export interface PipelineError {
  phase: string;
  message: string;
  timestamp: string;
}

export interface ProgressFile {
  feature_id: string;
  feature_name: string;
  current_phase: string;
  status: "running" | "paused" | "blocked" | "complete";
  started_at: string;
  completed_at: string | null;
  phases: PipelinePhaseEntry[];
  errors: PipelineError[];
}

export interface StatusOutput {
  summary: {
    total: number;
    complete: number;
    in_progress: number;
    pending: number;
    skipped: number;
    progress_pct: number;
  };
  in_flight: {
    feature_id: string;
    name: string;
    phase: string;
    status: string;
    elapsed_seconds: number;
  } | null;
  pipeline: ProgressFile | null;
  features: Array<{
    id: string;
    name: string;
    status: string;
    phase: string;
    priority: number;
  }>;
}

// =============================================================================
// Feature Context
// =============================================================================

/**
 * Context prepared for a feature implementation agent
 */
export interface FeatureContext {
  /** App-level context */
  app: AppContext;
  /** The feature to implement */
  feature: Feature;
  /** Detailed spec content (if available) */
  specContent: string | null;
  /** Plan content (if available) */
  planContent: string | null;
  /** Tasks content (if available) */
  tasksContent: string | null;
}

// =============================================================================
// Run Options
// =============================================================================

/**
 * Options for the runner loop
 */
export interface RunOptions {
  /** Maximum features to implement (0 = unlimited) */
  maxFeatures: number;
  /** Delay between features in seconds */
  delaySeconds: number;
  /** Dry run (show what would happen without executing) */
  dryRun: boolean;
}

// =============================================================================
// Run Result
// =============================================================================

/**
 * Result of implementing a single feature
 */
export interface RunResult {
  /** Whether implementation succeeded */
  success: boolean;
  /** Feature ID */
  featureId: string;
  /** Output from the agent */
  output: string;
  /** Error message if failed */
  error: string | null;
  /** Whether feature was blocked (not failed) */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  blockReason: string | null;
}

// =============================================================================
// Notification System
// =============================================================================

/**
 * Urgency tier for notifications
 */
export type NotificationTier = "critical" | "review" | "ambient";

/**
 * Notification delivery backend
 */
export type NotificationBackend = "voice" | "desktop" | "webhook" | "terminal-block";

/**
 * Type of phase transition
 */
export type PhaseTransitionType = "enter" | "complete" | "fail";

/**
 * Event emitted when a phase transition occurs
 */
export interface PhaseEvent {
  phase: SpecPhase;
  transition: PhaseTransitionType;
  featureId: string;
  featureName: string;
  timestamp: string;
  pipelineContext?: string;
}

/**
 * Payload sent to notification backends
 */
export interface NotificationPayload {
  phase: string;
  transition: PhaseTransitionType;
  tier: NotificationTier;
  featureId: string;
  featureName: string;
  timestamp: string;
  pipelineContext?: string;
}

/**
 * Configuration for the notification system
 */
export interface NotificationConfig {
  notification_backends: NotificationBackend[];
  webhook_url: string;
  default_urgency_by_phase: Record<string, NotificationTier>;
  failure_urgency: NotificationTier;
}

// =============================================================================
// Approval Gates
// =============================================================================

/**
 * Gate urgency tier (reuses notification tiers)
 */
export type GateUrgency = "critical" | "review" | "ambient";

/**
 * Phase boundary identifiers
 */
export type PhaseBoundary =
  | "specify_to_plan"
  | "plan_to_tasks"
  | "tasks_to_implement"
  | "implement_to_complete";

/**
 * Status of an approval gate
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "auto_approved" | "timed_out";

/**
 * A pending approval gate record
 */
export interface PendingApproval {
  id: number;
  feature_id: string;
  phase_boundary: PhaseBoundary;
  urgency: GateUrgency;
  status: ApprovalStatus;
  triggered_at: string;
  resolved_at: string | null;
  timeout_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}

/**
 * Derived pending-approval.json structure
 */
export interface PendingApprovalFile {
  pending: Array<{
    feature_id: string;
    phase_boundary: string;
    urgency: GateUrgency;
    triggered_at: string;
    timeout_at: string | null;
    status: ApprovalStatus;
  }>;
}

/**
 * Gate configuration from .specflow/config.yaml
 */
export interface GateConfig {
  gates: Record<string, GateUrgency>;
  timeout: Record<string, string>;
}

/**
 * Result of evaluating a gate
 */
export interface GateEvalResult {
  action: "log_and_continue" | "notify_and_wait" | "block";
  urgency: GateUrgency;
  boundary: PhaseBoundary;
  timeoutMs: number | null;
}

// =============================================================================
// Pipeline Failure Recovery
// =============================================================================

/**
 * Artifact requirements for a single phase
 */
export interface ArtifactRequirement {
  required: string[];
  optional: string[];
}

/**
 * Artifact requirements per phase
 */
export type ArtifactRequirements = Partial<Record<SpecPhase, ArtifactRequirement>>;

/**
 * Specflow project configuration from .specflow/config.yaml
 */
export interface SpecflowConfig {
  artifact_requirements?: ArtifactRequirements;
  pipeline?: {
    max_resume_count?: number;
  };
  hooks?: HooksConfig;
}

/**
 * A pipeline failure record
 */
export interface PipelineFailure {
  feature_id: string;
  phase: string;
  missing_artifacts: string[];
  error_message?: string;
  last_successful_phase: string | null;
  resume_count: number;
  blocked_at: string;
  resolved_at?: string | null;
}

/**
 * Derived failure.json structure
 */
export interface FailureFile {
  latest: PipelineFailure | null;
  history: PipelineFailure[];
}

// =============================================================================
// Execution Audit Log
// =============================================================================

/**
 * Status of an execution log entry
 */
export type ExecutionStatus = "running" | "success" | "failed" | "skipped" | "blocked";

/**
 * An execution log entry tracking a single phase execution
 */
export interface ExecutionLogEntry {
  id: number;
  featureId: string;
  phase: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  status: ExecutionStatus;
  gitShaBefore: string | null;
  gitShaAfter: string | null;
  artifactsProduced: string[] | null;
  errorMessage: string | null;
}

// =============================================================================
// Autorun
// =============================================================================

/** Options for the autorun command */
export interface AutorunOptions {
  maxFeatures: number;
  delaySeconds: number;
  dryRun: boolean;
  continueOnError: boolean;
  startFrom: string | null;
}

/** Result of a single phase execution within autorun */
export interface PhaseResult {
  success: boolean;
  skipped: boolean;
  blocked: boolean;
  error: string | null;
  artifacts: string[];
}

/** Summary of an autorun session */
export interface AutorunSummary {
  startedAt: Date;
  completedAt: Date;
  featuresProcessed: number;
  featuresSucceeded: number;
  featuresFailed: number;
  featuresBlocked: number;
  featuresSkipped: number;
}

/** Phase sequence for autorun */
export const AUTORUN_PHASES = ["specify", "plan", "tasks", "implement", "harden", "review", "approve", "complete"] as const;
export type AutorunPhase = (typeof AUTORUN_PHASES)[number];

// =============================================================================
// Semantic Versioning
// =============================================================================

/**
 * Parsed semantic version
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Raw tag string, e.g. "v1.2.3" */
  raw: string;
}

/**
 * Bump level for semantic versioning
 */
export type BumpLevel = "major" | "minor" | "patch";

/**
 * Version info including commit distance from latest tag
 */
export interface VersionInfo {
  current: SemVer;
  commitsSince: number;
  dirty: boolean;
}

/**
 * A single changelog entry (versioned or unreleased)
 */
export interface ChangelogEntry {
  version: string;
  date: string | null;
  added: string[];
  changed: string[];
  removed: string[];
}

// =============================================================================
// Phase Hooks
// =============================================================================

/**
 * A hook entry -- either a simple command string or an object with options
 */
export type HookEntry = string | {
  command: string;
  timeout?: number;
};

/**
 * Normalized hook entry with resolved timeout
 */
export interface NormalizedHookEntry {
  command: string;
  timeout: number;
}

/**
 * Hooks configuration for a single phase
 */
export interface PhaseHooks {
  pre?: HookEntry[];
  post?: HookEntry[];
}

/**
 * Top-level hooks configuration section
 */
export interface HooksConfig {
  default_timeout?: number;
  specify?: PhaseHooks;
  plan?: PhaseHooks;
  tasks?: PhaseHooks;
  implement?: PhaseHooks;
}

/**
 * Result of executing a single hook
 */
export interface HookResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Result of executing a batch of hooks
 */
export interface HookBatchResult {
  success: boolean;
  results: HookResult[];
  abortedAtIndex?: number;
}

// =============================================================================
// Evolve (F-017)
// =============================================================================

/** Artifact entry in evolve manifest */
export interface EvolveArtifact {
  path: string;
  type: "source" | "test" | "config" | "migration" | "spec";
  content_hash: string;
}

/** Manifest for evolved feature */
export interface EvolveManifest {
  feature_id: string;
  feature_name: string;
  evolved_at: string;
  baseline_version: string;
  spec_baseline: string;
  spec_content_hash: string;
  artifacts: EvolveArtifact[];
}

/** Result of evolving a feature */
export interface EvolveResult {
  feature_id: string;
  feature_name: string;
  baseline_path: string;
  manifest_path: string;
  spec_snapshot_path: string;
  artifact_count: number;
  status: "evolving";
}

// =============================================================================
// Review (F-024)
// =============================================================================

/** Structured review result written as review.json per feature */
export interface ReviewResult {
  featureId: string;
  featureName?: string;
  reviewedAt: string;
  passed: boolean;
  automatedChecks: {
    passed: boolean;
    checks: { name: string; passed: boolean; duration: number }[];
    alignment: { matched: number; missing: number };
  };
  acceptanceTests: {
    available: boolean;
    total: number;
    pass: number;
    fail: number;
    skip: number;
    pending: number;
  } | null;
  summary: {
    checksPass: boolean;
    acceptanceTestsPass: boolean | null;
  };
}

// =============================================================================
// Inbox (F-025)
// =============================================================================

/** A single item in the review inbox queue */
export interface InboxItem {
  featureId: string;
  name: string;
  priority: "P0" | "P1" | "P2";
  verdict: "ALL PASS" | string;
  verdictDetail: string[];
  timeInQueue: string;
  timeInQueueMs: number;
  reviewPath: string;
  acceptanceTestPath: string | null;
  decision: string;
}

/** Result of building the inbox queue */
export interface InboxResult {
  queue: InboxItem[];
  summary: { total: number; p0: number; p1: number; p2: number };
  suggestedBatchApprove: string | null;
}

// =============================================================================
// Harden (F-019) — Types removed in lifecycle alignment Phase 2
// Old TC-based types (HardenTestCase, HardenProtocol, HardenSession) and
// F-023 autorun types (EvaluationResult, TriageResult, etc.) deleted.
// Harden now uses template+ingest workflow — see acceptance-spec-ingest.ts.
// =============================================================================
