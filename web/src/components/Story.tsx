import type { Beat, Panel } from '@storytime/shared';

export function PanelView({ panel, index }: { panel: Panel; index: number }) {
  return (
    <article className="panel" style={{ animationDelay: `${index * 60}ms` }}>
      {panel.narration && <p className="narration">{panel.narration}</p>}
      {panel.dialogue.map((line, i) => (
        <p className="dialogue" key={i}>
          <span className="speaker">{line.who}</span>
          <span className="says">“{line.says}”</span>
        </p>
      ))}
      {panel.sfx && <p className="sfx">{panel.sfx}</p>}
    </article>
  );
}

export function BeatView({ beat }: { beat: Beat }) {
  return (
    <section className="beat">
      {beat.cooperDirection && (
        <p className="your-idea">
          <span className="your-idea-label">Your idea</span>
          {beat.cooperDirection}
        </p>
      )}
      {beat.panels.map((panel, i) => (
        <PanelView key={i} panel={panel} index={i} />
      ))}
    </section>
  );
}
