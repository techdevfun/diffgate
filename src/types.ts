// Shared types for diffgate.

export type Lang = 'js' | 'py' | 'go';

export interface FuncMeasure {
  name: string;
  startLine: number; // 1-based, in the analyzed file version
  endLine: number;   // 1-based, inclusive
  complexity: number;
}

export type GateId = 'complexity' | 'delta' | 'dupe' | 'growth';

export interface Violation {
  gate: GateId;
  file: string;
  line: number; // 1-based, in the new version of the file
  message: string;
}

export interface GateConfig {
  maxComplexity: number; // fail a touched function above this complexity
  maxDelta: number;      // fail a touched function gaining more than this in one diff
  minDupeTokens: number; // normalized token window that counts as a duplicated block
  maxDupeBlocks: number; // fail when more than this many duplicated blocks are found
  maxFileGrowth: number; // fail a single file gaining more than this many lines
}

export const DEFAULT_CONFIG: GateConfig = {
  maxComplexity: 10,
  maxDelta: 15,
  minDupeTokens: 50,
  maxDupeBlocks: 0,
  maxFileGrowth: 500,
};

export const VERSION = '0.1.0';
