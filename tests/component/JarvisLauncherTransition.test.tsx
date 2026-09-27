import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AnimatePresence } from "framer-motion";
import JarvisLauncherTransition from "@/components/jarvis/JarvisLauncherTransition";

function Harness({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <JarvisLauncherTransition key="jarvis" origin={{ x: 900, y: 700 }}>
          <div>Workspace content</div>
        </JarvisLauncherTransition>
      )}
    </AnimatePresence>
  );
}

describe("JarvisLauncherTransition", () => {
  it("reveals its children from the launcher origin and removes them after closing", async () => {
    const { rerender } = render(<Harness open />);
    expect(screen.getByText("Workspace content")).toBeInTheDocument();
    // jsdom's CSSStyleDeclaration drops clip-path, so the origin is also
    // exposed as a data attribute for this check.
    expect(screen.getByTestId("jarvis-launch-transition")).toHaveAttribute("data-origin", "900px 700px");

    rerender(<Harness open={false} />);
    await waitFor(() => expect(screen.queryByText("Workspace content")).not.toBeInTheDocument());
  });
});
