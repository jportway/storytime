import { forwardRef } from 'react';
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

/**
 * The break the storyteller decided to make.
 *
 * Rendered in the story rather than only in the header so that scrolling
 * back through a long story shows where each chapter began — the header
 * only ever knows about the current one.
 */
export function ChapterBreak({ n, title }: { n: number; title: string }) {
  return (
    <div className="chapter-break">
      <span className="chapter-break-number">Chapter {ordinal(n)}</span>
      <h2 className="chapter-break-title">{title}</h2>
    </div>
  );
}

/**
 * Marks where the new beat starts, so she can see where she'd got to.
 *
 * This is also the scroll target: the one programmatic scroll of a beat's
 * lifetime puts this element at the top of the pane and then stops. See the
 * scroll rule in App.tsx.
 */
export const NewFromHere = forwardRef<HTMLDivElement>(function NewFromHere(
  _props,
  ref,
) {
  return (
    <div className="new-divider" ref={ref}>
      <span className="new-divider-label">New from here</span>
      <span className="new-divider-rule" />
    </div>
  );
});

interface BeatViewProps {
  beat: Beat;
  /** Which chapter number this beat's title opens, when it opens one. */
  chapterNumber?: number;
  /** True for the beat that just landed — it carries the scroll target. */
  isNewest?: boolean;
  dividerRef?: React.Ref<HTMLDivElement>;
}

export function BeatView({
  beat,
  chapterNumber,
  isNewest,
  dividerRef,
}: BeatViewProps) {
  return (
    <section className="beat">
      {beat.chapterTitle && chapterNumber && (
        <ChapterBreak n={chapterNumber} title={beat.chapterTitle} />
      )}

      {/* The opening beat has nothing before it to be new from. */}
      {isNewest && beat.n > 1 && <NewFromHere ref={dividerRef} />}

      {beat.cooperDirection && <YourIdea text={beat.cooperDirection} />}

      {beat.panels.map((panel, i) => (
        <PanelView key={i} panel={panel} index={i} />
      ))}

      {/*
        The fork is the story's question to her, and until now it was written
        by the storyteller and then thrown away — it only ever appeared as
        placeholder text, which vanishes the moment she starts answering it.
      */}
      {beat.fork && <p className="fork-line">{beat.fork}</p>}
    </section>
  );
}

export function YourIdea({ text }: { text: string }) {
  return (
    <div className="your-idea">
      <span className="your-idea-label">Your idea</span>
      <p className="your-idea-text">{text}</p>
    </div>
  );
}

const ORDINALS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** "Chapter three" reads better than "Chapter 3" in a book. */
export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? String(n);
}
