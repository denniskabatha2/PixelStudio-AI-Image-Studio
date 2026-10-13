if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  process.stderr.write('This repository uses pnpm. Install pnpm 10 and run pnpm install.\n');
  process.exitCode = 1;
}
