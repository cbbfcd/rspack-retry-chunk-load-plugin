/* eslint-disable no-undef */
import path from 'path';
import { RetryChunkLoadPlugin } from '../../dist/index';
import HtmlWebpackPlugin from 'html-webpack-plugin';

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
