# Graph Report - RiseCare-Health-Kiosk  (2026-08-15)

## Corpus Check
- 157 files · ~543,084 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1184 nodes · 1784 edges · 124 communities (71 shown, 53 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fbff93bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Dashboard.tsx
- db/src/index.ts
- MAX30102
- cn
- devDependencies
- @radix-ui/react-separator
- dependencies
- scripts
- custom-fetch.ts
- SettingsDialog.tsx
- compilerOptions
- compilerOptions
- field.tsx
- RiseCare Health Kiosk
- components.json
- menubar.tsx
- carousel.tsx
- devDependencies
- form.tsx
- command.tsx
- db/package.json
- api-client-react/package.json
- input-group.tsx
- item.tsx
- schema/index.ts
- opencode.json
- @radix-ui/react-hover-card
- api-server/package.json
- AGENTS.md
- api-server/tsconfig.json
- context-menu.tsx
- dropdown-menu.tsx
- loadcell.py
- mqtt_client.py
- compilerOptions
- @radix-ui/react-select
- chart.tsx
- compilerOptions
- api-spec/package.json
- api-zod/package.json
- table.tsx
- utils.ts
- drawer.tsx
- empty.tsx
- select.tsx
- scripts
- clsx
- compilerOptions
- breadcrumb.tsx
- @radix-ui/react-tabs
- use-toast.ts
- toggle-group.tsx
- bp_bootloader_control.py
- @radix-ui/react-toast
- sheet.tsx
- express-session
- useRateLimit
- orval.config.ts
- zod
- tsconfig.json
- dotenv
- wifi.py
- sonner.tsx
- indoplas.py
- graphify.js
- mqtt.ts
- routes/sensors.ts
- SensorsSettings.tsx
- dependencies
- embla-carousel-react
- @hookform/resolvers
- input-otp
- lucide-react
- next-themes
- @radix-ui/react-accordion
- routes/index.ts
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- ai.ts
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- settings.ts
- @radix-ui/react-scroll-area
- navigation-menu.tsx
- @workspace/api-zod
- @radix-ui/react-slot
- App.tsx
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
- @radix-ui/react-toggle-group
- class-variance-authority
- card.tsx
- input-otp.tsx
- useToast
- mqtt
- date-fns
- network.ts
- cmdk

## God Nodes (most connected - your core abstractions)
1. `cn()` - 138 edges
2. `useToast()` - 26 edges
3. `useRateLimit()` - 23 edges
4. `SettingsAccount` - 22 edges
5. `compilerOptions` - 22 edges
6. `RiseCare Health Kiosk` - 17 edges
7. `MAX30102` - 16 edges
8. `query()` - 15 edges
9. `Results()` - 14 edges
10. `scripts` - 13 edges

## Surprising Connections (you probably didn't know these)
- `AccountsSettings()` --indirect_call--> `query()`  [INFERRED]
  artifacts/risecare-kiosk/src/components/settings/AccountsSettings.tsx → lib/db/src/index.ts
- `requireAuth()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/auth.ts → lib/db/src/index.ts
- `getAiMode()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `getRecommendationEnabled()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/ai.ts → lib/db/src/index.ts
- `isNetworkEnabled()` --calls--> `query()`  [EXTRACTED]
  artifacts/api-server/src/routes/network.ts → lib/db/src/index.ts

## Import Cycles
- None detected.

## Communities (124 total, 53 thin omitted)

### Community 0 - "Dashboard.tsx"
Cohesion: 0.10
Nodes (35): InstructionModal(), InstructionModalProps, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader() (+27 more)

### Community 1 - "db/src/index.ts"
Cohesion: 0.17
Nodes (14): logActivity(), createTables(), dbPath, dbUrlMatch, __dirname, envContent, envPath, FALLBACK_SURNAMES (+6 more)

### Community 2 - "MAX30102"
Cohesion: 0.07
Nodes (17): advertise_sensors(), handle_command(), main(), publish_calibration_progress(), MAX30102, MLX90614, find_printer(), print_receipt() (+9 more)

### Community 3 - "cn"
Cohesion: 0.09
Nodes (36): Kbd(), KbdGroup(), ResizableHandle(), ResizablePanelGroup(), SheetHeader(), Sidebar(), SidebarContent(), SidebarContext (+28 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (40): devDependencies, lightningcss, @replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal, @rollup/rollup-linux-arm64-gnu, @rollup/rollup-linux-x64-gnu, tailwindcss (+32 more)

### Community 6 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, body-parser, cookie-parser, cors, express, express-rate-limit, @workspace/db (+7 more)

### Community 7 - "scripts"
Cohesion: 0.05
Nodes (37): allowlist, __dirname, __filename, cross-env, lightningcss-linux-arm64-gnu, devDependencies, cross-env, lightningcss-linux-arm64-gnu (+29 more)

### Community 8 - "custom-fetch.ts"
Cohesion: 0.14
Nodes (25): ApiError, BodyType, buildErrorMessage(), customFetch(), CustomFetchOptions, ErrorType, getMediaType(), getStringField() (+17 more)

### Community 9 - "SettingsDialog.tsx"
Cohesion: 0.14
Nodes (19): LoginDialogProps, SettingsAccount, AccountsSettings(), AccountsSettingsProps, RoleFilter, ActivityLogsSettings(), ActivityLogsSettingsProps, AIIntegrationSettings() (+11 more)

### Community 10 - "compilerOptions"
Cohesion: 0.08
Nodes (24): workspace, compilerOptions, alwaysStrict, customConditions, isolatedModules, lib, module, moduleResolution (+16 more)

### Community 11 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, jsx, lib, moduleResolution, noEmit, paths, resolveJsonModule (+16 more)

### Community 12 - "field.tsx"
Cohesion: 0.15
Nodes (13): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+5 more)

### Community 13 - "RiseCare Health Kiosk"
Cohesion: 0.09
Nodes (22): Admin & Security, API Endpoints, Backend (API Server), Database, Development, Development Mode, Environment Configuration, Features (+14 more)

### Community 14 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 15 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 16 - "carousel.tsx"
Cohesion: 0.09
Nodes (25): Button, ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Carousel, CarouselApi, CarouselContent (+17 more)

### Community 17 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, esbuild, tsx, @types/bcryptjs, @types/cookie-parser, @types/cors, @types/express, @types/express-session (+9 more)

### Community 18 - "form.tsx"
Cohesion: 0.17
Nodes (9): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+1 more)

### Community 19 - "command.tsx"
Cohesion: 0.10
Nodes (18): TermsAgreementDialogProps, Checkbox, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList (+10 more)

### Community 20 - "db/package.json"
Cohesion: 0.09
Nodes (22): dependencies, bcryptjs, sql.js, zod, devDependencies, dotenv, @types/bcryptjs, @types/node (+14 more)

### Community 21 - "api-client-react/package.json"
Cohesion: 0.17
Nodes (11): dependencies, @tanstack/react-query, exports, react, @tanstack/react-query, name, peerDependencies, react (+3 more)

### Community 22 - "input-group.tsx"
Cohesion: 0.21
Nodes (10): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+2 more)

### Community 23 - "item.tsx"
Cohesion: 0.13
Nodes (17): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Item(), ItemActions(), ItemContent(), ItemDescription() (+9 more)

### Community 24 - "schema/index.ts"
Cohesion: 0.15
Nodes (9): InsertSensor, insertSensorSchema, Sensor, InsertSession, insertSessionSchema, Session, InsertVitalReading, insertVitalReadingSchema (+1 more)

### Community 25 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 27 - "api-server/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

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

### Community 36 - "chart.tsx"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 37 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declarationMap, emitDeclarationOnly, lib, outDir, rootDir, extends (+5 more)

### Community 38 - "api-spec/package.json"
Cohesion: 0.22
Nodes (8): devDependencies, orval, name, private, scripts, codegen, version, orval

### Community 39 - "api-zod/package.json"
Cohesion: 0.22
Nodes (8): dependencies, zod, exports, zod, name, private, type, version

### Community 40 - "table.tsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 41 - "utils.ts"
Cohesion: 0.06
Nodes (20): AccordionContent, AccordionItem, AccordionTrigger, Alert, AlertDescription, AlertTitle, alertVariants, Avatar (+12 more)

### Community 42 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 43 - "empty.tsx"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 44 - "select.tsx"
Cohesion: 0.25
Nodes (7): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 45 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, typecheck

### Community 47 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, composite, declarationMap, emitDeclarationOnly, outDir, rootDir, types, extends (+5 more)

### Community 48 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 50 - "use-toast.ts"
Cohesion: 0.12
Nodes (22): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+14 more)

### Community 51 - "toggle-group.tsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 52 - "bp_bootloader_control.py"
Cohesion: 0.52
Nodes (6): main(), parse_as_text(), parse_blood_pressure(), print_debug_help(), setup_hardware(), try_baud_rate()

### Community 54 - "sheet.tsx"
Cohesion: 0.25
Nodes (7): SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetOverlay, SheetTitle, sheetVariants

### Community 56 - "useRateLimit"
Cohesion: 0.25
Nodes (12): KeypadDialog(), KeypadDialogProps, KioskHeader(), KioskHeaderProps, SettingsDialog(), useAdminAuth(), useRateLimit(), abbreviateName() (+4 more)

### Community 57 - "orval.config.ts"
Cohesion: 0.40
Nodes (3): apiClientReactSrc, apiZodSrc, root

### Community 59 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compileOnSave, extends, files, ./tsconfig.base.json, references

### Community 61 - "wifi.py"
Cohesion: 0.28
Nodes (14): _active_device(), cmd_connect(), cmd_disconnect(), cmd_scan(), cmd_status(), main(), WiFi / network management via nmcli for the RISECARE kiosk.  Usage:   python3 wi, Unescape nmcli terse output (e.g. '\\:' -> ':' and '\\\\' -> '\\'). (+6 more)

### Community 65 - "mqtt.ts"
Cohesion: 0.19
Nodes (9): app, SESSION_SECRET, port, connectMQTT(), disconnectMQTT(), isConnected(), messageHandlers, subscribe() (+1 more)

### Community 66 - "routes/sensors.ts"
Cohesion: 0.22
Nodes (9): publish(), calibrationProgress, calibrationResults, completeTestAll(), latestReadings, router, sensorAvailability, testResults (+1 more)

### Community 67 - "SensorsSettings.tsx"
Cohesion: 0.14
Nodes (13): formatAgo(), NetworkSettings(), NetworkSettingsProps, NetworkStatus, WifiNetwork, Feedback, sensors, SensorsSettings() (+5 more)

### Community 68 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, @radix-ui/react-alert-dialog, @radix-ui/react-checkbox, @radix-ui/react-radio-group, @radix-ui/react-slider, @radix-ui/react-switch, @tanstack/react-query, @tanstack/react-query (+5 more)

### Community 75 - "routes/index.ts"
Cohesion: 0.20
Nodes (8): requireAuth(), router, router, router, findSessionLimiter, router, router, router

### Community 78 - "ai.ts"
Cohesion: 0.23
Nodes (13): calculateBMI(), getAiMode(), getBMIStatus(), getBPStatus(), getHRStatus(), getRecommendationEnabled(), getSpO2Status(), getTempStatus() (+5 more)

### Community 88 - "settings.ts"
Cohesion: 0.14
Nodes (12): AuthAccount, Express, express-session, Request, requireReauth(), requireSuperadmin(), SessionData, dbPath (+4 more)

### Community 90 - "navigation-menu.tsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 93 - "App.tsx"
Cohesion: 0.10
Nodes (24): queryClient, ACTIVITY_EVENTS, IdleTimeout(), Toaster(), backspaceAtCursor(), clearValue(), INPUT_TAGS, insertTextAtCursor() (+16 more)

### Community 117 - "card.tsx"
Cohesion: 0.29
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 118 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 119 - "useToast"
Cohesion: 0.36
Nodes (7): DatabaseSettings(), PowerSettings(), PowerSettingsProps, ReauthPrompt(), ReauthPromptProps, ServerSettings(), useToast()

### Community 124 - "network.ts"
Cohesion: 0.28
Nodes (7): execFileAsync, isNetworkEnabled(), requireNetworkEnabled(), router, runWifi(), WIFI_SCRIPT, workspaceRoot

## Knowledge Gaps
- **489 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `__filename`, `__dirname`, `allowlist` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `Dashboard.tsx`, `field.tsx`, `menubar.tsx`, `carousel.tsx`, `form.tsx`, `command.tsx`, `input-group.tsx`, `item.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `chart.tsx`, `table.tsx`, `utils.ts`, `drawer.tsx`, `empty.tsx`, `select.tsx`, `breadcrumb.tsx`, `use-toast.ts`, `toggle-group.tsx`, `sheet.tsx`, `SensorsSettings.tsx`, `navigation-menu.tsx`, `card.tsx`, `input-otp.tsx`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `query()` connect `ai.ts` to `db/src/index.ts`, `routes/sensors.ts`, `SettingsDialog.tsx`, `routes/index.ts`, `settings.ts`, `network.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `AccountsSettings()` connect `SettingsDialog.tsx` to `ai.ts`, `useToast`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `__filename` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10253699788583509 - nodes in this community are weakly interconnected._
- **Should `MAX30102` be split into smaller, more focused modules?**
  _Cohesion score 0.06857142857142857 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.09407665505226481 - nodes in this community are weakly interconnected._