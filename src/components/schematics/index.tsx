import type { EquipmentType, MovementPattern } from "@/data/schema";
import { EQUIPMENT_DRAWINGS, HEAD_R, PATTERN_DRAWINGS, type Drawing } from "./drawings";

export { EQUIPMENT_DRAWINGS, PATTERN_DRAWINGS } from "./drawings";

interface SchematicProps {
  /** Rendered width and height in px (default 34). */
  size?: number;
  className?: string;
  /** Accessible name; without one the drawing is decorative (aria-hidden). */
  label?: string;
}

function Schematic({
  drawing,
  size = 34,
  className,
  label,
}: SchematicProps & { drawing: Drawing }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={drawing.d} />
      {drawing.head && <circle cx={drawing.head[0]} cy={drawing.head[1]} r={HEAD_R} />}
      {drawing.dots?.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  );
}

/** Line drawing of a movement pattern (one per value of MOVEMENT_PATTERNS). */
export function PatternSchematic({
  pattern,
  ...rest
}: SchematicProps & { pattern: MovementPattern }) {
  return <Schematic drawing={PATTERN_DRAWINGS[pattern]} {...rest} />;
}

/** Line drawing of an equipment type (one per value of EQUIPMENT_TYPES). */
export function EquipmentSchematic({ type, ...rest }: SchematicProps & { type: EquipmentType }) {
  return <Schematic drawing={EQUIPMENT_DRAWINGS[type]} {...rest} />;
}

/**
 * The movement a machine is mostly used for: the most common pattern among its
 * linked exercises (ties go to the first linked). Null when nothing is linked.
 */
export function machinePattern(
  exerciseIds: Iterable<string>,
  catalog: ReadonlyMap<string, { pattern: MovementPattern }>,
): MovementPattern | null {
  const counts = new Map<MovementPattern, number>();
  let best: MovementPattern | null = null;
  for (const id of exerciseIds) {
    const pattern = catalog.get(id)?.pattern;
    if (!pattern) continue;
    const n = (counts.get(pattern) ?? 0) + 1;
    counts.set(pattern, n);
    if (best === null || n > (counts.get(best) ?? 0)) best = pattern;
  }
  return best;
}

/**
 * A machine drawn as what it's for (a leg extension shows a leg extension), so
 * machines of the same type don't all look alike. Falls back to the equipment
 * type's drawing when no exercise is linked.
 */
export function MachineSchematic({
  type,
  pattern,
  ...rest
}: SchematicProps & { type: EquipmentType; pattern: MovementPattern | null }) {
  return pattern ? (
    <PatternSchematic pattern={pattern} {...rest} />
  ) : (
    <EquipmentSchematic type={type} {...rest} />
  );
}

/**
 * The rounded tile a schematic sits in on list rows (M3 list-tile leading
 * element, 16px corners). `highlight` is for the one item that should stand
 * out (Von Restorff), e.g. today's anchor lift.
 */
export function SchematicTile({
  children,
  highlight = false,
  size = 52,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  size?: 44 | 52;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-tile ${
        size === 52 ? "h-13 w-13" : "h-11 w-11"
      } ${
        highlight
          ? "bg-primary text-on-primary"
          : "bg-surface-container-highest text-on-surface-variant"
      }`}
    >
      {children}
    </span>
  );
}
