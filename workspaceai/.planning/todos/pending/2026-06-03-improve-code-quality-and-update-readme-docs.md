---
created: 2026-06-03T16:35:25.097Z
title: Improve code quality and update readme docs
area: docs
files: []
---

## Problem

Code quality needs a pass — likely dead code, inconsistent patterns, missing or stale comments in non-obvious places. README and any other docs are probably out of date or thin relative to what the app currently does.

## Solution

1. Code quality pass:
   - Run linter and fix all warnings/errors
   - Remove dead code and unused imports
   - Enforce consistent naming and patterns across the codebase
   - Add targeted comments only where the WHY is non-obvious
2. README update:
   - Accurate project description and feature list
   - Setup/install instructions
   - Development workflow (how to run, test, build)
   - Architecture overview (view system, IPC model, AI integration)
3. Any other docs (CLAUDE.md, inline docs) reviewed for accuracy
