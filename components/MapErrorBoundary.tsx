"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Surfaces any error from the (lazily-loaded) map subtree on screen instead of
 * leaving a silent, eternal "Loading map…". Catches both render errors and
 * rejected dynamic imports (React.lazy throws on rejection).
 */
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Also log so it shows in the browser console / terminal.
    console.error("[HubMap] failed to load:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-2 bg-zinc-100 p-6 text-center dark:bg-zinc-900">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">The map failed to load.</p>
          <pre className="max-w-md overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-zinc-600 shadow dark:bg-zinc-950 dark:text-zinc-300">
            {this.state.error.message}
          </pre>
          <p className="text-xs text-zinc-400">Please copy this message — it tells us exactly what broke.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
