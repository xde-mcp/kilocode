// Template definitions for the Prompt Debugger

export const documentationTemplate = `# {{project.name}} Documentation

## Overview
{{project.description}}
Version: {{project.version}}

## User Information
- **Name:** {{user.name}}
- **Email:** {{user.email}}
- **Role:** {{user.role}}

## Project Items
{{#each items}}
- {{this}}
{{/each}}

## Generated on: {{date}}
`

export const holeFillTemplate = `You are a HOLE FILLER. You are provided with a file containing holes, formatted as '{{HOLE_NAME}}'.
Your TASK is to complete with a string to replace this hole with, including context-aware indentation, if needed.

## Current file content with hole:
\`\`\`
function hypothenuse(a, b) {
  return Math.sqrt({{FILL_HERE}}b ** 2);
}
\`\`\`

TASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion.`

// Default templates array
export const defaultTemplates = [
	{ id: "documentation", name: "Documentation Template", content: documentationTemplate },
	{ id: "holeFiller", name: "Hole Filler Template", content: holeFillTemplate },
]
