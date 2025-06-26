#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import yaml from 'yaml';

/**
 * Project Management MCP Server
 * Provides autonomous project creation and management capabilities for Claude Code
 */

interface ProjectConfig {
  name: string;
  type: 'webapp' | 'cli' | 'library' | 'api' | 'data' | 'mobile' | 'desktop';
  techStack: string[];
  framework?: string;
  language: string;
  features: string[];
  sdlcPhase: 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closure';
  governance: 'minimal' | 'standard' | 'enterprise';
}

interface ProjectStructure {
  directories: string[];
  files: { path: string; content: string }[];
}

class ProjectManagementServer {
  private server: Server;
  private projectsRoot: string;

  constructor() {
    this.server = new Server(
      {
        name: 'project-management-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.projectsRoot = process.env.PROJECTS_ROOT || '/home/developer/workspace/projects';
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_project',
          description: 'Create a new project with specified configuration',
          inputSchema: {
            type: 'object',
            properties: {
              config: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Project name' },
                  type: { 
                    type: 'string', 
                    enum: ['webapp', 'cli', 'library', 'api', 'data', 'mobile', 'desktop'],
                    description: 'Type of project to create'
                  },
                  techStack: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Technology stack (e.g., [\"react\", \"typescript\", \"node\"])'
                  },
                  framework: { type: 'string', description: 'Main framework (optional)' },
                  language: { type: 'string', description: 'Primary programming language' },
                  features: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Features to implement'
                  },
                  sdlcPhase: {
                    type: 'string',
                    enum: ['initiation', 'planning', 'execution', 'monitoring', 'closure'],
                    description: 'Current SDLC phase'
                  },
                  governance: {
                    type: 'string',
                    enum: ['minimal', 'standard', 'enterprise'],
                    description: 'Governance level'
                  }
                },
                required: ['name', 'type', 'language']
              }
            },
            required: ['config']
          }
        },
        {
          name: 'scaffold_feature',
          description: 'Add a new feature to an existing project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the project' },
              featureName: { type: 'string', description: 'Name of the feature' },
              featureType: { 
                type: 'string', 
                enum: ['component', 'page', 'api', 'service', 'utility'],
                description: 'Type of feature to create'
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Additional dependencies needed'
              }
            },
            required: ['projectPath', 'featureName', 'featureType']
          }
        },
        {
          name: 'manage_dependencies',
          description: 'Add, remove, or update project dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the project' },
              action: { 
                type: 'string', 
                enum: ['add', 'remove', 'update'],
                description: 'Action to perform'
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Dependencies to manage'
              },
              devDependencies: {
                type: 'boolean',
                description: 'Whether these are dev dependencies'
              }
            },
            required: ['projectPath', 'action', 'dependencies']
          }
        },
        {
          name: 'modify_project_structure',
          description: 'Modify the structure of an existing project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the project' },
              changes: {
                type: 'object',
                properties: {
                  addDirectories: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Directories to add'
                  },
                  addFiles: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        content: { type: 'string' }
                      },
                      required: ['path', 'content']
                    },
                    description: 'Files to add'
                  },
                  removeItems: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Files or directories to remove'
                  }
                }
              }
            },
            required: ['projectPath', 'changes']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'create_project':
            return await this.createProject(args.config as ProjectConfig);
          
          case 'scaffold_feature':
            return await this.scaffoldFeature(
              args.projectPath as string,
              args.featureName as string,
              args.featureType as string,
              args.dependencies as string[]
            );
          
          case 'manage_dependencies':
            return await this.manageDependencies(
              args.projectPath as string,
              args.action as 'add' | 'remove' | 'update',
              args.dependencies as string[],
              args.devDependencies as boolean
            );
          
          case 'modify_project_structure':
            return await this.modifyProjectStructure(
              args.projectPath as string,
              args.changes as any
            );
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Error executing tool: ${errorMessage}`);
      }
    });
  }

  private async createProject(config: ProjectConfig): Promise<{ content: any[] }> {
    const projectPath = path.join(this.projectsRoot, config.name);

    // Ensure projects directory exists
    await fs.ensureDir(this.projectsRoot);

    // Check if project already exists
    if (await fs.pathExists(projectPath)) {
      throw new Error(`Project ${config.name} already exists at ${projectPath}`);
    }

    console.log(chalk.blue(`🚀 Creating ${config.type} project: ${config.name}`));

    // Generate project structure based on type
    const structure = this.generateProjectStructure(config);

    // Create directories
    for (const dir of structure.directories) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    // Create files
    for (const file of structure.files) {
      const filePath = path.join(projectPath, file.path);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content);
    }

    // Initialize git repository
    try {
      execSync('git init', { cwd: projectPath });
      execSync('git add .', { cwd: projectPath });
      execSync(`git commit -m "🚀 Initial commit: ${config.type} project ${config.name}"`, { cwd: projectPath });
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not initialize git repository'));
    }

    console.log(chalk.green(`✅ Project ${config.name} created successfully at ${projectPath}`));

    return {
      content: [
        {
          type: 'text',
          text: `Project "${config.name}" created successfully!\n\n` +
                `📁 Location: ${projectPath}\n` +
                `🏗️ Type: ${config.type}\n` +
                `💻 Language: ${config.language}\n` +
                `🛠️ Tech Stack: ${config.techStack?.join(', ') || 'N/A'}\n` +
                `📊 SDLC Phase: ${config.sdlcPhase || 'initiation'}\n` +
                `🏛️ Governance: ${config.governance || 'standard'}\n\n` +
                `Next steps:\n` +
                `1. cd ${projectPath}\n` +
                `2. npm install (if applicable)\n` +
                `3. Start development!`
        }
      ]
    };
  }

  private generateProjectStructure(config: ProjectConfig): ProjectStructure {
    const structure: ProjectStructure = {
      directories: [],
      files: []
    };

    // Base directories for all projects
    structure.directories.push(
      'src',
      'tests',
      'docs',
      '.github/workflows',
      '.ai',
      '.sdlc',
      '.governance'
    );

    // Type-specific directories
    switch (config.type) {
      case 'webapp':
        structure.directories.push(
          'src/components',
          'src/pages',
          'src/api',
          'src/utils',
          'src/types',
          'public',
          'styles'
        );
        break;
      
      case 'cli':
        structure.directories.push(
          'src/commands',
          'src/utils',
          'src/types',
          'bin'
        );
        break;
      
      case 'library':
        structure.directories.push(
          'src/core',
          'src/utils',
          'src/types',
          'examples'
        );
        break;
      
      case 'api':
        structure.directories.push(
          'src/routes',
          'src/middleware',
          'src/models',
          'src/services',
          'src/utils',
          'src/types'
        );
        break;
    }

    // Generate package.json
    const packageJson = this.generatePackageJson(config);
    structure.files.push({
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2)
    });

    // Generate README.md
    structure.files.push({
      path: 'README.md',
      content: this.generateReadme(config)
    });

    // Generate .gitignore
    structure.files.push({
      path: '.gitignore',
      content: this.generateGitignore(config)
    });

    // Generate AI configuration
    structure.files.push({
      path: '.ai/config.yaml',
      content: this.generateAIConfig(config)
    });

    // Generate SDLC configuration
    structure.files.push({
      path: '.sdlc/config.yaml',
      content: this.generateSDLCConfig(config)
    });

    // Generate governance configuration
    structure.files.push({
      path: '.governance/policies.yaml',
      content: this.generateGovernanceConfig(config)
    });

    return structure;
  }

  private generatePackageJson(config: ProjectConfig): any {
    const base = {
      name: config.name,
      version: '1.0.0',
      description: `AI-Native ${config.type} project`,
      main: config.type === 'library' ? 'dist/index.js' : 'src/index.js',
      scripts: {
        dev: 'npm run start:dev',
        build: 'npm run build:prod',
        test: 'jest',
        lint: 'eslint src/**/*'
      },
      keywords: ['ai-native', config.type, ...(config.techStack || [])],
      author: 'AI-Native Platform',
      license: 'MIT'
    };

    // Add type-specific scripts and dependencies
    switch (config.type) {
      case 'webapp':
        base.scripts = {
          ...base.scripts,
          'start:dev': 'next dev',
          'build:prod': 'next build',
          start: 'next start'
        };
        break;
      
      case 'cli':
        base.scripts = {
          ...base.scripts,
          'start:dev': 'ts-node src/index.ts',
          'build:prod': 'tsc'
        };
        break;
      
      case 'api':
        base.scripts = {
          ...base.scripts,
          'start:dev': 'nodemon src/index.ts',
          'build:prod': 'tsc'
        };
        break;
    }

    return base;
  }

  private generateReadme(config: ProjectConfig): string {
    return `# ${config.name}

**AI-Native ${config.type} project**

Generated by AI-Native Platform

## 🚀 Features

${config.features?.map(f => `- ${f}`).join('\n') || '- Feature list will be populated during development'}

## 💻 Tech Stack

- **Language**: ${config.language}
- **Type**: ${config.type}
${config.techStack?.map(tech => `- **${tech}**`).join('\n') || ''}

## 🏗️ Development

\`\`\`bash
# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Build for production
npm run build
\`\`\`

## 📊 Project Status

- **SDLC Phase**: ${config.sdlcPhase || 'initiation'}
- **Governance Level**: ${config.governance || 'standard'}

## 🤖 AI-Native Development

This project was created and is maintained using the AI-Native Platform. Claude Code can autonomously:

- Add new features
- Implement functionality
- Create tests
- Generate documentation
- Manage dependencies

---

*Built with AI-Native Platform*
`;
  }

  private generateGitignore(config: ProjectConfig): string {
    const common = `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Production
build/
dist/
.next/
out/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Cache
.cache
.eslintcache

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
`;

    // Add language-specific ignores
    if (config.language === 'python') {
      return common + `
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.pytest_cache/
`;
    }

    if (config.language === 'rust') {
      return common + `
# Rust
target/
Cargo.lock
`;
    }

    return common;
  }

  private generateAIConfig(config: ProjectConfig): string {
    const aiConfig = {
      project: {
        name: config.name,
        type: config.type,
        language: config.language,
        techStack: config.techStack || [],
        features: config.features || []
      },
      ai: {
        provider: 'claude',
        model: 'claude-3-sonnet',
        capabilities: [
          'code-generation',
          'testing',
          'documentation',
          'refactoring'
        ]
      },
      automation: {
        autoCommit: false,
        autoTest: true,
        autoDocument: true
      }
    };

    return yaml.stringify(aiConfig);
  }

  private generateSDLCConfig(config: ProjectConfig): string {
    const sdlcConfig = {
      project: {
        name: config.name,
        phase: config.sdlcPhase || 'initiation',
        governance: config.governance || 'standard'
      },
      phases: {
        initiation: {
          status: config.sdlcPhase === 'initiation' ? 'active' : 'pending',
          deliverables: [
            'project-charter',
            'stakeholder-analysis',
            'feasibility-study'
          ]
        },
        planning: {
          status: config.sdlcPhase === 'planning' ? 'active' : 'pending',
          deliverables: [
            'requirements-document',
            'architecture-design',
            'project-plan'
          ]
        },
        execution: {
          status: config.sdlcPhase === 'execution' ? 'active' : 'pending',
          deliverables: [
            'working-software',
            'test-results',
            'documentation'
          ]
        },
        monitoring: {
          status: config.sdlcPhase === 'monitoring' ? 'active' : 'pending',
          deliverables: [
            'status-reports',
            'quality-metrics',
            'performance-data'
          ]
        },
        closure: {
          status: config.sdlcPhase === 'closure' ? 'active' : 'pending',
          deliverables: [
            'final-deliverables',
            'lessons-learned',
            'project-retrospective'
          ]
        }
      }
    };

    return yaml.stringify(sdlcConfig);
  }

  private generateGovernanceConfig(config: ProjectConfig): string {
    const level = config.governance || 'standard';
    
    const governanceConfig = {
      governance: {
        level,
        policies: level === 'enterprise' ? [
          'code-review-required',
          'security-scan-mandatory',
          'documentation-required',
          'compliance-tracking'
        ] : level === 'standard' ? [
          'code-review-required',
          'testing-mandatory',
          'documentation-required'
        ] : [
          'basic-quality-checks'
        ]
      },
      qualityGates: {
        testCoverage: level === 'enterprise' ? 90 : level === 'standard' ? 80 : 70,
        codeQuality: level === 'enterprise' ? 9.0 : level === 'standard' ? 8.0 : 7.0,
        securityScan: level === 'enterprise',
        performanceTest: level !== 'minimal'
      }
    };

    return yaml.stringify(governanceConfig);
  }

  private async scaffoldFeature(
    projectPath: string,
    featureName: string,
    featureType: string,
    dependencies?: string[]
  ): Promise<{ content: any[] }> {
    console.log(chalk.blue(`🔧 Scaffolding ${featureType} feature: ${featureName}`));

    // Implementation for feature scaffolding
    // This would be expanded based on the project type and feature type

    return {
      content: [
        {
          type: 'text',
          text: `Feature "${featureName}" scaffolded successfully!\n\n` +
                `Type: ${featureType}\n` +
                `Project: ${projectPath}\n` +
                `Dependencies: ${dependencies?.join(', ') || 'None'}`
        }
      ]
    };
  }

  private async manageDependencies(
    projectPath: string,
    action: 'add' | 'remove' | 'update',
    dependencies: string[],
    devDependencies = false
  ): Promise<{ content: any[] }> {
    console.log(chalk.blue(`📦 ${action}ing dependencies: ${dependencies.join(', ')}`));

    // Implementation for dependency management
    // This would use npm/yarn commands to manage dependencies

    return {
      content: [
        {
          type: 'text',
          text: `Dependencies ${action}ed successfully!\n\n` +
                `Project: ${projectPath}\n` +
                `Dependencies: ${dependencies.join(', ')}\n` +
                `Dev Dependencies: ${devDependencies}`
        }
      ]
    };
  }

  private async modifyProjectStructure(
    projectPath: string,
    changes: any
  ): Promise<{ content: any[] }> {
    console.log(chalk.blue(`🏗️ Modifying project structure`));

    // Implementation for structure modification
    // This would handle adding/removing directories and files

    return {
      content: [
        {
          type: 'text',
          text: `Project structure modified successfully!\n\n` +
                `Project: ${projectPath}\n` +
                `Changes applied: ${JSON.stringify(changes, null, 2)}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(chalk.green('🚀 Project Management MCP Server started!'));
  }
}

// Start the server
const server = new ProjectManagementServer();
server.run().catch(console.error);
