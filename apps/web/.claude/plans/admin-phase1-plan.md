# Phase 1 Implementation Plan: 后台信息架构重组

## Scope
Only modify:
1. **AdminSidebar** — group navigation into 5 logical sections
2. **AdminLayout** — add breadcrumb context / module title in header
3. **Admin Dashboard** — refine the overview page (tabs: 总览/待处理/系统状态)
4. **Path restructuring** — move pages to match the new URL scheme

## Design Decisions

### 1. No new directory pages for now
The plan mentions "待处理事项" and "系统状态" as separate sidebar items, but they don't need separate page files yet — the dashboard `/admin` page can use **Tabs** (same existing pattern as knowledge page) to show 总览 / 待处理 / 系统状态 within one route. This avoids creating empty pages and keeps the navigation correct.

The sidebar will link all three to `/admin` (with hash/anchor), or more practically, the dashboard page will use an internal tab state. When clicked from sidebar, `/admin` opens with the correct tab active.

### 2. Sidebar uses GroupLabel + inline grouping (no SidebarMenuSub)
The existing shadcn Sidebar `SidebarMenuSub` exists but is never used in the admin. Looking at the sidebar code structure, it's simpler and more maintainable to keep the current pattern: **SidebarGroup + SidebarGroupLabel + flat SidebarMenu** for each section. This matches the existing app-sidebar.tsx pattern and is already visually clean with the group label acting as section headers.

### 3. Icon mapping for the new structure
- **工作台 (Workspace)**: LayoutDashboard (总览) / ListChecks (待处理) / Activity (系统状态)
- **内容资产 (Content Assets)**: BookOpen (知识库) / Target (档案) / FileText (模板) / Rss (信源)
- **智能体 (AI Agents)**: Bot (智能体) / Compass (方法论) / FlaskConical (检索测试) / Activity (执行观测)
- **运营管理 (Operations)**: Users (用户) / KeyRound (激活码) / Receipt (使用记录)
- **系统 (System)**: Settings (设置) / ScrollText (日志)

### 4. Page path mapping

| Sidebar Label | href | Existing file |
|---|---|---|
| 总览 | /admin | /admin/page.tsx |
| 知识库 | /admin/knowledge | /admin/knowledge/page.tsx |
| 真实档案 | /admin/benchmark-profiles | /admin/benchmark-profiles/page.tsx |
| 内容模板 | /admin/templates | /admin/templates/page.tsx |
| 热点信源 | /admin/hot-sources | /admin/hot-sources/page.tsx |
| 智能体 | /admin/agents | /admin/agents/page.tsx |
| 方法论 | /admin/methodology | /admin/methodology/page.tsx |
| 用户 | /admin/users | /admin/users/page.tsx |
| 激活码 | /admin/activation-codes | /admin/activation-codes/page.tsx |
| 系统设置 | /admin/settings | /admin/settings/page.tsx |
| 检索测试 | /admin/retrieval-test | NEW (move JiekouTestPanel from knowledge page) |
| 使用记录 | /admin/usage | NEW (using existing AimExecutionTrace API) |
| 操作日志 | /admin/logs | NEW placeholder |

### 5. New page stubs for "未实现" items
For items that don't have a page yet (使用记录, 操作日志, 检索测试), we create minimal placeholder pages.

## Files to Create/Modify

### A. AdminSidebar — FULL REWRITE
Replace the flat `navItems` array with 5 grouped sections. Each section uses:
- `SidebarGroup` 
- `SidebarGroupLabel` with Chinese name + English subtitle
- `SidebarGroupContent` > `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton`

### B. AdminLayout — MINOR CHANGE
Add a breadcrumb context that reads the current pathname and shows the current module name + description.

### C. Dashboard — REFINE
Add `Tabs` at the top: 总览 | 待处理 | 系统状态
- **总览 tab**: Existing content (4 metric cards + 4 summary cards)
- **待处理 tab**: Filtered view showing only items requiring attention
- **系统状态 tab**: Enhanced system health view

## What Changes
- `src/components/admin/admin-sidebar.tsx` — navigation rewrite
- `src/app/admin/layout.tsx` — add breadcrumb
- `src/app/admin/page.tsx` — add dashboard tabs
- NEW: `src/app/admin/usage/page.tsx` — usage records
- NEW: `src/app/admin/logs/page.tsx` — operation logs
- NEW: `src/app/admin/retrieval-test/page.tsx` — JiekouTestPanel

## What Does NOT Change
- API routes
- Business logic
- Data models
- Existing business page content
- Existing admin component files
