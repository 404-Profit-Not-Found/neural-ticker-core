# Watchlist Browser Freezing - Complete Fix Documentation

## Problem Summary
Users with empty watchlists experienced browser freezing due to infinite render loops caused by unstable array/object references in React hooks and React Query.

## Root Causes & Fixes

### 1. React Query Key Object Instability ⚠️ CRITICAL
**File:** `frontend/src/hooks/useWatchlist.ts` line 137

**Problem:**
```typescript
queryKey: ['market-data', 'snapshots', { symbols }]
```
The object `{ symbols }` creates a new reference on every render, causing React Query to treat it as a different query.

**Fix:**
```typescript
queryKey: ['market-data', 'snapshots', symbols]
```
Pass the array directly without wrapping in an object.

---

### 2. Empty Array Reference Instability ⚠️ CRITICAL
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx`

**Problem:**
Multiple `useMemo` hooks returning new `[]` literals:
```typescript
const symbols = useMemo(() => {
    if (watchlistItems.length === 0) return []; // NEW ARRAY EVERY TIME!
    // ...
}, [watchlistItems]);
```

**Fix:**
Created constant empty array references:
```typescript
const EMPTY_SYMBOLS: string[] = [];
const EMPTY_ITEMS: WatchlistItem[] = [];
const EMPTY_TABLE_DATA: TickerData[] = [];
const EMPTY_SECTORS: string[] = [];
```

Applied to all useMemo hooks that return arrays:
- `watchlistItems` - returns `EMPTY_ITEMS` when empty
- `symbols` - returns `EMPTY_SYMBOLS` when empty
- `tableData` - returns `EMPTY_TABLE_DATA` when empty
- `uniqueSectors` - returns `EMPTY_SECTORS` when empty

---

### 3. Column Helper Recreation ⚠️ HIGH
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx`

**Problem:**
```typescript
const columnHelper = createColumnHelper<TickerData>();

const columns = useMemo(() => [
    columnHelper.accessor(...)
], [navigate, handleRemoveTicker, columnHelper]); // columnHelper in deps!
```

**Fix:**
Moved `createColumnHelper()` inside useMemo and removed from dependencies:
```typescript
const columns = useMemo(() => {
    const columnHelper = createColumnHelper<TickerData>();
    return [
        columnHelper.accessor(...)
    ];
}, [navigate, handleRemoveTicker]);
```

---

### 4. useEffect Dependency on Array Reference ⚠️ MEDIUM
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx` line 297

**Problem:**
```typescript
useEffect(() => {
    if (searchTickerQuery.data && searchTickerQuery.data.length > 0) {
        setShowSuggestions(true);
    } else {
        setShowSuggestions(false);
    }
}, [searchTickerQuery.data]); // Array reference changes!
```

**Fix:**
```typescript
}, [searchTickerQuery.data?.length]); // Primitive value
```

---

### 5. Unstable Callback Functions ⚠️ MEDIUM
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx`

**Problem:**
Multiple handler functions not wrapped in `useCallback`:
- `handleCreateList`
- `handleRenameList`
- `handleDeleteList`
- `handleRemoveTicker`
- `selectSuggestion`
- `handleKeyDown`

**Fix:**
Wrapped all handlers in `useCallback` with proper dependencies:
```typescript
const handleCreateList = useCallback(() => {
    // ...
}, [createListMutation, showToast]);

const selectSuggestion = useCallback((symbol: string) => {
    // ...
}, [activeWatchlistId, watchlistItems, addTickerMutation, showToast]);
```

---

### 6. Dependency on Unstable Object ⚠️ MEDIUM
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx`

**Problem:**
Functions depending on `activeWatchlist` object which gets recreated:
```typescript
const handleRemoveTicker = useCallback((symbol: string) => {
    const item = activeWatchlist.items.find(...); // activeWatchlist changes!
}, [activeWatchlist]);
```

**Fix:**
Changed to depend on `watchlistItems` array instead:
```typescript
const handleRemoveTicker = useCallback((symbol: string) => {
    const item = watchlistItems.find(...);
}, [watchlistItems]);
```

---

### 7. useMemo Dependency Optimization ⚠️ LOW
**File:** `frontend/src/components/dashboard/WatchlistTable.tsx`

**Problem:**
```typescript
const watchlistItems = useMemo(() => {
    // ...
}, [activeWatchlist]); // Entire object
```

**Fix:**
```typescript
}, [activeWatchlist?.items]); // Only the items array
```

---

## Why These Fixes Work

### JavaScript Reference Equality
```javascript
[] !== []  // true - different references
{} !== {}  // true - different references

const EMPTY = [];
EMPTY === EMPTY  // true - same reference
```

### React Query Behavior
React Query uses deep equality checks on queryKeys. When a queryKey contains:
- A new array reference → treats as different query → refetches
- A new object reference → treats as different query → refetches
- Same reference → recognizes as same query → no refetch

### React Rendering
- `useMemo` without stable dependencies → recalculates every render
- Functions without `useCallback` → new function every render
- New function in dependencies → triggers dependent hooks → infinite loop

---

## Test Results

### Before Fixes
- Browser freezes with empty watchlist
- Infinite API calls
- Tests timeout after 5 seconds

### After Fixes
```
✓ should render empty watchlist without excessive API calls
  Final API call count: 1
  Total API calls: 1
```

---

## Files Modified

1. **frontend/src/hooks/useWatchlist.ts**
   - Fixed queryKey object wrapper

2. **frontend/src/components/dashboard/WatchlistTable.tsx**
   - Added constant empty arrays
   - Wrapped all handlers in useCallback
   - Optimized useMemo dependencies
   - Fixed column helper recreation
   - Fixed useEffect dependencies

3. **frontend/src/components/dashboard/WatchlistTable.simple.test.tsx** (new)
   - Created test to verify no infinite loops

---

## Verification Steps

1. Run test:
   ```bash
   cd frontend && npm test -- WatchlistTable.simple.test.tsx --run
   ```
   Expected: Test passes with 1-2 API calls

2. Manual test in browser:
   - Create empty watchlist
   - Open DevTools Network tab
   - Watch for excessive API calls
   - Try adding a ticker
   - Verify no freezing

---

## Prevention Guidelines

### For Future Development

1. **Never return new arrays/objects in useMemo for empty states**
   ```typescript
   // ❌ BAD
   return [];
   
   // ✅ GOOD
   const EMPTY_ARRAY = [];
   return EMPTY_ARRAY;
   ```

2. **Avoid objects in React Query keys**
   ```typescript
   // ❌ BAD
   queryKey: ['data', { id, filters }]
   
   // ✅ GOOD
   queryKey: ['data', id, filters]
   ```

3. **Wrap event handlers in useCallback**
   ```typescript
   // ❌ BAD
   const handleClick = () => { ... };
   
   // ✅ GOOD
   const handleClick = useCallback(() => { ... }, [deps]);
   ```

4. **Use primitive values in useEffect dependencies**
   ```typescript
   // ❌ BAD
   useEffect(() => { ... }, [data]);
   
   // ✅ GOOD
   useEffect(() => { ... }, [data?.length, data?.id]);
   ```

5. **Minimize object dependencies in hooks**
   ```typescript
   // ❌ BAD
   useMemo(() => { ... }, [user]);
   
   // ✅ GOOD
   useMemo(() => { ... }, [user?.id, user?.name]);
   ```

---

## Related Issues

- React Query infinite loops
- React hooks dependency arrays
- JavaScript reference vs value equality
- Performance optimization in React

---

## Date: 2025-12-11
## Author: AI Assistant (Bob)