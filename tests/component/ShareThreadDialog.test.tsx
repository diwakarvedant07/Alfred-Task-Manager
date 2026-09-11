import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareThreadDialog from "@/components/canvas/ShareThreadDialog";

describe("ShareThreadDialog", () => {
  it("submits the entered email and chosen permission", () => {
    const onShare = vi.fn();
    render(<ShareThreadDialog threadId="th1" onShare={onShare} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "viewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Permission"), { target: { value: "VIEWER" } });
    fireEvent.click(screen.getByRole("button", { name: "Share thread" }));

    expect(onShare).toHaveBeenCalledWith("viewer@example.com", "VIEWER");
  });
});
