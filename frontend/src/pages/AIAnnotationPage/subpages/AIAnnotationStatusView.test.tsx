import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadingStatus } from "./AIAnnotationStatusView";

describe("initial evaluation loading status", () => {
  it("shows completed samples and a determinate progress bar", () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <LoadingStatus isLight message="Evaluating the initial codebook…" progress={{ completed: 12, total: 30 }} />
      </MantineProvider>,
    );

    expect(html).toContain("12 of 30 samples evaluated (40%)");
    expect(html).toContain('aria-label="Initial evaluation progress"');
  });

  it("does not imply progress before the sample count is known", () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <LoadingStatus isLight message="Evaluating the initial codebook…" progress={{ completed: 0, total: 0 }} />
      </MantineProvider>,
    );

    expect(html).not.toContain("samples evaluated");
    expect(html).not.toContain('aria-label="Initial evaluation progress"');
    expect(html).toContain("Waiting for sample progress…");
  });

  it("explains the final save after all samples are evaluated", () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <LoadingStatus isLight message="Evaluating the initial codebook…" progress={{ completed: 30, total: 30 }} />
      </MantineProvider>,
    );

    expect(html).toContain("All 30 samples evaluated. Saving results…");
  });
});
