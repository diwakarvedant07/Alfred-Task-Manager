import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dropdown from "@/components/ui/Dropdown";

describe("Dropdown", () => {
  it("shows children only after the trigger is clicked, and hides them again on outside click", () => {
    render(
      <div>
        <Dropdown trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
          <p>Menu content</p>
        </Dropdown>
        <button>Outside</button>
      </div>
    );

    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Open menu"));
    expect(screen.getByText("Menu content")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(
      <Dropdown trigger={({ toggle }) => <button onClick={toggle}>Open menu</button>}>
        <p>Menu content</p>
      </Dropdown>
    );

    fireEvent.click(screen.getByText("Open menu"));
    expect(screen.getByText("Menu content")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
  });
});
