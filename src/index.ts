import prettier from 'prettier';
import type { Compiler as WebpackCompiler } from 'webpack';
import type { Chunk, Compiler as RspackCompiler } from '@rspack/core';

// https://github.com/web-infra-dev/rspack/pull/5370
function appendWebpackScript(module: any, appendSource: string) {
  try {
    const originSource = module.getGeneratedCode();
    module.getGeneratedCode = () => `${originSource}\n${appendSource}`;
  } catch (err) {
    console.error('Failed to modify Webpack RuntimeModule');
    throw err;
  }
}

function appendRspackScript(
  module: any, // JsRuntimeModule type is not exported by rspack temporarily */
  appendSource: string
) {
  try {
    const source = module.source.source.toString('utf-8');
    module.source.source = Buffer.from(`${source}\n${appendSource}`, 'utf-8');
  } catch (err) {
    console.error('Failed to modify Rspack RuntimeModule');
    throw err;
  }
}

const pluginName = 'RetryChunkLoadPlugin';

export interface RetryChunkLoadPluginOptions {
  /**
   * optional stringified function to get the cache busting query string appended to the script src
   * if not set will default to appending the string `?cache-bust=true`
   */
  cacheBust?: string;
  /**
   * optional list of chunks to which retry script should be injected
   * if not set will add retry script to all chunks that have webpack script loading
   */
  chunks?: string[];
  /**
   * optional code to be executed in the browser context if after all retries chunk is not loaded.
   * if not set - nothing will happen and error will be returned to the chunk loader.
   */
  lastResortScript?: string;
  /**
   * optional value to set the maximum number of retries to load the chunk. Default is 1
   */
  maxRetries?: number;
  /**
   * optional number value to set the amount of time in milliseconds before trying to load the chunk again. Default is 0
   * if string, value must be code to generate a delay value. Receives retryCount as argument
   * e.g. `function(retryAttempt) { return retryAttempt * 1000 }`
   */
  retryDelay?: number | string;
  /**
   * For rspack
   */
  isRspack?: boolean;
  /**
   * 可选的监控回调函数，用于上报重试相关的指标
   * 函数接收事件类型和相关数据作为参数
   * 事件类型包括：'retry', 'success', 'failure'
   * e.g. `function(event, data) { console.log(event, data); }`
   */
  onChunkLoadEvent?: string;
}

export class RetryChunkLoadPlugin {
  options: RetryChunkLoadPluginOptions;

  constructor(options: RetryChunkLoadPluginOptions = {}) {
    this.options = Object.assign({}, options);
  }

  apply(compiler: WebpackCompiler | RspackCompiler) {
    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      compilation.hooks.runtimeModule.tap(pluginName, (module, chunk) => {
        const { isRspack = true } = this.options;

        const constructorName = isRspack
          ? (module as any).constructorName
          : module.constructor?.name;

        const isPublicPathModule =
          module.name === 'publicPath' ||
          constructorName === 'PublicPathRuntimeModule' ||
          constructorName === 'AutoPublicPathRuntimeModule';

        if (!isPublicPathModule) {
          return;
        }
        const maxRetryValueFromOptions = Number(this.options.maxRetries);
        const maxRetries =
          Number.isInteger(maxRetryValueFromOptions) &&
          maxRetryValueFromOptions > 0
            ? maxRetryValueFromOptions
            : 1;
        const getCacheBustString = () =>
          this.options.cacheBust
            ? `
                  (${this.options.cacheBust})();
                `
            : '"cache-bust=true"';
        const addRetryCode =
          !this.options.chunks ||
          this.options.chunks.includes((chunk as Chunk)?.name || '');

        const getRetryDelay =
          typeof this.options.retryDelay === 'string'
            ? this.options.retryDelay
            : `function() { return ${this.options.retryDelay || 0} }`;

        if (!addRetryCode) {
          return;
        }

        const { RuntimeGlobals } = (
          isRspack ? require('@rspack/core') : require('webpack')
        ) as typeof import('webpack');

        const getMonitorCallback = () =>
          this.options.onChunkLoadEvent
            ? `var $onChunkLoadEvent = ${this.options.onChunkLoadEvent};`
            : 'var $onChunkLoadEvent = function(event, data) {};';

        const script = `
          if(typeof ${RuntimeGlobals.require} !== "undefined") {
            var oldGetScript = ${RuntimeGlobals.getChunkScriptFilename};
            var oldLoadScript = ${RuntimeGlobals.ensureChunk};
            var queryMap = {};
            var countMap = {};
            var getRetryDelay = ${getRetryDelay}
            ${getMonitorCallback()}
            ${RuntimeGlobals.getChunkScriptFilename} = function(chunkId){
              var result = oldGetScript(chunkId);
              return result + (queryMap.hasOwnProperty(chunkId) ? '?' + queryMap[chunkId]  : '');
            };
            ${RuntimeGlobals.ensureChunk} = function(chunkId){
              var result = oldLoadScript(chunkId);
              return result.catch(function(error){
                var retries = countMap.hasOwnProperty(chunkId) ? countMap[chunkId] : ${maxRetries};
                if (retries < 1) {
                  var realSrc = oldGetScript(chunkId);
                  error.message = 'Loading chunk ' + chunkId + ' failed after ${maxRetries} retries.\\n(' + realSrc + ')';
                  error.request = realSrc;
                  $onChunkLoadEvent('failure', {
                    chunkId: chunkId,
                    url: realSrc,
                    error: error,
                    retryAttempts: ${maxRetries}
                  });${
                    this.options.lastResortScript
                      ? this.options.lastResortScript
                      : ''
                  }
                  throw error;
                }
                var retryAttempt = ${maxRetries} - retries + 1;
                $onChunkLoadEvent('retry', {
                  chunkId: chunkId,
                  retryAttempt: retryAttempt,
                  remainingRetries: retries - 1
                });
                return new Promise(function (resolve) {
                  setTimeout(function () {
                    var retryAttemptString = '&retry-attempt=' + retryAttempt;
                    var cacheBust = ${getCacheBustString()} + retryAttemptString;
                    queryMap[chunkId] = cacheBust;
                    countMap[chunkId] = retries - 1;
                    var chunkPromise = ${RuntimeGlobals.ensureChunk}(chunkId);
                    chunkPromise.then(function(result) {
                      $onChunkLoadEvent('success', {
                        chunkId: chunkId,
                        retryAttempt: retryAttempt
                      });
                      return result;
                    });
                    resolve(chunkPromise);
                  }, getRetryDelay(retryAttempt))
                })
              });
            };
          }`;
        const runtimeCode = prettier.format(script, {
          trailingComma: 'es5',
          singleQuote: true,
          parser: 'babel',
        });

        if (isRspack) {
          appendRspackScript(module, runtimeCode);
        } else {
          appendWebpackScript(module, runtimeCode);
        }
      });
    });
  }
}
