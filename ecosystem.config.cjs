module.exports = {
  apps: [
    {
      name: 'cs-posters',
      cwd: __dirname,
      script: 'pnpm',
      args: 'start',
      env: { PORT: 4173 },
    },
  ],
};
