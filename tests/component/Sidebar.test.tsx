import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "@/components/shell/Sidebar";

const mockPathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname() }));

describe("Sidebar", () => {
  it("renders Canvas and Recycle Bin links", () => {
    mockPathname.mockReturnValue("/canvas");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Canvas/ })).toHaveAttribute("href", "/canvas");
    expect(screen.getByRole("link", { name: /Recycle Bin/ })).toHaveAttribute("href", "/recycle-bin");
  });

  it("marks the link matching the current route as the current page", () => {
    mockPathname.mockReturnValue("/recycle-bin");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Recycle Bin/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Canvas/ })).not.toHaveAttribute("aria-current");
  });
});
