/**
 * Brownfield Codebase Scanner
 * Analyzes an existing codebase and extracts a structural inventory:
 * files, exports, functions, types, dependencies.
 */

import { join, relative, extname, basename } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { Glob } from "bun";

// =============================================================================
// Types
// =============================================================================

export interface ScanResult {
  /** When the scan was performed */
  scannedAt: string;
  /** Root directory that was scanned */
  rootPath: string;
  /** Total files found */
  totalFiles: number;
  /** Language breakdown */
  languages: Record<string, number>;
  /** File inventory */
  files: FileEntry[];
  /** Detected dependencies (from package.json, imports, etc.) */
  dependencies: DependencyEntry[];
}

export interface FileEntry {
  /** Relative path from scan root */
  path: string;
  /** File extension */
  extension: string;
  /** Detected language */
  language: string;
  /** Line count */
  lines: number;
  /** Exported symbols */
  exports: ExportEntry[];
  /** Functions defined */
  functions: FunctionEntry[];
  /** Types/interfaces defined */
  types: TypeEntry[];
}

export interface ExportEntry {
  name: string;
  kind: "function" | "class" | "const" | "type" | "interface" | "enum" | "default" | "unknown";
}

export interface FunctionEntry {
  name: string;
  line: number;
  exported: boolean;
}

export interface TypeEntry {
  name: string;
  kind: "interface" | "type" | "enum" | "class";
  line: number;
  exported: boolean;
}

export interface DependencyEntry {
  name: string;
  version: string | null;
  type: "production" | "development" | "peer";
}

// =============================================================================
// Language Detection
// =============================================================================

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".rb": "Ruby",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".cpp": "C++",
  ".h": "C",
  ".hpp": "C++",
  ".css": "CSS",
  ".scss": "SCSS",
  ".html": "HTML",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
};

function detectLanguage(ext: string): string {
  return EXTENSION_LANGUAGE_MAP[ext] || "Unknown";
}

// =============================================================================
// TypeScript/JavaScript Parser (Regex-based, no AST dependency)
// =============================================================================

function parseTypeScriptFile(content: string): {
  exports: ExportEntry[];
  functions: FunctionEntry[];
  types: TypeEntry[];
} {
  const lines = content.split("\n");
  const exports: ExportEntry[] = [];
  const functions: FunctionEntry[] = [];
  const types: TypeEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Exported function
    const exportFnMatch = line.match(
      /^export\s+(?:async\s+)?function\s+(\w+)/
    );
    if (exportFnMatch) {
      exports.push({ name: exportFnMatch[1], kind: "function" });
      functions.push({ name: exportFnMatch[1], line: lineNum, exported: true });
      continue;
    }

    // Exported const/let (including arrow functions)
    const exportConstMatch = line.match(
      /^export\s+(?:const|let|var)\s+(\w+)/
    );
    if (exportConstMatch) {
      exports.push({ name: exportConstMatch[1], kind: "const" });
      continue;
    }

    // Exported class
    const exportClassMatch = line.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
    if (exportClassMatch) {
      exports.push({ name: exportClassMatch[1], kind: "class" });
      types.push({
        name: exportClassMatch[1],
        kind: "class",
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Exported interface
    const exportInterfaceMatch = line.match(/^export\s+interface\s+(\w+)/);
    if (exportInterfaceMatch) {
      exports.push({ name: exportInterfaceMatch[1], kind: "interface" });
      types.push({
        name: exportInterfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Exported type
    const exportTypeMatch = line.match(/^export\s+type\s+(\w+)/);
    if (exportTypeMatch) {
      exports.push({ name: exportTypeMatch[1], kind: "type" });
      types.push({
        name: exportTypeMatch[1],
        kind: "type",
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Exported enum
    const exportEnumMatch = line.match(/^export\s+(?:const\s+)?enum\s+(\w+)/);
    if (exportEnumMatch) {
      exports.push({ name: exportEnumMatch[1], kind: "enum" });
      types.push({
        name: exportEnumMatch[1],
        kind: "enum",
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Export default
    const exportDefaultMatch = line.match(/^export\s+default\s+(?:class|function)?\s*(\w+)?/);
    if (exportDefaultMatch) {
      exports.push({
        name: exportDefaultMatch[1] || "default",
        kind: "default",
      });
      continue;
    }

    // Non-exported function
    const fnMatch = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) {
      functions.push({ name: fnMatch[1], line: lineNum, exported: false });
      continue;
    }

    // Non-exported interface/type/enum
    const interfaceMatch = line.match(/^interface\s+(\w+)/);
    if (interfaceMatch) {
      types.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: false,
      });
      continue;
    }

    const typeMatch = line.match(/^type\s+(\w+)\s*=/);
    if (typeMatch) {
      types.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNum,
        exported: false,
      });
    }
  }

  return { exports, functions, types };
}

// =============================================================================
// Heuristic Parser (for non-TS/JS languages)
// =============================================================================

function parseHeuristicFile(
  content: string,
  language: string
): {
  exports: ExportEntry[];
  functions: FunctionEntry[];
  types: TypeEntry[];
} {
  const lines = content.split("\n");
  const functions: FunctionEntry[] = [];
  const types: TypeEntry[] = [];

  const functionPatterns: Record<string, RegExp> = {
    Python: /^(?:async\s+)?def\s+(\w+)/,
    Rust: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
    Go: /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
    Ruby: /^def\s+(\w+)/,
    Java: /(?:public|private|protected|static)\s+\w+\s+(\w+)\s*\(/,
  };

  const classPatterns: Record<string, RegExp> = {
    Python: /^class\s+(\w+)/,
    Rust: /^(?:pub\s+)?struct\s+(\w+)/,
    Go: /^type\s+(\w+)\s+struct/,
    Ruby: /^class\s+(\w+)/,
    Java: /(?:public|private)\s+(?:abstract\s+)?class\s+(\w+)/,
  };

  const fnPattern = functionPatterns[language];
  const clsPattern = classPatterns[language];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (fnPattern) {
      const match = line.match(fnPattern);
      if (match) {
        const exported = language === "Rust" ? line.startsWith("pub") :
                         language === "Go" ? /^[A-Z]/.test(match[1]) :
                         language === "Python" ? !match[1].startsWith("_") : true;
        functions.push({ name: match[1], line: lineNum, exported });
      }
    }

    if (clsPattern) {
      const match = line.match(clsPattern);
      if (match) {
        types.push({ name: match[1], kind: "class", line: lineNum, exported: true });
      }
    }
  }

  return {
    exports: functions.filter((f) => f.exported).map((f) => ({
      name: f.name,
      kind: "function" as const,
    })),
    functions,
    types,
  };
}

// =============================================================================
// Dependency Scanner
// =============================================================================

function scanDependencies(rootPath: string): DependencyEntry[] {
  const deps: DependencyEntry[] = [];

  // package.json (Node.js)
  const packageJsonPath = join(rootPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        deps.push({ name, version: version as string, type: "production" });
      }
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        deps.push({ name, version: version as string, type: "development" });
      }
      for (const [name, version] of Object.entries(pkg.peerDependencies || {})) {
        deps.push({ name, version: version as string, type: "peer" });
      }
    } catch {
      // Skip malformed package.json
    }
  }

  // Cargo.toml (Rust)
  const cargoPath = join(rootPath, "Cargo.toml");
  if (existsSync(cargoPath)) {
    try {
      const content = readFileSync(cargoPath, "utf-8");
      const depMatches = content.matchAll(/^(\w[\w-]*)\s*=\s*"([^"]+)"/gm);
      for (const match of depMatches) {
        deps.push({ name: match[1], version: match[2], type: "production" });
      }
    } catch {
      // Skip
    }
  }

  // requirements.txt (Python)
  const requirementsPath = join(rootPath, "requirements.txt");
  if (existsSync(requirementsPath)) {
    try {
      const lines = readFileSync(requirementsPath, "utf-8").split("\n");
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)(?:[=<>!]+(.+))?/);
        if (match && !line.startsWith("#")) {
          deps.push({ name: match[1], version: match[2] || null, type: "production" });
        }
      }
    } catch {
      // Skip
    }
  }

  return deps;
}

// =============================================================================
// Ignore Patterns
// =============================================================================

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  "__pycache__",
  ".tox",
  "target",
  "vendor",
  ".specify",
  ".specflow",
]);

const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE_MAP));

function shouldIgnoreDir(name: string): boolean {
  return DEFAULT_IGNORE_DIRS.has(name) || name.startsWith(".");
}

// =============================================================================
// Main Scanner
// =============================================================================

/**
 * Scan a codebase directory and return a structural inventory
 */
export async function scanCodebase(rootPath: string): Promise<ScanResult> {
  const files: FileEntry[] = [];
  const languages: Record<string, number> = {};

  // Use Bun's Glob to find source files
  const glob = new Glob("**/*");
  const entries: string[] = [];

  for await (const entry of glob.scan({
    cwd: rootPath,
    onlyFiles: true,
  })) {
    // Skip ignored directories
    const parts = entry.split("/");
    if (parts.some((p) => shouldIgnoreDir(p))) continue;

    const ext = extname(entry);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    entries.push(entry);
  }

  for (const entry of entries) {
    const ext = extname(entry);
    const language = detectLanguage(ext);
    languages[language] = (languages[language] || 0) + 1;

    try {
      const content = readFileSync(join(rootPath, entry), "utf-8");
      const lineCount = content.split("\n").length;

      let parsed;
      if (language === "TypeScript" || language === "JavaScript") {
        parsed = parseTypeScriptFile(content);
      } else {
        parsed = parseHeuristicFile(content, language);
      }

      files.push({
        path: entry,
        extension: ext,
        language,
        lines: lineCount,
        exports: parsed.exports,
        functions: parsed.functions,
        types: parsed.types,
      });
    } catch {
      // Skip files that can't be read
      files.push({
        path: entry,
        extension: ext,
        language,
        lines: 0,
        exports: [],
        functions: [],
        types: [],
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    rootPath,
    totalFiles: files.length,
    languages,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    dependencies: scanDependencies(rootPath),
  };
}

/**
 * Write scan result to the brownfield directory
 */
export function writeScanResult(
  projectPath: string,
  result: ScanResult
): string {
  const brownfieldDir = join(projectPath, ".specify", "brownfield");
  mkdirSync(brownfieldDir, { recursive: true });

  const outputPath = join(brownfieldDir, "scan.json");
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}
