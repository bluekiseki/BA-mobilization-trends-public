// vite-plugin-obfuscator.ts
import type { Plugin } from 'vite';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { collectCrossChunkNames } from './collectCrossChunkNames';

// Gets the option type of JavaScriptObfuscator.
type ObfuscatorOptions = Parameters<typeof JavaScriptObfuscator.obfuscate>[1];

interface VitePluginObfuscatorOptions {
  /**
   * The regular expression pattern of the file to be obfuscated. The default is /\.js$/.
   */
  fileFilter?: RegExp;
  /**
   * Options that will be passed to javascript-obfuscator.
   * https://github.com/javascript-obfuscator/javascript-obfuscator#options
   */
  obfuscatorOptions?: ObfuscatorOptions;
}

export default function vitePluginObfuscator(options?: VitePluginObfuscatorOptions): Plugin {
  const { fileFilter = /\.js$/, obfuscatorOptions = {} } = options || {};

  return {
    name: 'vite-plugin-obfuscator',

    // This hook is called after bundling is complete
    generateBundle(_outputOptions, bundle) {
      for (const fileName in bundle) {
        if (fileFilter.test(fileName)) {
          const file = bundle[fileName];

          if (file.type === 'chunk') {
            console.log(`[vite-plugin-obfuscator] Obfuscating: ${fileName}`);

            // Prevent renaming of cross-chunk identifiers (imports/exports).
            // Without this, the obfuscator renames them in the body but not in
            // the import/export statement, causing ReferenceError at runtime.
            const crossChunkNames = collectCrossChunkNames(file);
            const reservedNames = [...(obfuscatorOptions.reservedNames ?? []), ...crossChunkNames.map((name) => `^${name}$`)];

            try {
              const obfuscationResult = JavaScriptObfuscator.obfuscate(file.code, {
                ...obfuscatorOptions,
                reservedNames,
              });

              file.code = obfuscationResult.getObfuscatedCode();

              if (obfuscationResult.getSourceMap()) {
                const sourceMapStr = obfuscationResult.getSourceMap();
                if (sourceMapStr) {
                  file.map = JSON.parse(sourceMapStr) as typeof file.map;
                }
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.warn(`[vite-plugin-obfuscator] Failed to obfuscate ${fileName}: ${errorMsg}`);
            }
          }
        }
      }
    },
  };
}
