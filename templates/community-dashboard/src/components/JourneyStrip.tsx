import { journeyStep, type DashState, type StepId } from "../state.ts";

const STEPS: { id: StepId; label: string }[] = [
  { id: "visit", label: "Visit" }, { id: "apply", label: "Apply" }, { id: "review", label: "In review" }, { id: "member", label: "Member" },
];

export function JourneyStrip({ dash }: { dash: DashState | undefined }) {
  const cur = dash ? journeyStep(dash) : "visit";
  const at = STEPS.findIndex((s) => s.id === cur);
  return (
    <ol className="journey" aria-label="Your journey">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < at ? "done" : i === at ? "current" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="num" aria-hidden="true">{i < at ? "✓" : i + 1}</span> {s.label}
          {i < at && <span className="sr">, done</span>}
        </li>
      ))}
    </ol>
  );
}
