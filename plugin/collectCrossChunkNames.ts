interface ChunkBindings {
  importedBindings?: Record<string, string[]>;
  exports?: string[];
}

/**
 * Collects imported binding names and exported names from a Rollup chunk.
 *
 * javascript-obfuscator processes each chunk independently. If it renames an
 * identifier in the body but not in the import/export statement, the identifier
 * becomes undefined at runtime. Passing these names as reservedNames prevents that.
 */
export function collectCrossChunkNames(chunk: ChunkBindings): string[] {
  const names: string[] = [];

  if (chunk.importedBindings) {
    for (const bindings of Object.values(chunk.importedBindings)) {
      if (Array.isArray(bindings)) {
        names.push(...bindings);
      }
    }
  }

  if (chunk.exports) {
    names.push(...chunk.exports);
  }

  return [...new Set(names)];
}
