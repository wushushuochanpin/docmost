# Create Standards (Rules + Skills)

## Design Philosophy

This command helps you create both **Rules** and **Skills** following the "Learn First, Enforce as Fallback" pattern:

- **Skills (Learning Layer)**: Provide detailed implementation guidance, applied when Agent judges them relevant
- **Rules (Enforcement Layer)**: Provide mandatory constraints with simple examples, always applied as fallback

## Workflow

When I provide a standard/topic, follow these steps:

### Step 1: Analyze the Topic
Determine if it should be:
- **Both Rules + Skills**: For complex topics (e.g., multi-tenancy, i18n, WebSocket)
- **Rules only**: For simple constraints (e.g., naming conventions, file size limits)
- **Skills only**: For optional best practices (e.g., performance optimization patterns)

### Step 2: Create Rule File (`.cursor/rules/{topic}.md`)

**Format:**
```markdown
---
description: Brief description of the constraint/standard
alwaysApply: true
---

# {Topic} Standards

## Critical Constraints

[Core mandatory rules - be concise]

## Examples

[Simple code examples showing correct vs incorrect]

## Detailed Guidance

See @{topic-skill} skill for detailed implementation patterns and best practices.
```

**Key Points:**
- Keep it concise (prefer < 200 lines)
- Focus on "MUST" constraints
- Include simple examples (✅ Good / ❌ Bad)
- Reference Skills for detailed guidance
- Use `alwaysApply: true`

### Step 3: Create Skill File (`.cursor/skills/{topic}/SKILL.md`)

**Format:**
```markdown
---
name: {topic}
description: Detailed description of when to use this skill. Include key scenarios like "Use when creating X, implementing Y, debugging Z, or reviewing code for W"
---

# How to Implement {Topic}

## Overview

[Brief introduction to the topic and why it matters]

## Core Principles

[Key concepts and principles]

## Step-by-Step Implementation

### Step 1: [First step]
[Detailed guidance with code examples]

### Step 2: [Second step]
[Detailed guidance with code examples]

## Common Patterns

### Pattern 1: [Common use case]
```typescript
// ✅ Correct implementation
[Example code]
```

### Pattern 2: [Another use case]
```typescript
// ✅ Correct implementation
[Example code]
```

## Best Practices

### ✅ DO
- [Best practice 1]
- [Best practice 2]

### ❌ DON'T
- [Anti-pattern 1]
- [Anti-pattern 2]

## Troubleshooting

### Issue: [Common problem]
**Solution:**
[How to fix it]

## References

- See @{topic} rule for mandatory constraints
- Related skills: @related-skill-1, @related-skill-2
```

**Key Points:**
- Detailed, narrative style ("How to...")
- Include step-by-step guides
- Provide multiple patterns and examples
- Include troubleshooting
- Reference Rules for constraints
- Optimize `description` for Agent relevance detection

### Step 4: Establish Cross-References

**In Rules:**
- Reference Skills: `See @{topic-skill} skill for detailed implementation patterns`

**In Skills:**
- Reference Rules: `See @{topic} rule for mandatory constraints`
- Reference related Skills: `Related skills: @related-skill-1, @related-skill-2`

## Priority Rules

1. **Rules take precedence**: If Skills and Rules conflict, Rules win (Rules are the fallback)
2. **Skills provide guidance**: Skills teach "how", Rules enforce "must"
3. **No duplication**: Rules say "must do X", Skills say "how to do X" - don't repeat the same content

## Example Structure

For topic "multi-tenancy":

**Rule** (`.cursor/rules/multi-tenancy.md`):
```markdown
---
description: Multi-tenancy architecture standards requiring TenantPrisma and Repository pattern
alwaysApply: true
---

# Multi-Tenancy Standards

## Critical Constraints

- **MUST use TenantPrisma**: Never use raw PrismaClient directly
- **MUST use Repository pattern**: All data access through Repository layer
- **MUST use tenantMiddleware**: All routes requiring tenant isolation

## Examples

```typescript
// ✅ Good
export class ConversationRepository extends BaseRepository {
  async findById(id: string) {
    return this.tenantPrisma.conversation.findUnique({
      where: this.mergeWhere({ id }),
    });
  }
}

// ❌ Bad
export class ConversationService {
  async findById(id: string) {
    return prisma.conversation.findUnique({ where: { id } });
  }
}
```

## Detailed Guidance

See @multi-tenancy skill for detailed implementation patterns and best practices.
```

**Skill** (`.cursor/skills/multi-tenancy/SKILL.md`):
```markdown
---
name: multi-tenancy
description: How to implement multi-tenancy architecture in Superchat. Use when creating repositories, services, API routes, or reviewing code for tenant isolation. Essential for all database operations.
---

# How to Implement Multi-Tenancy

## Overview

Multi-tenancy is a core requirement in Superchat. This skill teaches you how to properly implement tenant isolation using TenantPrisma and the Repository pattern.

## Step-by-Step Implementation

### Step 1: Create a Repository
[Detailed guide with examples]

### Step 2: Use BaseRepository
[Detailed guide with examples]

## Common Patterns

[Multiple patterns with detailed examples]

## Best Practices

[DOs and DON'Ts]

## Troubleshooting

[Common issues and solutions]

## References

- See @multi-tenancy rule for mandatory constraints
```

## Execution Instructions

When I provide a topic, you should:

1. **Analyze**: Determine if it needs both Rules + Skills or just one
2. **Create Rule** (if needed): In `.cursor/rules/{topic}.md` with constraints + simple examples
3. **Create Skill** (if needed): In `.cursor/skills/{topic}/SKILL.md` with detailed guidance
4. **Cross-reference**: Link Rules ↔ Skills
5. **Verify**: Ensure no duplication, Rules are concise, Skills are detailed

## Usage

Run this command with a topic, and I'll create the standardized Rules and Skills files following this pattern.

Example:
```
/create-standards multi-tenancy
/create-standards websocket-patterns
/create-standards error-handling
```
