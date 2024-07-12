/* eslint-disable no-undef */
import path from 'path';
import { RetryChunkLoadPlugin } from '../../dist/index.js';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @type {import('@rspack/cli').Configuration}
 */
export default {
  devtool: false,
  entry: path.join(__dirname, '..', 'integration', 'fixtures', 'index.ts'),
  output: { path: path.join(__dirname, 'dist') },
  mode: 'development',
  plugins: [
    new HtmlWebpackPlugin(),
    new RetryChunkLoadPlugin({ maxRetries: 5 }),
  ],
  resolve: { extensions: ['.ts'] },
};
