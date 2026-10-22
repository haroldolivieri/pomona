import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageSelector } from "../../src/components/LanguageSelector";
import "../../src/i18n";
afterEach(cleanup);
it("offers native names and emits selected locale", () => {
  const onChange = vi.fn();
  render(<LanguageSelector locale="en-GB" onChange={onChange} />);
  expect(screen.getByRole("option", { name: "Português (Brasil)" })).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "pt-BR" } });
  expect(onChange).toHaveBeenCalledWith("pt-BR");
});
