# Graph Report - RiseCare-Health-Kiosk  (2026-07-28)

## Corpus Check
- 140 files · ~527,909 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1084 nodes · 1524 edges · 112 communities (62 shown, 50 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `746f781a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Dashboard.tsx
- db/src/index.ts
- MAX30102
- cn
- devDependencies
- App.tsx
- utils.ts
- scripts
- custom-fetch.ts
- use-toast.ts
- compilerOptions
- compilerOptions
- field.tsx
- RiseCare Health Kiosk
- components.json
- menubar.tsx
- carousel.tsx
- dependencies
- form.tsx
- avatar.tsx
- db/package.json
- api-client-react/package.json
- input-group.tsx
- item.tsx
- schema/index.ts
- opencode.json
- @radix-ui/react-hover-card
- chart.tsx
- AGENTS.md
- api-server/tsconfig.json
- context-menu.tsx
- dropdown-menu.tsx
- loadcell.py
- mqtt_client.py
- compilerOptions
- @radix-ui/react-select
- table.tsx
- compilerOptions
- api-spec/package.json
- api-zod/package.json
- scripts/tsconfig.json
- breadcrumb.tsx
- drawer.tsx
- empty.tsx
- navigation-menu.tsx
- select.tsx
- sheet.tsx
- compilerOptions
- scripts/package.json
- @radix-ui/react-tabs
- card.tsx
- toggle-group.tsx
- bp_bootloader_control.py
- @radix-ui/react-toast
- alert.tsx
- input-otp.tsx
- @radix-ui/react-toggle-group
- orval.config.ts
- zod
- tsconfig.json
- badge.tsx
- sonner.tsx
- indoplas.py
- graphify.js
- class-variance-authority
- clsx
- cmdk
- dependencies
- embla-carousel-react
- @hookform/resolvers
- input-otp
- lucide-react
- next-themes
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-scroll-area
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-toggle
- @radix-ui/react-tooltip
- react
- react-day-picker
- react-dom
- react-hook-form
- react-icons
- react-resizable-panels
- recharts
- sonner
- tailwind-merge
- vaul
- @workspace/api-client-react
- wouter
- vite.config.ts
- post-merge.sh

## God Nodes (most connected - your core abstractions)
1. `cn()` - 138 edges
2. `compilerOptions` - 22 edges
3. `useRateLimit()` - 21 edges
4. `MAX30102` - 16 edges
5. `Results()` - 15 edges
6. `RiseCare Health Kiosk` - 14 edges
7. `scripts` - 13 edges
8. `useToast()` - 10 edges
9. `query()` - 10 edges
10. `VirtualKeyboard()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `getAiMode()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `getRecommendationEnabled()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `saveSensorValue()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/sensors.ts → lib/db/src/index.ts
- `saveSensorValue()` --calls--> `run()`  [EXTRACTED]
  artifacts/api-server/src/routes/sensors.ts → lib/db/src/index.ts
- `BreadcrumbSeparator()` --calls--> `cn()`  [EXTRACTED]
  artifacts/risecare-kiosk/src/components/ui/breadcrumb.tsx → artifacts/risecare-kiosk/src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (112 total, 50 thin omitted)

### Community 0 - "Dashboard.tsx"
Cohesion: 0.05
Nodes (65): InstructionModal(), InstructionModalProps, KeypadDialog(), KeypadDialogProps, KioskHeader(), KioskHeaderProps, Feedback, sensors (+57 more)

### Community 1 - "db/src/index.ts"
Cohesion: 0.06
Nodes (47): app, port, connectMQTT(), disconnectMQTT(), messageHandlers, publish(), subscribe(), calculateBMI() (+39 more)

### Community 2 - "MAX30102"
Cohesion: 0.07
Nodes (15): handle_command(), main(), publish_calibration_progress(), MAX30102, MLX90614, find_printer(), print_receipt(), test_print() (+7 more)

### Community 3 - "cn"
Cohesion: 0.09
Nodes (36): Kbd(), KbdGroup(), ResizableHandle(), ResizablePanelGroup(), SheetHeader(), Sidebar(), SidebarContent(), SidebarContext (+28 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (40): devDependencies, lightningcss, @replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal, @rollup/rollup-linux-arm64-gnu, @rollup/rollup-linux-x64-gnu, tailwindcss (+32 more)

### Community 5 - "App.tsx"
Cohesion: 0.12
Nodes (19): queryClient, backspaceAtCursor(), clearValue(), INPUT_TAGS, insertTextAtCursor(), isInputElement(), isNumeric(), Layout (+11 more)

### Community 6 - "utils.ts"
Cohesion: 0.07
Nodes (17): AccordionContent, AccordionItem, AccordionTrigger, Checkbox, HoverCardContent, PopoverContent, Progress, RadioGroup (+9 more)

### Community 7 - "scripts"
Cohesion: 0.05
Nodes (37): allowlist, __dirname, __filename, cross-env, lightningcss-linux-arm64-gnu, devDependencies, cross-env, lightningcss-linux-arm64-gnu (+29 more)

### Community 8 - "custom-fetch.ts"
Cohesion: 0.14
Nodes (25): ApiError, BodyType, buildErrorMessage(), customFetch(), CustomFetchOptions, ErrorType, getMediaType(), getStringField() (+17 more)

### Community 9 - "use-toast.ts"
Cohesion: 0.12
Nodes (23): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+15 more)

### Community 10 - "compilerOptions"
Cohesion: 0.08
Nodes (24): workspace, compilerOptions, alwaysStrict, customConditions, isolatedModules, lib, module, moduleResolution (+16 more)

### Community 11 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, jsx, lib, moduleResolution, noEmit, paths, resolveJsonModule (+16 more)

### Community 12 - "field.tsx"
Cohesion: 0.13
Nodes (16): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Field(), FieldContent(), FieldDescription(), FieldError() (+8 more)

### Community 13 - "RiseCare Health Kiosk"
Cohesion: 0.10
Nodes (19): API Endpoints, Backend (API Server), Database, Development, Development Mode, Environment Configuration, Features, Frontend (Kiosk UI) (+11 more)

### Community 14 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 15 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 16 - "carousel.tsx"
Cohesion: 0.09
Nodes (25): Button, ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Carousel, CarouselApi, CarouselContent (+17 more)

### Community 17 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, body-parser, cookie-parser, cors, dotenv, express, mqtt, @workspace/api-zod (+31 more)

### Community 18 - "form.tsx"
Cohesion: 0.14
Nodes (11): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+3 more)

### Community 19 - "avatar.tsx"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 20 - "db/package.json"
Cohesion: 0.11
Nodes (18): dotevn, dependencies, dotevn, sql.js, zod, devDependencies, dotenv, @types/node (+10 more)

### Community 21 - "api-client-react/package.json"
Cohesion: 0.17
Nodes (11): dependencies, @tanstack/react-query, exports, react, @tanstack/react-query, name, peerDependencies, react (+3 more)

### Community 22 - "input-group.tsx"
Cohesion: 0.21
Nodes (10): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+2 more)

### Community 23 - "item.tsx"
Cohesion: 0.18
Nodes (12): Item(), ItemActions(), ItemContent(), ItemDescription(), ItemFooter(), ItemGroup(), ItemHeader(), ItemMedia() (+4 more)

### Community 24 - "schema/index.ts"
Cohesion: 0.15
Nodes (9): InsertSensor, insertSensorSchema, Sensor, InsertSession, insertSessionSchema, Session, InsertVitalReading, insertVitalReadingSchema (+1 more)

### Community 25 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 27 - "chart.tsx"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 29 - "api-server/tsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, types, extends, include, node, src (+2 more)

### Community 30 - "context-menu.tsx"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 31 - "dropdown-menu.tsx"
Cohesion: 0.20
Nodes (9): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+1 more)

### Community 32 - "loadcell.py"
Cohesion: 0.33
Nodes (8): calibrate_finalize(), calibrate_tare(), get_stable_weight(), get_weight(), load_calibration(), _raw(), setup(), _stable_raw()

### Community 33 - "mqtt_client.py"
Cohesion: 0.31
Nodes (7): connect(), is_connected(), on_connect(), on_disconnect(), on_message(), publish(), wait_for_connection()

### Community 34 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declarationMap, emitDeclarationOnly, outDir, rootDir, extends, include (+2 more)

### Community 36 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 37 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declarationMap, emitDeclarationOnly, lib, outDir, rootDir, extends (+5 more)

### Community 38 - "api-spec/package.json"
Cohesion: 0.22
Nodes (8): devDependencies, orval, name, private, scripts, codegen, version, orval

### Community 39 - "api-zod/package.json"
Cohesion: 0.22
Nodes (8): dependencies, zod, exports, zod, name, private, type, version

### Community 40 - "scripts/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, types, extends, include, node, src (+1 more)

### Community 41 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 42 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 43 - "empty.tsx"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 44 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 45 - "select.tsx"
Cohesion: 0.25
Nodes (7): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 46 - "sheet.tsx"
Cohesion: 0.25
Nodes (7): SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetOverlay, SheetTitle, sheetVariants

### Community 47 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declarationMap, emitDeclarationOnly, outDir, rootDir, types, extends (+5 more)

### Community 48 - "scripts/package.json"
Cohesion: 0.15
Nodes (12): devDependencies, tsx, @types/node, tsx, @types/node, name, private, scripts (+4 more)

### Community 50 - "card.tsx"
Cohesion: 0.29
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 51 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 52 - "bp_bootloader_control.py"
Cohesion: 0.52
Nodes (6): main(), parse_as_text(), parse_blood_pressure(), print_debug_help(), setup_hardware(), try_baud_rate()

### Community 54 - "alert.tsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 55 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 57 - "orval.config.ts"
Cohesion: 0.40
Nodes (3): apiClientReactSrc, apiZodSrc, root

### Community 59 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compileOnSave, extends, files, ./tsconfig.base.json, references

### Community 60 - "badge.tsx"
Cohesion: 0.67
Nodes (3): Badge(), BadgeProps, badgeVariants

### Community 68 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, date-fns, @radix-ui/react-checkbox, @radix-ui/react-radio-group, @radix-ui/react-slider, @radix-ui/react-switch, @tanstack/react-query, @tanstack/react-query (+5 more)

## Knowledge Gaps
- **481 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `__filename`, `__dirname`, `allowlist` (+476 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **50 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `Dashboard.tsx`, `utils.ts`, `use-toast.ts`, `field.tsx`, `menubar.tsx`, `carousel.tsx`, `form.tsx`, `avatar.tsx`, `input-group.tsx`, `item.tsx`, `chart.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `table.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `empty.tsx`, `navigation-menu.tsx`, `select.tsx`, `sheet.tsx`, `card.tsx`, `toggle-group.tsx`, `alert.tsx`, `input-otp.tsx`, `badge.tsx`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`, `@radix-ui/react-hover-card`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle-group`, `zod`, `class-variance-authority`, `clsx`, `cmdk`, `embla-carousel-react`, `@hookform/resolvers`, `input-otp`, `lucide-react`, `next-themes`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-toggle`, `@radix-ui/react-tooltip`, `react`, `react-day-picker`, `react-dom`, `react-hook-form`, `react-icons`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `vaul`, `@workspace/api-client-react`, `wouter`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `__filename` to the rest of the system?**
  _481 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0519219736087206 - nodes in this community are weakly interconnected._
- **Should `db/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `MAX30102` be split into smaller, more focused modules?**
  _Cohesion score 0.07092198581560284 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.09407665505226481 - nodes in this community are weakly interconnected._