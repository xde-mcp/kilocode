# History View UI Redesign Proposal

## Current Issues

1. **Selection Mode button** is isolated in the top-right header
2. **"Show favorites only"** checkbox is in the filter area (disconnected from selection context)
3. **"Select all"** checkbox only appears in selection mode below the favorites filter
4. **Visual disconnect** between entering selection mode and performing selection actions

## Proposed Modern Design

### Design Philosophy
- **Grouped Actions**: Keep related controls together
- **Contextual UI**: Show/hide elements based on mode
- **Visual Hierarchy**: Clear distinction between filters and actions
- **Modern Patterns**: Use contemporary UI patterns (chips, segmented controls, toolbars)

---

## Layout Structure (Mermaid Diagram)

```mermaid
flowchart TB
    subgraph HeaderRow["Header Row"]
        BackBtn["← History"]
        Spacer[""]
    end
    
    subgraph ControlBar["Unified Control Bar"]
        direction LR
        Search["🔍 Search"]
        FilterToggle["Filters ▼"]
        ActionGroup["Action Group"]
    end
    
    subgraph FilterPanel["Filter Panel (Collapsible)"]
        direction LR
        WorkspaceFilter["Workspace: Current ▼"]
        SortFilter["Sort: Newest ▼"]
        FavToggle["⭐ Favorites Only"]
    end
    
    subgraph SelectionToolbar["Selection Toolbar (Mode-dependent)"]
        direction LR
        SelectAll["☐ Select All"]
        SelectionCount["3 selected"]
        BatchActions["🗑️ Delete | 📤 Export"]
        ExitMode["✓ Done"]
    end
    
    subgraph TaskList["Task List"]
        Task1["Task Item 1"]
        Task2["Task Item 2"]
        Task3["Task Item 3"]
    end
    
    subgraph Footer["Footer"]
        Pagination["Page 1 / 3"]
        PageNav["← Previous | Next →"]
    end
    
    HeaderRow --> ControlBar
    ControlBar -->|Expand| FilterPanel
    ControlBar -->|Enter Selection| SelectionToolbar
    FilterPanel --> TaskList
    SelectionToolbar --> TaskList
    TaskList --> Footer
```

---

## Detailed Component Design

### 1. Header Row (Simplified)
```
┌─────────────────────────────────────┐
│  ←  History                         │
└─────────────────────────────────────────────────────┘
```
- Remove the "Selection Mode" button from header
- Keep only back navigation and title

---

### 2. Unified Control Bar
```
┌─────────────────────────────────────────────────────┐
│ 🔍 Search history...        [Filters ▼]  [✓ Select] │
└─────────────────────────────────────────────────────┘
```

**Components:**
- **Search input**: Full-width with icon, clears when filters expanded
- **Filters button**: Toggle button that expands/collapses filter panel
- **Select button**: Primary action button to enter selection mode
  - Default state: "Select" with checklist icon
  - Active state: "Done" with checkmark (primary/blue color)

---

### 3. Collapsible Filter Panel
```
┌─────────────────────────────────────────────────────┐
│ Workspace: Current ▼    Sort: Newest ▼   ⭐ Favs    │
└─────────────────────────────────────────────────────┘
```

**Changes:**
- Filters hidden by default to reduce visual clutter
- "Favorites only" becomes a compact toggle chip (icon + label)
- All filter controls in a single row when expanded

---

### 4. Selection Mode Toolbar (Replaces Filter Panel when active)
```
┌─────────────────────────────────────────────────────┐
│ ☐ Select All              3 selected    [🗑️ Delete] │
│                           of 12 tasks    [✓ Done]   │
└─────────────────────────────────────────────────────┘
```

**Components:**
- **Checkbox + "Select All"**: Left-aligned, primary action
- **Selection counter**: "X selected of Y tasks" (center or right)
- **Batch actions**: Delete, Export (icon buttons with labels)
- **Done button**: Exit selection mode (secondary style)

---

### 5. Task Item Updates (In Selection Mode)
```
┌─────────────────────────────────────────────────────┐
│ ☐  Task Title                           [⭐] [🗑️]  │
│    2 hours ago · $0.00                              │
└─────────────────────────────────────────────────────┘
```

- Checkbox appears at the **start** of each task item
- Other action icons (favorite, delete) remain on the right
- Entire row is clickable to toggle selection

---

### 6. Visual States Summary

#### Normal Mode
```
┌─────────────────────────────────────────────────────┐
│  ←  History                                         │
├─────────────────────────────────────────────────────┤
│ 🔍 Search...              [Filters]  [Select ▼]     │
├─────────────────────────────────────────────────────┤
│    Task 1                                           │
│    Task 2                                           │
│    Task 3                                           │
└─────────────────────────────────────────────────────┘
```

#### Filters Expanded
```
┌─────────────────────────────────────────────────────┐
│  ←  History                                         │
├─────────────────────────────────────────────────────┤
│ 🔍 Search...              [Filters ▲]  [Select]     │
├─────────────────────────────────────────────────────┤
│ Workspace: Current ▼  Sort: Newest ▼  ⭐ Favorites  │
├─────────────────────────────────────────────────────┤
│    Task 1                                           │
│    Task 2                                           │
└─────────────────────────────────────────────────────┘
```

#### Selection Mode
```
┌─────────────────────────────────────────────────────┐
│  ←  History                                         │
├─────────────────────────────────────────────────────┤
│ 🔍 Search...              [Filters]  [Done ▲]       │
├─────────────────────────────────────────────────────┤
│ ☐ Select All        0 of 3 selected    [Cancel]    │
├─────────────────────────────────────────────────────┤
│ ☐  Task 1                                 [⭐] [🗑️]│
│ ☐  Task 2                                 [⭐] [🗑️]│
│ ☐  Task 3                                 [⭐] [🗑️]│
└─────────────────────────────────────────────────────┘
```

#### Selection Mode (with items selected)
```
┌─────────────────────────────────────────────────────┐
│  ←  History                                         │
├─────────────────────────────────────────────────────┤
│ 🔍 Search...              [Filters]  [Done ▲]       │
├─────────────────────────────────────────────────────┤
│ ☑ Select All        2 of 3 selected    [🗑️ Delete] │
│                                        [✓ Done]    │
├─────────────────────────────────────────────────────┤
│ ☑  Task 1                               [⭐] [🗑️]  │
│ ☐  Task 2                               [⭐] [🗑️]  │
│ ☑  Task 3                               [⭐] [🗑️]  │
└─────────────────────────────────────────────────────┘
```

---

## Key Improvements

### 1. **Unified Control Bar**
- All action controls in one row
- Clear distinction between filtering and selection
- Reduced visual clutter in header

### 2. **Contextual Toolbar**
- Filter panel ↔ Selection toolbar swap based on mode
- Only relevant controls visible at any time
- Selection actions immediately accessible when needed

### 3. **Improved Flow**
```
[Click Select] → [Selection Toolbar Appears] → [Select Items] → [Delete/Done]
       ↑                                                         ↓
       └───────────────── [Click Done] ←──────────────────────────┘
```

### 4. **Modern UI Patterns**
- **Segmented controls** for view switching
- **Chip-style toggles** for boolean filters
- **Sticky action bar** for selection operations
- **Progressive disclosure** (hidden filters by default)

---

## Component Implementation Notes

### File: `HistoryView.tsx`

#### New State Management
```typescript
const [showFilters, setShowFilters] = useState(false)
const [isSelectionMode, setIsSelectionMode] = useState(false)
```

#### Control Bar Component
```typescript
<div className="flex items-center gap-2 p-2">
  <VSCodeTextField className="flex-1" ... />
  <Button 
    variant="secondary" 
    onClick={() => setShowFilters(!showFilters)}
    active={showFilters}
  >
    Filters {showFilters ? '▲' : '▼'}
  </Button>
  <Button 
    variant={isSelectionMode ? "primary" : "secondary"}
    onClick={() => setIsSelectionMode(!isSelectionMode)}
  >
    {isSelectionMode ? 'Done' : 'Select'}
  </Button>
</div>
```

#### Conditional Toolbar
```typescript
{isSelectionMode ? (
  <SelectionToolbar 
    tasks={tasks}
    selectedIds={selectedTaskIds}
    onSelectAll={toggleSelectAll}
    onDelete={handleBatchDelete}
    onDone={() => setIsSelectionMode(false)}
  />
) : showFilters && (
  <FilterPanel 
    workspace={...}
    sortOption={...}
    showFavorites={...}
    onChange={...}
  />
)}
```

---

## Accessibility Considerations

1. **Keyboard Navigation**: Tab through controls in logical order
2. **Screen Readers**: Clear labels for mode changes
3. **Focus Management**: Auto-focus on "Select All" when entering selection mode
4. **ARIA States**: `aria-pressed` for toggle buttons, `aria-expanded` for panels

---

## Responsive Behavior

- **Mobile/Narrow**: Stack controls vertically
- **Desktop**: Horizontal layout as shown
- **Touch Targets**: Minimum 44px for all interactive elements

---

## Migration Path

1. **Phase 1**: Move Selection button to control bar
2. **Phase 2**: Implement collapsible filter panel
3. **Phase 3**: Add Selection Toolbar component
4. **Phase 4**: Update TaskItem checkboxes for selection mode
5. **Phase 5**: Polish animations and transitions
