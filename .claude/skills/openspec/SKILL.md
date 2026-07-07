---
name: openspec
description: Manage OpenSpec specifications for the WeData Tracking System. Use when a user wants to create, view, update specs, or propose changes to tracking features.
metadata:
  short-description: OpenSpec spec-driven development workflow
---

# OpenSpec Skill

This skill helps manage specifications using the OpenSpec framework for the WeData Tracking System.

## When to Use

- User asks to create a new spec or feature
- User wants to propose a change to existing functionality
- User needs to view or list current specs
- User wants to validate specs before implementation

## Available Commands

### View Specs Dashboard
```bash
npx openspec view
```
Opens an interactive dashboard to browse specs and changes.

### List All Specs
```bash
npx openspec list --specs
```
Lists all specification files in `openspec/specs/`.

### Show a Specific Spec
```bash
npx openspec show <spec-name>
```
Displays the content of a specific spec.

### Propose a Change
```bash
npx openspec change
```
Starts the workflow to propose a new feature or modification. Generates:
- `proposal.md` - Change description
- `design.md` - Technical decisions
- `tasks.md` - Implementation steps
- Spec deltas showing requirement changes

### Validate Specs
```bash
npx openspec validate
```
Checks specs for formatting or consistency issues.

### Archive Completed Change
```bash
npx openspec archive <change-name>
```
Archives a completed change and updates the main specs.

## Project Specs Location

Specs are stored in `openspec/specs/`:
- `tracking/meta-events.md` - Event configuration specs
- `tracking/properties.md` - Property and dictionary specs

## Workflow

1. **Before implementing**: Always check relevant specs in `openspec/specs/`
2. **When adding features**: Use `npx openspec change` to propose
3. **After implementation**: Archive the change with `npx openspec archive`
4. **Keep specs updated**: If code changes affect requirements, update the corresponding spec file

## Spec File Format

Specs follow this structure:

```markdown
# Feature Name

## Summary
Brief description of the feature.

## Requirements
1. Requirement one
2. Requirement two

## Scenarios

### Scenario Name
GIVEN some precondition
WHEN an action occurs
THEN expected outcome
AND additional outcome
```

## Reference

- Design Document: `docs/design.md`
- OpenSpec Docs: https://openspec.dev
