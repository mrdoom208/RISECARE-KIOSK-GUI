# Graph Report - RiseCare-Health-Kiosk  (2026-08-14)

## Corpus Check
- 144 files · ~534,144 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1106 nodes · 1575 edges · 114 communities (63 shown, 51 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `54eec123`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Results.tsx
- db/src/index.ts
- main.py
- cn
- devDependencies
- @radix-ui/react-separator
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
- pagination.tsx
- dependencies
- form.tsx
- command.tsx
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
- useRateLimit
- App.tsx
- Dashboard.tsx
- compilerOptions
- scripts/package.json
- @radix-ui/react-tabs
- MAX30102
- toggle-group.tsx
- bp_bootloader_control.py
- @radix-ui/react-toast
- sheet.tsx
- alert.tsx
- @radix-ui/react-toggle-group
- orval.config.ts
- zod
- tsconfig.json
- VirtualKeyboard.tsx
- carousel.tsx
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
- SensorsDialog.tsx
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- InstructionModal.tsx
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
- @radix-ui/react-alert-dialog
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
4. `RiseCare Health Kiosk` - 17 edges
5. `MAX30102` - 16 edges
6. `Results()` - 15 edges
7. `scripts` - 13 edges
8. `useToast()` - 12 edges
9. `query()` - 11 edges
10. `VirtualKeyboard()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `getAiMode()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `getRecommendationEnabled()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `getAccountRole()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/settings.ts → lib/db/src/index.ts
- `saveSensorValue()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/sensors.ts → lib/db/src/index.ts
- `saveSensorValue()` --calls--> `run()`  [EXTRACTED]
  artifacts/api-server/src/routes/sensors.ts → lib/db/src/index.ts

## Import Cycles
- None detected.

## Communities (114 total, 51 thin omitted)

### Community 0 - "Results.tsx"
Cohesion: 0.22
Nodes (19): VitalCard(), VitalCardProps, calculateBMI(), getBMIStatus(), getBPStatus(), getHRStatus(), getSpO2Status(), getStatusColor() (+11 more)

### Community 1 - "db/src/index.ts"
Cohesion: 0.06
Nodes (51): app, port, connectMQTT(), disconnectMQTT(), isConnected(), messageHandlers, publish(), subscribe() (+43 more)

### Community 2 - "main.py"
Cohesion: 0.09
Nodes (16): advertise_sensors(), handle_command(), main(), publish_calibration_progress(), MLX90614, find_printer(), print_receipt(), printer_status() (+8 more)

### Community 3 - "cn"
Cohesion: 0.09
Nodes (36): Kbd(), KbdGroup(), ResizableHandle(), ResizablePanelGroup(), SheetHeader(), Sidebar(), SidebarContent(), SidebarContext (+28 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (40): devDependencies, lightningcss, @replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal, @rollup/rollup-linux-arm64-gnu, @rollup/rollup-linux-x64-gnu, tailwindcss (+32 more)

### Community 6 - "utils.ts"
Cohesion: 0.06
Nodes (20): AccordionContent, AccordionItem, AccordionTrigger, Avatar, AvatarFallback, AvatarImage, HoverCardContent, InputOTP (+12 more)

### Community 7 - "scripts"
Cohesion: 0.05
Nodes (37): allowlist, __dirname, __filename, cross-env, lightningcss-linux-arm64-gnu, devDependencies, cross-env, lightningcss-linux-arm64-gnu (+29 more)

### Community 8 - "custom-fetch.ts"
Cohesion: 0.14
Nodes (25): ApiError, BodyType, buildErrorMessage(), customFetch(), CustomFetchOptions, ErrorType, getMediaType(), getStringField() (+17 more)

### Community 9 - "use-toast.ts"
Cohesion: 0.12
Nodes (22): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+14 more)

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
Cohesion: 0.09
Nodes (22): Admin & Security, API Endpoints, Backend (API Server), Database, Development, Development Mode, Environment Configuration, Features (+14 more)

### Community 14 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 15 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 16 - "pagination.tsx"
Cohesion: 0.18
Nodes (13): Button, ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Pagination(), PaginationContent, PaginationEllipsis() (+5 more)

### Community 17 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, body-parser, cookie-parser, cors, dotenv, express, mqtt, @workspace/api-zod (+31 more)

### Community 18 - "form.tsx"
Cohesion: 0.14
Nodes (11): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+3 more)

### Community 19 - "command.tsx"
Cohesion: 0.09
Nodes (19): LoginDialogProps, TermsAgreementDialogProps, Checkbox, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem (+11 more)

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
Cohesion: 0.22
Nodes (10): connect(), is_connected(), on_connect(), on_disconnect(), on_message(), publish(), wait_for_connection(), main() (+2 more)

### Community 34 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declarationMap, emitDeclarationOnly, outDir, rootDir, extends, include (+2 more)

### Community 36 - "table.tsx"
Cohesion: 0.06
Nodes (28): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, NavigationMenu, NavigationMenuContent (+20 more)

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

### Community 44 - "useRateLimit"
Cohesion: 0.19
Nodes (14): KeypadDialog(), KeypadDialogProps, KioskHeader(), KioskHeaderProps, SensorsDialog(), SettingsDialog(), SettingsDialogProps, Toaster() (+6 more)

### Community 45 - "App.tsx"
Cohesion: 0.15
Nodes (10): queryClient, ACTIVITY_EVENTS, IdleTimeout(), useVirtualKeyboard(), VirtualKeyboardContext, VirtualKeyboardContextValue, VirtualKeyboardProvider(), NotFound() (+2 more)

### Community 46 - "Dashboard.tsx"
Cohesion: 0.21
Nodes (12): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+4 more)

### Community 47 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declarationMap, emitDeclarationOnly, outDir, rootDir, types, extends (+5 more)

### Community 48 - "scripts/package.json"
Cohesion: 0.15
Nodes (12): devDependencies, tsx, @types/node, tsx, @types/node, name, private, scripts (+4 more)

### Community 51 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 52 - "bp_bootloader_control.py"
Cohesion: 0.52
Nodes (6): main(), parse_as_text(), parse_blood_pressure(), print_debug_help(), setup_hardware(), try_baud_rate()

### Community 54 - "sheet.tsx"
Cohesion: 0.25
Nodes (7): SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetOverlay, SheetTitle, sheetVariants

### Community 55 - "alert.tsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 57 - "orval.config.ts"
Cohesion: 0.40
Nodes (3): apiClientReactSrc, apiZodSrc, root

### Community 59 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compileOnSave, extends, files, ./tsconfig.base.json, references

### Community 60 - "VirtualKeyboard.tsx"
Cohesion: 0.30
Nodes (11): backspaceAtCursor(), clearValue(), INPUT_TAGS, insertTextAtCursor(), isInputElement(), isNumeric(), Layout, NUMERIC_ROWS (+3 more)

### Community 61 - "carousel.tsx"
Cohesion: 0.14
Nodes (12): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+4 more)

### Community 68 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, date-fns, @radix-ui/react-checkbox, @radix-ui/react-radio-group, @radix-ui/react-slider, @radix-ui/react-switch, @tanstack/react-query, @tanstack/react-query (+5 more)

### Community 75 - "SensorsDialog.tsx"
Cohesion: 0.27
Nodes (7): Feedback, sensors, SensorsDialogProps, Badge(), BadgeProps, badgeVariants, Switch

### Community 78 - "InstructionModal.tsx"
Cohesion: 0.43
Nodes (4): InstructionModal(), InstructionModalProps, sensorGuides, SensorGuide

## Knowledge Gaps
- **481 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `__filename`, `__dirname`, `allowlist` (+476 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `utils.ts`, `use-toast.ts`, `field.tsx`, `menubar.tsx`, `pagination.tsx`, `form.tsx`, `command.tsx`, `input-group.tsx`, `item.tsx`, `chart.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `table.tsx`, `breadcrumb.tsx`, `drawer.tsx`, `empty.tsx`, `Dashboard.tsx`, `toggle-group.tsx`, `sheet.tsx`, `alert.tsx`, `carousel.tsx`, `SensorsDialog.tsx`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`, `@radix-ui/react-separator`, `@radix-ui/react-hover-card`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle-group`, `zod`, `class-variance-authority`, `clsx`, `cmdk`, `embla-carousel-react`, `@hookform/resolvers`, `input-otp`, `lucide-react`, `next-themes`, `@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-scroll-area`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-toggle`, `@radix-ui/react-tooltip`, `react`, `react-day-picker`, `react-dom`, `react-hook-form`, `react-icons`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `vaul`, `@workspace/api-client-react`, `wouter`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `AlertDialogFooter()` connect `Dashboard.tsx` to `cn`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `__filename` to the rest of the system?**
  _481 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `db/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055178652193577565 - nodes in this community are weakly interconnected._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09243697478991597 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.09407665505226481 - nodes in this community are weakly interconnected._