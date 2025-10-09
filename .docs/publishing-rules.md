# Publishing Rules Guide

> **Updated in v0.1.0**: Complementary `isPublicRule` and `publishDateRule` system

## Table of Contents

- [Overview](#overview)
- [The Two Rules](#the-two-rules)
- [How They Work Together](#how-they-work-together)
- [Common Patterns](#common-patterns)
- [Real-World Examples](#real-world-examples)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Symbiont CMS uses **complementary publishing rules** that work together to determine which pages should be published and when. Both rules are optional and have sensible defaults.

### Quick Summary

- **`isPublicRule`** - Boolean gate: determines IF a page should be published
- **`publishDateRule`** - Date extraction: determines WHEN a page should be published
- **Both must pass** for a page to be published
- **Both are optional** with sensible defaults

## The Two Rules

### 1. `isPublicRule` (Boolean Gate)

**Purpose**: Determines IF a page should be published  
**Type**: `(page: PageObjectResponse) => boolean`  
**Default**: `() => true` (all pages pass the gate)

This is your "on/off switch" for publishing. Use it for:
- Status checks (`Status === 'Published'`)
- Boolean flags (`Ready checkbox === true`)
- Simple published/unpublished logic

**Example:**
```typescript
isPublicRule: (page) => page.properties.Status?.select?.name === 'Published'
```

### 2. `publishDateRule` (Date Extraction)

**Purpose**: Determines WHEN a page should be published  
**Type**: `(page: PageObjectResponse) => string | null`  
**Default**: Uses `page.last_edited_time` (always available in Notion)

This extracts the publish date from your Notion pages. Use it for:
- Custom date properties (`'Go Live Date'`)
- Scheduled publishing logic
- Complex date selection (fallbacks, conditional dates)

**Example:**
```typescript
publishDateRule: (page) => page.properties['Go Live']?.date?.start || null
```

## How They Work Together

**Both rules must pass** for a page to be published:

1. `isPublicRule` must return `true` (or be undefined, which defaults to `true`)
2. `publishDateRule` must return a valid ISO date string (or be undefined, which defaults to `page.last_edited_time`)

If either condition fails, the page is **unpublished** (`publish_at = null`).

### Decision Flow

```
                                    ┌─────────────────┐
                                    │  Notion Page    │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │  isPublicRule   │
                                    │  (gate check)   │
                                    └────────┬────────┘
                                             │
                            ┌────────────────┴────────────────┐
                            │                                 │
                         false                             true
                            │                                 │
                            ▼                                 ▼
                    ┌───────────────┐              ┌──────────────────┐
                    │ publish_at    │              │ publishDateRule  │
                    │ = null        │              │ (date extract)   │
                    │ (unpublished) │              └────────┬─────────┘
                    └───────────────┘                       │
                                              ┌─────────────┴─────────────┐
                                              │                           │
                                           null                      ISO date
                                              │                           │
                                              ▼                           ▼
                                     ┌───────────────┐         ┌──────────────────┐
                                     │ publish_at    │         │ publish_at = date│
                                     │ = null        │         │ (published!)     │
                                     │ (unpublished) │         └──────────────────┘
                                     └───────────────┘
```

## Common Patterns

### Pattern 1: Simple Status Gate (Default Date)

Most common pattern - just check if published, use last edited time as publish date.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  // Only publish pages marked as "Published"
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
  // publishDateRule omitted → uses page.last_edited_time
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: Only "Published" pages appear, using their last edit time.

---

### Pattern 2: Custom Date Property (No Gate)

Use a custom date property, allow all pages through the gate.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  // isPublicRule omitted → defaults to () => true (all pages pass)
  
  // Use custom "Go Live" date property
  publishDateRule: (page) => {
    return page.properties['Go Live']?.date?.start || null;
  },
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: Pages with a "Go Live" date are published on that date. Pages without it are unpublished.

---

### Pattern 3: Both Rules (Complex Logic)

Combine status checks with custom date logic.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  // Gate: only ready pages pass
  isPublicRule: (page) => page.properties.Ready?.checkbox === true,
  
  // Date: use embargo date or fall back to last edited
  publishDateRule: (page) => {
    const embargo = page.properties['Embargo Date']?.date?.start;
    return embargo || page.last_edited_time;
  },
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: Only pages with "Ready" checkbox publish. They use embargo date if set, otherwise last edited time.

---

### Pattern 4: Scheduled Publishing with Fallback

Different date properties for different statuses.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  // Gate: published or scheduled
  isPublicRule: (page) => {
    const status = page.properties.Status?.select?.name;
    return status === 'Published' || status === 'Scheduled';
  },
  
  // Date: scheduled date for scheduled posts, last edited for published
  publishDateRule: (page) => {
    const status = page.properties.Status?.select?.name;
    
    if (status === 'Scheduled') {
      return page.properties['Scheduled Date']?.date?.start || null;
    }
    
    // For 'Published' status, use last edited time
    return page.last_edited_time;
  },
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: "Scheduled" posts use their scheduled date. "Published" posts use last edited time.

---

### Pattern 5: All Pages Published (Default Everything)

Simplest config - publish everything with last edited time.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  // Both rules omitted → all defaults
  // isPublicRule: () => true (implicit)
  // publishDateRule: (page) => page.last_edited_time (implicit)
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: All pages published using their last edited timestamp.

---

### Pattern 6: Multiple Date Properties with Priority

Use the first available date from multiple properties.

```typescript
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
  
  publishDateRule: (page) => {
    // Priority: 1) Publish Date, 2) Created Time, 3) Last Edited
    return page.properties['Publish Date']?.date?.start 
        || page.created_time 
        || page.last_edited_time;
  },
  
  sourceOfTruthRule: () => 'NOTION'
}
```

**Result**: Published pages use their custom "Publish Date" if set, otherwise creation time, otherwise last edited.

## Real-World Examples

### Example 1: News Site with Embargo Dates

Prevent publishing until a certain date:

```typescript
{
  isPublicRule: (page) => {
    return page.properties.Status?.select?.name === 'Published';
  },
  
  publishDateRule: (page) => {
    const embargoDate = page.properties['Embargo Until']?.date?.start;
    const publishDate = page.properties['Publish Date']?.date?.start;
    
    // If there's an embargo date in the future, return null (unpublished)
    if (embargoDate) {
      const now = new Date().toISOString();
      if (embargoDate > now) {
        return null; // Still under embargo
      }
    }
    
    // Embargo passed or doesn't exist
    return publishDate || page.last_edited_time;
  }
}
```

---

### Example 2: Different Dates for Different Content Types

```typescript
{
  isPublicRule: (page) => {
    return page.properties.Status?.select?.name === 'Published';
  },
  
  publishDateRule: (page) => {
    const type = page.properties['Content Type']?.select?.name;
    
    // News articles use "Published At" (required)
    if (type === 'News') {
      return page.properties['Published At']?.date?.start || null;
    }
    
    // Evergreen content uses "Go Live" with fallback
    if (type === 'Evergreen') {
      return page.properties['Go Live']?.date?.start || page.last_edited_time;
    }
    
    // Tutorials use creation date
    if (type === 'Tutorial') {
      return page.created_time;
    }
    
    // Default: last edited
    return page.last_edited_time;
  }
}
```

---

### Example 3: Complex Multi-Status Workflow

Handle draft → review → scheduled → published lifecycle:

```typescript
{
  isPublicRule: (page) => {
    const status = page.properties.Status?.select?.name;
    // Only "Scheduled" and "Published" can go live
    return status === 'Scheduled' || status === 'Published';
  },
  
  publishDateRule: (page) => {
    const status = page.properties.Status?.select?.name;
    
    if (status === 'Scheduled') {
      // Must have a scheduled date to publish
      const scheduledDate = page.properties['Go Live']?.date?.start;
      if (!scheduledDate) {
        return null; // No date = don't publish yet
      }
      
      // Only publish if scheduled date has passed
      const now = new Date().toISOString();
      if (scheduledDate > now) {
        return null; // Future date = wait
      }
      
      return scheduledDate;
    }
    
    if (status === 'Published') {
      // Use publish date or last edited
      return page.properties['Published On']?.date?.start || page.last_edited_time;
    }
    
    // Shouldn't reach here due to isPublicRule gate
    return null;
  }
}
```

---

### Example 4: Checkbox + Custom Date

Simple visible/hidden toggle with custom date:

```typescript
{
  isPublicRule: (page) => {
    return page.properties['Visible on Site']?.checkbox === true;
  },
  
  publishDateRule: (page) => {
    return page.properties['Publish Date']?.date?.start || page.last_edited_time;
  }
}
```

---

### Example 5: Multi-Select Status with Priorities

Using multi-select for multiple states:

```typescript
{
  isPublicRule: (page) => {
    const statuses = page.properties.Status?.multi_select?.map(s => s.name) || [];
    // Must have "Approved" and not have "Hidden"
    return statuses.includes('Approved') && !statuses.includes('Hidden');
  },
  
  publishDateRule: (page) => {
    const statuses = page.properties.Status?.multi_select?.map(s => s.name) || [];
    
    // If it's a featured post, use featured date
    if (statuses.includes('Featured')) {
      return page.properties['Featured Since']?.date?.start || page.last_edited_time;
    }
    
    // Otherwise use approval date
    return page.properties['Approved On']?.date?.start || page.last_edited_time;
  }
}
```

## Migration Guide

### From Old isPublicRule (Pre-v0.1.0)

In older versions, `isPublicRule` was mutually exclusive with `publishDateRule` and had implicit date lookup behavior.

**Before (Old Behavior):**
```typescript
{
  isPublicRule: (page) => {
    return page.properties.Status?.select?.name === 'Published';
  }
  // Implicitly looked up 'Publish Date' property or used now()
}
```

**After (New Complementary Behavior):**

Option 1 - Use defaults (simplest):
```typescript
{
  isPublicRule: (page) => {
    return page.properties.Status?.select?.name === 'Published';
  }
  // Now uses page.last_edited_time (always available)
}
```

Option 2 - Explicitly preserve old behavior:
```typescript
{
  isPublicRule: (page) => {
    return page.properties.Status?.select?.name === 'Published';
  },
  publishDateRule: (page) => {
    // Preserve old 'Publish Date' property lookup + now() fallback
    return page.properties['Publish Date']?.date?.start || new Date().toISOString();
  }
}
```

Option 3 - Consolidate into publishDateRule only:
```typescript
{
  // isPublicRule omitted → defaults to () => true
  publishDateRule: (page) => {
    const status = page.properties.Status?.select?.name;
    
    if (status === 'Published') {
      return page.properties['Publish Date']?.date?.start || new Date().toISOString();
    }
    
    return null; // Unpublished
  }
}
```

### Breaking Changes

None! The new system is backwards compatible:
- Existing `isPublicRule` configs still work
- They now use `last_edited_time` instead of 'Publish Date' property (which may not exist)
- This is actually more reliable since `last_edited_time` always exists

## Type Signatures

```typescript
interface DatabaseBlueprint {
  // ... other properties ...
  
  /**
   * Optional boolean gate determining IF a page should be published
   * Default: () => true
   */
  isPublicRule?: (page: PageObjectResponse) => boolean;
  
  /**
   * Optional function extracting the publish date from a page
   * Default: (page) => page.last_edited_time
   * 
   * Returns:
   * - ISO date string → page is published at that date
   * - null → page is unpublished (publish_at = null)
   */
  publishDateRule?: (page: PageObjectResponse) => string | null;
}
```

## Best Practices

### 1. Start Simple, Add Complexity as Needed

```typescript
// ✅ Good: Start with just the gate
{
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published'
}

// ✅ Better: Add custom date when you need it
{
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
  publishDateRule: (page) => page.properties['Go Live']?.date?.start || page.last_edited_time
}
```

### 2. Always Return null for Unpublished

```typescript
// ❌ Bad: Returns undefined or empty string
publishDateRule: (page) => {
  if (condition) return '';  // Don't do this
  if (condition) return undefined;  // Or this
}

// ✅ Good: Explicitly returns null
publishDateRule: (page) => {
  if (condition) return null;  // Clear intent
  return page.properties['Date']?.date?.start || null;
}
```

### 3. Use last_edited_time as Fallback

```typescript
// ✅ Good: Always available, sensible default
publishDateRule: (page) => {
  return page.properties['Custom Date']?.date?.start || page.last_edited_time;
}
```

### 4. Type-Safe Property Access

```typescript
// ✅ Good: Safe access with optional chaining
const status = page.properties.Status?.select?.name;
const date = page.properties['Publish Date']?.date?.start;

// ❌ Bad: Can throw errors
const status = page.properties.Status.select.name;
```

### 5. Test Your Logic in Notion First

Use Notion's database view filters to preview what will be published:
1. Create a filter matching your `isPublicRule` logic
2. Add a formula column to preview your `publishDateRule` logic
3. Verify the results before deploying

### 6. Document Your Publishing Logic

```typescript
{
  // Clear documentation helps future you
  isPublicRule: (page) => {
    // Only publish "Published" and "Featured" posts
    const status = page.properties.Status?.select?.name;
    return status === 'Published' || status === 'Featured';
  },
  
  publishDateRule: (page) => {
    // Use "Publish Date" if set, otherwise last edited time
    return page.properties['Publish Date']?.date?.start || page.last_edited_time;
  }
}
```

## Troubleshooting

### Q: All my posts show the same publish date

**A**: You're probably using the default `last_edited_time`. This is normal! If you want different dates:

```typescript
publishDateRule: (page) => {
  return page.properties['Custom Date']?.date?.start || page.last_edited_time;
}
```

---

### Q: Posts aren't appearing on my site

**A**: Check both rules:

1. Is `isPublicRule` returning `false`?
   ```typescript
   // Add logging to debug
   isPublicRule: (page) => {
     const status = page.properties.Status?.select?.name;
     console.log(`Page ${page.id}: status = ${status}`);
     return status === 'Published';
   }
   ```

2. Is `publishDateRule` returning `null`?
   ```typescript
   // Add logging to debug
   publishDateRule: (page) => {
     const date = page.properties['Date']?.date?.start;
     console.log(`Page ${page.id}: date = ${date}`);
     return date || page.last_edited_time;
   }
   ```

---

### Q: I want scheduled posts to not appear until their date

**A**: Use `publishDateRule` with a future date. Your site queries should filter:

```graphql
query GetPosts {
  posts(
    where: {
      publish_at: { _lte: "now()" }  # Only past/present dates
    }
  ) {
    id
    title
    publish_at
  }
}
```

---

### Q: Can I use both rules together?

**A**: Yes! That's the recommended approach for complex workflows:

```typescript
{
  isPublicRule: (page) => /* your gate check */,
  publishDateRule: (page) => /* your date logic */
}
```

---

### Q: What if I want all pages unpublished?

**A**: Either gate always returns false, or date always returns null:

```typescript
// Option 1: Gate blocks everything
{ isPublicRule: () => false }

// Option 2: Date is always null
{ publishDateRule: () => null }
```

---

### Q: Why did my 'Publish Date' property stop working?

**A**: The default changed to `last_edited_time` (more reliable). To use your custom property:

```typescript
{
  publishDateRule: (page) => {
    return page.properties['Publish Date']?.date?.start || page.last_edited_time;
  }
}
```

---

### Q: How do I debug which rule is failing?

**A**: Add logging to both rules:

```typescript
{
  isPublicRule: (page) => {
    const result = /* your logic */;
    console.log(`[isPublicRule] Page ${page.id}: ${result}`);
    return result;
  },
  
  publishDateRule: (page) => {
    const result = /* your logic */;
    console.log(`[publishDateRule] Page ${page.id}: ${result}`);
    return result;
  }
}
```

## See Also

- [symbiont-cms.md](./symbiont-cms.md) - Full configuration reference
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Current implementation status
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - QWER integration guide
- [Notion API Reference](https://developers.notion.com/reference/property-object) - Property types

---

**Last Updated**: October 8, 2025
