# v2 Release Gate Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing v2.0 release-gate documents for v1-to-v2 migration and pattern compatibility.

**Architecture:** Keep this stage docs/test-only. `docs/migration-v1-to-v2.md` explains the breaking reset, claim paths, and no-silent-migration rule. `docs/pattern-compatibility-matrix.md` turns the seven required pattern families into an explicit matrix with variants, validation focus, core node combinations, and non-claims.

**Tech Stack:** Markdown, Vitest docs-release checks.

---

## Scope Check

This stage does not change runtime behavior, plugin schemas, package metadata, or n8n API usage. It only closes release documentation gates required by the v2 design spec.

## Tasks

- [x] Write failing docs-release tests for migration and pattern matrix docs.
- [x] Add `docs/migration-v1-to-v2.md`.
- [x] Add `docs/pattern-compatibility-matrix.md`.
- [x] Link both documents from README and release checklist.
- [ ] Run docs-release, typecheck, full tests, build, package boundary, and diff check before merge.
