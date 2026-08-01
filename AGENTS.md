# Repository Engineering Rules

These rules apply to the entire repository. They are mandatory for all future implementation work.

## Web UI Reuse Is The Default

- Before creating a component, hook, layout, dialog, control, or CSS pattern, search the repository for an existing equivalent and extend it when ownership matches.
- Shared navigation, header, sidebar, footer, dialogs, cards, state logic, responsive rules, and design tokens must have one source of truth.
- Fix layout bugs in the shared container or component that owns the behavior. Do not compensate with page-specific offsets, fixed heights, or duplicate shells.
- Page-specific CSS is allowed only when the behavior is genuinely unique to that page. It must not override shared application geometry to repair a shared bug.
- Desktop and mobile variants must derive from the same component, state, and data source. Do not build independent mobile copies that can drift from desktop behavior.
- Repeated workflows must use shared controllers/hooks for validation, persistence, navigation, and dialogs. A page may provide the target entity, but it must not reimplement the workflow.
- Do not create page-local header/footer/navigation implementations. All console routes must render through the shared console shell and footer.
- Preserve responsibility boundaries while reusing presentation infrastructure. In particular, History is an immutable/read-only view and the Diagnosis Wizard is editable; they may share the console shell, but must not share the Wizard's editable component instance or state machine.

## Responsive Design Rules

- Use one mutually exclusive, continuous responsive matrix for shared console surfaces: Mobile `max-width: 768px`, Tablet `min-width: 769px` and `max-width: 1024px`, PC `min-width: 1025px`.
- Treat PC (`>=1025px`) as the baseline source of truth. Mobile and Tablet are responsive variants of the same component, state, and data source; do not create parallel mobile markup or navigation.
- Put responsive behavior in the shared shell/component that owns the geometry. Do not repair cross-page layout with page-specific margins, negative offsets, fixed heights, or duplicated wrappers.
- Header, global navigation, Wizard stepper, main content, and footer must use the shared console grid and design tokens so their seams, widths, and scrolling rules stay consistent across routes.
- The console header and footer are fixed shell grid slots; only the main work area owns page scrolling. The Wizard stepper stays pinned to the top of that scroll area, and the shared Wizard action bar stays pinned immediately above the footer. Any shell or responsive change must re-check all four anchors at the start, middle, and end of a long scroll.
- Every `position: sticky` element must name its owning scroll container. Do not add an intermediate `overflow` ancestor that silently clips or disables sticky positioning.
- Use horizontal scrolling only for content that cannot compress (for example, mobile navigation, steppers, or galleries); add a clear overflow affordance, preserve a stable item width, and prevent body-level horizontal overflow.
- Default interactive touch targets to at least `44px` in both dimensions. Keep icon, menu, and brand spacing in the shared component using `gap`, never negative margins.
- Keep primary and secondary text nodes independently responsive: hide or truncate only the secondary node, never hide the whole label container to make room.
- When changing responsive CSS, search existing media queries first and consolidate the final behavior at the shared ownership boundary instead of adding another page-local patch.
- Verify shared responsive surfaces at the critical boundaries `320`, `390`, `768`, `769`, `900`, `1024`, `1025`, and `1280px`; check for overflow, clipped text, sticky seams, and touch-target regressions.
- Shared mobile action bars must reuse the desktop component and state. Use bounded grid/flex tracks with `min-width: 0`, keep the bar within its owning scroll container, and never use negative margins that can create body-level overflow.
- Viewport-pinned mobile action bars must be implemented once at the shared Wizard/shell ownership boundary. Reserve content clearance for the bar and `env(safe-area-inset-bottom)`; page-local offsets or duplicated mobile action markup are not allowed.
- Wizard progress connectors must occupy only the space between semantic step items. Labels and step markers must remain above connectors, readable at every breakpoint, and must never be crossed by decorative lines.

## Typography And Icon System

- Define typography, icon sizes, motion, and numeric alignment as global design tokens. Components consume those tokens; they must not introduce one-off font stacks, icon dimensions, line heights, or tracking values.
- Use Fraunces for display headings, IBM Plex Sans for interface and body copy, and IBM Plex Mono for steps, kickers, timestamps, status codes, measurements, and code. Do not add another UI font family without an explicit product requirement.
- Keep Chinese body copy at `line-height >= 1.6`. Uppercase labels use at least `.14em` tracking, comparable numbers use tabular figures, and negative tracking is reserved for large display headings.
- Apply Fraunces optical sizing deliberately: large titles use a high `opsz`, section headings use a middle `opsz`, and compact card headings use a lower `opsz`. Do not use the display face for paragraphs, buttons, tables, or dense navigation.
- Functional icons must come through the shared Iconify adapter and use the Carbon set by default. Do not add emoji icons, hand-drawn SVGs, external SVG images, or a second icon library for an icon already covered by Carbon.
- Icons use `currentColor` and the shared `16/20/24/32px` size scale. Decorative icons are hidden from assistive technology; icon-only controls must provide an accessible name on the control.

## UI Copy And Progressive Disclosure

- Classify interface copy before rendering it: L1 controls, status values, and key data stay visible; L2 step names, placeholders, empty-state labels, and requirements needed before an action stay visible only when concise; L3 feature explanations, rationale, timing guidance, and internal mechanisms should be omitted from the primary surface unless they are genuinely necessary, then use the shared info tooltip, help link, or first-use coach mark.
- Each section may have one action-oriented title and at most one single-line L2 hint. Do not stack a title, subtitle, and paragraph that repeat the same meaning.
- Keep one visible source of truth for each semantic message across a workflow. Prefer step states, badges, and field values over repeated confirmation banners or explanatory paragraphs.
- Empty states use a short primary message and one relevant action when an action exists. Do not place explanatory prose in empty states or placeholders, and never use a placeholder instead of a persistent field label.
- Prompts, raw provider output, generated source, model JSON, and other debug payloads are primary content when the user is actively inspecting or editing them. Show them directly in a bounded, independently scrollable work area; do not collapse them by default unless the product specification explicitly asks for progressive disclosure.
- Express optionality with the shared secondary label or info affordance, not parenthesized annotations in titles or field labels.
- Shared tooltips and disclosures must be keyboard focusable, expose their controlled content through ARIA, and preserve all migrated information without returning it to the main reading flow.
- File types, required columns, limits, and other information needed to complete an upload or input action are L2 pre-action requirements, not tooltip content. Keep them visibly adjacent to the control.
- Do not add a tooltip merely to preserve explanatory copy. Visual cleanliness takes priority when the explanation is nonessential and the control is already self-explanatory.
- Tooltip triggers stay in the title row or the card's upper-right utility position, never on a separate line. Tooltips open by explicit click, close on outside click or Escape, remain within the viewport, and use the shared placement variants rather than page-local offsets.

## Change Discipline

- Prefer the smallest change at the correct ownership boundary over isolated one-page patches.
- When a shared primitive changes, verify every known consumer at desktop and mobile widths.
- Keep persisted data contracts versionable and backward compatible. Never silently fabricate fields missing from legacy records.
- Never log, render, export, or expose API keys. Configuration comparisons must use non-reversible fingerprints; secrets may only remain in the user's local persisted workspace when the product explicitly requires it.
- Preserve unrelated user changes and avoid opportunistic refactors outside the requested behavior.

## Sensitive And Destructive Actions

- Delete, clear, overwrite, reset, revoke, and other sensitive actions must use the shared danger semantic color (red) across the trigger, confirmation icon, warning copy, and destructive confirmation button. They must never look like neutral or primary actions.
- Destructive operations require an explicit confirmation that names the exact scope and consequence. Cancellation is the safe default, and bulk deletion must state the affected item count.
- Row-level destructive controls remain independently focusable and must stop propagation so they never trigger the row's primary navigation action.
- Disable destructive controls when there is nothing in scope, and update all shared counters and dependent views immediately after a confirmed operation.

## Route And Feature Boundaries

- Each top-level console feature has one explicit, same-level route (`/diagnosis`, `/knowledge`, `/models`, `/history`) and renders through the shared console shell.
- Query-string view switches are compatibility inputs only; new navigation and internal links must use the canonical feature route. Keep legacy query links as redirects so bookmarks continue to work without creating a second route tree.
- Route-to-view mappings live in one shared module. Do not duplicate pathname checks or hand-write alternate URLs in individual pages and components.
- Keep feature-specific pages and detail routes under their feature directory; do not put a second editable workflow inside a read-only history route.

## Motion And Interaction Libraries

- Web 动效优先复用已有共享组件和动效库，不手写重复的动画系统。
- 动效库选型保持以下固定优先级：
  1. [`DavidHDev/react-bits`](https://github.com/DavidHDev/react-bits)：优先用于 React UI 动效、状态反馈和可复用交互片段。
  2. [`greensock/GSAP`](https://github.com/greensock/GSAP)：用于需要时间线、序列编排或精细控制的复杂动画。
  3. [`darkroomengineering/lenis`](https://github.com/darkroomengineering/lenis)：用于需要统一滚动体验的页面级滚动场景。
  4. [`tengbao/vanta`](https://github.com/tengbao/vanta)：仅用于确有必要的背景环境动效，不能干扰内容和交互。
  5. [`galacean/effects-runtime`](https://github.com/galacean/effects-runtime)：仅用于明确需要高性能视觉特效的场景。
- 只有在上述库不适合当前交互时，才使用 CSS transition/keyframes 或原生 Web Animations；简单 hover、focus、loading 不引入重量级 3D/粒子运行时。
- 动效必须服务于状态反馈、空间关系、滚动层级或任务完成感，不得增加装饰噪声；所有动效支持 `prefers-reduced-motion: reduce`。
- 动效按需加载，避免影响首屏和控制台基础交互；实现必须复用共享组件与全局 token，禁止页面单独复制一套 motion 规则。
