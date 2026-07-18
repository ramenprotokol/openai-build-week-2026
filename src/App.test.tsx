import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("first-use orientation", () => {
  it("explains the product before exposing the drill controls", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Agents move fast/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Training for the human supervising/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Issue the first directive" }),
    ).not.toBeInTheDocument();
  });

  it("opens the command interface from one explicit action", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /Begin the five-minute drill/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Issue the first directive" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enrollment incident")).toBeInTheDocument();
  });
});
