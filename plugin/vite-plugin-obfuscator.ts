// vite-plugin-obfuscator.ts
import type { Plugin } from 'vite';
import JavaScriptObfuscator from 'javascript-obfuscator';

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
    async generateBundle(outputOptions, bundle) {
      for (const fileName in bundle) {
        if (fileFilter.test(fileName)) {
          const file = bundle[fileName];

          if (file.type === 'chunk') {
            console.log(`[vite-plugin-obfuscator] Obfuscating: ${fileName}`);

            try {
              const obfuscationResult = JavaScriptObfuscator.obfuscate(file.code, obfuscatorOptions);

              // Update
              file.code = obfuscationResult.getObfuscatedCode();

              // Update the source map when it has been created
              if (obfuscationResult.getSourceMap()) {
                file.map = JSON.parse(obfuscationResult.getSourceMap());
              }
            } catch (error) {
              this.warn(`[vite-plugin-obfuscator] Failed to obfuscate ${fileName}: ${error}`);
            }
          }
        }
      }
    },
  };
}
