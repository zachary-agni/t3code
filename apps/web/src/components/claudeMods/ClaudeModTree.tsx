import type { ClaudeModAction, ClaudeModNode, ClaudeModPress } from "@t3tools/contracts";
import { useGT } from "gt-react";
import {
  createContext,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "~/lib/utils";

import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

// Mods draw with Claude Code's terminal elements. Everything here is mod-authored data: it is
// rendered through React text and primitives only, never as HTML.

type ClaudeModPaneAction = Extract<ClaudeModAction, { type: "press" | "input" | "select" }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ClaudeModTreeAction = DistributiveOmit<ClaudeModPaneAction, "paneId">;

interface TreeContextValue {
  readonly onAction: (action: ClaudeModTreeAction) => void;
  readonly canAct: boolean;
}

const TreeContext = createContext<TreeContextValue>({ onAction: () => undefined, canAct: false });

export function ClaudeModTree(props: {
  readonly tree: ClaudeModNode;
  readonly canAct: boolean;
  readonly onAction: (action: ClaudeModTreeAction) => void;
}) {
  return (
    <TreeContext value={{ onAction: props.onAction, canAct: props.canAct }}>
      <div className="flex min-w-0 flex-col text-sm" data-claude-mod-tree>
        <NodeView node={props.tree} />
      </div>
    </TreeContext>
  );
}

const str = (props: ClaudeModNode["props"], key: string): string | undefined => {
  const value = props?.[key];
  return typeof value === "string" ? value : undefined;
};
const num = (props: ClaudeModNode["props"], key: string): number | undefined => {
  const value = props?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const THEME_COLORS: Readonly<Record<string, string>> = {
  text: "var(--color-foreground)",
  inverseText: "var(--color-background)",
  subtle: "var(--color-muted-foreground)",
  inactive: "var(--color-muted-foreground)",
  secondaryText: "var(--color-muted-foreground)",
  success: "var(--color-success-foreground)",
  error: "var(--color-error-foreground)",
  warning: "var(--color-warning-foreground)",
  suggestion: "var(--color-info-foreground)",
  permission: "var(--color-info-foreground)",
  info: "var(--color-info-foreground)",
  ide: "var(--color-info-foreground)",
  claude: "var(--color-primary)",
  primary: "var(--color-primary)",
  border: "var(--color-border)",
  secondaryBorder: "var(--color-border)",
  promptBorder: "var(--color-border)",
  background: "var(--color-background)",
};

const RAW_COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([\d\s.,%/-]+\)|[a-z]+)$/i;

/** A theme key or a plain CSS color; anything else inherits. */
function claudeModColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return THEME_COLORS[value] ?? (RAW_COLOR.test(value) ? value : undefined);
}

const NAMED_SPACE: Readonly<Record<string, string>> = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
};

/** A space in character cells (`ch` across, `lh` down) or a named size. */
function space(value: unknown, axis: "x" | "y"): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}${axis === "x" ? "ch" : "lh"}`;
  }
  return typeof value === "string" ? NAMED_SPACE[value] : undefined;
}

const PERCENT = /^\d+(\.\d+)?%$/;
function length(value: unknown, axis: "x" | "y"): string | undefined {
  if (typeof value === "string") return PERCENT.test(value) ? value : undefined;
  return space(value, axis);
}

const FLEX_ALIGN = new Set(["flex-start", "flex-end", "center", "stretch", "baseline"]);
const FLEX_JUSTIFY = new Set([
  "flex-start",
  "flex-end",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
]);
const pick = (set: ReadonlySet<string>, value: unknown) =>
  typeof value === "string" && set.has(value) ? value : undefined;

function boxStyle(props: ClaudeModNode["props"]): CSSProperties {
  const p = props ?? {};
  const column = p.flexDirection === "column" || p.flexDirection === "column-reverse";
  const style: CSSProperties = {
    flexDirection:
      p.flexDirection === "column" ||
      p.flexDirection === "row-reverse" ||
      p.flexDirection === "column-reverse"
        ? p.flexDirection
        : "row",
    flexWrap: p.flexWrap === "wrap" || p.flexWrap === "wrap-reverse" ? p.flexWrap : undefined,
    flexGrow: num(p, "flexGrow"),
    flexShrink: num(p, "flexShrink"),
    alignItems: pick(FLEX_ALIGN, p.alignItems),
    alignSelf: pick(FLEX_ALIGN, p.alignSelf),
    justifyContent: pick(FLEX_JUSTIFY, p.justifyContent),
    columnGap: space(p.columnGap ?? (column ? undefined : p.gap), "x"),
    rowGap: space(p.rowGap ?? (column ? p.gap : undefined), "y"),
    width: length(p.width, "x"),
    height: length(p.height, "y"),
    minWidth: length(p.minWidth, "x"),
    minHeight: length(p.minHeight, "y"),
    paddingLeft: space(p.paddingLeft ?? p.paddingX ?? p.padding, "x"),
    paddingRight: space(p.paddingRight ?? p.paddingX ?? p.padding, "x"),
    paddingTop: space(p.paddingTop ?? p.paddingY ?? p.padding, "y"),
    paddingBottom: space(p.paddingBottom ?? p.paddingY ?? p.padding, "y"),
    marginLeft: space(p.marginLeft ?? p.marginX ?? p.margin, "x"),
    marginRight: space(p.marginRight ?? p.marginX ?? p.margin, "x"),
    marginTop: space(p.marginTop ?? p.marginY ?? p.margin, "y"),
    marginBottom: space(p.marginBottom ?? p.marginY ?? p.margin, "y"),
    backgroundColor: claudeModColor(p.backgroundColor),
    overflow: p.overflow === "hidden" || p.overflowX === "hidden" ? "hidden" : undefined,
    display: p.display === "none" ? "none" : undefined,
  };
  if (typeof p.borderStyle === "string") {
    style.borderStyle = p.borderStyle === "double" ? "double" : "solid";
    style.borderWidth = p.borderStyle === "double" ? 3 : p.borderStyle === "bold" ? 2 : 1;
    style.borderRadius = p.borderStyle === "round" ? 8 : undefined;
    style.borderColor = claudeModColor(p.borderColor) ?? "var(--color-border)";
    if (p.borderDimColor === true) style.opacity = 0.7;
  }
  return style;
}

const TEXT_SIZE: Readonly<Record<string, string>> = {
  caption: "text-xs",
  footnote: "text-xs",
  heading: "text-base font-semibold",
  title: "text-lg font-semibold",
};
const TEXT_WEIGHT: Readonly<Record<string, number>> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

function textView(node: ClaudeModNode, boldByDefault = false) {
  const p = node.props ?? {};
  const color = claudeModColor(p.color);
  const background = claudeModColor(p.backgroundColor);
  const maxLines = num(p, "maxLines");
  const truncate = typeof p.wrap === "string" && p.wrap.startsWith("truncate");
  const weight =
    (typeof p.weight === "string" ? TEXT_WEIGHT[p.weight] : undefined) ??
    (p.bold === true || boldByDefault ? 600 : undefined);
  const style: CSSProperties = {
    color: p.inverse === true ? (background ?? "var(--color-background)") : color,
    backgroundColor: p.inverse === true ? (color ?? "var(--color-foreground)") : background,
    fontWeight: weight,
    ...(maxLines !== undefined && maxLines > 0
      ? {
          display: "-webkit-box",
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }
      : {}),
  };
  return (
    <span
      className={cn(
        "whitespace-pre-wrap",
        typeof p.size === "string" && TEXT_SIZE[p.size],
        p.dimColor === true && (color ? "opacity-70" : "text-muted-foreground"),
        p.mono === true && "font-mono",
        p.tabular === true && "tabular-nums",
        p.italic === true && "italic",
        p.underline === true && "underline",
        p.strikethrough === true && "line-through",
        truncate && "truncate",
      )}
      dir={p.dir === "rtl" || p.dir === "ltr" ? p.dir : undefined}
      style={style}
    >
      <Children node={node} />
    </span>
  );
}

function Children(props: { readonly node: ClaudeModNode }) {
  const children = props.node.children;
  if (!children || children.length === 0) return null;
  return children.map((child, index) =>
    typeof child === "string" ? (
      child
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- a mod's tree has no stable ids; position is the identity
      <NodeView key={index} node={child} />
    ),
  );
}

function NodeView(props: { readonly node: ClaudeModNode }): ReactNode {
  const { node } = props;
  switch (node.type) {
    case "Box":
    case "div":
      return (
        <div className="flex min-w-0" style={boxStyle(node.props)}>
          <Children node={node} />
        </div>
      );
    case "Text":
    case "span":
      return textView(node);
    case "b":
      return textView(node, true);
    case "Button":
      return <ModButton node={node} />;
    case "Input":
      return <ModInput node={node} />;
    case "Select":
      return <ModSelect node={node} />;
    case "Link":
      return <ModLink node={node} />;
    case "Code":
      return <ModCode node={node} />;
    case "Markdown":
      return <ModMarkdown node={node} />;
    case "Progress":
      return <ModProgress node={node} />;
    case "Svg":
      return <ModSvg node={node} />;
    case "Client":
      return node.children?.length ? <Children node={node} /> : <ClientPlaceholder />;
    default:
      return <Children node={node} />;
  }
}

function ClientPlaceholder() {
  const gt = useGT();
  return (
    <span className="text-muted-foreground text-xs italic">{gt("Not supported in T3 Code")}</span>
  );
}

function ModButton(props: { readonly node: ClaudeModNode }) {
  const { onAction, canAct } = use(TreeContext);
  const { node } = props;
  const label = str(node.props, "label");
  const key = str(node.props, "key");
  const press = node.press;
  const variant =
    node.props?.variant === "primary"
      ? "default"
      : node.props?.plain === true || node.props?.role === "dismiss"
        ? "ghost"
        : "outline";
  return (
    <Button
      size="xs"
      variant={variant}
      disabled={!canAct || press === undefined}
      onClick={() => {
        if (press) onAction({ type: "press", press, ...(key === undefined ? {} : { key }) });
      }}
    >
      {node.children?.length ? <Children node={node} /> : label}
    </Button>
  );
}

const INPUT_CHANGE_DEBOUNCE_MS = 150;

function ModInput(props: { readonly node: ClaudeModNode }) {
  const gt = useGT();
  const { onAction, canAct } = use(TreeContext);
  const { node } = props;
  const serverValue = str(node.props, "value") ?? "";
  const key = str(node.props, "key");
  const label = str(node.props, "label");
  const placeholder = str(node.props, "placeholder");
  const submitLabel = str(node.props, "submitLabel");
  const rows = num(node.props, "rows") ?? 1;
  const press = node.press;
  const [draft, setDraft] = useState({ value: serverValue, server: serverValue });
  const [focused, setFocused] = useState(false);
  const changeTimer = useRef<number | null>(null);

  // The mod's value wins unless it is only echoing what is being typed; clearing always wins.
  if (draft.server !== serverValue && (!focused || serverValue === "")) {
    setDraft({ value: serverValue, server: serverValue });
  }

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels the pending debounced change timer on unmount
  useEffect(
    () => () => {
      if (changeTimer.current !== null) window.clearTimeout(changeTimer.current);
    },
    [],
  );

  const send = (kind: "change" | "submit", value: string) => {
    if (!press || !canAct) return;
    onAction({ type: "input", press, kind, value, ...(key === undefined ? {} : { key }) });
  };
  const onChange = (value: string) => {
    setDraft((current) => ({ ...current, value }));
    if (changeTimer.current !== null) window.clearTimeout(changeTimer.current);
    changeTimer.current = window.setTimeout(() => {
      changeTimer.current = null;
      send("change", value);
    }, INPUT_CHANGE_DEBOUNCE_MS);
  };
  const submit = () => {
    if (changeTimer.current !== null) window.clearTimeout(changeTimer.current);
    changeTimer.current = null;
    send("submit", draft.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (rows > 1 && !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };
  const disabled = !canAct || press === undefined;
  const common = {
    value: draft.value,
    placeholder,
    disabled,
    "aria-label": label ?? placeholder ?? gt("Mod input"),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown,
  };
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      {label ? <span className="text-muted-foreground text-xs">{label}</span> : null}
      <span className="flex min-w-0 items-start gap-1.5">
        {rows > 1 ? (
          <Textarea
            {...common}
            rows={rows}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        ) : (
          <Input {...common} size="sm" onChange={(event) => onChange(event.currentTarget.value)} />
        )}
        {submitLabel ? (
          <Button size="xs" variant="outline" disabled={disabled} onClick={submit}>
            {submitLabel}
          </Button>
        ) : null}
      </span>
    </label>
  );
}

function ModSelect(props: { readonly node: ClaudeModNode }) {
  const gt = useGT();
  const { onAction, canAct } = use(TreeContext);
  const { node } = props;
  const key = str(node.props, "key");
  const label = str(node.props, "label");
  const press = node.press;
  const options = (Array.isArray(node.props?.options) ? node.props.options : []).flatMap(
    (option: unknown) => {
      if (!option || typeof option !== "object") return [];
      const { value, label: optionLabel } = option as { value?: unknown; label?: unknown };
      if (typeof value !== "string") return [];
      return [{ value, label: typeof optionLabel === "string" ? optionLabel : value }];
    },
  );
  const serverValue = str(node.props, "value") ?? null;
  const [picked, setPicked] = useState<{ value: string; server: string | null } | null>(null);
  const value = picked !== null && picked.server === serverValue ? picked.value : serverValue;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      {label ? <span className="text-muted-foreground text-xs">{label}</span> : null}
      <Select
        value={value ?? ""}
        disabled={!canAct || press === undefined}
        onValueChange={(next) => {
          if (typeof next !== "string" || !press) return;
          setPicked({ value: next, server: serverValue });
          onAction({ type: "select", press, value: next, ...(key === undefined ? {} : { key }) });
        }}
      >
        <SelectTrigger size="sm" aria-label={label ?? gt("Mod choice")}>
          <SelectValue>{options.find((option) => option.value === value)?.label ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </label>
  );
}

const SAFE_HREF = /^https?:\/\//i;

function ModLink(props: { readonly node: ClaudeModNode }) {
  const { node } = props;
  const href = str(node.props, "href");
  const label = str(node.props, "label");
  const content = node.children?.length ? <Children node={node} /> : (label ?? href);
  if (!href || !SAFE_HREF.test(href)) return <span>{content}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-info-foreground underline underline-offset-2"
    >
      {content}
    </a>
  );
}

/** A fence longer than any backtick run in the source, so the source cannot close it early. */
function fencedCode(source: string, language: string): string {
  const longest = Math.max(2, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language.replace(/[^\w+-]/g, "")}\n${source}\n${fence}`;
}

function ModCode(props: { readonly node: ClaudeModNode }) {
  const { node } = props;
  const source = str(node.props, "source") ?? "";
  const language = node.props?.format === "diff" ? "diff" : (str(node.props, "language") ?? "text");
  return <ChatMarkdown text={fencedCode(source, language)} cwd={undefined} parseRawHtml={false} />;
}

function ModMarkdown(props: { readonly node: ClaudeModNode }) {
  const { onAction, canAct } = use(TreeContext);
  const { node } = props;
  const press: ClaudeModPress | undefined = node.press;
  const key = str(node.props, "key");
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!press) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    if (!canAct) return;
    onAction({
      type: "press",
      press,
      href: anchor.getAttribute("href") ?? "",
      ...(key === undefined ? {} : { key }),
    });
  };
  return (
    <div
      className={cn("min-w-0", node.props?.dimColor === true && "text-muted-foreground")}
      onClickCapture={onClickCapture}
    >
      <ChatMarkdown text={str(node.props, "text") ?? ""} cwd={undefined} parseRawHtml={false} />
    </div>
  );
}

function ModProgress(props: { readonly node: ClaudeModNode }) {
  const { node } = props;
  const label = str(node.props, "label");
  const valueText = str(node.props, "valueText");
  const raw = num(node.props, "value");
  const value = raw === undefined ? undefined : Math.min(1, Math.max(0, raw));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {label || valueText ? (
        <span className="flex justify-between gap-2 text-xs">
          <span>{label}</span>
          <span className="text-muted-foreground tabular-nums">{valueText}</span>
        </span>
      ) : null}
      {value === undefined ? null : (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{
              width: `${value * 100}%`,
              backgroundColor: claudeModColor(node.props?.color),
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Mod SVG only ever loads as an image, where scripts and external loads never run. */
export function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

function ModSvg(props: { readonly node: ClaudeModNode }) {
  const { node } = props;
  const source = str(node.props, "source");
  const alt = str(node.props, "alt") ?? "";
  if (!source) return <span className="text-muted-foreground text-xs">{alt}</span>;
  return (
    <img
      src={svgDataUrl(source)}
      alt={alt}
      className="max-w-full"
      style={{ width: length(node.props?.width, "x"), height: length(node.props?.height, "y") }}
    />
  );
}
