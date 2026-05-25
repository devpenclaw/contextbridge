#!/usr/bin/env node

import { Command } from 'commander';
import { ContextBridge } from '@contextbridge/sdk';
import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';

const program = new Command();

program
  .name('cb')
  .description('ContextBridge — Context orchestration for AI-assisted development')
  .version('0.1.0');

// ─── Init Command ──────────────────────────────────────────

program
  .command('init')
  .description('Initialize ContextBridge by indexing the current repository')
  // Watch mode will be supported in a future release
  .action(async (options) => {
    const repoDir = process.cwd();
    console.log(chalk.blue('🔍 ContextBridge — Indexing repository...'));
    console.log(chalk.gray(`  Directory: ${repoDir}`));

    const bridge = new ContextBridge({ repoDir });
    bridge.initialize();

    const progress = bridge.index();

    console.log(chalk.green(`\n✅ Done!`));
    console.log(`  ${chalk.yellow(progress.total)} files found`);
    console.log(`  ${chalk.green(progress.indexed)} files indexed`);
    console.log(`  ${chalk.gray(progress.skipped)} files skipped (unchanged)`);
    if (progress.errors > 0) {
      console.log(`  ${chalk.red(progress.errors)} errors`);
    }

    const stats = bridge.getStats();
    console.log(`\n${chalk.cyan('📊 Stats:')}`);
    console.log(`  ${stats.fileCount} files indexed`);
    console.log(`  ${stats.functionCount} functions`);
    console.log(`  ${stats.classCount} classes`);
    console.log(`  ${stats.typeCount} types`);

    bridge.close();
  });

// ─── Context Command ───────────────────────────────────────

program
  .command('context')
  .description('Get context for a task or question about the codebase')
  .argument('[query]', 'What do you want context on?')
  .option('-f, --format <format>', 'Output format: prompt, structured, minimal', 'prompt')
  .action(async (query, options) => {
    if (!query) {
      console.log(chalk.red('❌ Please provide a query. Usage: cb context "your question"'));
      process.exit(1);
    }

    const repoDir = process.cwd();
    const bridge = new ContextBridge({ repoDir });
    bridge.initialize();

    const result = bridge.getContext({ query, format: options.format as 'prompt' | 'structured' | 'minimal' });

    if (options.format === 'minimal') {
      console.log(result.summary);
    } else if (options.format === 'structured') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Default: prompt format — outputs markdown ready to paste into AI tools
      console.log(chalk.bold('\n📋 Context Package'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(result.summary);
      console.log();

      for (const section of result.sections) {
        console.log(section.content);
      }

      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray(`Token cost: ~${result.tokenCost} | Confidence: ${(result.queryMetadata.confidence * 100).toFixed(0)}%`));
      console.log(chalk.gray(`Intent: ${result.queryMetadata.interpretedIntent}`));
    }

    bridge.close();
  });

// ─── Ask Command (Interactive) ─────────────────────────────

program
  .command('ask')
  .description('Enter interactive mode to ask questions about the codebase')
  .action(async () => {
    const repoDir = process.cwd();
    const bridge = new ContextBridge({ repoDir });
    bridge.initialize();

    console.log(chalk.cyan('\n🧠 ContextBridge Interactive Mode'));
    console.log(chalk.gray('  Type your questions about the codebase.'));
    console.log(chalk.gray('  Type "exit" or press Ctrl+C to quit.\n'));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle Ctrl+C gracefully
    const cleanup = () => {
      rl.close();
      bridge.close();
      console.log(chalk.gray('\nGoodbye!'));
      process.exit(0);
    };
    process.on('SIGINT', cleanup);

    try {
      while (true) {
        const query = await rl.question(chalk.green('cb> '));
        if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') break;
        if (!query.trim()) continue;

        const result = bridge.getContext({ query });

        console.log(chalk.bold('\n📋 Context Package\n'));
        console.log(result.summary);
        console.log();

        for (const section of result.sections) {
          console.log(section.content);
        }

        console.log(chalk.gray('─'.repeat(40)));

        // Ask for feedback
        const feedback = await rl.question(chalk.gray('Was this helpful? (1-5, or skip): '));
        if (feedback && /^[1-5]$/.test(feedback)) {
          bridge.recordFeedback(result.id, parseInt(feedback) as 1 | 2 | 3 | 4 | 5);
          console.log(chalk.green('  Thanks for the feedback!'));
        }
      }
    } finally {
      process.off('SIGINT', cleanup);
      rl.close();
      bridge.close();
      console.log(chalk.gray('\nGoodbye!'));
    }
  });

// ─── Status Command ────────────────────────────────────────

program
  .command('status')
  .description('Show indexing status for the current repository')
  .action(async () => {
    const repoDir = process.cwd();
    const dbPath = path.join(repoDir, '.contextbridge', 'contextbridge.db');

    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow('⚠️  Not indexed yet. Run `cb init` to index this repository.'));
      return;
    }

    const bridge = new ContextBridge({ repoDir });
    bridge.initialize();

    const stats = bridge.getStats();
    const dbStats = fs.statSync(dbPath);

    console.log(chalk.cyan('\n📊 ContextBridge Status\n'));
    console.log(`  ${chalk.bold('Files:')}     ${stats.fileCount}`);
    console.log(`  ${chalk.bold('Functions:')} ${stats.functionCount}`);
    console.log(`  ${chalk.bold('Classes:')}   ${stats.classCount}`);
    console.log(`  ${chalk.bold('Types:')}     ${stats.typeCount}`);
    console.log(`  ${chalk.bold('DB Size:')}   ${(dbStats.size / 1024).toFixed(1)} KB`);

    bridge.close();
  });

// ─── Parse Arguments ───────────────────────────────────────

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
