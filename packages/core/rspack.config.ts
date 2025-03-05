import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';

export default defineConfig({
  entry: {
    main: './src/index.ts',
  },
  target: 'node18',
  resolve: {
    extensions: ['.ts'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                target: 'es2022',
                parser: {
                  syntax: 'typescript',
                },
              },
            },
          },
        ],
      },
    ],
  },
  optimization: {
    minimizer: [new rspack.SwcJsMinimizerRspackPlugin()],
  },
  devtool: false,
});
