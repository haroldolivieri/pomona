# v1.1.2 — Direct gate, native outcome metrics, CI-only releases

The Clef gate uses the evaluated Direct questions and a 0.70 rejection threshold. Exactly one failing score rejects the photo. Conflicting scores still pass to Gemini, and the timeout remains three seconds. Gemini can abstain on every round.

The native Workers Observability event `gate_grading_outcome` joins a valid Clef pass with the final Gemini grading status. Its numeric `nonOkValue` supports count and rate charts. Error fallbacks and invalid Clef output are separate categories. See [dashboard definitions](clef-grading-metrics.md).

Production deployment is restricted to the GitHub Actions main workflow. The deployment message and job summary include the version and release change description. The provisioning script configures resources only; deployment remains in the existing CI workflow.

Live Direct eval on 16 browser-prepared 768px images: 13 expected decisions, zero false rejections, zero inference errors/timeouts. The supplied carrot photo now rejects as `unclear_photo`. Blur, cereal, and potato scenes still pass to Gemini because multiple failure scores exceed the cutoff. These remain accuracy failures against desired gate rejections; they are not presented as passing cases. Report: `/tmp/pomona-clef-direct-070.json`.

No production deployment is performed from the developer terminal. The release must be pushed and deployed by CI. Native dashboard configuration is tracked separately from source validation.
