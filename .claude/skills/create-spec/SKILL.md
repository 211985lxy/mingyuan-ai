---
name: create-spec
description: Create a new OpenSpec specification file. Use when a user wants to define requirements for a new feature or module.
metadata:
  short-description: Create new OpenSpec spec files
---

# Create Spec Skill

Creates new specification files following the OpenSpec format for the WeData Tracking System.

## When to Use

- User wants to add a new feature spec
- User needs to document requirements for a new module
- User asks to "spec out" or "define requirements" for something

## Workflow

1. Ask the user for the feature/module name
2. Determine the appropriate category (e.g., `tracking`, `monitoring`, `admin`)
3. Create the spec file at `openspec/specs/<category>/<feature>.md`
4. Follow the template structure below

## Spec Template

```markdown
# Feature Name

## Summary
One paragraph describing what this feature does and why it exists.

## Requirements
1. **Requirement Category**: Description of requirement.
2. **Another Requirement**: Description.

## Scenarios

### Scenario Name
GIVEN a precondition or context
WHEN an action is performed
THEN the expected result occurs
AND any additional outcomes.
```

## Naming Conventions

- **File names**: kebab-case (e.g., `virtual-events.md`)
- **Event IDs**: lowercase, underscores, numbers, start with letter (e.g., `click_signup`)
- **Property IDs**: lowercase, underscores (e.g., `product_id`)

## Categories

Based on the design document (`docs/design.md`):

| Category | Description |
|----------|-------------|
| `tracking` | Meta-events, properties, dictionaries |
| `virtual` | Virtual event management |
| `monitoring` | Quality monitoring, error tracking |
| `pages` | Page remark management |

## Example

For a request like "create a spec for virtual events":

1. Create file: `openspec/specs/virtual/virtual-events.md`
2. Reference design doc section 2.4
3. Define requirements and scenarios based on the design

## After Creation

Remind the user:
- Review the spec for accuracy
- Run `npx openspec validate` to check formatting
- Commit the spec to version control
