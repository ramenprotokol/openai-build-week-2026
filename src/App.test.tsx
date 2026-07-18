import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("first-use orientation", () => {
  it("explains the product before exposing the drill controls", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Agents move fast/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/place to practise the workflow/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Issue the first directive" }),
    ).not.toBeInTheDocument();
  });

  it("offers an unmistakable choice between Trial and Real modes", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: /Trial Mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Real Mode/i })).toBeInTheDocument();
  });

  it("opens the simulated command interface from Trial Mode", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /Trial Mode/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Issue the first directive" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enrollment incident")).toBeInTheDocument();
  });

  it("explains how to connect a repository from Real Mode on the public site", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Real Mode/i }));

    expect(screen.getByRole("heading", { name: /Open CONTROL ROOM beside your code/i })).toBeInTheDocument();
    expect(screen.getByText(/npm run real -- --repo/i)).toBeInTheDocument();
  });
});
