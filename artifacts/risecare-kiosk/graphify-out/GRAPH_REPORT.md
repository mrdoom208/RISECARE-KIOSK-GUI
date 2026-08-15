# Graph Report - risecare-kiosk  (2026-08-15)

## Corpus Check
- 86 files · ~275,352 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 636 nodes · 1007 edges · 79 communities (33 shown, 46 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fbff93bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Dashboard.tsx
- devDependencies
- carousel.tsx
- cn
- command.tsx
- App.tsx
- compilerOptions
- use-toast.ts
- field.tsx
- components.json
- menubar.tsx
- utils.ts
- form.tsx
- dependencies
- input-group.tsx
- item.tsx
- chart.tsx
- context-menu.tsx
- dropdown-menu.tsx
- sheet.tsx
- table.tsx
- breadcrumb.tsx
- drawer.tsx
- empty.tsx
- navigation-menu.tsx
- select.tsx
- button-group.tsx
- card.tsx
- toggle-group.tsx
- accordion.tsx
- kbd.tsx
- tabs.tsx
- sonner.tsx
- clsx
- cmdk
- date-fns
- embla-carousel-react
- @hookform/resolvers
- input-otp
- lucide-react
- next-themes
- @radix-ui/react-accordion
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-progress
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react-day-picker
- react-dom
- react-hook-form
- react-icons
- react-resizable-panels
- recharts
- sonner
- tailwind-merge
- @tanstack/react-query
- vaul
- @workspace/api-client-react
- wouter
- zod
- vite.config.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 138 edges
2. `useRateLimit()` - 21 edges
3. `Results()` - 15 edges
4. `useToast()` - 13 edges
5. `react` - 11 edges
6. `VirtualKeyboard()` - 9 edges
7. `Dashboard()` - 9 edges
8. `compilerOptions` - 9 edges
9. `getStatusColor()` - 7 edges
10. `tailwind` - 6 edges

## Surprising Connections (you probably didn't know these)
- `useCarousel()` --references--> `react`  [EXTRACTED]
  src/components/ui/carousel.tsx → package.json
- `useChart()` --references--> `react`  [EXTRACTED]
  src/components/ui/chart.tsx → package.json
- `useFormField()` --references--> `react`  [EXTRACTED]
  src/components/ui/form.tsx → package.json
- `SidebarMenuSkeleton()` --references--> `react`  [EXTRACTED]
  src/components/ui/sidebar.tsx → package.json
- `SidebarProvider()` --references--> `react`  [EXTRACTED]
  src/components/ui/sidebar.tsx → package.json

## Import Cycles
- None detected.

## Communities (79 total, 46 thin omitted)

### Community 0 - "Dashboard.tsx"
Cohesion: 0.06
Nodes (57): InstructionModal(), InstructionModalProps, KeypadDialog(), KeypadDialogProps, KioskHeader(), KioskHeaderProps, Feedback, sensors (+49 more)

### Community 1 - "devDependencies"
Cohesion: 0.05
Nodes (40): lightningcss, devDependencies, lightningcss, @replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal, @rollup/rollup-linux-arm64-gnu, @rollup/rollup-linux-x64-gnu (+32 more)

### Community 2 - "carousel.tsx"
Cohesion: 0.07
Nodes (30): react, react, Button, ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Carousel (+22 more)

### Community 3 - "cn"
Cohesion: 0.11
Nodes (32): SheetHeader(), Sidebar(), SidebarContent(), SidebarContext, SidebarContextProps, SidebarFooter(), SidebarGroup(), SidebarGroupAction() (+24 more)

### Community 4 - "command.tsx"
Cohesion: 0.09
Nodes (19): LoginDialogProps, TermsAgreementDialogProps, Checkbox, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem (+11 more)

### Community 5 - "App.tsx"
Cohesion: 0.11
Nodes (20): queryClient, ACTIVITY_EVENTS, IdleTimeout(), backspaceAtCursor(), clearValue(), INPUT_TAGS, insertTextAtCursor(), isInputElement() (+12 more)

### Community 6 - "compilerOptions"
Cohesion: 0.08
Nodes (24): build, dist, dom, dom.iterable, esnext, node, node_modules, src/**/* (+16 more)

### Community 7 - "use-toast.ts"
Cohesion: 0.12
Nodes (22): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+14 more)

### Community 8 - "field.tsx"
Cohesion: 0.15
Nodes (13): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+5 more)

### Community 9 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 10 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 11 - "utils.ts"
Cohesion: 0.10
Nodes (12): Avatar, AvatarFallback, AvatarImage, HoverCardContent, PopoverContent, Progress, RadioGroup, RadioGroupItem (+4 more)

### Community 12 - "form.tsx"
Cohesion: 0.09
Nodes (17): Alert, AlertDescription, AlertTitle, alertVariants, FormControl, FormDescription, FormFieldContext, FormFieldContextValue (+9 more)

### Community 13 - "dependencies"
Cohesion: 0.15
Nodes (13): class-variance-authority, dependencies, class-variance-authority, @radix-ui/react-alert-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-popover, @radix-ui/react-radio-group, @radix-ui/react-toast (+5 more)

### Community 14 - "input-group.tsx"
Cohesion: 0.21
Nodes (10): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+2 more)

### Community 15 - "item.tsx"
Cohesion: 0.18
Nodes (12): Item(), ItemActions(), ItemContent(), ItemDescription(), ItemFooter(), ItemGroup(), ItemHeader(), ItemMedia() (+4 more)

### Community 16 - "chart.tsx"
Cohesion: 0.20
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 17 - "context-menu.tsx"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 18 - "dropdown-menu.tsx"
Cohesion: 0.20
Nodes (9): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+1 more)

### Community 19 - "sheet.tsx"
Cohesion: 0.25
Nodes (7): SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetOverlay, SheetTitle, sheetVariants

### Community 20 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 21 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 22 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 23 - "empty.tsx"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 24 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 25 - "select.tsx"
Cohesion: 0.25
Nodes (7): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 26 - "button-group.tsx"
Cohesion: 0.38
Nodes (5): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Separator

### Community 27 - "card.tsx"
Cohesion: 0.29
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 28 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 29 - "accordion.tsx"
Cohesion: 0.50
Nodes (3): AccordionContent, AccordionItem, AccordionTrigger

### Community 32 - "tabs.tsx"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

## Knowledge Gaps
- **275 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+270 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **46 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `Dashboard.tsx`, `carousel.tsx`, `command.tsx`, `use-toast.ts`, `field.tsx`, `menubar.tsx`, `utils.ts`, `form.tsx`, `input-group.tsx`, `item.tsx`, `chart.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `table.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `empty.tsx`, `navigation-menu.tsx`, `select.tsx`, `button-group.tsx`, `card.tsx`, `toggle-group.tsx`, `accordion.tsx`, `kbd.tsx`, `tabs.tsx`?**
  _High betweenness centrality (0.468) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`, `carousel.tsx`, `clsx`, `cmdk`, `date-fns`, `embla-carousel-react`, `@hookform/resolvers`, `input-otp`, `lucide-react`, `next-themes`, `@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-progress`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react-day-picker`, `react-dom`, `react-hook-form`, `react-icons`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `@tanstack/react-query`, `vaul`, `@workspace/api-client-react`, `wouter`, `zod`?**
  _High betweenness centrality (0.352) - this node is a cross-community bridge._
- **Why does `react` connect `carousel.tsx` to `Dashboard.tsx`, `cn`, `dependencies`?**
  _High betweenness centrality (0.317) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _275 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06342342342342343 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `carousel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0748663101604278 - nodes in this community are weakly interconnected._