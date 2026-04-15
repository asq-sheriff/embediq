import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { UserProfile, Priority } from '../types/index.js';
import { ConsoleUI } from './console.js';
import { PlaybackRenderer } from './playback.js';

export class EditCorrectFlow {
  private ui: ConsoleUI;
  private renderer: PlaybackRenderer;

  constructor(ui: ConsoleUI) {
    this.ui = ui;
    this.renderer = new PlaybackRenderer(ui);
  }

  async run(profile: UserProfile): Promise<UserProfile> {
    let approved = false;

    while (!approved) {
      this.renderer.render(profile);

      const action = await select({
        message: 'What would you like to do?',
        choices: [
          { value: 'approve', name: 'Approve this understanding' },
          { value: 'correct', name: 'Correct a specific item' },
          { value: 'priority', name: 'Adjust priority ordering' },
          { value: 'add', name: 'Add something we missed' },
        ],
      });

      switch (action) {
        case 'approve':
          approved = true;
          break;
        case 'correct':
          await this.correctItem(profile);
          break;
        case 'priority':
          await this.adjustPriorities(profile);
          break;
        case 'add':
          await this.addMissing(profile);
          break;
      }
    }

    this.ui.success('Understanding approved!');
    return profile;
  }

  private async correctItem(profile: UserProfile): Promise<void> {
    const field = await select({
      message: 'Which field to correct?',
      choices: [
        { value: 'businessDomain', name: `Domain: ${profile.businessDomain}` },
        { value: 'industry', name: `Industry: ${profile.industry}` },
        { value: 'teamSize', name: `Team size: ${profile.teamSize}` },
        { value: 'languages', name: `Languages: ${profile.languages.join(', ')}` },
        { value: 'budgetTier', name: `Budget: ${profile.budgetTier}` },
        { value: 'cicd', name: `CI/CD: ${profile.devOps.cicd}` },
      ],
    });

    switch (field) {
      case 'businessDomain': {
        const val = await input({ message: 'New domain description:' });
        profile.businessDomain = val;
        break;
      }
      case 'industry': {
        const val = await input({ message: 'New industry:' });
        profile.industry = val;
        break;
      }
      case 'teamSize': {
        const val = await select({
          message: 'Team size:',
          choices: [
            { value: 'solo', name: 'Solo' },
            { value: 'small', name: 'Small (2-5)' },
            { value: 'medium', name: 'Medium (6-15)' },
            { value: 'large', name: 'Large (15+)' },
          ],
        });
        profile.teamSize = val as UserProfile['teamSize'];
        break;
      }
      case 'languages': {
        const val = await input({ message: 'Languages (comma-separated):' });
        profile.languages = val.split(',').map(s => s.trim()).filter(Boolean);
        break;
      }
      case 'budgetTier': {
        const val = await select({
          message: 'Budget tier:',
          choices: [
            { value: 'minimal', name: 'Minimal (<$5/day)' },
            { value: 'moderate', name: 'Moderate ($5-20/day)' },
            { value: 'enterprise', name: 'Enterprise' },
          ],
        });
        profile.budgetTier = val as UserProfile['budgetTier'];
        break;
      }
      case 'cicd': {
        const val = await input({ message: 'CI/CD platform:' });
        profile.devOps.cicd = val;
        break;
      }
    }

    this.ui.success('Updated!');
  }

  private async adjustPriorities(profile: UserProfile): Promise<void> {
    if (profile.priorities.length === 0) {
      this.ui.warn('No priorities to adjust.');
      return;
    }

    console.log(chalk.dim('\n  Current priority order:'));
    for (let i = 0; i < profile.priorities.length; i++) {
      console.log(`    ${i + 1}. ${profile.priorities[i].name} (${Math.round(profile.priorities[i].confidence * 100)}%)`);
    }

    const toMove = await select({
      message: 'Which priority to move to the top?',
      choices: profile.priorities.map((p, i) => ({
        value: String(i),
        name: `${i + 1}. ${p.name}`,
      })),
    });

    const idx = parseInt(toMove, 10);
    const [moved] = profile.priorities.splice(idx, 1);
    moved.confidence = Math.min(moved.confidence + 0.1, 1.0);
    profile.priorities.unshift(moved);

    this.ui.success(`"${moved.name}" moved to top priority.`);
  }

  private async addMissing(profile: UserProfile): Promise<void> {
    const category = await select({
      message: 'What category?',
      choices: [
        { value: 'problem', name: 'Problem area' },
        { value: 'language', name: 'Programming language' },
        { value: 'compliance', name: 'Compliance framework' },
        { value: 'security', name: 'Security concern' },
      ],
    });

    const val = await input({ message: 'Enter the value to add:' });

    switch (category) {
      case 'problem':
        profile.problemAreas.push(val);
        break;
      case 'language':
        profile.languages.push(val);
        break;
      case 'compliance':
        profile.complianceFrameworks.push(val);
        break;
      case 'security':
        profile.securityConcerns.push(val);
        break;
    }

    this.ui.success(`Added "${val}" to ${category}.`);
  }
}
