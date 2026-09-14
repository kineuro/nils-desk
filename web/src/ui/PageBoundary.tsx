// SPDX-License-Identifier: AGPL-3.0-only
// A page that throws while it draws says so in its own place, and the rest of
// the desk stays: the top bar, the side and every other page keep working.
// Opening another page or another conversation draws afresh, and so does
// drawing this one again. A page that draws is never mounted anew by this: a
// conversation keeps its stream and its queued words across a new address.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** The address the page was opened at; a new one clears a stopped page. */
  route: string;
}

interface State {
  failed: string | null;
}

export class PageBoundary extends Component<Props, State> {
  state: State = { failed: null };

  static getDerivedStateFromError(e: unknown): State {
    return { failed: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown) {
    console.error("the page stopped drawing:", e);
  }

  componentDidUpdate(before: Props) {
    if (before.route !== this.props.route && this.state.failed !== null) this.setState({ failed: null });
  }

  render() {
    if (this.state.failed === null) return this.props.children;
    return <Stopped why={this.state.failed} onAgain={() => this.setState({ failed: null })} />;
  }
}

/** What stands in a page's place once it stopped drawing. */
export function Stopped({ why, onAgain }: { why: string; onAgain: () => void }) {
  return (
    <section className="state" role="alert">
      <h1>This page stopped</h1>
      <p>Something on it could not be drawn. The rest of the desk carries on: open another page, or draw this one again.</p>
      <p className="warn">{why}</p>
      <p>
        <button type="button" className="button secondary" onClick={onAgain}>
          Draw it again
        </button>
      </p>
    </section>
  );
}
