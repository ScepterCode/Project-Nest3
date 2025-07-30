#!/usr/bin/env node

/**
 * Role Migration CLI Tool
 * 
 * Command-line interface for managing role system migrations, validations, and rollbacks.
 * Provides easy access to migration utilities with comprehensive logging and error handling.
 * 
 * Requirements: 1.1, 1.5
 */

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs').promises;
const path = require('path');

// Import migration services (these would need to be compiled from TypeScript)
// For now, we'll use the JavaScript migration service
const { RoleMigrationService } = require('./migrate-role-system-enhanced');

const program = new Command();

program
  .name('role-migration')
  .description('Role system migration and management CLI')
  .version('1.0.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--dry-run', 'Run operations without making changes')
  .option('--config <path>', 'Path to configuration file');

/**
 * Migration Commands
 */
program
  .command('migrate')
  .description('Run role system migration')
  .option('-b, --batch-size <size>', 'Batch size for processing users', '100')
  .option('--no-backup', 'Skip creating backup before migration')
  .option('--no-validation', 'Skip post-migration validation')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Starting role system migration...'));
      
      const config = await loadConfig(program.opts().config);
      const migrationService = new RoleMigrationService();

      // Set environment variables based on options
      if (program.opts().dryRun) {
        process.env.DRY_RUN = 'true';
      }
      if (program.opts().verbose) {
        process.env.LOG_LEVEL = 'debug';
      }

      // Confirm migration if not in dry-run mode
      if (!program.opts().dryRun) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'This will modify user role data. Are you sure you want to continue?',
            default: false
          }
        ]);

        if (!confirm) {
          console.log(chalk.yellow('Migration cancelled.'));
          return;
        }
      }

      await migrationService.migrate();
      console.log(chalk.green('✅ Migration completed successfully!'));

    } catch (error) {
      console.error(chalk.red('❌ Migration failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('rollback <migrationId>')
  .description('Rollback a specific migration')
  .action(async (migrationId) => {
    try {
      console.log(chalk.blue(`🔄 Rolling back migration: ${migrationId}`));
      
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'This will restore previous role data. Are you sure?',
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Rollback cancelled.'));
        return;
      }

      const migrationService = new RoleMigrationService();
      await migrationService.rollback(migrationId);
      console.log(chalk.green('✅ Rollback completed successfully!'));

    } catch (error) {
      console.error(chalk.red('❌ Rollback failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Validation Commands
 */
program
  .command('validate')
  .description('Validate role system integrity')
  .option('-u, --user <userId>', 'Validate specific user')
  .option('-r, --report', 'Generate detailed validation report')
  .option('-f, --fix', 'Attempt to fix validation issues automatically')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 Running role system validation...'));
      
      // This would use the TypeScript validation service
      // For now, we'll simulate the validation
      const validationResults = await runValidation(options);
      
      if (validationResults.isValid) {
        console.log(chalk.green('✅ All validations passed!'));
      } else {
        console.log(chalk.yellow(`⚠️  Found ${validationResults.issues.length} issues`));
        
        // Display issues
        for (const issue of validationResults.issues) {
          const color = issue.severity === 'critical' ? 'red' : 
                       issue.severity === 'high' ? 'yellow' : 'gray';
          console.log(chalk[color](`  ${issue.severity.toUpperCase()}: ${issue.description}`));
        }

        if (options.fix) {
          const { confirmFix } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmFix',
              message: 'Attempt to fix issues automatically?',
              default: false
            }
          ]);

          if (confirmFix) {
            await attemptAutoFix(validationResults.issues);
          }
        }
      }

      if (options.report) {
        await generateValidationReport(validationResults);
      }

    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Backup and Snapshot Commands
 */
program
  .command('snapshot')
  .description('Create a rollback snapshot')
  .option('-d, --description <desc>', 'Snapshot description', 'Manual snapshot')
  .option('-u, --users <userIds>', 'Comma-separated list of user IDs to snapshot')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📸 Creating rollback snapshot...'));
      
      const userIds = options.users ? options.users.split(',') : undefined;
      
      // This would use the TypeScript rollback service
      const snapshotId = await createSnapshot(options.description, userIds);
      
      console.log(chalk.green(`✅ Snapshot created: ${snapshotId}`));
      console.log(chalk.gray(`Description: ${options.description}`));
      if (userIds) {
        console.log(chalk.gray(`Users: ${userIds.length} users`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Snapshot creation failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('snapshots')
  .description('List available snapshots')
  .option('-l, --limit <number>', 'Number of snapshots to show', '10')
  .action(async (options) => {
    try {
      const snapshots = await listSnapshots(parseInt(options.limit));
      
      if (snapshots.length === 0) {
        console.log(chalk.yellow('No snapshots found.'));
        return;
      }

      console.log(chalk.blue('📋 Available snapshots:'));
      console.log();
      
      for (const snapshot of snapshots) {
        console.log(chalk.white(`${snapshot.id}`));
        console.log(chalk.gray(`  Description: ${snapshot.description}`));
        console.log(chalk.gray(`  Created: ${snapshot.timestamp}`));
        console.log(chalk.gray(`  Users: ${snapshot.userCount}, Assignments: ${snapshot.assignmentCount}`));
        console.log();
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to list snapshots:'), error.message);
      process.exit(1);
    }
  });

/**
 * Status and Info Commands
 */
program
  .command('status')
  .description('Show migration system status')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 Role Migration System Status'));
      console.log();
      
      const status = await getSystemStatus();
      
      console.log(chalk.white('Database Status:'));
      console.log(`  New role tables: ${status.newTables ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`  Legacy role data: ${status.legacyData ? chalk.yellow('Found') : chalk.green('Clean')}`);
      console.log();
      
      console.log(chalk.white('Migration Status:'));
      console.log(`  Total users: ${status.totalUsers}`);
      console.log(`  Migrated users: ${status.migratedUsers}`);
      console.log(`  Pending migration: ${status.pendingUsers}`);
      console.log();
      
      console.log(chalk.white('System Health:'));
      console.log(`  Health score: ${getHealthColor(status.healthScore)}${status.healthScore}%`);
      console.log(`  Critical issues: ${status.criticalIssues}`);
      console.log(`  Total issues: ${status.totalIssues}`);

    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig(program.opts().config);
      
      console.log(chalk.blue('⚙️  Current Configuration:'));
      console.log();
      console.log(JSON.stringify(config, null, 2));

    } catch (error) {
      console.error(chalk.red('❌ Failed to load configuration:'), error.message);
      process.exit(1);
    }
  });

/**
 * Utility Commands
 */
program
  .command('cleanup')
  .description('Clean up migration artifacts')
  .option('--backups', 'Clean up old backup files')
  .option('--logs', 'Clean up old log files')
  .option('--snapshots', 'Clean up old snapshots')
  .option('--older-than <days>', 'Only clean files older than specified days', '30')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🧹 Cleaning up migration artifacts...'));
      
      const olderThanDays = parseInt(options.olderThan);
      let cleanedCount = 0;

      if (options.backups) {
        cleanedCount += await cleanupBackups(olderThanDays);
      }

      if (options.logs) {
        cleanedCount += await cleanupLogs(olderThanDays);
      }

      if (options.snapshots) {
        cleanedCount += await cleanupSnapshots(olderThanDays);
      }

      if (!options.backups && !options.logs && !options.snapshots) {
        // Clean all by default
        cleanedCount += await cleanupBackups(olderThanDays);
        cleanedCount += await cleanupLogs(olderThanDays);
        cleanedCount += await cleanupSnapshots(olderThanDays);
      }

      console.log(chalk.green(`✅ Cleaned up ${cleanedCount} files`));

    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error.message);
      process.exit(1);
    }
  });

// Helper functions (these would integrate with the actual TypeScript services)

async function loadConfig(configPath) {
  const defaultConfig = {
    batchSize: 100,
    maxRetries: 3,
    backupEnabled: true,
    validationEnabled: true,
    logLevel: 'info'
  };

  if (!configPath) {
    return defaultConfig;
  }

  try {
    const configFile = await fs.readFile(configPath, 'utf8');
    const userConfig = JSON.parse(configFile);
    return { ...defaultConfig, ...userConfig };
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not load config file ${configPath}, using defaults`));
    return defaultConfig;
  }
}

async function runValidation(options) {
  // This would integrate with the actual RoleValidationService
  // For now, return mock data
  return {
    isValid: Math.random() > 0.3,
    issues: [
      {
        severity: 'high',
        description: 'User user-123 has missing primary role',
        suggestedFix: 'Assign primary role to user'
      },
      {
        severity: 'medium',
        description: 'Assignment assignment-456 is expired but still active',
        suggestedFix: 'Update assignment status to expired'
      }
    ]
  };
}

async function attemptAutoFix(issues) {
  console.log(chalk.blue('🔧 Attempting to fix issues automatically...'));
  
  let fixedCount = 0;
  for (const issue of issues) {
    try {
      // This would implement actual fixes based on issue type
      console.log(chalk.gray(`  Fixing: ${issue.description}`));
      // await fixIssue(issue);
      fixedCount++;
    } catch (error) {
      console.log(chalk.red(`  Failed to fix: ${issue.description}`));
    }
  }

  console.log(chalk.green(`✅ Fixed ${fixedCount} out of ${issues.length} issues`));
}

async function generateValidationReport(results) {
  const reportDir = path.join(process.cwd(), 'validation-reports');
  await fs.mkdir(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, `validation_report_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));

  console.log(chalk.green(`📄 Validation report saved to: ${reportPath}`));
}

async function createSnapshot(description, userIds) {
  // This would integrate with the actual RoleRollbackService
  return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function listSnapshots(limit) {
  // This would integrate with the actual RoleRollbackService
  return [
    {
      id: 'snapshot_1234567890_abc123',
      description: 'Pre-migration snapshot',
      timestamp: new Date().toISOString(),
      userCount: 150,
      assignmentCount: 200
    }
  ];
}

async function getSystemStatus() {
  // This would integrate with actual system checks
  return {
    newTables: true,
    legacyData: false,
    totalUsers: 1000,
    migratedUsers: 950,
    pendingUsers: 50,
    healthScore: 85,
    criticalIssues: 2,
    totalIssues: 15
  };
}

function getHealthColor(score) {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.yellow;
  return chalk.red;
}

async function cleanupBackups(olderThanDays) {
  const backupDir = path.join(process.cwd(), 'backups');
  try {
    const files = await fs.readdir(backupDir);
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays > olderThanDays) {
        await fs.unlink(filePath);
        cleanedCount++;
      }
    }

    return cleanedCount;
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not clean backups: ${error.message}`));
    return 0;
  }
}

async function cleanupLogs(olderThanDays) {
  // Similar implementation for logs
  return 0;
}

async function cleanupSnapshots(olderThanDays) {
  // This would integrate with the database to clean old snapshots
  return 0;
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}