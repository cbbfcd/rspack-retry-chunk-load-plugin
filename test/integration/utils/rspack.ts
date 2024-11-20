import * as path from 'path';
import { type MultiStats, rspack, Stats } from '@rspack/core';
import { RetryChunkLoadPlugin } from '../../../src';

import MemoryFileSystem from 'memory-fs';

export default function (
  pluginOptions = {},
  { fixture = 'index.ts', extend = {} } = {}
) {
  const fs = new MemoryFileSystem();

  const fixturesDir = path.join(__dirname, '../fixtures');

  const result = new Promise<Stats | MultiStats | undefined>(
    (resolve, reject) => {
      const compiler = rspack({
        mode: 'development',
        devtool: false,
        entry: path.join(fixturesDir, fixture),
        output: {
          path: path.join(fixturesDir, 'dist'),
        },
        plugins: [new RetryChunkLoadPlugin(pluginOptions)],
        resolve: {
          extensions: ['.ts', '.js'],
        },
        ...extend,
      });

      compiler.outputFileSystem = fs as any;

      compiler.run((error, stats) => {
        if (error) {
          return reject(error);
        }

        return resolve(stats);
      });
    }
  );

  return { fs, result };
}
