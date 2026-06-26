import tailwindcss from '@tailwindcss/vite';

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  // Manual stories + the MDX help page. Auto-detected component stories are
  // written to disk by the addon (filesystem mode) and picked up here too.
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
  ],

  addons: [
    '@storybook/addon-docs',
    {
      name: 'storybook-addon-auto-detect',
      options: {
        enabled: true,
        framework: 'react',
        scanDirs: ['src/components'],
        instanceScanDirs: ['src'],
        excludeDirs: ['node_modules', 'dist'],
        variantStrategy: 'primary',
        outputMode: 'filesystem',
        governanceEnabled: true,
        debug: true,
      },
    },
  ],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  // Tailwind v4 (so generated tokens actually resolve). Team-owned setup.
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins || [];
    viteConfig.plugins.push(tailwindcss());
    return viteConfig;
  },
};

export default config;
